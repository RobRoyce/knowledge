/*
 * Command line interface for the storage service.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { AddressInfo } from "node:net";
import { writeBackup } from "./backup.ts";
import { activateRestore, assertEmpty, stageRestore } from "./restore.ts";
import { openDataDir } from "./datadir.ts";
import { createServer } from "./http.ts";
import { migrate } from "./migrate.ts";
import { VERSION } from "./version.ts";

const USAGE = `kc-storage ${VERSION}

Usage:
  node src/main.ts serve   --data-dir <dir> [--port <n>] [--allow-origin <origin>]...
                           [--max-upload-mb <n>] [--exit-on-stdin-close]
                           [--web-root <dir> [--session-idle-minutes <n>]
                            [--session-max-hours <n>] [--launch-code-minutes <n>]]
  node src/main.ts migrate --data-dir <dir> --from <knowledge-backup.json> [--dry-run]
  node src/main.ts backup  --data-dir <dir> --out <file.tar>
  node src/main.ts restore --data-dir <empty dir> --from <file.tar>

serve needs the bearer token in the KC_STORAGE_TOKEN environment variable.
serve listens on 127.0.0.1 only. Port 0 (default) picks a free port.
When ready, serve prints one JSON line: {"event":"ready","url":...}.
--web-root serves the browser UI from <dir> and enables browser sessions.
Use scripts/start-browser.mjs (yarn browser) to start it with a launch link.`;

function fail(message: string): never {
  console.error(`kc-storage: ${message}`);
  process.exit(2);
}

export async function main(argv: string[]) {
  const [command, ...rest] = argv;
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        "data-dir": { type: "string" },
        port: { type: "string", default: "0" },
        "allow-origin": { type: "string", multiple: true, default: [] },
        "exit-on-stdin-close": { type: "boolean", default: false },
        "max-upload-mb": { type: "string", default: "2048" },
        "web-root": { type: "string" },
        "session-idle-minutes": { type: "string", default: "30" },
        "session-max-hours": { type: "string", default: "12" },
        "launch-code-minutes": { type: "string", default: "5" },
        from: { type: "string" },
        out: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    });
  } catch (e: any) {
    fail(`${e.message}\n\n${USAGE}`);
  }
  const values = parsed.values;
  if (!command || values.help) {
    console.log(USAGE);
    return;
  }
  const dataDir = values["data-dir"];
  if (!dataDir) fail("--data-dir is required.");

  switch (command) {
    case "serve":
      return serve(dataDir, values);
    case "migrate": {
      if (!values.from) fail("--from is required.");
      const dir = openDataDir(dataDir);
      try {
        const report = await migrate(dir, values.from, {
          dryRun: values["dry-run"],
        });
        console.log(JSON.stringify(summary(report), null, 2));
        if (report.status === "failed") process.exitCode = 1;
      } finally {
        dir.close();
      }
      return;
    }
    case "backup": {
      if (!values.out) fail("--out is required.");
      const dir = openDataDir(dataDir);
      const tmp = `${values.out}.partial`;
      try {
        const out = fs.createWriteStream(tmp, { flags: "wx" });
        const manifest = await writeBackup(dir, out);
        await new Promise<void>((resolve, reject) => {
          out.on("error", reject);
          out.end(resolve);
        });
        fs.renameSync(tmp, values.out);
        console.log(
          JSON.stringify({
            backup: path.resolve(values.out),
            projects: manifest.projects.length,
            sources: manifest.sources.length,
            assets: manifest.assets.length,
          })
        );
      } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw e;
      } finally {
        dir.close();
      }
      return;
    }
    case "restore": {
      if (!values.from) fail("--from is required.");
      // Same validation and activation as the HTTP API
      const dir = openDataDir(dataDir);
      try {
        assertEmpty(dir);
        const staged = await stageRestore(dir, values.from);
        const result = activateRestore(dir, staged);
        console.log(
          JSON.stringify({
            restored: result,
            warnings: staged.preview.warnings,
            notIncluded: staged.preview.notIncluded,
            dataDir: dir.root,
          })
        );
      } finally {
        dir.close();
      }
      return;
    }
    default:
      fail(`Unknown command: ${command}\n\n${USAGE}`);
  }
}

function summary(report: Awaited<ReturnType<typeof migrate>>) {
  const count = (o: Record<string, unknown[]>) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.length]));
  return {
    status: report.status,
    error: report.error,
    runDirectory: report.runDirectory,
    projects: count(report.projects),
    sources: count(report.sources),
    files: count(report.files),
    missingFiles: report.files.missing,
    superseded: report.superseded.length,
    inboxEntries: report.inbox.length,
    rendererKeys: report.rendererKeys.length,
  };
}

function serve(dataDir: string, values: Record<string, any>) {
  const token = process.env.KC_STORAGE_TOKEN;
  if (!token || token.length < 32) {
    fail(
      "KC_STORAGE_TOKEN must be set to a random value of at least 32 characters."
    );
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    fail("--port must be an integer from 0 to 65535.");
  }

  const maxUploadMb = Number(values["max-upload-mb"]);
  if (!Number.isFinite(maxUploadMb) || maxUploadMb <= 0) {
    fail("--max-upload-mb must be a positive number.");
  }

  const dir = openDataDir(dataDir);
  if (dir.swept.length > 0) {
    console.error(
      `[kc-storage] removed ${dir.swept.length} unreferenced or temporary files`
    );
  }
  const minutes = (name: string) => {
    const n = Number(values[name]);
    if (!Number.isFinite(n) || n <= 0)
      fail(`--${name} must be a positive number.`);
    return n * 60 * 1000;
  };
  const server = createServer({
    dir,
    token,
    allowedOrigins: values["allow-origin"],
    maxUploadBytes: Math.floor(maxUploadMb * 1024 * 1024),
    webRoot: values["web-root"],
    sessionOptions: {
      idleMs: minutes("session-idle-minutes"),
      maxMs: minutes("session-max-hours") * 60,
      launchCodeMs: minutes("launch-code-minutes"),
    },
  });

  let stopping = false;
  const shutdown = (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.error(`[kc-storage] stopping (${reason})`);
    server.close(() => {
      dir.close();
      process.exit(0);
    });
    server.closeAllConnections();
    setTimeout(() => {
      dir.close();
      process.exit(1);
    }, 5000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  if (values["exit-on-stdin-close"]) {
    process.stdin.on("end", () => shutdown("stdin closed"));
    process.stdin.on("error", () => shutdown("stdin error"));
    process.stdin.resume();
  }

  server.on("error", (e) => {
    console.error(`[kc-storage] server error: ${e.message}`);
    dir.close();
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    const { port: actual } = server.address() as AddressInfo;
    console.log(
      JSON.stringify({
        event: "ready",
        url: `http://127.0.0.1:${actual}`,
        version: VERSION,
        dataDir: dir.root,
        webUi: Boolean(values["web-root"]),
      })
    );
  });
}
