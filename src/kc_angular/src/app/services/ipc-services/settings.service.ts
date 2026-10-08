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

import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, tap } from 'rxjs';
import { SettingsStore } from '@app/platform/settings-store';
import { WindowControls } from '@app/platform/window-controls';
import {
  ApplicationSettingsModel,
  DisplaySettingsModel,
  GraphSettingsModel,
  IngestSettingsModel,
  SearchSettingsModel,
  SettingsModel,
} from '@shared/models/settings.model';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { Router } from '@angular/router';
import { SettingsComponent } from '@components/settings/settings.component';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private _settings = new BehaviorSubject<SettingsModel>({} as any);
  all = this._settings.asObservable();

  private _search = new BehaviorSubject<SearchSettingsModel>({} as any);
  search = this._search.asObservable();

  private _app = new BehaviorSubject<ApplicationSettingsModel>({} as any);
  app = this._app.asObservable();

  private _ingest = new BehaviorSubject<IngestSettingsModel>({} as any);
  ingest = this._ingest.asObservable();

  private _display = new BehaviorSubject<DisplaySettingsModel>({} as any);
  display = this._display.asObservable();

  private _graph = new BehaviorSubject<GraphSettingsModel>({} as any);
  graph = this._graph.asObservable();

  private ref?: DynamicDialogRef;

  constructor(
    private store: SettingsStore,
    private windowControls: WindowControls,
    private dialog: DialogService,
    private router: Router,
    private zone: NgZone
  ) {
    // Keep a copy of default settings for other components and services
    this.store.defaults().then((settings) => {
      this.zone.run(() => {
        this._defaults = settings;
      });
    });

    // Desktop: Electron settings file. Browser: localStorage.
    this.store.changes.subscribe((settings: SettingsModel) => {
      this.zone.run(() => {
        console.debug(
          `[Debug]-[${new Date().toLocaleString()}]-[SettingsService]: Settings Updated: `,
          settings
        );
        this._settings.next(settings);

        if (settings.search) {
          this._search.next(settings.search);
        } else {
          console.error('SettingsService - Search Settings not found...');
        }

        if (settings.app) {
          this._app.next(settings.app);
        } else {
          console.error('SettingsService - Application Settings not found...');
        }

        if (settings.ingest) {
          this._ingest.next(settings.ingest);
        } else {
          console.error('SettingsService - Ingest Settings not found...');
        }

        if (settings.display) {
          this._display.next(settings.display);
          setTimeout(() => {
            this.windowControls.setZoom(settings.display.zoom);
          });
        } else {
          console.error('SettingsService - Display Settings not found...');
        }

        if (settings.app.graph) {
          this._graph.next(settings.app.graph);
        } else {
          console.error('SettingsService - Graph Settings not found...');
        }
      });
    });

    this.store.start();
  }

  private _defaults!: SettingsModel;

  get defaults() {
    return this._defaults;
  }

  get(): SettingsModel {
    return this._settings.value;
  }

  /**
   * If `settings` is an Object, make sure it conforms to the root level SettingsModel
   * i.e. if updating ingest, the parameter should contain {ingest: {...}}
   * @param settings
   */
  set(settings: SettingsModel | Object) {
    this.store.save(settings);
  }

  show(category?: 'display' | 'search' | 'import' | 'graph' | 'chat') {
    if (this.ref) {
      return;
    }
    this.ref = this.dialog.open(SettingsComponent, {
      header: 'Settings',
      width: 'min(72rem, 95vw)',
      height: 'min(72rem, 95vh)',
      contentStyle: {
        'border-bottom-left-radius': '6px',
        'border-bottom-right-radius': '6px',
      },
    });

    if (!category) {
      category = 'display';
    }

    const route = this.router.url;

    setTimeout(() => {
      this.router
        .navigate(['app', { outlets: { settings: [category] } }])
        .then((success) => {
          if (!success) {
            console.warn('SettingsService - Unable to navigate to ', category);
          }
        });
    });

    this.ref.onClose
      .pipe(
        take(1),
        tap(() => {
          this.router.navigateByUrl(route).then((success) => {
            if (!success) {
              console.warn(
                'SettingsService - Unable to navigate to ',
                category
              );
            }
            this.ref = undefined;
          });
        })
      )
      .subscribe();
  }
}
