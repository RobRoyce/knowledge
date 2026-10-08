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
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { BehaviorSubject, Observable, Subject, tap } from 'rxjs';
import { ElectronIpcService } from '@services/ipc-services/electron-ipc.service';
import { fadeIn } from '@app/animations';
import { filter, takeUntil } from 'rxjs/operators';
import { SettingsService } from '@services/ipc-services/settings.service';
import { NotificationsService } from '@services/user-services/notifications.service';

@Component({
  selector: 'app-ks-thumbnail',
  template: `
    <div *ngIf="thumbnail$ | async; else loading" class="h-full w-full">
      <p-image
        [src]="thumbnail$ | async"
        [@fadeIn]="animate"
        (onImageError)="onImageError()"
        class="flex-col-center-center h-full thumbnail-container overflow-hidden justify-content-start"
        imageClass="ks-thumbnail {{ animate ? 'kenburns-top' : '' }}"
        [preview]="allowPreview"
      >
      </p-image>
    </div>

    <ng-template #loading>
      <div
        [@fadeIn]="animate"
        class="h-full flex-col-center-center select-none bg-primary-reverse text-color-secondary"
        style="min-height: 12rem"
      >
        <app-ks-icon [ks]="ks"></app-ks-icon>
        <div class="text-sm mt-4">Thumbnail Unavailable</div>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .thumbnail-container {
        min-height: 12rem;
      }
    `,
  ],
  animations: [fadeIn],
})
export class KsThumbnailComponent implements OnDestroy, OnChanges {
  @Input() ks!: KnowledgeSource;

  @Input() animate = true;

  @Input() allowPreview = true;

  _thumbnail$: BehaviorSubject<any> = new BehaviorSubject<any>(undefined);

  thumbnail$: Observable<any> = this._thumbnail$.asObservable();

  private cleanUp: Subject<any> = new Subject<any>();

  constructor(
    private ipcService: ElectronIpcService,
    private settings: SettingsService,
    private notifications: NotificationsService
  ) {
    this.animate = settings.get().display.animations;
  }

  ngOnChanges(changes: SimpleChanges) {
    try {
      if (changes.ks.currentValue) {
        this._thumbnail$.next(undefined);

        /**
         * If the Source already has a thumbnail, try to display it immediately.
         */
        if (changes.ks.currentValue.thumbnail) {
          this._thumbnail$.next(changes.ks.currentValue.thumbnail);
          return;
        }

        /**
         * Otherwise, if the Source is of type 'file', request thumbnail from OS
         */
        if (this.ks.ingestType === 'file') {
          this.ipcService.thumbnail
            .pipe(
              takeUntil(this.cleanUp),
              filter((t) => t?.id === this.ks.id.value),
              tap((thumbnail) => {
                this.ks.thumbnail = thumbnail.thumbnail;
                this._thumbnail$.next(this.ks.thumbnail);
              })
            )
            .subscribe();
        }

        /**
         * Otherwise, attempt to get thumbnail from the web
         */
        this.getThumbnail();
      }
    } catch (e) {
      this.notifications.warn(
        'Source Thumbnail',
        'Thumbnail Error',
        'Unable to set thumbnail: ' + e
      );
    }
  }

  ngOnDestroy() {
    this.cleanUp.next({});
    this.cleanUp.complete();
  }

  getThumbnail() {
    const link: string =
      typeof this.ks.accessLink === 'string'
        ? this.ks.accessLink
        : this.ks.accessLink.href;

    if (this.ks.ingestType === 'file') {
      this.ipcService.getFileThumbnail([
        {
          path: link,
          id: this.ks.id.value,
        },
      ]);
      return;
    } else {
      if (this.ks.thumbnail) {
        this._thumbnail$.next(this.ks.thumbnail);
      }

      const meta = this.ks.meta;
      if (meta) {
        const ogImage = meta.find((m) => m.key === 'og:image');
        if (ogImage && ogImage.value) {
          if (!ogImage.value.startsWith('http')) {
            this._thumbnail$.next(undefined);
            return;
          }
          const url = ogImage.value;
          fetch(url)
            .then((result) => {
              result.text().then((text) => {
                // Sometimes, requesting an image will return HTML, which is signs of failure
                if (!text.startsWith('<')) {
                  this.ks.thumbnail = url;
                  this._thumbnail$.next(this.ks.thumbnail);
                }
              });
            })
            .catch(() => {
              this.notifications.warn('Thumbnail', 'Invalid Thumbnail', url);
              this._thumbnail$.next(undefined);
            });
        }
      }
    }
  }

  onImageError() {
    this._thumbnail$.next(undefined);
  }
}
