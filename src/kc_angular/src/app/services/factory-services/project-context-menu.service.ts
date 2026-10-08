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

import { Injectable } from '@angular/core';
import { KcProject, ProjectUpdateRequest } from '@app/models/project.model';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { ProjectCommandService } from '@services/command-services/project-command.service';
import { ProjectService } from './project.service';
import { ProjectTreeFactoryService } from '@services/factory-services/project-tree-factory.service';
import { Clipboard } from '@angular/cdk/clipboard';

@Injectable({
  providedIn: 'root',
})
export class ProjectContextMenuService {
  constructor(
    private projects: ProjectService,
    private pCommand: ProjectCommandService,
    private tree: ProjectTreeFactoryService,
    private clipboard: Clipboard
  ) {}

  generate(project: KcProject, projects?: KcProject[]): MenuItem[] {
    return [
      {
        label:
          project.name.substring(0, 16) +
          (project.name.length > 16 ? '...' : ''),
        disabled: true,
        icon: 'pi pi-folder',
      },
      {
        label: '',
        separator: true,
      },
      {
        label: 'Details',
        icon: PrimeIcons.INFO,
        command: () => {
          this.pCommand.detail(project);
        },
      },
      {
        label: 'Add Subproject',
        icon: PrimeIcons.PLUS,
        command: () => {
          this.pCommand.new(project.id);
        },
      },
      {
        label: 'Convert to Root',
        icon: PrimeIcons.ARROW_CIRCLE_UP,
        command: () => {
          // Remove parent project from this project
          const realProject = this.projects.getProject(project.id);
          if (!realProject) return;

          const parent = this.projects.getProject(project.parentId.value);

          project.parentId = { value: '' };
          realProject.parentId = { value: '' };

          const updates: ProjectUpdateRequest[] = [{ id: realProject.id }];

          // Update parent project by removing this project from its children
          if (parent) {
            parent.subprojects = parent.subprojects.filter(
              (p) => p !== project.id.value
            );
            updates.push({ id: parent.id });
          }

          // Update projects
          this.projects.updateProjects(updates);
        },
      },
      {
        label: '',
        separator: true,
      },
      {
        label: 'Goto Project',
        icon: PrimeIcons.ARROW_CIRCLE_RIGHT,
        command: () => {
          this.projects.setCurrentProject(project.id.value);
        },
      },
      {
        label: 'Copy as JSON',
        icon: PrimeIcons.COPY,
        command: () => {
          this.pCommand.copyJSON(projects ? projects : [project]);
        },
      },
      {
        label: 'Copy Project Tree',
        icon: PrimeIcons.COPY,
        items: [
          {
            label: 'YAML',
            icon: 'pi pi-file',
            command: () => {
              const treeNode = this.tree.findTreeNode(project.id.value);
              if (!treeNode) return;
              const yaml = this.tree.generateYAML(treeNode, 0);
              this.clipboard.copy(yaml);
            },
          },
          {
            label: 'JSON',
            icon: 'pi pi-file',
            command: () => {
              const treeNode = this.tree.findTreeNode(project.id.value);
              if (!treeNode) return;
              const json = this.tree.generateJSON(treeNode);
              this.clipboard.copy(json);
            },
          },
        ],
      },
      {
        label: '',
        separator: true,
      },
      {
        label: 'Remove',
        icon: PrimeIcons.TRASH,
        command: () => {
          this.pCommand.remove([project]);
        },
      },
    ];
  }
}
