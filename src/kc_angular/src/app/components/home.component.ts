/*
 * Copyright (c) 2022-2024 Rob Royce
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

import { Component, HostListener, OnDestroy, ViewChild } from '@angular/core';
import {
  ConfirmationService,
  FilterService,
  MenuItem,
  TreeNode,
} from 'primeng/api';
import { DragAndDropService } from '@services/ingest-services/drag-and-drop.service';
import { IngestService } from '@services/ingest-services/ingest.service';
import { KcProject } from '@app/models/project.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { KsContextMenuService } from '@services/factory-services/ks-context-menu.service';
import { KsFactoryService } from '@services/factory-services/ks-factory.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ProjectService } from '@services/factory-services/project.service';
import { ProjectTreeFactoryService } from '@services/factory-services/project-tree-factory.service';
import { SettingsService } from '@services/ipc-services/settings.service';
import { Splitter } from 'primeng/splitter';
import { finalize, map, take, takeUntil, tap } from 'rxjs/operators';

@Component({
  selector: 'app-home',
  template: `
    <p-contextMenu
      #cm
      styleClass="shadow-7 bg-primary-reverse"
      [model]="ksMenuItems"
      [baseZIndex]="999999"
      [autoZIndex]="true"
      appendTo="body"
    >
    </p-contextMenu>

    <div
      class="inbox-container width-constrained flex flex-column h-full w-full align-items-center"
    >
      <div class="inbox-header flex-grow-0 w-full">
        <div
          class="flex flex-row justify-content-between align-items-center p-2 border-bottom-1 border-400"
        >
          <div class="flex flex-row">
            <button
              pButton
              label="Import"
              icon="pi pi-download"
              [disabled]="
                !upNext || upNext.length === 0 || !selectedProject.key
              "
              (click)="onProjectImport()"
            ></button>
            <project-selector
              proTip
              tipHeader="Time to Gather Your Sources!"
              tipMessage="Choose a Project from the dropdown, hit Import, and watch your Sources flow in. Want them all in the same Project? Just check the 'Import All' box. Or, have some fun dragging and dropping Sources into the Project tree on the sidebar."
              [tipGroups]="['inbox', 'intro']"
              [tipHidden]="!upNext || upNext.length === 0"
              [tipShowOnHover]="true"
              [disabled]="!upNext || upNext.length === 0"
              class="w-16rem px-2"
              [showClear]="false"
              (onSelect)="selectedProject = $event"
              placeholder="Import to Project..."
            ></project-selector>
            <p-checkbox
              [binary]="true"
              label="Import All"
              [(ngModel)]="importAll"
              [disabled]="
                !upNext || upNext.length === 0 || !selectedProject.key
              "
            ></p-checkbox>
          </div>

          <div *ngIf="active" class="flex flex-row text-2xl font-bold">
            {{ active.title | truncate : [64] }}
          </div>

          <div class="flex flex-row">
            <button
              pButton
              proTip
              tipHeader="Out with the Old! 🗑️"
              tipMessage="Need a clean slate? Click 'Remove All' to sweep away all sources from your Inbox."
              tipIcon="pi pi-trash"
              [tipGroups]="['inbox']"
              icon="pi pi-trash"
              label="Remove All"
              class="p-button-danger p-button-text"
              (click)="onKsRemove(upNext)"
              [disabled]="!upNext || upNext.length === 0"
            ></button>
          </div>
        </div>
      </div>

      <div class="inbox-content flex-grow-1 h-full w-full overflow-y-auto">
        <div class="w-full h-full flex app-splitter-container">
          <div class="app-splitter-left">
            <div
              *ngIf="upNext.length > 0"
              class="h-full"
              style="overflow-y: auto"
            >
              <div class="shadow-1 sticky top-0 z-5">
                <div class="p-input-icon-left w-full">
                  <i class="pi pi-filter"></i>
                  <input
                    type="text"
                    pInputText
                    #filter
                    style="height: 40px; width: 100%"
                    placeholder="Filter"
                    (input)="onFilter($event, filter.value)"
                    class="w-full p-fluid"
                  />
                </div>
              </div>
              <div>
                <div *ngFor="let ks of filtered">
                  <app-ks-message
                    class="source-drag-handle"
                    proTip
                    tipHeader="Drag, Drop, Organize! 📁"
                    tipMessage="Get groovy with your sources! Just drag and drop them into any project in your project tree (sidebar). It's like arranging books on your favorite shelf!"
                    tipIcon="pi pi-arrows-alt"
                    [tipGroups]="['inbox', 'source']"
                    [ks]="ks"
                    (click)="setActive(ks)"
                    pDraggable="sources"
                    (onDragStart)="dragStart($event, ks)"
                    (onDragEnd)="dragEnd($event, ks)"
                    (contextmenu)="
                      setContext(ks); onKsContextMenu(context); cm.show($event)
                    "
                    [active]="active && ks.id.value === active.id.value"
                  >
                  </app-ks-message>
                </div>
              </div>
            </div>

            <div
              *ngIf="upNext.length == 0"
              class=""
              id="inbox-side-panel"
              #inboxSidePanel
            >
              <div
                style="width: 100%;"
                class="hover:surface-hover text-primary"
                proTip
                tipHeader="Ready for a Web Adventure?"
                tipMessage="Click here to dive into a selection of curated web Sources. These are perfect examples of how we neatly gather and display metadata. Time to surf the interwebs!"
                [tipGroups]="['inbox', 'source', 'intro']"
                [tipShowOnHover]="true"
              >
                <app-ks-message
                  class="cursor-pointer hover:surface-hover"
                  (click)="loadExamples()"
                  status="Surprise Me!"
                >
                </app-ks-message>
              </div>
            </div>
            <div class="w-full" *ngIf="loading">
              <p-progressBar
                mode="indeterminate"
                [style]="{ height: '2px' }"
              ></p-progressBar>
            </div>
          </div>

          <div class="app-splitter-right">
            <div *ngIf="active" class="w-full h-full flex flex-column">
              <app-source
                [source]="active"
                [dialog]="false"
                [reset]="reset"
                (remove)="onKsRemove([$event])"
                (update)="update($event)"
              ></app-source>
            </div>

            <div *ngIf="!active" class="w-full h-full flex flex-column">
              <app-dropzone
                [shouldShorten]="upNext.length > 0"
                [supportedTypes]="supportedTypes"
                hintMessage="Supported types: {{ supportedTypes.join(', ') }}"
              >
              </app-dropzone>
              <div
                class="inactive-inbox surface-hover gap-4 border-round-bottom-2xl"
              >
                <div (dragstart)="$event.preventDefault()">
                  <img
                    src="https://knowledge-app.s3.us-west-1.amazonaws.com/kc-icon-transparent.png"
                    alt="Knowledge Logo"
                    class="knowledge-logo"
                    [class.pulsate-fwd]="animate"
                  />
                </div>
                <div class="text-600 text-2xl">You're all caught up.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .inbox-container {
        border-style: hidden;
      }

      @media (min-width: 140rem) {
        .inbox-container {
          border-right-width: 1px !important;
          border-right-style: solid;
          border-left-width: 1px !important;
          border-left-style: solid;
          border-color: var(--surface-200) !important;
        }
      }

      .inactive-inbox {
        height: 100%;
        display: flex;
        flex-direction: column;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
})
export class HomeComponent implements OnDestroy {
  @ViewChild('splitter') splitter!: Splitter;

  upNext: KnowledgeSource[] = [];
  active?: KnowledgeSource;
  context?: KnowledgeSource;
  filtered?: KnowledgeSource[];
  kcProject: Observable<KcProject | null>;
  treeNodes: TreeNode[] = [];
  selectedProject: any;
  collapsed = false;
  ksMenuItems: MenuItem[] = [];
  loading = false;
  supportedTypes: string[] = ['Links', 'Files'];
  animate = true;
  importAll = false;
  reset = false;

  private _activeIndex = new BehaviorSubject<number>(0);

  activeIndex$ = this._activeIndex.asObservable();
  private cleanUp: Subject<any> = new Subject<any>();

  constructor(
    private confirm: ConfirmationService,
    private dnd: DragAndDropService,
    private factory: KsFactoryService,
    private filterService: FilterService,
    private ingest: IngestService,
    private projects: ProjectService,
    private menu: KsContextMenuService,
    private notifications: NotificationsService,
    private tree: ProjectTreeFactoryService,
    private settings: SettingsService
  ) {
    this.kcProject = projects.currentProject;

    this.supportedTypes = dnd.supportedTypes;

    settings.display
      .pipe(
        takeUntil(this.cleanUp),
        map((d) => d.animations),
        tap((animate) => (this.animate = animate))
      )
      .subscribe();

    tree.treeNodes
      .pipe(
        takeUntil(this.cleanUp),
        tap((nodes) => {
          this.treeNodes = nodes;
        })
      )
      .subscribe();

    tree.selected
      .pipe(
        takeUntil(this.cleanUp),
        tap((selected) => {
          this.selectedProject = selected;
        })
      )
      .subscribe();

    ingest.queue
      .pipe(
        takeUntil(this.cleanUp),
        tap((upNext) => {
          this.loading = true;
          this.upNext = upNext;

          // Sort messages by date received (most recent appears at the top)
          this.filtered = this.upNext.sort((a, b) => {
            if (a.dateCreated > b.dateCreated) {
              return -1;
            } else if (a.dateCreated < b.dateCreated) {
              return 1;
            } else {
              return 0;
            }
          });
          const activeIndex = this.upNext.findIndex(
            (ks) => ks.id.value === this.active?.id.value
          );
          this._activeIndex.next(activeIndex === -1 ? 0 : activeIndex);
          this.loading = false;
        })
      )
      .subscribe();

    this.activeIndex$.pipe().subscribe((index) => {
      this.active = this.upNext[index];
    });
  }

  ngOnDestroy() {
    this.cleanUp.next({});
    this.cleanUp.complete();
  }

  goToFirstTab() {
    this.reset = true;
    setTimeout(() => {
      this.reset = false;
    }, 500);
  }

  onKsRemove(sources: KnowledgeSource[]) {
    this.goToFirstTab();
    const message =
      sources.length === 1
        ? `Permanently remove ${sources[0].title}?`
        : `Permanently remove ${sources.length} Sources?`;
    const header = sources.length === 1 ? `Remove Source` : `Remove Sources`;

    // Prompt user to confirm removal
    this.confirm.confirm({
      message: message,
      header: header,
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonStyleClass: 'p-button-text p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      acceptIcon: 'pi pi-trash',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        const newIndex =
          sources.length === 1
            ? this._activeIndex.value > 0
              ? this._activeIndex.value - 1
              : 0
            : 0;
        for (const source of sources) {
          // Remove any chat artifacts for this source
          localStorage.removeItem(`chat-${source.id.value}`);
          this.ingest.remove(source);
        }
        this._activeIndex.next(newIndex);
      },
    });
  }

  setActive(ks: KnowledgeSource) {
    const found = this.upNext.indexOf(ks);
    this._activeIndex.next(found ? found : 0);
  }

  setContext(ks: KnowledgeSource) {
    const found = this.upNext.indexOf(ks);
    const index = found ? found : 0;
    this.context = this.upNext[index];
  }

  onPreviousSource() {
    if (this._activeIndex.value === 0) {
      this._activeIndex.next(this.upNext.length - 1);
    } else {
      this._activeIndex.next(Math.max(0, this._activeIndex.value - 1));
    }
  }

  onNextSource() {
    if (this._activeIndex.value === this.upNext.length - 1) {
      this._activeIndex.next(0);
    } else {
      this._activeIndex.next(
        Math.min(this._activeIndex.value + 1, this.upNext.length - 1)
      );
    }
  }

  onProjectImport() {
    this.goToFirstTab();
    if (!this.selectedProject) {
      this.notifications.warn(
        'Inbox',
        'Invalid Project',
        'You must select a valid project to import.'
      );
      return;
    }

    const project = this.projects.getProject(this.selectedProject.key);
    if (!project) {
      this.notifications.error(
        'Home',
        'Invalid Project',
        'That project cannot be found in storage.'
      );
      return;
    }

    if (this.importAll) {
      this.projects
        .updateProjects([
          {
            id: project.id,
            addKnowledgeSource: this.upNext,
          },
        ])
        .then(() => {
          if (this.active) {
            for (const source of this.upNext) {
              this.ingest.add(source);
            }
          }
        });
    } else if (this.active) {
      this.projects
        .updateProjects([
          {
            id: project.id,
            addKnowledgeSource: [this.active],
          },
        ])
        .then(() => {
          if (this.active) {
            this.ingest.add(this.active);
          }
        });
    }
  }

  collapseAll() {
    this.collapsed = false;
    setTimeout(() => {
      this.collapsed = true;
    });
  }

  onKsContextMenu(ks: KnowledgeSource | undefined) {
    if (ks) {
      this.ksMenuItems = this.menu
        .generate(ks)
        .filter(
          (k) =>
            k.label !== 'Details' &&
            k.label !== 'Goto Project' &&
            k.label !== 'Move'
        );

      const removeItem = this.ksMenuItems.find((k) => k.label === 'Remove');

      if (removeItem) {
        removeItem.command = () => {
          this.onKsRemove([ks]);
        };
      }
    }
  }

  onFilter($event: Event, value: string) {
    if (value) {
      this.filtered = this.upNext.filter((ks) =>
        JSON.stringify(ks)
          .toLocaleLowerCase()
          .includes(value.toLocaleLowerCase())
      );
    } else {
      this.filtered = this.upNext;
    }
  }

  loadExamples() {
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.factory
      .examples()
      .pipe(
        take(1),
        tap((sources: KnowledgeSource[]) => {
          this.ingest.enqueue(sources);
        })
      )
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        error: (error: any) => {
          setTimeout(() => {
            this.loading = false;
            this.notifications.error(
              'Inbox',
              'Unable to Load Examples',
              error,
              'toast'
            );
          }, 1000);
        },
      });
  }

  @HostListener('document:keydown.Control.[')
  @HostListener('document:keydown.meta.[')
  @HostListener('document:keydown.meta.ArrowUp')
  keyPressPrevious() {
    this.onPreviousSource();
  }

  @HostListener('document:keydown.Control.]')
  @HostListener('document:keydown.meta.]')
  @HostListener('document:keydown.meta.ArrowDown')
  keyPressNext() {
    this.onNextSource();
  }

  update($event: KnowledgeSource) {
    // Find the source and update it in place
    const found = this.upNext.find((ks) => ks.id.value === $event.id.value);
    if (found) {
      found.title = $event.title;
      found.description = $event.description;
      found.icon = $event.icon;
      found.dateDue = $event.dateDue;
      found.flagged = $event.flagged;
      found.topics = $event.topics;
    }
  }

  dragStart($event: any, ks: KnowledgeSource) {
    this.dnd
      .dragSource($event, ks)
      .pipe(
        take(1),
        tap((dragged) => {
          if (dragged === ks.id.value) {
            this.ingest.add(ks);
          }
        })
      )
      .subscribe();
  }

  dragEnd($event: any, rowData: any) {
    this.dnd.dragSourceEnd($event, rowData);
  }
}
