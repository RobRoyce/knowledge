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

import { Component } from '@angular/core';
import { StorageService } from '@services/ipc-services/storage.service';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NotificationsService } from '@services/user-services/notifications.service';
import { SettingsService } from '@services/ipc-services/settings.service';

@Component({
  selector: 'app-storage-settings',
  template: `
    <div class="p-fluid grid">
      <form [formGroup]="form" class="w-full h-full">
        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Backup</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <div class="mb-3 text-500">
                  A backup holds projects, sources, annotations, chat history
                  and the inbox. It does not hold settings or imported files.
                </div>
                <app-setting-template class="w-full" label="Export Backup">
                  <div class="settings-input">
                    <button
                      pButton
                      label="Export"
                      [loading]="exporting"
                      (click)="onExport()"
                    ></button>
                  </div>
                </app-setting-template>

                <app-setting-template class="w-full" label="Restore Backup">
                  <div class="settings-input">
                    <input
                      #importUpload
                      class="hidden"
                      (change)="onImport($event)"
                      type="file"
                      accept=".json,application/json"
                    />
                    <button
                      pButton
                      label="Restore"
                      (click)="importUpload.click()"
                    ></button>
                  </div>
                </app-setting-template>
              </div>
            </ng-template>
          </p-panel>
        </div>
      </form>
    </div>
  `,
  styles: [],
})
export class StorageSettingsComponent {
  exportType = 'Everything';

  exporting = false;

  form: FormGroup;

  constructor(
    private storage: StorageService,
    private formBuilder: FormBuilder,
    private notifications: NotificationsService,
    private settings: SettingsService
  ) {
    this.form = formBuilder.group({});
  }

  onExport() {
    this.exporting = true;
    try {
      const keys = this.storage.export(this.settings.get().system?.appVersion);
      this.notifications.success(
        'Backup',
        'Backup Exported',
        `Saved ${keys} storage entries.`
      );
    } catch (e) {
      this.notifications.error('Backup', 'Export Failed', `${e}`);
    } finally {
      this.exporting = false;
    }
  }

  onImport($event: any) {
    const input: HTMLInputElement = $event.target;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    file
      .text()
      .then((text) => {
        const result = this.storage.restore(text);
        this.notifications.success(
          'Backup',
          'Backup Restored',
          `${result.projectsAdded} projects added, ${result.projectsReplaced} replaced. Reloading...`
        );

        // Reload so every service reads the restored storage
        setTimeout(() => window.location.reload(), 1500);
      })
      .catch((e: Error) => {
        this.notifications.error('Backup', 'Restore Failed', e.message);
      })
      .finally(() => {
        input.value = '';
      });
  }
}
