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

/** True when the Electron preload bridge exists. Decided once at startup. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!(window as any).api;
}

export type Feature =
  | 'chat'
  | 'saveWebsite'
  | 'embeddedBrowser'
  | 'importSettings'
  | 'windowControls'
  | 'openInDefaultApp'
  | 'showInFolder'
  | 'fileThumbnails'
  | 'fileIcons'
  | 'dragOut';

const DESKTOP_ONLY: Record<Feature, string> = {
  chat: 'Chat is available in the desktop app.',
  saveWebsite: 'Saving websites is available in the desktop app.',
  embeddedBrowser: 'The built-in browser is available in the desktop app.',
  importSettings:
    'Watched folders and extension settings are available in the desktop app.',
  windowControls: 'Window controls are part of the desktop app.',
  openInDefaultApp:
    'Opening files in other apps is available in the desktop app.',
  showInFolder: 'Showing files in Finder is available in the desktop app.',
  fileThumbnails: 'File thumbnails are available in the desktop app.',
  fileIcons: 'File icons are available in the desktop app.',
  dragOut: 'Dragging files out of Knowledge is available in the desktop app.',
};

/** Which optional features this client has. */
@Injectable({ providedIn: 'root' })
export class Platform {
  readonly kind: 'desktop' | 'browser' = isDesktop() ? 'desktop' : 'browser';

  get desktop() {
    return this.kind === 'desktop';
  }

  has(feature: Feature): boolean {
    return this.desktop || !(feature in DESKTOP_ONLY);
  }

  /** Why a feature is not available, for tooltips and messages. */
  unavailable(feature: Feature): string {
    return this.has(feature) ? '' : DESKTOP_ONLY[feature];
  }
}
