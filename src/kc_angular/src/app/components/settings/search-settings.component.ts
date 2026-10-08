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
import { FormBuilder, FormGroup } from '@angular/forms';
import { SearchSettingsModel } from '@shared/models/settings.model';
import { debounceTime, distinctUntilChanged, tap } from 'rxjs/operators';

@Component({
  selector: 'app-search-settings',
  template: `
    <div class="p-fluid grid gap-2">
      <form [formGroup]="form" class="w-full h-full">
        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Web Search</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  label="Provider"
                  labelHelp="The search provider will be used to perform web searches."
                >
                  <p-dropdown
                    [options]="providers"
                    formControlName="provider"
                    class="settings-input"
                    optionLabel="name"
                    [style]="{ width: '100%' }"
                    appendTo="body"
                  ></p-dropdown>
                </app-setting-template>
              </div>
            </ng-template>
          </p-panel>
        </div>

        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Local Search</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  label="Fuzzy Matching"
                  labelHelp="Enable or disable fuzzy search. Enabling fuzzy search will result in more search results at the cost of accuracy."
                  labelSubtext="{{ form.controls.fuzzy.value | switchLabel }}"
                  labelHelpLink="https://fusejs.io/concepts/scoring-theory.html"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="fuzzy"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  label="Threshold"
                  labelSubtext="{{
                    form.controls.threshold.value / 100 | number : '1.1'
                  }}"
                  labelHelp="Only search results with a score lower than the threshold will be displayed. A threshold of 0.0 requires a perfect match, a threshold of 1.0 would match anything."
                  labelHelpLink="https://fusejs.io/api/options.html#includescore"
                >
                  <p-slider
                    class="settings-input w-16rem"
                    formControlName="threshold"
                  ></p-slider>
                  <div class="settings-input-subtext-left">Fewer results</div>
                  <div class="settings-input-subtext-right">More results</div>
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
export class SearchSettingsComponent {
  searchSettings: SearchSettingsModel = new SearchSettingsModel();

  providers = [
    { code: 'google', name: 'Google' },
    { code: 'bing', name: 'Bing' },
    { code: 'duck', name: 'DuckDuckGo' },
  ];

  form: FormGroup;

  constructor(
    private settings: SettingsService,
    private formBuilder: FormBuilder
  ) {
    if (!settings.get().search) {
      this.set();
    } else {
      this.searchSettings = {
        ...this.searchSettings,
        ...settings.get().search,
      };
    }

    this.form = formBuilder.group({
      provider: [
        this.providers.find((p) => p.code === this.searchSettings.provider),
      ],
      fuzzy: [this.searchSettings.fuzzy],
      threshold: [this.searchSettings.threshold],
    });

    this.disable();

    this.form.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged((prev, curr) => {
          return (
            curr.provider === prev.provider &&
            curr.fuzzy === prev.fuzzy &&
            curr.threshold === prev.threshold
          );
        }),
        tap((formValue) => {
          this.searchSettings = {
            provider: formValue.provider.code,
            fuzzy: formValue.fuzzy,
            threshold: formValue.threshold,
          };
          this.disable();
          this.set();
        })
      )
      .subscribe();
  }

  disable() {
    this.searchSettings.fuzzy
      ? this.form.get('threshold')?.enable()
      : this.form.get('threshold')?.disable();
  }

  set() {
    this.settings.set({
      search: this.searchSettings,
    });
  }
}
