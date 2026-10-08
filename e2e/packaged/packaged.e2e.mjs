/*
 * The unsigned packaged app, self-contained:
 *
 * - The app is copied to a temporary directory outside the repository.
 * - It runs with only HOME, TMPDIR, and PATH=/usr/bin:/bin:/usr/sbin:/sbin
 *   (no Node.js, no AWS, Apple, or AI credentials).
 * - The working directory is outside the repository.
 * - Every launch uses an explicit scratch profile.
 *
 * Build first: yarn package-local
 * Run:         yarn e2e-packaged
 * App:         KC_PACKAGED_APP=<path to Knowledge.app> (default: dist/mac-arm64)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  FIXTURES,
  REPO,
  backendInfo,
  captureDownloads,
  close,
  launch,
  readAsset,
  readLibrary,
  startFixtureSite,
  waitForFile,
} from "../lib.mjs";
import * as ui from "../steps.mjs";
import {
  readTarEntry,
  readTarIndex,
  TarWriter,
} from "../../src/kc_storage/src/tar.ts";

const BUILT_APP =
  process.env.KC_PACKAGED_APP ??
  path.join(REPO, "dist/mac-arm64/Knowledge.app");
const RESTRICTED_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const PROJECT = "Packaged Project";
const SITE_TITLE = "Knowledge Fixture Site";
const byTitle = (list) =>
  [...list].sort((a, b) => a.title.localeCompare(b.title));

/** Storage service processes that serve a data directory under root. */
function serviceProcesses(root) {
  const out = spawnSync("/usr/bin/pgrep", ["-f", `serve --data-dir ${root}`], {
    encoding: "utf8",
  });
  return out.stdout
    .split("\n")
    .filter(Boolean)
    .map((pid) => ({
      pid,
      command: execFileSync("/bin/ps", ["-o", "command=", "-p", pid], {
        encoding: "utf8",
      }).trim(),
    }));
}

async function waitForNoServices(root) {
  for (let i = 0; i < 40 && serviceProcesses(root).length > 0; i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  return serviceProcesses(root);
}

/** Copy a backup and set its manifest version. */
async function withVersion(tar, out, version) {
  const index = readTarIndex(tar, { allowName: () => true, maxEntries: 100 });
  const manifest = JSON.parse(
    readTarEntry(tar, index.get("manifest.json")).toString()
  );
  manifest.version = version;
  const stream = fs.createWriteStream(out);
  const writer = new TarWriter(stream);
  await writer.addBuffer(
    "manifest.json",
    Buffer.from(JSON.stringify(manifest))
  );
  for (const [name, entry] of index) {
    if (name !== "manifest.json")
      await writer.addBuffer(name, readTarEntry(tar, entry));
  }
  await writer.finish();
  await new Promise((r) => stream.end(r));
  return out;
}

test(
  "packaged app works without Node.js, the repository, or credentials",
  { timeout: 600000 },
  async () => {
    assert.ok(
      fs.existsSync(BUILT_APP),
      `Packaged app not found: ${BUILT_APP}. Run yarn package-local.`
    );

    // Everything outside the repository
    // realpath: macOS reports /var/folders as /private/var/folders
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "kc-packaged-"))
    );
    const app = path.join(root, "Knowledge.app");
    execFileSync("/usr/bin/ditto", [BUILT_APP, app]);
    const cwd = path.join(root, "cwd");
    fs.mkdirSync(cwd);
    const env = {
      HOME: os.homedir(),
      TMPDIR: os.tmpdir(),
      PATH: RESTRICTED_PATH,
    };
    const options = { packaged: app, cwd };
    const log = path.join(root, "app.log");
    console.log(`packaged test directory: ${root}`);

    // No Node.js on the restricted PATH
    assert.notEqual(spawnSync("/usr/bin/which", ["node"], { env }).status, 0);

    const profileA = path.join(root, "profile-a");
    const profileB = path.join(root, "profile-b");
    const originals = path.join(root, "originals");
    fs.mkdirSync(originals);
    const pdf = path.join(originals, "recovery-fixture.pdf");
    const txt = path.join(originals, "recovery-note.txt");
    fs.copyFileSync(path.join(FIXTURES, "recovery-fixture.pdf"), pdf);
    fs.copyFileSync(path.join(FIXTURES, "recovery-note.txt"), txt);
    const pdfBytes = fs.readFileSync(pdf);
    const txtBytes = fs.readFileSync(txt);
    const site = await startFixtureSite();

    const expectedRuntime = `${app}/Contents/Resources/node/bin/node ${app}/Contents/Resources/kc_storage/src/main.ts serve`;
    let a;
    let b;
    try {
      // 1. Start. The service runs with the bundled runtime from the package.
      a = await launch(profileA, log, env, options);
      const services = serviceProcesses(profileA);
      assert.equal(services.length, 1, JSON.stringify(services));
      assert.ok(
        services[0].command.startsWith(expectedRuntime),
        services[0].command
      );
      const cwdOfService = execFileSync(
        "/usr/sbin/lsof",
        ["-a", "-p", services[0].pid, "-d", "cwd", "-Fn"],
        {
          encoding: "utf8",
        }
      );
      assert.match(
        cwdOfService,
        new RegExp(
          `n${app.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/Contents/Resources`
        )
      );

      // 2-5. Create, save a link, import files, annotate
      await ui.createProject(a.page, PROJECT, "Packaged workflow");
      await ui.addLinkToProject(a.page, site.url, SITE_TITLE);
      await ui.importFilesToProject(a.page, [pdf, txt]);
      await ui.openTable(a.page);
      await ui.openSource(a.page, "recovery-note.txt");
      await ui.addAnnotation(a.page, "annotation", "packaged note");
      await ui.addTopic(a.page, "packagedtopic");
      await a.page.waitForTimeout(1500);
      await ui.closeDialog(a.page);
      await a.page.waitForTimeout(1000);
      const library = await readLibrary(a.page);
      assert.equal(library.length, 1);
      assert.equal(library[0].sources.length, 3);
      await close(a);
      a = undefined;
      assert.deepEqual(await waitForNoServices(profileA), []);

      // 6. Restart and retrieve
      a = await launch(profileA, log, env, options);
      const afterRestart = await readLibrary(a.page);
      assert.deepEqual(
        byTitle(afterRestart[0].sources),
        byTitle(library[0].sources)
      );
      const note = afterRestart[0].sources.find(
        (s) => s.title === "recovery-note.txt"
      );
      assert.deepEqual(note.topics, ["packagedtopic"]);
      assert.deepEqual(note.annotations, ["packaged note"]);

      // 7. Export the library through the UI
      const downloads = path.join(root, "downloads");
      await captureDownloads(a.app, downloads);
      await ui.openSettings(a.page, "Backup");
      await a.page.locator("button", { hasText: "Export Library" }).click();
      const date = new Date().toISOString().slice(0, 10);
      const tar = await waitForFile(
        path.join(downloads, `knowledge-library-${date}.tar`)
      );

      // 8. Make the original files unavailable
      fs.rmSync(originals, { recursive: true });

      // 9. Second isolated profile, while the first instance still runs
      b = await launch(profileB, log, env, options);
      const infoA = await backendInfo(a.page);
      const infoB = await backendInfo(b.page);
      assert.notEqual(infoA.storage.url, infoB.storage.url);
      assert.notEqual(infoA.storage.token, infoB.storage.token);
      assert.notEqual(infoA.chat.url, infoB.chat.url);
      const crossStatus = await b.page.evaluate(
        async ({ url, token }) =>
          (
            await fetch(`${url}/v1/projects`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          ).status,
        { url: infoA.storage.url, token: infoB.storage.token }
      );
      assert.equal(crossStatus, 401);
      for (const s of [
        ...serviceProcesses(profileA),
        ...serviceProcesses(profileB),
      ]) {
        assert.ok(s.command.startsWith(expectedRuntime), s.command);
      }
      await close(a);
      a = undefined;
      assert.deepEqual(await waitForNoServices(profileA), []);

      // Chat history and preferences must not change during a library restore
      await b.page.evaluate(() =>
        localStorage.setItem("chat-sentinel", "keep me")
      );

      // An unsupported backup version is refused with a clear message
      const v3 = await withVersion(tar, path.join(root, "v3.tar"), 3);
      const refused = await ui.restoreLibraryError(b.page, v3);
      assert.match(refused, /Backup version 3 is not supported/);
      assert.deepEqual(await readLibrary(b.page), []);

      // 10. Restore through the interface
      const restore = await ui.restoreLibrary(b.page, tar);
      assert.match(restore.preview, /1 project, 3 sources, 2 files/);
      assert.match(restore.preview, /Chat history/);
      assert.match(restore.preview, /API keys/);
      assert.match(
        restore.result,
        /Restored 1 project, 3 sources, and 2 files/
      );
      assert.equal(
        await b.page.evaluate(() => localStorage.getItem("chat-sentinel")),
        "keep me"
      );

      // The interface now refuses another restore and says why
      await ui.openSettings(b.page, "Backup");
      const refusal = await b.page.locator("#restore-refused").innerText();
      assert.match(
        refusal,
        /Restore works only into an empty library\. This library has 1 project, 3 sources, and 2 files/
      );
      await close(b);
      b = undefined;

      // 11. Restart
      b = await launch(profileB, log, env, options);
      await ui.selectProject(b.page, PROJECT);

      // 12. Open the restored files without the originals
      const restored = await readLibrary(b.page);
      assert.deepEqual(
        byTitle(restored[0].sources),
        byTitle(afterRestart[0].sources)
      );
      const ids = Object.fromEntries(
        restored[0].sources.map((s) => [s.title, s.assetId])
      );
      assert.ok(
        (await readAsset(b.page, ids["recovery-fixture.pdf"])).equals(pdfBytes)
      );
      assert.ok(
        (await readAsset(b.page, ids["recovery-note.txt"])).equals(txtBytes)
      );

      await ui.openTable(b.page);
      await ui.openSource(b.page, "recovery-fixture.pdf");
      await ui.openDocumentTab(b.page);
      const embed = b.page.locator("source-document embed");
      await embed.waitFor({ timeout: 15000 });
      assert.match(await embed.getAttribute("src"), /^blob:/);
      await b.page.waitForTimeout(2000);
      await ui.closeDialog(b.page);

      const thumbnail = await b.page.evaluate(
        (assetId) =>
          new Promise((resolve) => {
            window.api.receive("E2A:FileSystem:FileThumbnail", (responses) => {
              const mine = responses.find(
                (r) => r.success?.data?.id === "probe"
              );
              if (mine) resolve(mine.success.data.thumbnail);
            });
            window.api.send("A2E:FileSystem:FileThumbnail", [
              {
                path: "/nonexistent/recovery-fixture.pdf",
                assetId,
                id: "probe",
              },
            ]);
          }),
        ids["recovery-fixture.pdf"]
      );
      assert.match(thumbnail, /^data:image\/png;base64,.{100,}/);
      await close(b);
      b = undefined;

      // No service process remains after the app exits
      assert.deepEqual(await waitForNoServices(root), []);
    } finally {
      if (a) await close(a);
      if (b) await close(b);
      site.close();
      // Keep logs and profiles. Remove the 440 MB app copy.
      fs.rmSync(app, { recursive: true, force: true });
    }
  }
);
