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

/** Native window functions. The browser has none. */
export abstract class WindowControls {
  abstract readonly available: boolean;
  abstract minimize(): void;
  abstract maximize(): void;
  abstract setZoom(percent: number): void;
}

export class DesktopWindowControls extends WindowControls {
  readonly available = true;
  minimize() {
    window.api.send('A2E:Window:Minimize');
  }
  maximize() {
    window.api.send('A2E:Window:Maximize');
  }
  setZoom(percent: number) {
    window.api.send('A2E:Window:ZoomIn', percent);
  }
}

export class BrowserWindowControls extends WindowControls {
  readonly available = false;
  minimize() {}
  maximize() {}
  setZoom() {}
}
