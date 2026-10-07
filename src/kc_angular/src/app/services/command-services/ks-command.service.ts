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

import { Platform } from '@app/platform/platform';
import { ManagedFiles } from '@app/platform/managed-files';
import { BehaviorSubject } from 'rxjs';
import { BrowserViewDialogService } from '@services/ipc-services/browser-view-dialog.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { ConfirmationService } from 'primeng/api';
import { DataService } from '../user-services/data.service';
import { DialogService } from 'primeng/dynamicdialog';
import { ElectronIpcService } from '@services/ipc-services/electron-ipc.service';
import { Injectable } from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { NotificationsService } from '../user-services/notifications.service';
import { ProjectService } from '@services/factory-services/project.service';
import { ProjectUpdateRequest } from '@app/models/project.model';

@Injectable({
  providedIn: 'root',
})
export class KsCommandService {
  private _ksDetailEvent = new BehaviorSubject<
    (KnowledgeSource & { force: boolean; view?: string }) | undefined
  >(undefined);
  ksDetailEvent = this._ksDetailEvent.asObservable();

  private _ksShareEvent = new BehaviorSubject<KnowledgeSource[]>([]);
  ksShareEvent = this._ksShareEvent.asObservable();

  private _ksShowInFilesEvent = new BehaviorSubject<KnowledgeSource>({} as any);
  ksShowInFilesEvent = this._ksShowInFilesEvent.asObservable();

  constructor(
    private ipc: ElectronIpcService,
    private data: DataService,
    private browser: BrowserViewDialogService,
    private dialog: DialogService,
    private confirmation: ConfirmationService,
    private clipboard: Clipboard,
    private notifications: NotificationsService,
    private projects: ProjectService,
    private managedFiles: ManagedFiles,
    private platform: Platform
  ) {}

  update(ksList: KnowledgeSource[], notify = true) {
    this.data.sources.update(ksList).then(() => {
      if (notify) {
        this.notifications.success(
          'Source Command',
          `Source${ksList.length > 1 ? 's' : ''} Updated`,
          ksList.map((k) => k.title).join(', ')
        );
      }
    });
  }

  remove(ksList: KnowledgeSource[]) {
    if (ksList.length <= 0) {
      return;
    }

    this.confirmation.confirm({
      message: `Permanently remove ${
        ksList.length === 1 ? ksList[0].title : `${ksList.length} Sources`
      }?`,
      header: `Remove Source${ksList.length === 1 ? '' : 's'}`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonStyleClass: 'p-button-text p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      acceptIcon: 'pi pi-trash',
      accept: () => {
        // TODO: if the KS points to a local file, ask the user what they want to be done with the file...
        const updates: ProjectUpdateRequest[] = [];

        ksList.forEach((ks) => {
          const proj = updates.find(
            (p) => p.id.value === ks.associatedProject.value
          );
          if (proj) {
            if (proj.removeKnowledgeSource) {
              proj.removeKnowledgeSource.push(ks);
            }
          } else {
            updates.push({
              id: ks.associatedProject,
              removeKnowledgeSource: [ks],
            });
          }
        });
        this.projects.updateProjects(updates);
      },
    });
  }

  preview(ks: KnowledgeSource) {
    this.onKsPreview(ks);
  }

  detail(ks: KnowledgeSource, force = false) {
    this._ksDetailEvent.next({ ...ks, ...{ force: force } });
  }

  share(ksList: KnowledgeSource[]) {
    this._ksShareEvent.next(ksList);
  }

  chat(ks: KnowledgeSource) {
    this._ksDetailEvent.next({ ...ks, ...{ force: true, view: 'chat' } });
  }

  open(ks: Partial<KnowledgeSource>) {
    if (ks.ingestType === 'file' && ks.assetId) {
      // Desktop: default app. Browser: a new tab.
      this.managedFiles
        .open(
          ks.assetId,
          ks.reference?.source?.file?.filename ?? ks.title ?? 'file'
        )
        .then(() =>
          this.notifications.success(
            'Source Command',
            'File Opened',
            ks.title ?? ''
          )
        )
        .catch((e: unknown) =>
          this.notifications.error(
            'Source Command',
            'Unable to Open File',
            `${e}`
          )
        );
    } else if (ks.ingestType === 'file' && typeof ks.accessLink === 'string') {
      this.ipc.openLocalFile(ks.accessLink).then((result) => {
        if (result) {
          this.notifications.success(
            'Source Command',
            'File Opened',
            ks.title ?? ''
          );
        } else {
          this.notifications.error(
            'Source Command',
            'Failed to Open',
            ks.title ?? ''
          );
        }
      });
    } else if (ks && ks.accessLink) {
      window.open(
        typeof ks.accessLink === 'string' ? ks.accessLink : ks.accessLink.href
      );
      this.notifications.success(
        'Source Command',
        'Link Opened',
        ks.title ?? ''
      );
    }

    if (!ks.events) {
      ks.events = [];
    }

    ks.events.push({
      date: new Date(),
      label: 'Accessed',
    });
  }

  copyPath(ksList: KnowledgeSource[]) {
    if (ksList.length <= 0) {
      return;
    }
    const paths = [];
    for (const ks of ksList) {
      paths.push(
        typeof ks.accessLink === 'string' ? ks.accessLink : ks.accessLink.href
      );
    }
    this.clipboard.copy(paths.join('\n'));
    this.notifications.success('Source Command', 'Copied to Clipboard!', '');
  }

  copyJSON(ksList: KnowledgeSource[]) {
    if (ksList.length <= 0) {
      return;
    }

    let ksStr = '';
    try {
      ksStr = JSON.stringify(ksList);
      this.clipboard.copy(ksStr);
      this.notifications.success('Source Command', 'Copied to Clipboard!', '');
    } catch (e) {
      return;
    }
  }

  showInFiles(ks: KnowledgeSource) {
    if (typeof ks.accessLink !== 'string') {
      return;
    }
    // Browser: no access to local folders. Open the managed file instead.
    if (!this.platform.has('showInFolder')) {
      this.open(ks);
      return;
    }
    this.ipc.showItemInFolder(ks.accessLink);
    this._ksShowInFilesEvent.next(ks);
  }

  private async onKsPreview(ks: KnowledgeSource) {
    const dialogRef = this.browser.open({ ks: ks });

    if (dialogRef === undefined) {
      this.notifications.warn(
        'Source Command',
        'Unsupported File Type',
        'Opening with default application instead.'
      );
      this.open(ks);
      return;
    }

    const textExtractor = this.ipc.extractedText.subscribe((data) => {
      const text = data.text.trim();
      if (
        text !== '' &&
        data.url.includes(
          typeof ks.accessLink === 'string' ? ks.accessLink : ks.accessLink.href
        )
      ) {
        if (!ks.description.includes(data.text)) {
          ks.description += data.text + '\n\n';
        }
      }
    });

    let closed = false;
    dialogRef?.onClose.subscribe((result) => {
      if (!result) {
        return;
      }

      if (!closed) {
        textExtractor.unsubscribe();
        try {
          if (ks.associatedProject) {
            const update: ProjectUpdateRequest = {
              id: ks.associatedProject,
              updateKnowledgeSource: [ks],
            };
            this.projects.updateProjects([update]);
          }
        } catch (e) {
          this.notifications.warn(
            'Source Command',
            'Invalid Project',
            'Unable to update project after closing the preview dialog...'
          );
        }

        closed = true;
      }
    });
  }
}
