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
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { ProjectService } from './project.service';

@Injectable({
  providedIn: 'root',
})
export class KsContextMenuService {
  styleClass = 'surface-0';

  constructor(
    private ksCommandService: KsCommandService,
    private projectService: ProjectService
  ) {}

  generate(target: KnowledgeSource, ksList?: KnowledgeSource[]): MenuItem[] {
    let menu: MenuItem[] = [
      {
        label:
          target.title.substring(0, 16) +
          (target.title.length > 16 ? '...' : ''),
        disabled: true,
        icon: 'pi pi-file',
      },
      {
        label: '',
        separator: true,
      },
      {
        label: 'Details',
        icon: PrimeIcons.INFO,
        command: () => {
          this.ksCommandService.detail(target);
        },
      },
      {
        label: 'Preview',
        icon: PrimeIcons.EYE,
        command: () => {
          this.ksCommandService.preview(target);
        },
      },
      {
        label: 'Open',
        icon: PrimeIcons.EXTERNAL_LINK,
      },
      {
        label: 'Chat',
        icon: PrimeIcons.COMMENTS,
        command: () => {
          this.ksCommandService.chat(target);
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
          if (target.associatedProject)
            this.projectService.setCurrentProject(
              target.associatedProject.value
            );
        },
      },
      {
        label: 'Copy',
        icon: PrimeIcons.COPY,
      },
      {
        label: '',
        separator: true,
      },
      {
        label: 'Remove',
        icon: PrimeIcons.TRASH,
      },
    ];

    let ksLabel = target.title.substring(0, 13);
    if (target.title.length > 13) {
      ksLabel += '...';
    }

    menu = this.setRemove(menu, target, ksLabel, ksList);
    menu = this.setOpen(menu, target, ksLabel, ksList);
    menu = this.setCopy(menu, target, ksLabel, ksList);
    menu = this.setShowIn(menu, target);
    return menu;
  }

  private setRemove(
    menu: MenuItem[],
    target: KnowledgeSource,
    label: string,
    ksList?: KnowledgeSource[]
  ): MenuItem[] {
    const remove = menu.find((m) => m.label === 'Remove');

    if (remove && (!ksList || ksList.length === 0)) {
      remove.label = 'Remove';
      remove.command = () => {
        this.ksCommandService.remove([target]);
      };
    } else if (remove) {
      remove.items = [
        {
          label: label,
          styleClass: this.styleClass,
          command: () => {
            this.ksCommandService.remove([target]);
          },
        },
      ];
      if (ksList && ksList.length > 1) {
        remove.items.push({
          label: `Selected (${ksList.length})`,
          styleClass: this.styleClass,
          command: () => {
            this.ksCommandService.remove(ksList);
          },
        });
      }
    }
    return menu;
  }

  private setOpen(
    menu: MenuItem[],
    target: KnowledgeSource,
    label: string,
    ksList?: KnowledgeSource[]
  ): MenuItem[] {
    const open = menu.find((m) => m.label === 'Open');

    if (open && (!ksList || ksList.length === 0)) {
      open.label = 'Open';
      open.command = () => {
        this.ksCommandService.open(target);
      };
    } else if (open) {
      open.items = [
        {
          label: label,
          styleClass: this.styleClass,
          command: () => {
            this.ksCommandService.open(target);
          },
        },
      ];
      if (ksList && ksList.length > 1) {
        open.items.push({
          label: `Selected (${ksList.length})`,
          styleClass: this.styleClass,
          command: () => {
            for (const ks of ksList) {
              this.ksCommandService.open(ks);
            }
          },
        });
      }
    }
    return menu;
  }

  private setCopy(
    menu: MenuItem[],
    target: KnowledgeSource,
    label: string,
    ksList?: KnowledgeSource[]
  ) {
    const copy = menu.find((m) => m.label === 'Copy');

    if (copy && (!ksList || ksList.length === 0)) {
      copy.items = [
        {
          label: target.ingestType === 'file' ? 'Path' : 'Link',
          styleClass: this.styleClass,
          command: () => {
            this.ksCommandService.copyPath([target]);
          },
        },
        {
          label: 'Object as JSON',
          styleClass: this.styleClass,
          command: () => {
            this.ksCommandService.copyJSON([target]);
          },
        },
      ];
    } else if (copy) {
      copy.items = [
        {
          label: label,
          styleClass: this.styleClass,
          items: [
            {
              label: target.ingestType === 'file' ? 'Path' : 'Link',
              styleClass: this.styleClass,
              command: () => {
                this.ksCommandService.copyPath([target]);
              },
            },
            {
              label: 'Object as JSON',
              styleClass: this.styleClass,
              command: () => {
                this.ksCommandService.copyJSON([target]);
              },
            },
          ],
        },
      ];

      if (ksList && ksList.length) {
        const nFiles = ksList.filter((k) => k.ingestType === 'file').length;
        const nLinks = ksList.length - nFiles;
        let multiLabel = ``;
        if (nFiles > 0) {
          multiLabel += `Path${nFiles > 1 ? 's' : ''} (${nFiles})${
            nLinks > 0 ? ' / ' : ''
          }`;
        }
        if (nLinks > 0) {
          multiLabel += `Link${nLinks > 1 ? 's' : ''} (${nLinks})`;
        }
        copy.items.push({
          label: `Selected`,
          styleClass: this.styleClass,
          items: [
            {
              label: multiLabel,
              styleClass: this.styleClass,
              command: () => {
                this.ksCommandService.copyPath(ksList);
              },
            },
            {
              label: `Objects as JSON (${ksList.length})`,
              styleClass: this.styleClass,
              command: () => {
                this.ksCommandService.copyJSON(ksList);
              },
            },
          ],
        });
      }
    }

    return menu;
  }

  private setShowIn(menu: MenuItem[], target: KnowledgeSource) {
    if (target.ingestType === 'file') {
      const menuItem = {
        label: 'Show in files',
        icon: PrimeIcons.FOLDER_OPEN,
        command: () => {
          this.ksCommandService.showInFiles(target);
        },
      };
      menu.splice(5, 0, menuItem);
    }
    return menu;
  }
}
