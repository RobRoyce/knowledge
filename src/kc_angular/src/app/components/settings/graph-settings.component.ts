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
import {
  GraphActions,
  GraphSettingsModel,
} from '@shared/models/settings.model';
import { SettingsService } from '@services/ipc-services/settings.service';
import { FormBuilder, FormGroup } from '@angular/forms';
import { debounceTime, distinctUntilChanged, tap } from 'rxjs/operators';

@Component({
  selector: 'app-graph-settings',
  template: `
    <div class="p-fluid grid">
      <form [formGroup]="form" class="w-full h-full">
        <div class="col-12">
          <p-panel [toggleable]="true" toggler="header">
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">General</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  class="w-full"
                  label="Show Sources"
                  labelHelp="Enable or disable showing Source nodes in the graph. Disabling will improve performance but only Project nodes will be visible."
                  labelSubtext="{{
                    form.controls.showSources.value | switchLabel
                  }}"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="showSources"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  class="w-full"
                  label="Auto-fit"
                  labelHelp="Enable or disable automatically fitting the graph to viewport after each layout."
                  labelSubtext="{{ form.controls.autoFit.value | switchLabel }}"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="autoFit"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  class="w-full"
                  label="Performance Warnings"
                  labelHelp="Enable or disable warnings when Knowledge detects potential performance issues with the graph."
                  labelSubtext="{{
                    form.controls.largeGraphWarning.value | switchLabel
                  }}"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="largeGraphWarning"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  class="w-full"
                  label="On single-click"
                  labelHelp="The action to perform when single-clicking Source nodes in the graph."
                >
                  <p-dropdown
                    class="settings-input w-12rem"
                    formControlName="tap"
                    [options]="actions"
                    optionLabel="label"
                    optionValue="action"
                  ></p-dropdown>
                </app-setting-template>

                <app-setting-template
                  class="w-full"
                  label="On double-click"
                  labelHelp="The action to perform when double-clicking Source nodes in the graph."
                >
                  <p-dropdown
                    class="settings-input w-12rem"
                    formControlName="dblTap"
                    [options]="actions"
                    optionLabel="label"
                    optionValue="action"
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
                <div class="text-2xl">Animation</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  label="Animations"
                  labelHelp="Enable or disable animations. Disabling animations may improve performance."
                  labelSubtext="{{ form.controls.animate.value | switchLabel }}"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="animate"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  label="Animation Duration"
                  labelHelp="How long it takes to animate changes in the graph."
                  labelSubtext="{{
                    form.controls.duration.value / 1000.0 | number : '1.1'
                  }}s"
                >
                  <p-slider
                    class="w-16rem settings-input"
                    [min]="0"
                    [max]="10000"
                    [step]="500"
                    formControlName="duration"
                  ></p-slider>
                  <div class="settings-input-subtext-left">Shorter</div>
                  <div class="settings-input-subtext-right">Longer</div>
                </app-setting-template>
              </div>
            </ng-template>
          </p-panel>
        </div>

        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Physics</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  label="Simulate"
                  labelHelp="Run physics-based simulation after non-simulated layouts. This may help graphs look better at the cost of extra layout time."
                  labelSubtext="{{
                    form.controls.simulate.value | switchLabel
                  }}"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="simulate"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  label="Run Forever"
                  labelHelp="Run simulation until it reaches steady state. May cause performance issues and extremely long runtimes."
                  labelSubtext="{{
                    form.controls.infinite.value | switchLabel
                  }}"
                >
                  <p-inputSwitch
                    class="settings-input"
                    formControlName="infinite"
                  ></p-inputSwitch>
                </app-setting-template>

                <app-setting-template
                  label="Simulation Runtime"
                  labelHelp="How long to run simulation before stopping. Shorter times may result in better performance and more stability at the cost of layout coherence."
                  labelSubtext="{{
                    form.controls.maxTime.value / 1000.0 | number : '1.1'
                  }}s"
                >
                  <p-slider
                    class="w-16rem settings-input"
                    [min]="0"
                    [max]="10000"
                    [step]="500"
                    formControlName="maxTime"
                  ></p-slider>
                  <div class="settings-input-subtext-left">Shorter</div>
                  <div class="settings-input-subtext-right">Longer</div>
                </app-setting-template>

                <app-setting-template
                  label="Delay"
                  labelHelp="How long to wait before running auto-simulate after running non-simulated layouts."
                  labelSubtext="{{
                    form.controls.autoSimulateDelay.value / 1000.0
                      | number : '1.1'
                  }}s"
                >
                  <p-slider
                    class="w-16rem settings-input"
                    [min]="0"
                    [max]="5000"
                    [step]="500"
                    formControlName="autoSimulateDelay"
                  ></p-slider>
                  <div class="settings-input-subtext-left">Shorter</div>
                  <div class="settings-input-subtext-right">Longer</div>
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
export class GraphSettingsComponent {
  graphSettings: GraphSettingsModel = new GraphSettingsModel();

  form: FormGroup;

  actions: { action: GraphActions; label: string }[] = [
    { action: 'preview', label: 'Show Preview' },
    { action: 'details', label: 'Show Details' },
    { action: 'open', label: 'Open in...' },
    { action: 'select', label: 'Select (no action)' },
  ];

  constructor(
    private settings: SettingsService,
    private formBuilder: FormBuilder
  ) {
    if (!settings.get().app.graph) {
      this.set();
    } else {
      this.graphSettings = {
        ...this.graphSettings,
        ...settings.get().app.graph,
      };
    }

    this.form = formBuilder.group({
      showSources: [this.graphSettings.display.showSources],
      autoFit: [this.graphSettings.display.autoFit],
      largeGraphWarning: [this.graphSettings.display.largeGraphWarning],
      animate: [this.graphSettings.animation.enabled],
      duration: [this.graphSettings.animation.duration],
      simulate: [this.graphSettings.simulation.enabled],
      infinite: [this.graphSettings.simulation.infinite],
      maxTime: [this.graphSettings.simulation.maxTime],
      autoSimulateDelay: [this.graphSettings.simulation.delay],
      dblTap: [this.graphSettings.actions.dblTap],
      tap: [this.graphSettings.actions.tap],
    });

    this.disable();

    this.form.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged((prev, curr) => {
          return (
            curr.animate === prev.animate &&
            curr.duration === prev.duration &&
            curr.simulate === prev.simulate &&
            curr.maxTime === prev.maxTime &&
            curr.infinite === prev.infinite &&
            curr.autoFit === prev.autoFit &&
            curr.largeGraphWarning === prev.largeGraphWarning &&
            curr.autoSimulateDelay === prev.autoSimulateDelay &&
            curr.tap === prev.tap &&
            curr.dblTap === prev.dblTap
          );
        }),
        tap((formValue) => {
          this.graphSettings = {
            animation: {
              enabled: formValue.animate,
              duration: formValue.duration,
            },
            display: {
              showSources: formValue.showSources,
              autoFit: formValue.autoFit,
              largeGraphWarning: formValue.largeGraphWarning,
            },
            simulation: {
              enabled: formValue.simulate,
              infinite: formValue.infinite,
              maxTime: formValue.maxTime,
              delay: formValue.autoSimulateDelay,
            },
            actions: {
              dblTap: formValue.dblTap,
              tap: formValue.tap,
            },
            minimal: this.graphSettings.minimal,
          };

          this.disable();
          this.set();
        })
      )
      .subscribe();
  }

  disable() {
    this.graphSettings.animation.enabled
      ? this.form.get('duration')?.enable()
      : this.form.get('duration')?.disable();

    if (this.graphSettings.simulation.enabled) {
      this.form.get('infinite')?.enable();
      this.form.get('autoSimulateDelay')?.enable();

      if (this.graphSettings.simulation.infinite) {
        this.form.get('maxTime')?.disable();
      } else {
        this.form.get('maxTime')?.enable();
      }
    } else {
      this.form.get('infinite')?.disable();
      this.form.get('maxTime')?.disable();
      this.form.get('autoSimulateDelay')?.disable();
    }
  }

  set() {
    this.settings.set({
      app: {
        graph: this.graphSettings,
      },
    });
  }
}
