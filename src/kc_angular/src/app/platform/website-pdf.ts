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

/**
 * Save a website as a PDF file. The desktop app renders the page in a
 * hidden window and writes the file. A browser page cannot do this.
 */
export abstract class WebsitePdf {
  abstract readonly available: boolean;
  /** Resolves to the saved file path. */
  abstract save(
    url: string,
    filename: string,
    timeoutMs?: number
  ): Promise<string>;
}

@Injectable()
export class DesktopWebsitePdf extends WebsitePdf {
  readonly available = true;

  save(url: string, filename: string, timeoutMs = 20000) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The PDF was not saved in time.')),
        timeoutMs
      );
      window.api.receiveOnce('E2A:Extraction:Website', (result: unknown) => {
        clearTimeout(timer);
        if (typeof result === 'string' && result) resolve(result);
        else reject(new Error('The PDF was not saved.'));
      });
      window.api.send('A2E:Extraction:Website', { url, filename });
    });
  }
}

@Injectable()
export class BrowserWebsitePdf extends WebsitePdf {
  readonly available = false;

  save(): Promise<string> {
    return Promise.reject(
      new Error('Saving a website as PDF is available in the desktop app.')
    );
  }
}
