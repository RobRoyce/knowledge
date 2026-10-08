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
 * Local backend addresses for this instance.
 *
 * Each server listens on an ephemeral loopback port and requires a random
 * bearer token. The renderer receives the address and token only through
 * the A2E:Backend:Info IPC channel, so it cannot reach another instance.
 */

import { ipcMain } from "electron";
import crypto from "crypto";

export interface BackendEndpoint {
  url?: string;
  token?: string;
  error?: string;
}

export interface BackendInfo {
  chat: BackendEndpoint;
}

export function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Register the IPC handler. Each value resolves when its server is ready
 * or has failed.
 */
export function registerBackendInfo(endpoints: {
  [K in keyof BackendInfo]: Promise<BackendEndpoint>;
}) {
  ipcMain.handle("A2E:Backend:Info", async (): Promise<BackendInfo> => {
    return { chat: await endpoints.chat };
  });
}
