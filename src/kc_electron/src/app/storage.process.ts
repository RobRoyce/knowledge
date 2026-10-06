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
 * Starts the standalone storage service (src/kc_storage) with Node.js.
 *
 * Electron's own Node.js is too old for node:sqlite, so the service runs
 * with the Node.js on PATH, or with KC_NODE. The service stops when this
 * process closes its standard input, including after a crash.
 */

import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import { BackendEndpoint, newToken } from "./backend";

const START_TIMEOUT_MS = 20000;

let child: ChildProcess | undefined;

export function startStorageService(dataDir: string): Promise<BackendEndpoint> {
  const entry = path.join(
    app.getAppPath(),
    "src",
    "kc_storage",
    "src",
    "main.ts"
  );
  const node = process.env.KC_NODE || "node";
  const token = newToken();

  return new Promise((resolve) => {
    if (!fs.existsSync(entry)) {
      resolve({ error: `Storage service not found at ${entry}.` });
      return;
    }

    let stderr = "";
    let settled = false;
    const finish = (endpoint: BackendEndpoint) => {
      if (!settled) {
        settled = true;
        resolve(endpoint);
      }
    };

    // Only the variables the service needs. ELECTRON_RUN_AS_NODE and
    // test-runner variables must not reach it.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      KC_STORAGE_TOKEN: token,
    };

    child = spawn(
      node,
      [
        entry,
        "serve",
        "--data-dir",
        dataDir,
        "--port",
        "0",
        "--allow-origin",
        "null",
        "--exit-on-stdin-close",
      ],
      { env, stdio: ["pipe", "pipe", "pipe"] }
    );

    const timer = setTimeout(() => {
      finish({
        error: `Storage service did not start in time. ${stderr}`.trim(),
      });
      child?.kill();
    }, START_TIMEOUT_MS);

    child.on("error", (e) => {
      clearTimeout(timer);
      finish({
        error: `Could not run "${node}": ${e.message}. Install Node.js 24 or set KC_NODE.`,
      });
    });

    child.stderr?.on("data", (d) => {
      stderr += d;
      process.stderr.write(`[storage] ${d}`);
    });

    let stdout = "";
    child.stdout?.on("data", (d) => {
      stdout += d;
      const newline = stdout.indexOf("\n");
      if (newline < 0 || settled) {
        return;
      }
      clearTimeout(timer);
      try {
        const ready = JSON.parse(stdout.slice(0, newline));
        console.log(`[Knowledge]: storage service listening on ${ready.url}`);
        finish({ url: ready.url, token });
      } catch {
        finish({ error: `Unexpected storage service output: ${stdout}` });
      }
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      finish({
        error: `Storage service exited with code ${code}. ${stderr}`.trim(),
      });
      if (settled && code !== 0) {
        console.error(`[Knowledge]: storage service stopped (code ${code})`);
      }
    });
  });
}

export function stopStorageService() {
  if (child && child.exitCode === null) {
    child.stdin?.end();
  }
}
