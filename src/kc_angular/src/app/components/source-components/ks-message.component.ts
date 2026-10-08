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
import { Component, Input } from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';

@Component({
  selector: 'app-ks-message',
  template: `
    <div
      *ngIf="ks; else placeholder"
      class="flex-col-center-between w-full h-full border-bottom-1 border-100 hover:surface-hover p-2"
      [class.text-primary]="active"
      [class.surface-card]="active"
    >
      <div class="flex-row-center-between w-full pb-2">
        <app-ks-icon
          [ks]="ks"
          [animate]="animate"
          [allowClickThrough]="false"
          style="height: 40px; width: 40px"
          class="pr-2 flex align-items-center"
        >
        </app-ks-icon>

        <div #titleContainer class="ks-message-title-and-flag">
          <div class="ks-message-title font-bold">
            {{ ks.title | truncate : [48] }}
          </div>
          <div
            [class.pi-flag-fill]="ks.flagged"
            [class.pi-flag]="!ks.flagged"
            [class.text-400]="!ks.flagged"
            (click)="onKsFlagged($event, ks)"
            class="ks-message-flag pi px-2 hover:text-primary"
          ></div>
        </div>
      </div>
      <div *ngIf="showFooter" class="flex-row-center-between w-full text-500">
        <div *ngIf="!label; else labelPlaceholder" class="text-left">
          {{ ks.importMethod | importMethod }}
        </div>
        <ng-template #labelPlaceholder>{{ label }}</ng-template>
        <div *ngIf="showDate" class="text-right">
          {{ ks.dateCreated | date : 'MM/dd/yy hh:mm a' }}
        </div>
      </div>
    </div>

    <ng-template #placeholder>
      <div
        class="flex-col-center-between w-full border-bottom-1 border-100 hover:surface-hover p-2"
        [class.bg-primary-reverse]="active"
      >
        <div *ngIf="!status" class="flex-row-center-between w-full pb-2">
          <p-skeleton size="40px" shape="circle" class="pr-2"></p-skeleton>
          <p-skeleton
            class="w-full"
            height="32px"
            shape="rectangle"
          ></p-skeleton>
        </div>
        <div
          *ngIf="status"
          class="w-full flex-row-center-center"
          style="height: 4rem"
        >
          <div class="text-500 font-bold">
            {{ status }}
          </div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .ks-message-title-and-flag {
        display: flex;
        width: 100%;
        height: 40px;
        max-height: 40px;
        flex-direction: row;
        flex-wrap: nowrap;
        align-content: center;
        align-items: center;
        justify-content: space-between;

        .ks-message-title {
          //min-width: 10rem;
          max-width: 40rem;
          max-height: 40px;
          overflow-wrap: anywhere;
          font-weight: 600 !important;
        }
      }
    `,
  ],
})
export class KsMessageComponent {
  @Input() ks!: KnowledgeSource;

  @Input() status?: string;

  @Input() active: boolean | undefined = false;

  @Input() label?: string;

  @Input() showFooter = true;

  @Input() showDate = true;

  @Input() animate = true;

  onKsFlagged($event: MouseEvent, ks: KnowledgeSource) {
    $event.preventDefault();
    $event.stopPropagation();
    ks.flagged = !ks.flagged;
  }
}
