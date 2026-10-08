/*
 * Launch helpers for driving Knowledge with isolated data profiles.
 *
 * Every launch sets KC_PROFILE_DIR. These helpers never use the normal
 * per-user profile. Output (profiles, logs, screenshots) goes to
 * e2e/.output/<run>, which Git ignores.
 */

import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

export const REPO = path.resolve(import.meta.dirname, "..");
export const FIXTURES = path.join(REPO, "e2e", "fixtures");

/**
 * The Electron binary. Since Electron 42 the package downloads it on first
 * use (checked against the package's checksums.json), not at install.
 */
export const ELECTRON = createRequire(import.meta.url)("electron");

/**
 * Environment for the app. The Node test runner sets NODE_TEST_CONTEXT in
 * child processes. Electron's Node must not see it, or startup stalls.
 */
export function appEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return env;
}

/** Create an empty output directory for one test run. */
export function newRun(name) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(REPO, "e2e", ".output", `${name}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Launch the app with the given profile directory. The window stays hidden
 * and never takes focus; set KC_E2E_SHOW=1 to watch it.
 *
 * options.packaged: path to a packaged Knowledge.app. The app then gets
 * only options.env (no inherited variables) and runs in options.cwd.
 */
export async function launch(profileDir, logFile, env = {}, options = {}) {
  if (!profileDir) {
    throw new Error("launch() needs an explicit profile directory");
  }
  const log = fs.createWriteStream(logFile, { flags: "a" });
  const hidden =
    process.env.KC_E2E_SHOW === "1" ? {} : { KC_HIDDEN_WINDOW: "1" };
  const app = await electron.launch(
    options.packaged
      ? {
          executablePath: path.join(
            options.packaged,
            "Contents/MacOS/Knowledge"
          ),
          args: [],
          cwd: options.cwd,
          env: { ...env, ...hidden, KC_PROFILE_DIR: profileDir },
          timeout: 60000,
        }
      : {
          executablePath: ELECTRON,
          args: [REPO],
          cwd: REPO,
          env: { ...appEnv(), ...env, ...hidden, KC_PROFILE_DIR: profileDir },
          timeout: 60000,
        }
  );
  app.process().stdout?.on("data", (d) => log.write(`[main] ${d}`));
  app.process().stderr?.on("data", (d) => log.write(`[main:err] ${d}`));
  const page = await app.firstWindow();
  page.on("console", (m) => log.write(`[renderer:${m.type()}] ${m.text()}\n`));
  page.on("pageerror", (e) => log.write(`[renderer:pageerror] ${e.message}\n`));
  await page.waitForSelector("app-create button", { timeout: 30000 });
  return { app, page, log };
}

export async function close(ctx) {
  await ctx.app.close();
  ctx.log.end();
}

export async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** Save every download from this window into dir. */
export async function captureDownloads(app, dir) {
  await app.evaluate(({ BrowserWindow }, target) => {
    const session = BrowserWindow.getAllWindows()[0].webContents.session;
    session.removeAllListeners("will-download");
    session.on("will-download", (_event, item) => {
      item.setSavePath(`${target}/${item.getFilename()}`);
    });
  }, dir);
}

/** Wait until a file exists and has stopped growing. */
export async function waitForFile(file, timeout = 15000) {
  const end = Date.now() + timeout;
  let last = -1;
  while (Date.now() < end) {
    if (fs.existsSync(file)) {
      const size = fs.statSync(file).size;
      if (size > 0 && size === last) {
        return file;
      }
      last = size;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`File did not appear: ${file}`);
}

/** Serve e2e/fixtures/site on an ephemeral loopback port. */
export async function startFixtureSite() {
  const root = path.join(FIXTURES, "site");
  const server = http.createServer((req, res) => {
    const name =
      path.basename(new URL(req.url, "http://x").pathname) || "index.html";
    const file = path.join(root, name);
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/index.html`,
    close: () => server.close(),
  };
}

/** Backend addresses and tokens of the instance that owns this page. */
export function backendInfo(page) {
  return page.evaluate(() => window.api.invoke("A2E:Backend:Info"));
}

/** Read projects and sources from this instance's storage service. */
export async function readLibrary(page) {
  return page.evaluate(async () => {
    const { storage } = await window.api.invoke("A2E:Backend:Info");
    const get = (route) =>
      fetch(`${storage.url}/v1/${route}`, {
        headers: { Authorization: `Bearer ${storage.token}` },
      }).then((r) => r.json());
    const { projects } = await get("projects");
    const { sources } = await get("sources");
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      sources: sources
        .filter((s) => s.projectId === p.id)
        .map((s) => ({
          id: s.id,
          title: s.title,
          type: s.ingestType,
          assetId: s.assetId,
          topics: s.data.topics ?? [],
          annotations: (s.data.meta ?? [])
            .filter((m) => m.key === "annotation")
            .map((m) => m.value),
        })),
    }));
  });
}

/** Bytes of a managed file, read through this instance's storage service. */
export async function readAsset(page, assetId) {
  const base64 = await page.evaluate(async (id) => {
    const { storage } = await window.api.invoke("A2E:Backend:Info");
    const res = await fetch(`${storage.url}/v1/assets/${id}/content`, {
      headers: { Authorization: `Bearer ${storage.token}` },
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    let text = "";
    for (const b of bytes) text += String.fromCharCode(b);
    return btoa(text);
  }, assetId);
  return Buffer.from(base64, "base64");
}
