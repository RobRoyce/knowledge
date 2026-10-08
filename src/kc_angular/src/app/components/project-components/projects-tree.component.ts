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
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ProjectService } from '@services/factory-services/project.service';
import { MenuItem, TreeNode } from 'primeng/api';
import { ProjectCommandService } from '@services/command-services/project-command.service';
import { ProjectTreeFactoryService } from '@services/factory-services/project-tree-factory.service';
import {
  BehaviorSubject,
  merge,
  Observable,
  skip,
  Subject,
  tap,
  throttleTime,
} from 'rxjs';
import { ProjectContextMenuService } from '@services/factory-services/project-context-menu.service';
import { debounceTime, map, takeUntil } from 'rxjs/operators';
import { NotificationsService } from '@services/user-services/notifications.service';
import { DragAndDropService } from '@services/ingest-services/drag-and-drop.service';

@Component({
  selector: 'app-projects-tree',
  template: `
    <p-tree
      #projectTreeElement
      cdkDropList
      class="h-full"
      emptyMessage=" "
      selectionMode="single"
      styleClass="border-1 bg-primary-reverse text-color"
      scrollHeight="flex"
      [draggableNodes]="true"
      [droppableNodes]="true"
      [validateDrop]="true"
      (onNodeDrop)="drop($event)"
      (drop)="drop($event)"
      [style]="{ 'max-height': '100%' }"
      [contextMenu]="cm"
      [filter]="true"
      [value]="projectTree"
      [selection]="currentProject"
      (onNodeSelect)="selectionChange($event)"
      (onNodeContextMenuSelect)="onContextMenu($event)"
    >
      <ng-template pTemplate="header">
        <div class="flex-row-center-between">
          <button
            pButton
            icon="pi pi-plus"
            label="Project"
            (click)="onNewProject()"
            class="p-button-text p-button-plain"
          ></button>
          <button
            pButton
            icon="pi pi-trash"
            label="Remove"
            [disabled]="!projectTree"
            (click)="onRemoveProject(currentProject)"
            class="p-button-text p-button-plain p-button-danger"
          ></button>
        </div>
      </ng-template>

      <ng-template pTemplate="default" let-node>
        <div
          #nodeLabel
          class="drop-target"
          pDroppable="sources"
          [class.drop-target]="!(highlight$ | async)"
          [ngClass]="highlight$ | async"
          (onDrop)="drop($event, node.key)"
          (onDragEnter)="nodeLabel.classList.add('p-draggable-enter')"
          (onDragLeave)="nodeLabel.classList.remove('p-draggable-enter')"
          (mouseleave)="nodeLabel.classList.remove('p-draggable-enter')"
        >
          {{ node.label | truncate : [32] }}
        </div>
      </ng-template>

      <ng-template pTemplate="footer">
        <div class="flex-row-center-between border-top-1 border-400">
          <button
            pButton
            icon="pi pi-arrow-down"
            label="Expand"
            [disabled]="!projectTree || projectTree.length === 0"
            (click)="expandAll(projectTree, true)"
            class="p-button-text p-button-plain outline-none border-none shadow-none"
          ></button>
          <button
            pButton
            icon="pi pi-circle"
            class="p-button-text border-none outline-none shadow-none"
            [disabled]="!projectTree || projectTree.length === 0"
            pTooltip="Show current project"
            tooltipPosition="top"
            (click)="showSelected()"
          ></button>
          <button
            pButton
            icon="pi pi-arrow-up"
            label="Collapse"
            [disabled]="!projectTree || projectTree.length === 0"
            (click)="expandAll(projectTree, false)"
            class="p-button-text p-button-plain outline-none border-none shadow-none"
          ></button>
        </div>
      </ng-template>
    </p-tree>
    <p-contextMenu #cm [model]="menu" appendTo="body"></p-contextMenu>
  `,
  styles: [
    `
      ::ng-deep {
        .p-tree {
          height: 100%;
          border: none;
        }

        .p-treenode-droppoint {
          display: none !important;
          height: 0 !important;
          width: 0 !important;
        }

        .drop-target {
          border: 1px dashed transparent;
          transition: border-color 0.2s;

          &.p-draggable-enter {
            border-color: var(--primary-color);
            background: var(--primary-color) !important;
            color: var(--text-color) !important;
          }
        }
      }
    `,
  ],
})
export class ProjectsTreeComponent implements OnInit, OnDestroy {
  @ViewChild('nodeLabel', { static: true }) nodeLabel!: ElementRef;

  projectId = '';

  currentProject?: TreeNode;

  projectTree: TreeNode[] = [];

  menu: MenuItem[] = [];

  highlight$: Observable<string>;

  private projectChange = new BehaviorSubject<string>('');

  private cleanUp: Subject<any> = new Subject<any>();

  constructor(
    private dnd: DragAndDropService,
    private notify: NotificationsService,
    private projects: ProjectService,
    private pCommand: ProjectCommandService,
    private pContext: ProjectContextMenuService,
    private tree: ProjectTreeFactoryService
  ) {
    /* When user selects a project in the project tree, set current project via project service */
    this.projectChange
      .asObservable()
      .pipe(
        takeUntil(this.cleanUp),
        skip(1),
        debounceTime(500),
        tap((projectId) => {
          this.projects.setCurrentProject(projectId);
        })
      )
      .subscribe();

    /* When the project tree is updated, make sure the correct project is selected in the tree */
    const treeSub$ = tree.treeNodes.pipe(
      takeUntil(this.cleanUp),
      tap((nodes) => {
        this.projectTree = nodes;
      })
    );

    /* When the current project changes, make sure the correct project is selected in the tree */
    const projectSub$ = projects.currentProject.pipe(
      takeUntil(this.cleanUp),
      tap((project) => {
        this.projectId = project?.id.value ?? this.projectId;
      })
    );

    merge(treeSub$, projectSub$)
      .pipe(
        takeUntil(this.cleanUp),
        debounceTime(500),
        tap(() => {
          if (this.projectTree.length > 0) {
            this.notify.debug(
              'Project Tree',
              'Setting Active Project',
              `${this.projectId}`
            );
            this.currentProject =
              tree.findTreeNode(this.projectId, this.projectTree) ?? undefined;
            if (this.currentProject) {
              this.expandPath(this.currentProject);
            }
          }
        })
      )
      .subscribe();

    this.highlight$ = dnd.dropHighlight.pipe(
      throttleTime(50),
      map((highlight) =>
        highlight ? 'project-receptor-in' : 'project-receptor-out'
      )
    );
  }

  ngOnInit(): void {
    this.projects.scrollToActive(1000);
  }

  ngOnDestroy() {
    this.cleanUp.next({});
    this.cleanUp.complete();
  }

  selectionChange($event: any) {
    this.projectChange.next($event.node.key);
  }

  onNewProject(currentProject?: TreeNode) {
    this.pCommand.new(
      currentProject?.key ? { value: currentProject.key } : undefined
    );
  }

  onRemoveProject(currentProject?: TreeNode) {
    if (currentProject?.key) {
      const project = this.projects.getProject(currentProject.key);
      if (project) {
        this.pCommand.remove([project]);
      }
    }
  }

  expandAll(root: TreeNode[], expand: boolean) {
    for (const t of root) {
      t.expanded = expand;
      if (t.children && t.children.length > 0)
        this.expandAll(t.children, expand);
    }
  }

  onContextMenu($event: any) {
    if ($event.node) {
      const project = this.projects.getProject($event.node.key);

      if (project) {
        this.menu = this.pContext.generate(project);
      }
    } else {
      this.menu = [];
    }
  }

  showSelected() {
    if (this.currentProject) {
      this.expandPath(this.currentProject);
      this.projects.scrollToActive();
    }
  }

  drop($event: any, projectId?: string) {
    if ($event.dataTransfer?.getData('source') && projectId) {
      // This is a drag and drop event of a source onto a project, move source to project
      this.dnd.dropSource($event, projectId);
      return;
    } else if ($event.dataTransfer?.getData('sources') && projectId) {
      this.dnd.dropSources($event, projectId);
      return;
    }

    if (!$event.dropNode || !$event.dragNode) {
      $event.preventDefault();
      $event.stopPropagation();
      return;
    }

    // Three projects need to be updated when a project is moved
    // 1. The project that is moved
    // 2. The project that is the new parent
    // 3. The project that is now the old parent (if any)
    const dragProject = this.projects.getProject($event.dragNode.key);
    const dropProject = this.projects.getProject($event.dropNode.key);
    const oldParentProject = this.projects.getProject(
      dragProject?.parentId?.value ?? ''
    );

    if (!dragProject || !dropProject) {
      this.notify.error(
        'Project Tree',
        'Error moving project',
        'Could not resolve Project tree.'
      );

      return;
    }

    if (
      oldParentProject &&
      oldParentProject.id.value === dropProject.id.value
    ) {
      // Dropping on the same parent project, do nothing

      return;
    }

    dragProject.parentId.value = dropProject.id.value;
    dropProject.subprojects.push(dragProject.id.value);
    const updates = [
      {
        id: dropProject.id,
        expanded: true,
      },
      {
        id: dragProject.id,
        expanded: dragProject.expanded,
      },
    ];

    if (oldParentProject) {
      oldParentProject.subprojects = oldParentProject.subprojects.filter(
        (id) => id !== dragProject.id.value
      );
      updates.push({
        id: oldParentProject.id,
        expanded: oldParentProject.expanded,
      });
    }

    this.projects.updateProjects(updates);
  }

  private expandPath = (node: TreeNode) => {
    let curr = node.parent;
    while (curr) {
      curr.expanded = true;
      curr = curr.parent;
    }
  };
}
