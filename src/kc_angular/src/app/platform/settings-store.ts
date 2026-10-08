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

import { Observable, ReplaySubject } from 'rxjs';
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

  /** Merge a partial settings object and store it. */
  abstract save(partial: object): void;
}

/** Desktop: Electron keeps settings in knowledge.settings.json. */
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

const BROWSER_SETTINGS_KEY = 'kc-settings';

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

/** Browser: settings are UI preferences in localStorage. */
export class BrowserSettingsStore extends SettingsStore {
  private subject = new ReplaySubject<SettingsModel>(1);
  readonly changes = this.subject.asObservable();
  private current: SettingsModel = browserDefaults();

  defaults() {
    return Promise.resolve(browserDefaults());
  }

  start() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(BROWSER_SETTINGS_KEY) ?? '{}'
      );
      this.current = merge(browserDefaults(), saved);
    } catch {
      this.current = browserDefaults();
    }
    this.subject.next(this.current);
  }

  /**
   * Emit only real changes, and asynchronously, like the desktop store.
   * Subscribers that save settings in response cannot start a loop.
   */
  save(partial: object) {
    const next = merge(this.current, partial);
    const json = JSON.stringify(next);
    if (json === JSON.stringify(this.current)) {
      return;
    }
    this.current = next;
    try {
      localStorage.setItem(BROWSER_SETTINGS_KEY, json);
    } catch (e) {
      console.warn('[Settings]: not saved', e);
    }
    setTimeout(() => this.subject.next(this.current));
  }
}
