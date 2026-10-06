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
 * Applies the data profile and resolves the Resources directory.
 *
 * Import this module before any other application module. It must call
 * app.setPath("userData") before Electron creates the default session.
 * See profile.paths.ts for the profile selection rules.
 */

import { app } from "electron";
import fs from "fs";
import path from "path";
import { resolveProfile } from "./profile.paths";

export const profile = resolveProfile(
  process.env.KC_PROFILE_DIR,
  app.isPackaged,
  app.getAppPath()
);

if (profile) {
  for (const dir of Object.values(profile)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  app.setPath("userData", profile.userData);
  app.setPath("sessionData", profile.userData);
  app.setPath("crashDumps", path.join(profile.userData, "Crashpad"));
  console.log(`[Knowledge]: data profile: ${profile.root}`);
} else {
  console.log("[Knowledge]: data profile: system (per-user default)");
}

/**
 * Directory that holds app.env, icon.png and tiktoken_bg.wasm.
 * Packaged builds receive these files through electron-builder extraResources.
 */
export function resourcesDir(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), "Resources");
}
