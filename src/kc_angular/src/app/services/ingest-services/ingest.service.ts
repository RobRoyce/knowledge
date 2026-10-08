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
import { AutoscanService } from './autoscan.service';
import { BehaviorSubject, skip } from 'rxjs';
import { DomSanitizer } from '@angular/platform-browser';
import { ElectronIpcService } from '../ipc-services/electron-ipc.service';
import { ExtensionService } from './extension.service';
import { FaviconService } from './favicon.service';
import { Injectable, OnDestroy, SecurityContext } from '@angular/core';
import {
  KnowledgeSource,
  KnowledgeSourceReference,
  SourceModel,
} from '@app/models/knowledge.source.model';
import { KnowledgeSourceIngestTask } from '@shared/models/knowledge.source.model';
import { KsFactoryService } from '../factory-services/ks-factory.service';
import { NotificationsService } from '../user-services/notifications.service';
import { ProjectService } from '../factory-services/project.service';
import { SettingsService } from '../ipc-services/settings.service';

@Injectable({
  providedIn: 'root',
})
export class IngestService implements OnDestroy {
  private _queue = new BehaviorSubject<KnowledgeSource[]>([]);
  queue = this._queue.asObservable();

  private tasks: KnowledgeSourceIngestTask[] = [];

  constructor(
    private favicon: FaviconService,
    private factory: KsFactoryService,
    private autoscan: AutoscanService,
    private extension: ExtensionService,
    private settings: SettingsService,
    private ipc: ElectronIpcService,
    private projects: ProjectService,
    private sanitizer: DomSanitizer,
    private notify: NotificationsService
  ) {
    this.autoscanSubscribe();
    this.extensionSubscribe();

    this.loadInbox();

    this.queue.subscribe((sources) => {
      // Persist source list every time it is update. Restore it on app load.
      const sourceString = JSON.stringify(sources);
      localStorage.setItem('ingest-queue', sourceString);
    });
  }

  ngOnDestroy() {
    for (const task of this.tasks) {
      task.callback('delay');
    }
  }

  enqueue(ksList: KnowledgeSource[]) {
    let ksQueue = this._queue.value;
    const ksNext: KnowledgeSource[] = [];

    for (const ks of ksList) {
      if (
        ksQueue.find(
          (k) =>
            k.id.value === ks.id.value ||
            k.accessLink.toString() == ks.accessLink.toString() ||
            k.title === ks.title
        )
      ) {
        this.notify.warn(
          'Ingest Service',
          'Ignoring Duplicate',
          `Source: ${ks.title}`,
          'toast'
        );
        continue;
      }

      ksNext.push(ks);
    }

    if (ksNext.length <= 0) {
      return;
    }

    ksQueue = ksQueue.concat(ksNext);

    ksQueue.forEach((ks) => {
      ks.dateCreated = new Date(ks.dateCreated);
    });

    // Sort by date created
    ksQueue.sort((a, b) => {
      if (a.dateCreated < b.dateCreated) {
        return -1;
      }
      if (a.dateCreated > b.dateCreated) {
        return 1;
      }
      return 0;
    });

    this._queue.next(ksQueue);

    if (ksList.length <= 0) {
      return;
    }

    this.notify.success(
      'IngestService',
      'Source Imported',
      `Imported ${ksNext.length} Source${ksNext.length > 1 ? 's' : ''}.`
    );
  }

  add(ks: KnowledgeSource) {
    this.finalize(ks, 'add');
    this._queue.next(
      this._queue.value.filter((k) => k.id.value !== ks.id.value)
    );
  }

  remove(ks: KnowledgeSource) {
    this.finalize(ks, 'remove');
    this._queue.next(
      this._queue.value.filter((k) => k.id.value !== ks.id.value)
    );
  }

  delay(ks: KnowledgeSource) {
    this.finalize(ks, 'delay');
    this._queue.next(
      this._queue.value.filter((k) => k.id.value !== ks.id.value)
    );
  }

  show() {
    this.settings.show('import');
  }

  private loadInbox() {
    const inbox = localStorage.getItem('ingest-queue');
    if (inbox) {
      const sources = JSON.parse(inbox);

      for (const source of sources) {
        source.icon = undefined;
      }

      this.favicon.extractFromKsList(sources).then((updated) => {
        this.enqueue(updated);
      });
    }
  }

  /**
   * Subscribe to file watcher, which communicates with Electron IPC, which in turn watches a local directory for files
   * Once an extension event occurs, create a new Knowledge Source and notify listeners that a new KS is available
   *
   * TODO: Ideally, this function should use ksFactory to create KS
   */
  private autoscanSubscribe() {
    this.autoscan.files.subscribe((fileModels) => {
      if (!fileModels || fileModels.length === 0) {
        return;
      }

      const iconRequests = [];
      const ksList: KnowledgeSource[] = [];

      for (const fileModel of fileModels) {
        iconRequests.push(fileModel.path);
      }

      this.ipc.getFileIcon(iconRequests).then((icons) => {
        for (let i = 0; i < fileModels.length; i++) {
          const fileModel = fileModels[i];
          const sourceLink = fileModel.path;
          const source = new SourceModel(fileModel, undefined);
          const ref = new KnowledgeSourceReference('file', source, sourceLink);
          const ks = new KnowledgeSource(
            fileModel.filename,
            fileModel.id,
            'file',
            ref
          );
          ks.dateAccessed = [];
          ks.dateModified = [];
          ks.dateCreated = new Date();
          ks.iconUrl = this.favicon.file();
          ks.icon = icons[i];
          ks.importMethod = 'autoscan';
          ksList.push(ks);

          this.tasks.push({
            id: ks.id.value,
            callback: (method: 'add' | 'remove' | 'delay') => {
              this.autoscan.finalize(ks.id, method);
            },
            method: 'autoscan',
          });
        }

        this.enqueue(ksList);
      });
    });

    this.autoscan.move.subscribe((move) => {
      this.projects.getAllProjects().then((projects) => {
        for (const project of projects) {
          const ks = project.knowledgeSource.find(
            (k) => k.id.value === move.id
          );
          if (ks) {
            ks.accessLink = move.newPath;
            this.projects.updateProjects([
              {
                id: project.id,
              },
            ]);
            return;
          }
        }
      });
    });
  }

  /**
   * Subscribe to browser watcher, which communicates with Electron IPC, which in turn listens to browser extensions
   * Once an extension event occurs, create a new Knowledge Source and notify listeners that a new KS is available
   * @private
   */
  private extensionSubscribe() {
    this.extension.links.pipe(skip(1)).subscribe((webSource) => {
      if (!webSource || !webSource.accessLink) {
        this.notify.warn(
          'IngestService',
          'Empty Link',
          `Received empty link: ${webSource.accessLink}`
        );
        return;
      }

      const sanitized = this.sanitizer.sanitize(
        SecurityContext.URL,
        webSource.accessLink
      );
      if (!sanitized) {
        this.notify.error(
          'IngestService',
          'Link Rejected',
          'Unable to sanitize URL received from browser extension.'
        );
        return;
      }

      this.factory
        .make('website', sanitized)
        .then((ks) => {
          ks.importMethod = 'extension';
          ks.title = webSource.title ?? ks.title;
          ks.iconUrl = webSource.iconUrl ?? ks.iconUrl;
          ks.topics = webSource.topics ?? [];
          ks.flagged = webSource.flagged;
          ks.description = webSource.description ?? '';
          ks.rawText = webSource.rawText;
          ks.thumbnail = webSource.thumbnail;
          if (ks.reference.source.website)
            ks.reference.source.website.metadata = webSource.metadata;

          /* TODO: Move this to ks.markup once it gets implemented after schema changes... */
          if (webSource.markup?.notes && webSource.markup.notes.length > 0) {
            ks.rawText = webSource.markup?.notes[0].body;
          }

          // TODO: need to make sure the factory doesn't do any additional work that was already done by the extensions
          //      i.e. don't try to scrape meta tags if they have already been scraped

          this.enqueue([ks]);
        })
        .catch(() => {
          this.notify.error(
            'IngestService',
            'Exception',
            'Unable to sanitize URL received from browser extension.'
          );
        });
    });
  }

  /**
   * Perform any remaining tasks associated with importing `ks` given the desired `operation`
   * @param ks An imported Knowledge Source to be finalized
   * @param operation
   * @private
   */
  private finalize(ks: KnowledgeSource, operation: 'add' | 'remove' | 'delay') {
    // TODO: Files added using file manager should not be checked either (not that checking hurts, but still)...
    if (ks.ingestType !== 'file') {
      return;
    }
    if (
      this.settings.get().ingest.manager.target !== 'all' &&
      ks.importMethod !== 'autoscan'
    ) {
      return;
    }

    const task = this.tasks.find((t) => t.id === ks.id.value);
    if (task) {
      this.notify.debug(
        'IngestService',
        'Finalizing',
        `id: ${ks.id.value}, original import method: ${task.method}, operation: ${operation}`
      );
      task.callback(operation);
    } else {
      this.notify.debug(
        'IngestService',
        'Task Not Found',
        `Unable to locate task belonging to id ${ks.id.value}`
      );
    }
  }
}
