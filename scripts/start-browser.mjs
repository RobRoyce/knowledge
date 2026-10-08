/*
 * Start the storage service with the browser UI. No Electron.
 *
 *   yarn browser [--data-dir <dir>] [--web-root <dir>] [--port <n>]
 *                [--session-idle-minutes <n>] [--open]
 *
 * Defaults: --data-dir .dev-profiles/browser/library,
 *           --web-root src/kc_angular/dist/main (run yarn build-angular-dev first).
 *
 * The port comes from the library path, so one library always opens at the
 * same browser address. The page and its browser preferences belong to
 * that address. Use --port when that port is in use.
 *
 * The bearer token stays in this process and the service environment. It
 * is never printed. The script prints a one-time launch link. Press Enter
 * for a new link (for example, after a session ends). Press Ctrl+C to stop.
 */

import crypto from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import { spawn, execFile } from "node:child_process";
import { parseArgs } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    "data-dir": {
      type: "string",
      default: path.join(ROOT, ".dev-profiles", "browser", "library"),
    },
    "web-root": {
      type: "string",
      default: path.join(ROOT, "src", "kc_angular", "dist", "main"),
    },
    port: { type: "string" },
    "session-idle-minutes": { type: "string" },
    open: { type: "boolean", default: false },
  },
});

const dataDir = path.resolve(values["data-dir"]);

/** 41000-48999: below the ephemeral range of macOS, Linux, and Windows. */
function libraryPort(dir) {
  const hash = crypto.createHash("sha256").update(dir).digest();
  return 41000 + (hash.readUInt32BE(0) % 8000);
}

const port = values.port ?? String(libraryPort(dataDir));

const token = crypto.randomBytes(32).toString("hex");
const service = spawn(
  process.execPath,
  [
    path.join(ROOT, "src", "kc_storage", "src", "main.ts"),
    "serve",
    "--data-dir",
    dataDir,
    "--web-root",
    path.resolve(values["web-root"]),
    "--port",
    port,
    ...(values["session-idle-minutes"]
      ? ["--session-idle-minutes", values["session-idle-minutes"]]
      : []),
    "--exit-on-stdin-close",
  ],
  {
    env: { ...process.env, KC_STORAGE_TOKEN: token },
    stdio: ["pipe", "pipe", "inherit"],
  }
);

const ready = await new Promise((resolve, reject) => {
  let out = "";
  service.stdout.on("data", (d) => {
    out += d;
    const line = out.split("\n")[0];
    if (out.includes("\n")) resolve(JSON.parse(line));
  });
  service.on("exit", (code) =>
    reject(
      new Error(
        `The storage service stopped (code ${code}). If port ${port} is in use, ` +
          "stop the other program or choose a port with --port <n>. " +
          "A different port is a different browser address, with its own browser preferences."
      )
    )
  );
});

async function printLaunchLink() {
  const res = await fetch(`${ready.url}/v1/session/launch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(`Could not create a launch link (${res.status}).`);
  const { url, expiresAt } = await res.json();
  console.log(
    `\nOpen this link in your browser (one use, expires ${expiresAt}):\n\n  ${url}\n`
  );
  console.log("Press Enter for a new link. Press Ctrl+C to stop.");
  return url;
}

console.log(`Library: ${ready.dataDir}`);
const first = await printLaunchLink();
if (values.open && process.platform === "darwin") {
  execFile("open", [first]);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", () => printLaunchLink().catch((e) => console.error(e.message)));

const stop = () => {
  service.stdin.end();
  service.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
service.on("exit", (code) => process.exit(code ?? 0));
