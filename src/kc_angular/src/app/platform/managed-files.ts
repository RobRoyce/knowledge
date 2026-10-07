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
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BackendService } from '@services/ipc-services/backend.service';
import { NativeFiles } from './native-files';

/** Show and open managed files (files copied into the library). */
export abstract class ManagedFiles {
  /**
   * A URL that shows the file in this client. Call release() with it when
   * the view closes.
   */
  abstract viewUrl(assetId: string, filename: string): Promise<string>;

  abstract release(url: string): void;

  /** Open the file outside the app view. */
  abstract open(assetId: string, filename: string): Promise<void>;

  protected contentPath(assetId: string, filename: string) {
    return `/v1/assets/${encodeURIComponent(
      assetId
    )}/content/${encodeURIComponent(filename)}`;
  }
}

/** Desktop: fetch with the bearer token into a blob: URL; open in the default app. */
@Injectable()
export class DesktopManagedFiles extends ManagedFiles {
  constructor(
    private http: HttpClient,
    private backend: BackendService,
    private native: NativeFiles
  ) {
    super();
  }

  async viewUrl(assetId: string, filename: string) {
    const blob = await firstValueFrom(
      this.http.get(
        this.backend.storage.url + this.contentPath(assetId, filename),
        {
          responseType: 'blob',
        }
      )
    );
    return URL.createObjectURL(blob);
  }

  release(url: string) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  async open(assetId: string) {
    await this.native.openManagedFile(assetId);
  }
}

/**
 * Browser: the session cookie authorizes same-origin requests, so the
 * page uses the content URL directly. The URL ends with the filename, so
 * the browser's PDF viewer and downloads show it.
 */
@Injectable()
export class BrowserManagedFiles extends ManagedFiles {
  async viewUrl(assetId: string, filename: string) {
    return this.contentPath(assetId, filename);
  }

  release() {}

  async open(assetId: string, filename: string) {
    window.open(this.contentPath(assetId, filename), '_blank', 'noopener');
  }
}
