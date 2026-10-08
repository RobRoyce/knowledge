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
import { SettingsService } from '@services/ipc-services/settings.service';
import { ElectronIpcService } from '@services/ipc-services/electron-ipc.service';
import { IngestSettingsModel } from '@shared/models/settings.model';
import { NotificationsService } from '@services/user-services/notifications.service';
import { PromptForDirectoryRequest } from '@shared/models/electron.ipc.model';
import { debounceTime, distinctUntilChanged, tap } from 'rxjs/operators';
import { FormBuilder, FormGroup } from '@angular/forms';

export type FileManagerTarget = 'autoscan' | 'all';

export type SelectButtonOption = {
  name: string;
  value: FileManagerTarget;
  disabled: boolean;
};

@Component({
  selector: 'app-ingest-settings',
  template: `
    <div class="p-fluid grid select-none gap-2">
      <form [formGroup]="form" class="w-full h-full">
        <div class="col-12">
          <p-panel #autoscanPanel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Autoscan</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  label="Autoscan (Beta)"
                  labelHelp="Enable or disable watching for new files in a pre-designated folder."
                  labelHelpLink="https://github.com/KnowledgeCanvas/knowledge/wiki/Basics:-Sources#how-are-sources-imported"
                  labelSubtext="{{
                    form.controls.autoscan.value | switchLabel
                  }}"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="autoscan"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  label="Autoscan Location"
                  labelHelp="Files saved to this location will automatically be added to your Inbox."
                >
                  <div class="settings-input p-inputgroup w-30rem">
                    <button
                      pButton
                      [disabled]="!form.controls.autoscan.value"
                      icon="pi pi-folder"
                      (click)="getAutoscanPath()"
                    ></button>
                    <input
                      pInputText
                      type="text"
                      #autoscanLocation
                      id="autoscanLocation"
                      style="width: calc(100% - 10rem)"
                      formControlName="autoscanPath"
                    />
                    <button
                      pButton
                      label="Show"
                      (click)="show(autoscanLocation.value)"
                    ></button>
                  </div>
                </app-setting-template>

                <app-setting-template
                  label="Scan Interval"
                  labelHelp="How frequently Knowledge will scan the directory."
                >
                  <p-inputNumber
                    formControlName="autoscanInterval"
                    [suffix]="' seconds'"
                    inputId="autoscan-interval"
                    class="settings-input w-16rem"
                    [showButtons]="true"
                    [useGrouping]="false"
                    [allowEmpty]="false"
                    [min]="10"
                    [max]="600"
                  ></p-inputNumber>
                </app-setting-template>
              </div>
            </ng-template>
          </p-panel>
        </div>

        <div class="col-12">
          <p-panel #fileManager>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">File Manager</div>
              </div>
            </ng-template>

            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <!-- TODO: re-enable this once the feature is fully built out and supported -->
                <app-setting-template
                  label="Managed Files"
                  labelHelp="Choose which imported files are moved to a centralized location on your computer. Note that Autoscan files are always moved."
                  labelSubtext="{{
                    form.controls.managerTarget.value | titlecase
                  }}"
                >
                  <p-selectButton
                    [options]="fileManagerStates"
                    [disabled]="true"
                    formControlName="managerTarget"
                    pTooltip="Knowledge currently only supports managing files that were imported using Autoscan"
                    class="settings-input w-30rem"
                    id="managed-files"
                    optionLabel="name"
                    optionValue="value"
                    optionDisabled="disabled"
                  ></p-selectButton>
                </app-setting-template>

                <app-setting-template
                  label="Storage Location"
                  labelHelp="Files imported using Autoscan will be moved from their original location to this location."
                >
                  <div class="settings-input p-inputgroup w-30rem">
                    <button
                      pButton
                      [disabled]="true"
                      icon="pi pi-folder"
                      (click)="getStoragePath()"
                      pTooltip="Changing storage location will be supported in a future version of Knowledge"
                    ></button>

                    <input
                      pInputText
                      type="text"
                      formControlName="managerPath"
                      id="storage-path"
                      #filestorage
                      style="width: calc(100% - 10rem)"
                    />

                    <button
                      pButton
                      label="Show"
                      (click)="show(filestorage.value)"
                    ></button>
                  </div>
                </app-setting-template>
              </div>
            </ng-template>
          </p-panel>
        </div>

        <div class="col-12">
          <p-panel #extensionpanel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Browser Extensions</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  label="Browser Extensions (Beta)"
                  labelHelp="Enable or disable communication with the Knowledge browser extension."
                  labelHelpLink="https://github.com/KnowledgeCanvas/extensions"
                  labelSubtext="{{
                    form.controls.extensions.value | switchLabel
                  }}"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="extensions"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  label="Port"
                  labelHelp="The port used to communicate between Knowledge and the browser extension."
                >
                  <p-inputNumber
                    formControlName="extensionsPort"
                    inputId="port-number"
                    class="settings-input w-16rem"
                    [showButtons]="true"
                    [useGrouping]="false"
                    [allowEmpty]="false"
                    [min]="1025"
                    [max]="65535"
                  ></p-inputNumber>
                </app-setting-template>

                <app-setting-template
                  label="Download Extensions"
                  labelHelp="Extensions are currently in Beta and require enabling 'Developer Mode' in Chrome."
                >
                  <div class="settings-input">
                    <a
                      target="_blank"
                      href="https://github.com/KnowledgeCanvas/extensions/releases/download/v0.1.0/knowledge-extensions.zip"
                    >
                      <app-ks-icon
                        iconUrl="assets/img/icons/chrome_icon.svg"
                      ></app-ks-icon>
                    </a>
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
export class IngestSettingsComponent {
  ingestSettings: IngestSettingsModel = new IngestSettingsModel();

  form: FormGroup;

  fileManagerStates: SelectButtonOption[] = [
    { name: 'Autoscan Files Only', value: 'autoscan', disabled: false },
    { name: 'All Imported Files', value: 'all', disabled: false },
  ];

  constructor(
    private settings: SettingsService,
    private notifications: NotificationsService,
    private ipc: ElectronIpcService,
    private formBuilder: FormBuilder
  ) {
    if (!settings.get().ingest) {
      this.set();
    } else {
      this.ingestSettings = settings.get().ingest;
    }

    this.form = formBuilder.group({
      autoscan: [this.ingestSettings.autoscan.enabled],
      autoscanPath: [this.ingestSettings.autoscan.path],
      autoscanInterval: [this.ingestSettings.autoscan.interval],
      extensions: [this.ingestSettings.extensions.enabled],
      extensionsPort: [this.ingestSettings.extensions.port],
      extensionsPath: [this.ingestSettings.extensions.path],
      manager: [this.ingestSettings.manager.enabled],
      managerPath: [this.ingestSettings.manager.storageLocation],
      managerTarget: [this.ingestSettings.manager.target],
    });

    this.disable();

    this.form.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged((prev, curr) => {
          if (curr.managerPath !== prev.managerPath) {
            this.notifications.error(
              'Import Settings',
              'Invalid Path',
              'File manager path cannot be changed at this time.'
            );
            return true;
          }
          return (
            curr.autoscan === prev.autoscan &&
            curr.autoscanPath === prev.autoscanPath &&
            curr.autoscanInterval === prev.autoscanInterval &&
            curr.extensions === prev.extensions &&
            curr.extensionsPort === prev.extensionsPort &&
            curr.extensionsPath === prev.extensionsPath &&
            curr.manager === prev.manager &&
            curr.managerPath === prev.managerPath &&
            curr.managerTarget === prev.managerTarget
          );
        }),
        tap((formValue) => {
          this.ingestSettings = {
            autoscan: {
              enabled: formValue.autoscan,
              path: formValue.autoscanPath,
              interval: formValue.autoscanInterval,
            },
            extensions: {
              enabled: formValue.extensions,
              port: formValue.extensionsPort,
              // NOTE: This setting not changed because it is currently disabled
              path: this.ingestSettings.extensions.path,
            },
            // NOTE: These settings not changed because they are currently disabled
            manager: this.ingestSettings.manager,
          };

          this.disable();
          this.set();
        })
      )
      .subscribe();
  }

  disable() {
    if (this.ingestSettings.autoscan.enabled) {
      this.form.get('autoscanPath')?.disable();
      this.form.get('autoscanInterval')?.enable();
    } else {
      this.form.get('autoscanPath')?.disable();
      this.form.get('autoscanInterval')?.disable();
    }

    if (this.ingestSettings.extensions.enabled) {
      this.form.get('extensionsPort')?.enable();
      this.form.get('extensionsPath')?.enable();
    } else {
      this.form.get('extensionsPort')?.disable();
      this.form.get('extensionsPath')?.disable();
    }

    if (this.ingestSettings.manager.enabled) {
      // this.form.get('managerPath')?.enable();
      // this.form.get('managerTarget')?.enable();
      this.form.get('managerPath')?.disable();
      this.form.get('managerTarget')?.disable();
    } else {
      this.form.get('managerPath')?.disable();
      this.form.get('managerTarget')?.disable();
    }
  }

  set() {
    this.settings.set({
      ingest: this.ingestSettings,
    });
  }

  show(location: string) {
    this.ipc.showItemInFolder(location);
    this.notifications.debug(
      'IngestSettings',
      'Locating Folder',
      location,
      'toast'
    );
  }

  getStoragePath() {
    // let req: PromptForDirectoryRequest = {
    //   title: 'Local Storage Location',
    //   defaultPath: this.ingestSettings.manager.storageLocation,
    //   properties: ['openDirectory', 'showHiddenFiles', 'createDirectory']
    // }
    // this.ipcService.promptForDirectory(req).then((path) => {
    //   this.ingestSettings.manager.storageLocation = path;
    //   this.settingsService.set({ingest: this.ingestSettings});
    //   this.notifications.debug('IngestSettings', 'Storage Path Changed', path, 'toast');
    // }).catch((reason) => {
    //   this.notifications.error('IngestSettings', 'Invalid Storage Path', reason);
    //   console.error(reason);
    // });
  }

  getAutoscanPath() {
    // TODO: we should verify that the selected folder is completely empty (or at least does not contain any folders)
    const req: PromptForDirectoryRequest = {
      title: 'Autoscan Location',
      defaultPath: this.ingestSettings.autoscan.path,
      properties: ['openDirectory', 'createDirectory'],
      message: 'Please select an EMPTY directory.',
    };
    this.ipc
      .promptForDirectory(req)
      .then((path) => {
        this.ingestSettings.autoscan.path = path;
        this.settings.set({ ingest: this.ingestSettings });
        this.form.controls.autoscanPath.setValue(
          this.ingestSettings.autoscan.path
        );
        this.notifications.debug(
          'IngestSettings',
          'Autoscan Path Changed',
          path,
          'toast'
        );
      })
      .catch((reason) => {
        this.notifications.error(
          'IngestSettings',
          'Invalid Autoscan Path',
          reason.message
        );
        console.error(reason);
      });
  }
}
