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

import { BehaviorSubject, fromEvent, Observable, Subject, tap } from 'rxjs';
import { Injectable, OnDestroy } from '@angular/core';
import { NotificationsService } from '@services/user-services/notifications.service';
import { ProjectService } from '@services/factory-services/project.service';
import { ProjectTreeNode } from '@app/models/project.tree.model';
import { TreeNode } from 'primeng/api';
import { constructTreeNodes } from '@app/workers/tree.worker';
import { delay, take, takeUntil } from 'rxjs/operators';

interface ProjectJSON {
  name: string;
  subprojects: ProjectJSON[];
}

@Injectable({
  providedIn: 'root',
})
export class ProjectTreeFactoryService implements OnDestroy {
  private _treeNodes = new BehaviorSubject<TreeNode[]>([]);

  treeNodes: Observable<TreeNode[]> = this._treeNodes.asObservable();

  private _selected = new BehaviorSubject<TreeNode>({});

  selected = this._selected.asObservable();

  private cleanUp: Subject<any> = new Subject<any>();

  constructor(
    private projectService: ProjectService,
    private notifications: NotificationsService
  ) {
    projectService.projectTree
      .pipe(
        takeUntil(this.cleanUp),
        tap((nodes) => {
          this.notifications.debug(
            'Project Tree Factory',
            'Project Tree Updated',
            'running update...'
          );
          this.update(nodes, false);
        })
      )
      .subscribe();

    projectService.projectTree
      .pipe(
        take(1),
        delay(1000),
        tap(() => {
          this.notifications.debug(
            'Project Tree Factory',
            'Setting Initial Project',
            ``
          );
          const projectId = projectService.getCurrentProjectId();
          if (projectId) {
            const node = this.findTreeNode(
              projectId.value,
              this._treeNodes.value
            );
            if (node) {
              this._selected.next(node);
            }
          }
        })
      )
      .subscribe();

    projectService.currentProject
      .pipe(
        takeUntil(this.cleanUp),
        tap((project) => {
          this.notifications.debug(
            'Project Tree Factory',
            'Current Project Changed',
            `${project?.name}`
          );
          if (project) {
            const node = this.findTreeNode(
              project.id.value,
              this._treeNodes.value
            );
            if (node) {
              this._selected.next(node);
            }
          }
        })
      )
      .subscribe();
  }

  ngOnDestroy() {
    this.cleanUp.next({});
    this.cleanUp.complete();
  }

  findTreeNode(id: string, treenodes?: TreeNode[]): TreeNode | undefined {
    if (!treenodes) {
      treenodes = this._treeNodes.value;
    }

    let found = treenodes.find((n) => n.key == id);
    if (found) {
      return found;
    }
    for (const node of treenodes) {
      if (node.children && node.children.length > 0) {
        found = this.findTreeNode(id, node.children);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  generateYAML(root: TreeNode, level: number): string {
    //   Recursively generate YAML, using the following format:
    //   - name: Project Name
    //     subprojects:
    //     - name: Subproject Name
    //       subprojects:
    //      - ...

    let yaml = '';
    const indent = '-'.repeat(level);
    yaml += `${indent}${root.label}\n`;
    if (root.children && root.children.length > 0) {
      for (const child of root.children) {
        yaml += this.generateYAML(child, level + 1);
      }
    }
    return yaml;
  }

  generateJSON(root: TreeNode): string {
    // Generate JSON in the following format:
    // {
    //   "name": "Project Name",
    //   "subprojects": [
    //     {
    //       "name": "Subproject Name",
    //       "subprojects": [...]
    //     }
    //   ]
    // }

    if (!root.label) {
      return 'Invalid Project Name';
    }

    const json: ProjectJSON = {
      name: root.label,
      subprojects: [],
    };
    if (root.children && root.children.length > 0) {
      for (const child of root.children) {
        json.subprojects.push(JSON.parse(this.generateJSON(child)));
      }
    }

    return JSON.stringify(json);
  }

  /**
   * Generate a tree in the same format as the `tree` command in Unix.
   * e.g.:
   * Project Name
   * ├── Subproject Name
   * │   ├── Subsubproject Name
   * │   └── Subsubproject Name
   * └── Subproject Name
   */
  generateTree(
    root: TreeNode,
    level = 0,
    isLastSubproject = false,
    prefix = ''
  ) {
    let tree = '';
    if (level > 0) {
      tree += prefix + (isLastSubproject ? '└── ' : '├── ') + root.label + '\n';
    } else {
      tree += `<b>${root.label}</b>` + '\n';
    }

    if (root.children && root.children.length > 0) {
      const newPrefix =
        prefix + (level === 0 ? '    ' : isLastSubproject ? '    ' : '│   ');
      root.children.forEach((child, index) => {
        if (root.children) {
          const isLastChild = index === root.children.length - 1;
          tree += this.generateTree(child, level + 1, isLastChild, newPrefix);
        }
      });
    }

    if (level === 0) {
      return '<code>\n' + tree + '</code>\n';
    }
    return tree;
  }

  private update(
    projectNodes: ProjectTreeNode[],
    collapsed: boolean,
    parent?: TreeNode
  ) {
    const worker = new Worker(
      new URL('../../workers/tree.worker', import.meta.url)
    );

    if (worker) {
      const nodes$ = fromEvent(worker, 'message');
      nodes$
        .pipe(
          take(1),
          tap((results: any) => {
            this._treeNodes.next(results.data);
          })
        )
        .subscribe();

      worker.postMessage({
        nodes: projectNodes,
        collapsed: collapsed,
        parent: parent,
      });
    } else {
      this.notifications.debug(
        'Project Tree Factory',
        'Web Worker Unavailable',
        'Constructing tree in main process.'
      );
      const treeNodes: TreeNode[] = constructTreeNodes(
        projectNodes,
        collapsed,
        parent
      );

      for (const node of projectNodes) {
        const proj = this.projectService.getProject(node.id);
        const treeNode: TreeNode = {
          label: node.name,
          data: JSON.stringify(proj?.knowledgeSource),
          expanded: collapsed ? false : node.expanded,
          leaf: node.subprojects.length === 0,
          selectable: true,
          draggable: true,
          parent: parent,
          droppable: true,
          key: node.id,
          icon: node.icon,
        };

        treeNode.children = constructTreeNodes(
          node.subprojects,
          collapsed,
          treeNode
        );
        treeNodes.push(treeNode);
      }

      this._treeNodes.next(treeNodes);
    }
  }
}
