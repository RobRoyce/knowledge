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
import { BehaviorSubject, Observable } from 'rxjs';
import { Injectable, NgZone } from '@angular/core';
import { IpcMessage } from '@shared/models/electron.ipc.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { NotificationsService } from '@services/user-services/notifications.service';
import { WebSourceModel } from '@shared/models/web.source.model';

@Injectable({
  providedIn: 'root',
})
export class ExtensionService {
  private channels = {
    import: 'E2A:Extension:Import',
  };

  private receive = window.api?.receive ?? (() => undefined);

  private __links = new BehaviorSubject<
    Partial<WebSourceModel & KnowledgeSource>
  >({} as any);
  links: Observable<Partial<WebSourceModel & KnowledgeSource>> =
    this.__links.asObservable();

  constructor(
    private zone: NgZone,
    private notifications: NotificationsService
  ) {
    this.receive(this.channels.import, (msg: IpcMessage) => {
      this.zone.run(() => {
        if (msg.success?.data) {
          const data = msg.success.data;

          notifications.debug(
            'ExtensionService',
            'Extension Import',
            data.title
          );

          /* TODO: need to copy over other fields, like flagged, rawText, etc... but how? */
          /* TODO: standardize the model so we don't need to do a manual conversion */
          const webSource: Partial<WebSourceModel & KnowledgeSource> = {
            iconUrl: data.iconUrl,
            title: data.title,
            accessLink: data.accessLink,
            topics: data.topics ?? [],
            metadata: { meta: data.metadata },
            flagged: data.flagged,
            rawText: data.rawText,
            thumbnail: data.thumbnail,
            description: data.description,
            markup: { notes: [], highlights: [], stickers: [] },
          };

          if (data.rawText) {
            webSource.markup = {
              notes: [
                {
                  title: 'Selected Text',
                  body: data.rawText,
                  type: 'highlight',
                  event: {
                    timestamp: new Date().toLocaleString(),
                    type: 'create',
                    description:
                      'Imported as selected text from browser extension.',
                  },
                },
              ],
            };
          }

          this.__links.next(webSource);
        } else {
          notifications.error(
            'ExtensionService',
            'Extension Import',
            msg.error?.message ?? 'Unable to import.'
          );
          // TODO: subscriber.error(msg.error);
        }
      });
    });
  }
}
