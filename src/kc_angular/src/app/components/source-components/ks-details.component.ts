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
import { Component } from '@angular/core';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { NotificationsService } from '@services/user-services/notifications.service';
import { KsCommandService } from '@services/command-services/ks-command.service';

@Component({
  selector: 'app-details',
  template: `
    <div class="w-full flex-row-center-between my-2 px-2 sticky title-bar">
      <div class="flex-row-center-start">
        <app-ks-icon [ks]="ks" class="px-3 title-bar-interactive"></app-ks-icon>
        <div class="text-xl font-bold">{{ ks.title }}</div>
      </div>
      <div class="flex-row-center-end" style="width: 10rem">
        <div *ngIf="saved" class="flex-row-center-start text-primary">
          <div class="pi pi-check"></div>
          <div class="px-3">Saved</div>
        </div>
        <div>
          <button
            pButton
            class="p-button-text p-button-rounded title-bar-interactive"
            icon="pi pi-times"
            (click)="onClose()"
          ></button>
        </div>
      </div>
    </div>
    <div class="flex flex-row flex-grow-1 overflow-y-auto">
      <app-source
        [source]="ks"
        [dialog]="true"
        (update)="update($event)"
      ></app-source>
    </div>
    <div class="flex flex-row flex-grow-0 mt-2 sticky">
      <app-project-breadcrumb
        class="w-full"
        [projectId]="ks.associatedProject.value"
      >
      </app-project-breadcrumb>
    </div>
  `,
  styles: [],
})
export class KsDetailsComponent {
  ks!: KnowledgeSource;

  collapsed = false;

  saved = false;

  constructor(
    private config: DynamicDialogConfig,
    private ref: DynamicDialogRef,
    private notifications: NotificationsService,
    private command: KsCommandService
  ) {
    if (config?.data?.ks) {
      this.ks = config.data.ks;
    } else {
      this.notifications.error(
        'Source Details',
        'Invalid Source',
        'Could not find a source to display.'
      );
    }
  }

  onClose() {
    this.ref.close();
  }

  onSaved() {
    /* Show the "Saved" notice for 5 seconds */
    this.saved = true;
    setTimeout(() => {
      this.saved = false;
    }, 5000);
  }

  /** Show "Saved" only after the service saved the change. */
  update($event: KnowledgeSource) {
    if ($event) {
      this.command.update([$event]).then((saved) => {
        if (saved) this.onSaved();
      });
    }
  }
}
