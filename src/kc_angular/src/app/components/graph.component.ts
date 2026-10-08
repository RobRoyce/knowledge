/*
 * Copyright (c) 2023-2024 Rob Royce
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectService } from '@services/factory-services/project.service';
import { KcProject } from '@app/models/project.model';
import {
  BehaviorSubject,
  fromEvent,
  skip,
  skipUntil,
  Subject,
  throttleTime,
} from 'rxjs';
import { KsContextMenuService } from '@services/factory-services/ks-context-menu.service';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { ContextMenu } from 'primeng/contextmenu';
import { ProjectCommandService } from '@services/command-services/project-command.service';
import {
  distinctUntilChanged,
  map,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { ProjectContextMenuService } from '@services/factory-services/project-context-menu.service';
import { SettingsService } from '@services/ipc-services/settings.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { createGraph } from '@app/workers/graph.worker';

@Component({
  selector: 'app-graph',
  template: `
    <div class="graph-container">
      <graph-canvas
        #graph
        [data]="data"
        (onRunning)="onRunning($event)"
        (onSourceTap)="onSourceTap($event)"
        (onSourceDblTap)="onSourceDblTap($event)"
        (onSourceCtxtap)="onSourceCtxtap($event)"
        (onProjectTap)="onProjectTap($event)"
        (onProjectCtxtap)="onProjectCtxtap($event)"
        class="w-full h-full"
      >
      </graph-canvas>
    </div>
    <p-contextMenu
      #cm
      styleClass="shadow-7 bg-primary-reverse"
      [model]="menuItems"
      [baseZIndex]="999999"
      [autoZIndex]="true"
      appendTo="body"
    >
    </p-contextMenu>
  `,
  styles: [
    `
      .graph-container {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        justify-content: space-between;
      }
    `,
  ],
})
export class GraphComponent implements OnInit, OnDestroy {
  @ViewChild('cm') cm!: ContextMenu;

  projectId = '';

  data: any[] = [];

  menuItems: MenuItem[] = [];

  private activeProject?: KcProject;

  private showSources = true;

  private running = false;

  private cleanUp = new Subject();

  private onBuild = new BehaviorSubject({});

  constructor(
    private route: ActivatedRoute,
    private projects: ProjectService,
    private confirm: ConfirmationService,
    private command: KsCommandService,
    private context: KsContextMenuService,
    private notifications: NotificationsService,
    private pContext: ProjectContextMenuService,
    private pCommand: ProjectCommandService,
    private settings: SettingsService
  ) {
    this.onBuild
      .asObservable()
      .pipe(
        skip(1),
        skipUntil(this.projects.currentProject),
        throttleTime(500),
        tap(() => {
          this.build();
        })
      )
      .subscribe();
  }

  async ngOnInit() {
    this.projects.currentProject
      .pipe(
        takeUntil(this.cleanUp),
        tap((project) => {
          if (project) {
            this.projectId = project.id.value;
          }
          this.activeProject = project ?? undefined;
          this.onBuild.next({});
        })
      )
      .subscribe();

    this.settings.graph
      .pipe(
        takeUntil(this.cleanUp),
        distinctUntilChanged((prev, curr) => {
          /* Only refresh the graph if the 'Show Sources' setting has changed */
          return prev.display.showSources === curr.display.showSources;
        }),
        tap((graphSettings) => {
          this.showSources = graphSettings.display.showSources;
          this.onBuild.next({});
        })
      )
      .subscribe();
  }

  ngOnDestroy() {
    this.cleanUp.next({});
    this.cleanUp.complete();
  }

  async build() {
    if (!this.projectId) {
      this.notifications.error(
        'Graph',
        'Invalid Project ID',
        'No Project ID provided.'
      );
      return;
    }

    const projectTree = this.getTree(this.projectId);
    const worker = new Worker(
      new URL('../workers/graph.worker', import.meta.url)
    );
    const confirm = (data: any[]) => {
      if (
        this.settings.get().app.graph.display.largeGraphWarning &&
        data.length > 750
      ) {
        this.confirm.confirm({
          header: "Woah, that's a big graph!",
          message:
            'If you notice performance issues, you may want to adjust the Graph Settings. You can also disable this warning in the settings menu.',
          icon: 'pi pi-warn',
          accept: () => {
            this.data = data;
          },
          reject: () => {
            this.settings.show('graph');
          },
          acceptLabel: 'Got it!',
          rejectLabel: 'Graph Settings',
          rejectIcon: 'pi pi-cog',
        });
      } else {
        this.data = data;
      }
    };

    if (worker) {
      try {
        const graphNodes = fromEvent(worker, 'message');
        graphNodes
          .pipe(
            take(1),
            map((msg) => (msg as any).data),
            map((data) => {
              for (const node of data)
                if (node.data.ks)
                  node.data.ks.icon = localStorage.getItem(
                    `icon-${node.data.ks.id.value}`
                  );
              return data;
            }),
            tap(confirm)
          )
          .subscribe();
        worker.postMessage({
          projects: projectTree,
          root: this.projectId,
          showSources: this.showSources,
        });
      } catch (e) {
        const data: any[] = createGraph(
          projectTree,
          this.projectId,
          this.showSources
        );
        for (const node of data)
          if (node.data.ks)
            node.data.ks.icon = localStorage.getItem(
              `icon-${node.data.ks.id.value}`
            );
        confirm(data);
      }
    } else {
      this.notifications.warn(
        'Graph',
        'Web Workers Unavailable',
        'Reverting to synchronous operations...'
      );
      const data: any[] = createGraph(
        projectTree,
        this.projectId,
        this.showSources
      );
      for (const node of data)
        if (node.data.ks)
          node.data.ks.icon = localStorage.getItem(
            `icon-${node.data.ks.id.value}`
          );
      confirm(data);
    }
  }

  onSourceTap($event: { data: KnowledgeSource; event: MouseEvent }) {
    const action = this.settings.get().app.graph.actions.tap;
    if (action === 'preview') {
      this.command.preview($event.data);
    } else if (action === 'details') {
      this.command.detail($event.data);
    } else if (action === 'open') {
      this.command.open($event.data);
    }
  }

  onSourceDblTap($event: { data: KnowledgeSource; event: MouseEvent }) {
    const action = this.settings.get().app.graph.actions.dblTap;
    if (action === 'preview') {
      this.command.preview($event.data);
    } else if (action === 'details') {
      this.command.detail($event.data);
    } else if (action === 'open') {
      this.command.open($event.data);
    }
  }

  onSourceCtxtap($event: { data: KnowledgeSource[]; event: MouseEvent }) {
    if ($event.data.length === 1) {
      this.menuItems = this.context.generate($event.data[0]);
    } else {
      this.menuItems = this.context.generate($event.data[0], $event.data);
    }
    this.cm.show($event.event);
  }

  onProjectCtxtap($event: { data: KcProject; event: MouseEvent }) {
    this.menuItems = this.pContext.generate($event.data);
    this.cm.show($event.event);
  }

  onProjectTap($event: { data: KcProject; event: MouseEvent }) {
    this.pCommand.detail($event.data);
  }

  onRunning(running: boolean) {
    this.running = running;
  }

  private getTree(
    project: string | any,
    level = 1
  ): (KcProject & { level: number })[] {
    if (!project) {
      return [];
    }
    if (typeof project === 'string') {
      const p = this.projects.getProject(project);
      if (!p) {
        return [];
      } else {
        project = p;
        project.level = level;
      }
    }
    let tree = [project];
    if (!project.subprojects) {
      return tree;
    }
    for (const subProject of project.subprojects) {
      tree = tree.concat(this.getTree(subProject, level + 1));
    }
    return tree;
  }
}
