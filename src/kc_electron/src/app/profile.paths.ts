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

/*
 * Data profile path rules. This module has no Electron imports so that
 * Node can test it.
 *
 *   KC_PROFILE_DIR=<path>   Use <path> for all application data.
 *   KC_PROFILE_DIR=system   Use the normal per-user locations.
 *   (unset, unpackaged)     Use <appPath>/.dev-profiles/dev.
 *   (unset, packaged)       Use the normal per-user locations.
 */

import path from "path";

export interface DataProfile {
  root: string;
  userData: string;
  data: string;
  settings: string;
  downloads: string;
}

export function resolveProfile(
  requested: string | undefined,
  isPackaged: boolean,
  appPath: string
): DataProfile | null {
  if (requested === "system") {
    return null;
  }

  let root: string;
  if (requested) {
    root = path.resolve(requested);
  } else if (!isPackaged) {
    root = path.join(appPath, ".dev-profiles", "dev");
  } else {
    return null;
  }

  return {
    root,
    userData: path.join(root, "userData"),
    data: path.join(root, "data"),
    settings: path.join(root, "settings"),
    downloads: path.join(root, "downloads"),
  };
}
