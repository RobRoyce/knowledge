/*
 * Copyright (c) 2023 Rob Royce
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
import { isDesktop } from '@app/platform/platform';
import { Injectable } from '@angular/core';
import { KnowledgeSourceFactoryRequest } from '@services/factory-services/ks-factory.service';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { NotificationsService } from '@services/user-services/notifications.service';
import { ProjectUpdateRequest } from '@app/models/project.model';
import { ProjectService } from '@services/factory-services/project.service';
import { BehaviorSubject, skip, throttleTime } from 'rxjs';

export type DragAndDropPacket = {
  text?: string;
  html?: string;
  uri?: string;
  event?: DragEvent;
};

type TransferHandler = {
  HANDLER_TYPE: string;

  /* Optional prefix specifying the types of data transfers supported (e.g. cal: message:, etc) */
  URI_PREFIX?: string;

  /* Certain handlers may only be available for specific Operating Systems */
  SUPPORTED_OS?: 'MacOS' | 'Windows';

  /**
   * Acceptor function returns true if handler can support this event, otherwise false
   * @param data
   */
  accepts: (data: DragAndDropPacket) => boolean;

  /**
   * Callback function to handle transfer event if handler is chosen
   * @param data
   */
  callback: (
    data: DragAndDropPacket
  ) => Promise<KnowledgeSourceFactoryRequest | undefined>;
};

@Injectable({
  providedIn: 'root',
})
export class DragAndDropService {
  _sourceDrop = new BehaviorSubject<string>('');
  sourceDrop = this._sourceDrop.asObservable().pipe(skip(1));

  _dropHighlight = new BehaviorSubject<boolean>(false);
  dropHighlight = this._dropHighlight
    .asObservable()
    .pipe(skip(1), throttleTime(250));

  private pending?: string;
  private __data_transfer_handlers: TransferHandler[] = [
    {
      HANDLER_TYPE: 'Local Files',
      accepts: (data: DragAndDropPacket) => {
        if (!data.event?.dataTransfer?.items) {
          return false;
        }
        for (let i = 0; i < data.event.dataTransfer.items.length; i++) {
          if (data.event.dataTransfer.items[i].kind === 'file') {
            return true;
          }
        }
        return false;
      },
      callback: (data: DragAndDropPacket) =>
        new Promise<KnowledgeSourceFactoryRequest | undefined>((resolve) => {
          const files: File[] = [];
          if (!data.event?.dataTransfer?.items) {
            resolve(undefined);
            return;
          }

          if (data.event.dataTransfer.items) {
            for (let i = 0; i < data.event.dataTransfer.items.length; i++) {
              if (data.event.dataTransfer.items[i].kind === 'file') {
                const file = data.event.dataTransfer.items[i].getAsFile();
                if (file) {
                  if (file.name === this.pending) {
                    this.notifications.debug(
                      'Drag And Drop',
                      `Ignoring ${file.name}`,
                      'File appears to originate from within Knowledge.'
                    );
                    this.pending = undefined;
                  } else {
                    files.push(file);
                  }
                }
              }
            }
            resolve({ ingestType: 'file', files: files });
          } else if (data.event.dataTransfer.files) {
            for (let i = 0; i < data.event.dataTransfer.files.length; i++)
              files.push(data.event.dataTransfer.files[i]);
          } else {
            resolve(undefined);
          }
        }),
    },

    {
      HANDLER_TYPE: 'Web Links',
      accepts: (data: DragAndDropPacket) => {
        // Saving websites needs the desktop app
        if (!isDesktop()) {
          return false;
        }
        const text = data.text,
          uri = data.uri;
        if (!text || !text.length || !uri || !uri.length) {
          return false;
        } else {
          return text.includes(uri) || uri.includes(text);
        }
      },
      callback: (data: DragAndDropPacket) =>
        new Promise<KnowledgeSourceFactoryRequest | undefined>((resolve) => {
          if (!data.text || !data.uri) {
            resolve(undefined);
          }
          if (data.text && data.text.length && data.uri && data.uri.length) {
            resolve({ ingestType: 'website', links: [data.uri] });
          }
          resolve(undefined);
        }),
    },

    // {
    //   HANDLER_TYPE: 'Calendar (MacOS)',
    //   URI_PREFIX: 'ical:',
    //   accepts: (data: DragAndDropPacket) => {
    //     return false;
    //   },
    //   callback: (data: DragAndDropPacket) => new Promise<KnowledgeSourceFactoryRequest | undefined>((resolve) => {
    //     console.log('Got ical entry...');
    //     resolve(undefined);
    //   })
    // },
    //
    // {
    //   HANDLER_TYPE: 'Mail (MacOS)',
    //   URI_PREFIX: 'message:',
    //   accepts: (data: DragAndDropPacket) => {
    //     return false;
    //   },
    //   callback: (data: DragAndDropPacket) => new Promise<KnowledgeSourceFactoryRequest | undefined>((resolve) => {
    //     console.log('message entry...');
    //     resolve(undefined);
    //   })
    // },
    //
    // {
    //   HANDLER_TYPE: 'OmniFocus (MacOS)',
    //   URI_PREFIX: 'omnifocus:',
    //   accepts: (data: DragAndDropPacket) => {
    //     return false;
    //   },
    //   callback: (data: DragAndDropPacket) => new Promise<KnowledgeSourceFactoryRequest | undefined>((resolve) => {
    //     console.log('Got omnifocus entry...');
    //     resolve(undefined);
    //   })
    // }
  ];

  constructor(
    private notifications: NotificationsService,
    private projects: ProjectService
  ) {}

  get supportedTypes() {
    return this.__data_transfer_handlers
      .map((dth) => dth.HANDLER_TYPE)
      .filter((type) => isDesktop() || type !== 'Web Links');
  }

  async parseDragEvent(
    event: DragEvent
  ): Promise<KnowledgeSourceFactoryRequest | undefined> {
    event.preventDefault();

    this.notifications.debug('Drag And Drop', 'Parsing Drag and Drop', event);

    if (!event.dataTransfer?.items) {
      return undefined;
    }

    // Try to differentiate different drop types using text data
    const textData = event.dataTransfer.getData('text/plain');
    const htmlData = event.dataTransfer.getData('text/html');
    const uriData = event.dataTransfer.getData('text/uri-list');
    const dths_prefix = this.__data_transfer_handlers.filter(
      (dth) => dth.URI_PREFIX && uriData && uriData.startsWith(dth.URI_PREFIX)
    );
    const dths_no_prefix = this.__data_transfer_handlers.filter((dth) =>
      dth.accepts({
        text: textData,
        html: htmlData,
        uri: uriData,
        event: event,
      })
    );

    const details =
      `${dths_prefix.map((a) => a.HANDLER_TYPE).join(', ')}` +
      `${dths_no_prefix.map((a) => a.HANDLER_TYPE).join(', ')}`;

    if (dths_no_prefix.length === 0 && dths_prefix.length === 0) {
      this.notifications.debug(
        'Drag And Drop',
        'No Handlers Found',
        'Knowledge does not know how to handle that drag and drop!'
      );
      return;
    }

    this.notifications.debug('Drag And Drop', 'Handlers Found', details);

    let req: KnowledgeSourceFactoryRequest | undefined;
    if (dths_prefix && dths_prefix.length) {
      // We only want one handler, so we choose the first one (which would default to any handler that has a specific URI prefix
      await dths_prefix[0]
        .callback({
          text: textData,
          html: htmlData,
          uri: uriData,
          event: event,
        })
        .then((res) => {
          req = res;
        });
    } else if (dths_no_prefix && dths_no_prefix.length) {
      await dths_no_prefix[0]
        .callback({
          text: textData,
          html: htmlData,
          uri: uriData,
          event: event,
        })
        .then((res) => {
          req = res;
        });
    }

    return req;
  }

  dragOut($event: DragEvent, ks: Partial<KnowledgeSource> | undefined) {
    $event.preventDefault();
    $event.stopPropagation();

    // Dragging a file out to the operating system is a desktop feature
    if (ks && ks.ingestType === 'file' && isDesktop()) {
      this.pending =
        typeof ks.accessLink === 'string' ? ks.accessLink : ks.accessLink?.href;
      this.pending = this.pending?.split('\\').pop()?.split('/').pop();
      window.electron.startDrag(ks);
    }
  }

  dragSource(event: DragEvent, source: KnowledgeSource) {
    this._dropHighlight.next(true);

    event.dataTransfer?.setData('source', JSON.stringify(source));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }

    const dragImage = new Image();
    dragImage.src =
      source.icon['changingThisBreaksApplicationSecurity'] || source.icon || '';
    dragImage.classList.add('knowledge-source-icon');
    event.dataTransfer?.setDragImage(dragImage, -10, -10);
    return this.sourceDrop;
  }

  dragSources(event: DragEvent, sources: KnowledgeSource[]) {
    this._dropHighlight.next(true);
    event.dataTransfer?.setData('sources', JSON.stringify(sources));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }

    const dragImage = new Image();
    dragImage.src =
      sources[0].icon['changingThisBreaksApplicationSecurity'] ||
      sources[0].icon ||
      '';
    dragImage.classList.add('knowledge-source-icon');
    event.dataTransfer?.setDragImage(dragImage, -10, -10);

    return this.sourceDrop;
  }

  dropSource($event: any, projectId: string) {
    this._dropHighlight.next(false);

    const source: KnowledgeSource = JSON.parse(
      $event.dataTransfer?.getData('source')
    );

    if (!source || !projectId) {
      return;
    }

    // Create a list of updates to be applied
    const updates = this.moveSourceRequests([source], projectId);
    this.projects.updateProjects(updates).then((saved) => {
      if (saved) this._sourceDrop.next(source.id.value);
    });
  }

  dropSources($event: any, projectId: string) {
    this._dropHighlight.next(false);

    const sources: KnowledgeSource[] = JSON.parse(
      $event.dataTransfer?.getData('sources')
    );

    if (!sources || !projectId) {
      return;
    }

    // Create a list of updates to be applied
    const updates = this.moveSourceRequests(sources, projectId);

    this.projects.updateProjects(updates).then((saved) => {
      if (!saved) return;
      for (const source of sources) {
        this._sourceDrop.next(source.id.value);
      }
    });
  }

  dragSourceEnd($event: any, _: any) {
    this._dropHighlight.next(false);
  }

  private moveSourceRequests(sources: KnowledgeSource[], projectId: string) {
    const updates: ProjectUpdateRequest[] = [];
    for (const source of sources) {
      const prevId = source.associatedProject.value;
      const newId = projectId;

      if (prevId === newId) {
        continue;
      }

      const newProject = this.projects.getProject(newId);
      const prevProject = this.projects.getProject(prevId);

      if (newProject && prevProject) {
        updates.push({
          id: prevProject.id,
          moveKnowledgeSource: {
            ks: source,
            new: newProject.id,
          },
        });
      } else if (newProject) {
        updates.push({
          id: newProject.id,
          addKnowledgeSource: [source],
        });
      }
    }
    return updates;
  }
}
