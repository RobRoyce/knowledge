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

import { Component, OnInit } from '@angular/core';
import type { RestorePreview } from '@contracts/storage';
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
                <div class="text-2xl">Library Backup</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <div class="mb-3 text-500">
                  Contains projects, sources, the inbox, topics, metadata, and
                  copies of imported files. Does not contain chat history, UI
                  preferences, settings, or API keys.
                </div>
                <app-setting-template class="w-full" label="Export Library">
                  <div class="settings-input">
                    <button
                      pButton
                      label="Export Library"
                      [loading]="exportingLibrary"
                      (click)="onExportLibrary()"
                    ></button>
                  </div>
                </app-setting-template>

                <app-setting-template class="w-full" label="Restore Library">
                  <div class="settings-input">
                    <input
                      #restoreUpload
                      id="restore-library-input"
                      class="hidden"
                      (change)="onSelectLibraryBackup($event)"
                      type="file"
                      accept=".tar,application/x-tar"
                    />
                    <button
                      pButton
                      label="Restore Library"
                      [disabled]="!libraryEmpty || !!preview || restoreBusy"
                      [loading]="restoreBusy"
                      (click)="restoreUpload.click()"
                    ></button>
                  </div>
                </app-setting-template>

                <div
                  *ngIf="refusal"
                  id="restore-refused"
                  class="mt-2 p-3 border-round surface-200"
                >
                  {{ refusal }}
                </div>

                <div
                  *ngIf="preview"
                  id="restore-preview"
                  class="mt-3 p-3 border-round surface-200 flex flex-column gap-2"
                >
                  <div class="text-lg font-bold">Restore this library?</div>
                  <div>
                    Backup created:
                    {{ preview.backupCreatedAt | date : 'medium' }} (format
                    version {{ preview.backupVersion }})
                  </div>
                  <div id="restore-counts">
                    {{ count(preview.counts.projects, 'project') }},
                    {{ count(preview.counts.sources, 'source')
                    }}{{ inboxNote(preview.counts.inbox) }},
                    {{ count(preview.counts.assets, 'file') }} ({{
                      preview.counts.bytes / 1024 | number : '1.0-0'
                    }}
                    KB)
                  </div>
                  <div *ngIf="preview.projectNames.length">
                    Projects: {{ preview.projectNames.join(', ') }}
                  </div>
                  <div *ngFor="let warning of preview.warnings">
                    Warning: {{ warning }}
                  </div>
                  <div id="restore-not-included">
                    Not in this backup, and not changed:
                    {{ preview.notIncluded.join(', ') }}.
                  </div>
                  <div class="flex gap-2 mt-2">
                    <button
                      pButton
                      id="restore-confirm"
                      label="Restore"
                      class="w-auto"
                      [loading]="restoreBusy"
                      (click)="onConfirmRestore()"
                    ></button>
                    <button
                      pButton
                      id="restore-cancel"
                      label="Cancel"
                      class="p-button-text w-auto"
                      [disabled]="restoreBusy"
                      (click)="onCancelRestore()"
                    ></button>
                  </div>
                </div>

                <div
                  *ngIf="restoreError"
                  id="restore-error"
                  class="mt-2 p-3 border-round surface-200 text-red-400"
                >
                  {{ restoreError }}
                </div>

                <div
                  *ngIf="restoreResult"
                  id="restore-result"
                  class="mt-2 p-3 border-round surface-200"
                >
                  {{ restoreResult }}
                </div>
              </div>
            </ng-template>
          </p-panel>
        </div>
        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Chat and Preferences Backup</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <div class="mb-3 text-500">
                  Chat history and UI preferences from this window's local
                  storage. It does not hold projects, sources, the inbox, or
                  files.
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
export class StorageSettingsComponent implements OnInit {
  exportType = 'Everything';

  exporting = false;

  exportingLibrary = false;

  /** Restore is allowed only into a library without records. */
  libraryEmpty = false;

  refusal = '';

  preview?: RestorePreview;

  restoreBusy = false;

  restoreError = '';

  restoreResult = '';

  form: FormGroup;

  constructor(
    private storage: StorageService,
    private formBuilder: FormBuilder,
    private notifications: NotificationsService,
    private settings: SettingsService
  ) {
    this.form = formBuilder.group({});
  }

  count(n: number, noun: string, plural = `${noun}s`) {
    return `${n} ${n === 1 ? noun : plural}`;
  }

  /** " (2 inbox entries)" when the backup has inbox entries. */
  inboxNote(inbox = 0) {
    return inbox > 0
      ? ` (${this.count(inbox, 'inbox entry', 'inbox entries')})`
      : '';
  }

  ngOnInit() {
    this.refreshLibraryStatus();
  }

  private message(e: any): string {
    return e?.error?.error?.message ?? e?.message ?? `${e}`;
  }

  async refreshLibraryStatus() {
    try {
      const status = await this.storage.libraryStatus();
      this.libraryEmpty = status.empty;
      const c = status.counts;
      this.refusal = status.empty
        ? ''
        : `Restore works only into an empty library. This library has ${this.count(
            c.projects,
            'project'
          )}, ` +
          `${this.count(c.sources, 'source')}, and ${this.count(
            c.assets,
            'file'
          )}. To restore, start Knowledge with a new ` +
          'profile. Existing data is not changed or deleted.';
    } catch (e) {
      this.libraryEmpty = false;
      this.refusal = `Library status unavailable: ${this.message(e)}`;
    }
  }

  /** Upload the selected file. The service validates it. Nothing changes yet. */
  async onSelectLibraryBackup($event: any) {
    const input: HTMLInputElement = $event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.restoreError = '';
    this.restoreResult = '';
    this.restoreBusy = true;
    try {
      this.preview = await this.storage.stageRestore(file);
    } catch (e) {
      this.restoreError = `The backup cannot be restored. ${this.message(e)}`;
      await this.refreshLibraryStatus();
    } finally {
      this.restoreBusy = false;
    }
  }

  async onConfirmRestore() {
    if (!this.preview) {
      return;
    }
    this.restoreBusy = true;
    this.restoreError = '';
    try {
      const r = await this.storage.activateRestore(this.preview.id);
      this.preview = undefined;
      this.restoreResult =
        `Restored ${this.count(r.projects, 'project')}, ${this.count(
          r.sources,
          'source'
        )}${this.inboxNote(r.inbox)}, ` +
        `and ${this.count(r.assets, 'file')}. ` +
        'Knowledge reloads now.';
      this.notifications.success(
        'Backup',
        'Library Restored',
        this.restoreResult
      );

      // Reload so every service reads the restored library
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      this.preview = undefined;
      this.restoreError = `Restore failed. The library is not changed. ${this.message(
        e
      )}`;
      await this.refreshLibraryStatus();
    } finally {
      this.restoreBusy = false;
    }
  }

  async onCancelRestore() {
    const id = this.preview?.id;
    this.preview = undefined;
    if (id) {
      try {
        await this.storage.cancelRestore(id);
      } catch {
        // The staged files are removed at the next service start
      }
    }
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

  async onExportLibrary() {
    this.exportingLibrary = true;
    try {
      const size = await this.storage.exportLibrary();
      this.notifications.success(
        'Backup',
        'Library Exported',
        `${(size / 1024).toFixed(0)} KB`
      );
    } catch (e: any) {
      this.notifications.error(
        'Backup',
        'Library Export Failed',
        e?.error?.error?.message ?? e?.message ?? `${e}`
      );
    } finally {
      this.exportingLibrary = false;
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
          `${result.keysWritten} entries restored. Reloading...`
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
