/*
 * Copyright (c) 2026 Rob Royce
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

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Observable, ReplaySubject } from 'rxjs';
import type { PreferenceDocument } from '@contracts/storage';
import { BackendService } from '@services/ipc-services/backend.service';
import {
  createDefaultSettings,
  SettingsModel,
} from '@shared/models/settings.model';

/** Where settings come from and where changes go. */
export abstract class SettingsStore {
  /** Complete settings, on load and after every change. */
  abstract readonly changes: Observable<SettingsModel>;

  /** Default settings. */
  abstract defaults(): Promise<SettingsModel>;

  /** Request the current settings. */
  abstract start(): void;

  /**
   * Resolves when the saved settings are loaded. The app waits for it at
   * startup, so no page reads or saves defaults in place of saved values.
   */
  ready(): Promise<void> {
    return Promise.resolve();
  }

  /** Merge a partial settings object and store it. */
  abstract save(partial: object): void;
}

/** Desktop: Electron keeps settings in knowledge.settings.json. */
@Injectable()
export class DesktopSettingsStore extends SettingsStore {
  private subject = new ReplaySubject<SettingsModel>(1);
  readonly changes = this.subject.asObservable();

  constructor() {
    super();
    window.api.receive('E2A:Settings:All', (settings: SettingsModel) =>
      this.subject.next(settings)
    );
  }

  defaults(): Promise<SettingsModel> {
    return new Promise((resolve) => {
      window.api.receiveOnce('E2A:Settings:Defaults', resolve);
      window.api.send('A2E:Settings:Defaults');
    });
  }

  start() {
    window.api.send('A2E:Settings:Get');
  }

  save(partial: object) {
    window.api.send('A2E:Settings:Set', partial);
  }
}

/** Settings of earlier versions, in localStorage of one browser address. */
const LEGACY_SETTINGS_KEY = 'kc-settings';

/** Preference document of the browser client in the storage service. */
const BROWSER_SETTINGS_PREFERENCE = 'browser-settings';

function browserDefaults(): SettingsModel {
  return createDefaultSettings({
    env: {
      appTitle: 'Knowledge',
      settingsFilename: '',
      DEFAULT_WINDOW_HEIGHT: 0,
      DEFAULT_WINDOW_WIDTH: 0,
      STARTUP_WINDOW_HEIGHT: 0,
      STARTUP_WINDOW_WIDTH: 0,
    },
    system: {
      appPath: '',
      appVersion: '',
      cwd: '',
      downloadPath: '',
      electronVersion: '',
      envPath: '',
      firstRun: false,
      homePath: '',
      nodeVersion: '',
      osPlatform: 'browser',
      osVersion: navigator.userAgent,
      pathSep: '/',
      resourcesPath: '',
      settingsPath: '',
      settingsFilePath: '',
    },
    storagePath: '',
    extensionsPath: '',
    autoscanPath: '',
  });
}

/** Plain-object merge. Arrays and other values replace. */
function merge(target: any, source: any): any {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source;
  }
  const out = { ...(target && typeof target === 'object' ? target : {}) };
  for (const [key, value] of Object.entries(source)) {
    out[key] = merge(out[key], value);
  }
  return out;
}

/**
 * Browser: the storage service keeps the settings with the library, so
 * they do not depend on the browser address. Nothing is emitted before the
 * saved settings load, so an early save cannot replace them with defaults.
 */
@Injectable()
export class BrowserSettingsStore extends SettingsStore {
  private subject = new ReplaySubject<SettingsModel>(1);
  readonly changes = this.subject.asObservable();
  private current: SettingsModel = browserDefaults();
  private loaded = false;
  private loading?: Promise<void>;
  private early: object[] = [];
  private writing = false;
  private dirty = false;

  constructor(private http: HttpClient, private backend: BackendService) {
    super();
  }

  private get url() {
    return `${this.backend.storage.url}/v1/preferences/${BROWSER_SETTINGS_PREFERENCE}`;
  }

  defaults() {
    return Promise.resolve(browserDefaults());
  }

  start() {
    this.ready();
  }

  override ready() {
    this.loading ??= this.load();
    return this.loading;
  }

  /**
   * Emit only real changes, and asynchronously, like the desktop store.
   * Subscribers that save settings in response cannot start a loop.
   */
  save(partial: object) {
    if (!this.loaded) {
      this.early.push(partial);
      return;
    }
    const next = merge(this.current, partial);
    if (JSON.stringify(next) === JSON.stringify(this.current)) {
      return;
    }
    this.current = next;
    this.write();
    setTimeout(() => this.subject.next(this.current));
  }

  private async load() {
    await this.backend.whenActive();
    let saved: object = {};
    let migrate = false;
    try {
      const { preference } = await firstValueFrom(
        this.http.get<{ preference: PreferenceDocument }>(this.url)
      );
      saved = preference.data;
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) {
        // First start of this library: save the settings document once,
        // with the settings of an earlier version at this address, if any
        saved = legacySettings();
        migrate = true;
      } else {
        console.warn('[Settings]: not loaded', e);
      }
    }
    this.current = merge(browserDefaults(), saved);
    for (const partial of this.early) {
      this.current = merge(this.current, partial);
    }
    this.loaded = true;
    if (migrate || this.early.length > 0) this.write();
    this.early = [];
    this.subject.next(this.current);
  }

  /** Write the newest settings. Waits while the connection is not active. */
  private async write() {
    this.dirty = true;
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        await this.backend.whenActive();
        try {
          await firstValueFrom(this.http.put(this.url, this.current));
          localStorage.removeItem(LEGACY_SETTINGS_KEY);
        } catch (e) {
          if (this.backend.isConnectionFailure(e)) {
            this.backend.connectionLost(e);
            this.dirty = true;
          } else {
            console.warn('[Settings]: not saved', e);
          }
        }
      }
    } finally {
      this.writing = false;
    }
  }
}

function legacySettings(): object {
  try {
    const saved = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) ?? '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}
