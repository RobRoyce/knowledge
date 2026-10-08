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

import type { AssetRecord } from '@contracts/storage';

/**
 * Local filesystem functions. Desktop only. The browser has no access to
 * local paths, and the library API never accepts them.
 */
export abstract class NativeFiles {
  abstract readonly available: boolean;

  /** Original location of a file the user selected, or null. Metadata only. */
  abstract pathOf(file: File): string | null;

  /** Copy a local file by path into the library (watched folders). */
  abstract importFromPath(
    path: string,
    mediaType?: string
  ): Promise<AssetRecord>;

  /** Open a managed file in its default application. */
  abstract openManagedFile(assetId: string): Promise<boolean>;
}

export class DesktopNativeFiles extends NativeFiles {
  readonly available = true;

  pathOf(file: File) {
    const path = (file as any).path;
    return typeof path === 'string' && path ? path : null;
  }

  importFromPath(path: string, mediaType?: string): Promise<AssetRecord> {
    return window.api.invoke('A2E:Storage:ImportFile', { path, mediaType });
  }

  openManagedFile(assetId: string): Promise<boolean> {
    return window.api.invoke('A2E:Storage:OpenAsset', assetId);
  }
}

export class BrowserNativeFiles extends NativeFiles {
  readonly available = false;

  pathOf() {
    return null;
  }

  importFromPath(): Promise<AssetRecord> {
    return Promise.reject(
      new Error('Local file paths are not available in the browser.')
    );
  }

  openManagedFile(): Promise<boolean> {
    return Promise.reject(
      new Error('Opening files in other apps is available in the desktop app.')
    );
  }
}
