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
 * Starts the standalone storage service (kc_storage) with Node.js.
 *
 * Electron's own Node.js is too old for node:sqlite, so the service runs in
 * a separate Node.js 24 process:
 *
 *   Packaged:    Resources/node/bin/node (bundled) and Resources/kc_storage.
 *                PATH, KC_NODE, and the working directory are not used.
 *   Unpackaged:  KC_NODE or node from PATH, and <repo>/src/kc_storage.
 *
 * The service stops when this process closes its standard input, including
 * after a crash.
 */

import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import { BackendEndpoint, newToken } from "./backend";

const START_TIMEOUT_MS = 20000;

let child: ChildProcess | undefined;

interface ServiceLocation {
  node: string;
  entry: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

function serviceLocation(token: string): ServiceLocation {
  if (app.isPackaged) {
    const resources = process.resourcesPath;
    return {
      node: path.join(resources, "node", "bin", "node"),
      entry: path.join(resources, "kc_storage", "src", "main.ts"),
      cwd: resources,
      env: { KC_STORAGE_TOKEN: token },
    };
  }
  // Only the variables the service needs. ELECTRON_RUN_AS_NODE and
  // test-runner variables must not reach it.
  return {
    node: process.env.KC_NODE || "node",
    entry: path.join(app.getAppPath(), "src", "kc_storage", "src", "main.ts"),
    cwd: app.getAppPath(),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      KC_STORAGE_TOKEN: token,
    },
  };
}

export function startStorageService(dataDir: string): Promise<BackendEndpoint> {
  const token = newToken();
  const { node, entry, cwd, env } = serviceLocation(token);

  return new Promise((resolve) => {
    if (!fs.existsSync(entry)) {
      resolve({ error: `Storage service not found at ${entry}.` });
      return;
    }
    if (app.isPackaged && !fs.existsSync(node)) {
      resolve({ error: `Bundled Node.js runtime not found at ${node}.` });
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
      { cwd, env, stdio: ["pipe", "pipe", "pipe"] }
    );

    console.log(`[Knowledge]: storage service runtime: ${node} ${entry}`);

    const timer = setTimeout(() => {
      finish({
        error: `Storage service did not start in time. ${stderr}`.trim(),
      });
      child?.kill();
    }, START_TIMEOUT_MS);

    child.on("error", (e) => {
      clearTimeout(timer);
      finish({
        error: app.isPackaged
          ? `Could not run the bundled Node.js runtime (${node}): ${e.message}.`
          : `Could not run "${node}": ${e.message}. Install Node.js 24 or set KC_NODE.`,
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
