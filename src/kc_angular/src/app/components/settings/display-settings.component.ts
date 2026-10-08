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
import { Component } from '@angular/core';
import { ThemeService } from '@services/user-services/theme.service';
import { SettingsService } from '@services/ipc-services/settings.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { KcTheme } from '@shared/models/style.model';
import { DisplaySettingsModel } from '@shared/models/settings.model';
import { FormBuilder, FormGroup } from '@angular/forms';
import { debounceTime, distinctUntilChanged, tap } from 'rxjs/operators';

@Component({
  selector: 'app-display-settings',
  template: `
    <div class="p-fluid grid gap-2">
      <form [formGroup]="form" class="w-full h-full">
        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Appearance</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template label="Theme">
                  <div class="p-inputgroup w-16rem settings-input">
                    <button
                      pButton
                      icon="pi pi-replay"
                      pTooltip="Restore default"
                      tooltipPosition="left"
                      (click)="restoreDefaultTheme()"
                    ></button>
                    <p-dropdown
                      formControlName="theme"
                      [options]="themes"
                      optionLabel="name"
                      [filter]="true"
                      [group]="true"
                      id="theme-dropdown"
                      [style]="{ width: '100%' }"
                      appendTo="body"
                    >
                      <ng-template pTemplate="group" let-group>
                        <p-divider></p-divider>
                        <b>{{ group.name }}</b>
                        <b *ngIf="group.isDark"> (Dark)</b>
                        <b *ngIf="!group.isDark"> (Light)</b>
                      </ng-template>
                    </p-dropdown>
                  </div>
                </app-setting-template>

                <app-setting-template label="Zoom">
                  <input
                    class="settings-input"
                    type="text"
                    pInputText
                    value="{{
                      form.controls.zoom.value / 100 | number | percent
                    }}"
                    readonly
                  />
                  <p-slider
                    formControlName="zoom"
                    class="settings-input w-16rem"
                    [animate]="true"
                    [min]="50"
                    [max]="200"
                    [step]="10"
                  ></p-slider>
                  <div class="settings-input-subtext-left">Zoom Out</div>
                  <div class="settings-input-subtext-right">Zoom In</div>
                </app-setting-template>

                <app-setting-template
                  label="Log Notifications"
                  labelHelp="Enable to display log messages as notifications in the bottom right corner of the application window."
                >
                  <p-selectButton
                    [options]="logLevels"
                    formControlName="logs"
                    [multiple]="true"
                    id="log-selector"
                    class="settings-input w-24rem"
                    optionLabel="name"
                    optionValue="value"
                  ></p-selectButton>
                </app-setting-template>
              </div>
            </ng-template>
          </p-panel>
        </div>

        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Video</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  label="Auto-play YouTube videos"
                  labelHelp="Automatically play and pause YouTube videos when the 'YouTube Video' panel is toggled open."
                >
                  <p-inputSwitch
                    formControlName="autoplay"
                    class="settings-input"
                  ></p-inputSwitch>
                </app-setting-template>
              </div>
            </ng-template>
          </p-panel>
        </div>

        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Animations</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  label="Animations"
                  labelHelp="Enable or disable animations. Disabling animations may improve performance. Note that this option does not affect graph animations."
                >
                  <p-inputSwitch
                    formControlName="animations"
                    class="settings-input"
                  ></p-inputSwitch>
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
export class DisplaySettingsComponent {
  displaySettings: DisplaySettingsModel = new DisplaySettingsModel();
  themes: KcTheme[];
  logLevels = [
    { name: 'Error', value: 'error' },
    { name: 'Warn', value: 'warn' },
    { name: 'Debug', value: 'debug' },
  ];
  form: FormGroup;
  private send = window.api.send;
  private receive = window.api.receive;
  private channels = {
    zoomIn: 'A2E:Window:ZoomIn',
    zoomOut: 'A2E:Window:ZoomOut',
    zoomLevel: 'E2A:Window:ZoomLevel',
  };

  constructor(
    private themeService: ThemeService,
    private settingsService: SettingsService,
    private formBuilder: FormBuilder,
    private notificationsService: NotificationsService
  ) {
    if (!settingsService.get().display) {
      this.set();
    } else {
      this.displaySettings = settingsService.get().display;
    }

    this.themes = themeService.groupedThemes;

    this.form = formBuilder.group({
      theme: [this.displaySettings.theme],
      syncTheme: [this.displaySettings.syncTheme],
      zoom: [this.displaySettings.zoom],
      autoplay: [this.displaySettings.autoplay],
      logs: [
        [
          this.displaySettings.logging.debug ? 'debug' : '',
          this.displaySettings.logging.error ? 'error' : '',
          this.displaySettings.logging.warn ? 'warn' : '',
        ],
      ],
      animations: [this.displaySettings.animations],
    });

    this.form.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged((prev, curr) => {
          return (
            curr.theme.code === prev.theme.code &&
            curr.syncTheme === prev.syncTheme &&
            curr.zoom === prev.zoom &&
            curr.logs === prev.logs &&
            curr.autoplay === prev.autoplay &&
            curr.animations === prev.animations
          );
        }),
        tap((formValue) => {
          const error = !!formValue.logs.find((l: any) => l == 'error');
          const debug = !!formValue.logs.find((l: any) => l == 'debug');
          const warn = !!formValue.logs.find((l: any) => l == 'warn');

          if (error && error != this.displaySettings.logging.error) {
            this.notificationsService.error(
              'DisplaySettings',
              'Errors Enabled',
              'This is a sample error message.',
              'toast'
            );
          }

          if (debug && debug != this.displaySettings.logging.debug) {
            this.notificationsService.debug(
              'DisplaySettings',
              'Debug Enabled',
              'This is a sample debug message.',
              'toast'
            );
          }

          if (warn && warn != this.displaySettings.logging.warn) {
            this.notificationsService.warn(
              'DisplaySettings',
              'Warnings Enabled',
              'This is a sample warning message.',
              'toast'
            );
          }

          if (this.displaySettings.theme.code !== formValue.theme.code) {
            this.themeService.switchTheme(formValue.theme.code);
          }

          if (this.displaySettings.zoom != formValue.zoom) {
            this.send(this.channels.zoomOut, this.displaySettings.zoom);
          }

          const themeSettings = this.themeService.findTheme(
            formValue.theme.code
          );

          this.displaySettings = {
            autoplay: formValue.autoplay,
            logging: {
              error: error ?? this.displaySettings.logging.error,
              debug: debug ?? this.displaySettings.logging.debug,
              warn: warn ?? this.displaySettings.logging.warn,
            },
            syncTheme: formValue.syncTheme,
            theme: themeSettings,
            zoom: formValue.zoom,
            animations: formValue.animations,
          };
          this.set();
        })
      )
      .subscribe();
  }

  restoreDefaultTheme() {
    if (
      this.displaySettings.theme.code === this.themeService.defaultTheme.code
    ) {
      return;
    }
    this.themeService
      .switchTheme(this.themeService.defaultTheme.code)
      .then(() => {
        this.displaySettings.theme = this.themeService.currentTheme;
        this.form.controls.theme.setValue(this.displaySettings.theme);
        this.settingsService.set({
          display: { theme: this.themeService.currentTheme },
        });
      });
  }

  set() {
    this.settingsService.set({
      display: this.displaySettings,
    });
  }
}
