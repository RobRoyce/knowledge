/*
 * The library workflow through the existing UI, with the storage service:
 * create a project, save a link, import a PDF and a text file, annotate,
 * search, restart, read the same records and file after the original files
 * are deleted, export the library, and restore it into a second profile.
 *
 * Run: yarn build-dev && yarn e2e
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FIXTURES,
  captureDownloads,
  close,
  launch,
  newRun,
  readAsset,
  readLibrary,
  shot,
  startFixtureSite,
  waitForFile,
} from "./lib.mjs";
import * as ui from "./steps.mjs";

const PROJECT = "Library Project";
const SITE_TITLE = "Knowledge Fixture Site";
const sortByTitle = (list) =>
  [...list].sort((a, b) => a.title.localeCompare(b.title));

async function documentSource(page) {
  const embed = page.locator("source-document embed");
  await embed.waitFor({ timeout: 15000 });
  return embed.getAttribute("src");
}

test(
  "library workflow uses the storage service and survives restart, deletion, and restore",
  { timeout: 300000 },
  async () => {
    const run = newRun("workflow");
    const profileA = path.join(run, "profile-a");
    const profileB = path.join(run, "profile-b");
    const log = path.join(run, "app.log");
    const site = await startFixtureSite();

    // Originals in the run directory, so the test can delete them later
    const originals = path.join(run, "originals");
    fs.mkdirSync(originals);
    const pdf = path.join(originals, "recovery-fixture.pdf");
    const txt = path.join(originals, "recovery-note.txt");
    fs.copyFileSync(path.join(FIXTURES, "recovery-fixture.pdf"), pdf);
    fs.copyFileSync(path.join(FIXTURES, "recovery-note.txt"), txt);
    const pdfBytes = fs.readFileSync(pdf);
    const txtBytes = fs.readFileSync(txt);

    let ctx;
    try {
      // 1-6: create, save, import, show, annotate, search
      ctx = await launch(profileA, log);
      await ui.createProject(ctx.page, PROJECT, "Created by the e2e workflow.");
      await ui.addLinkToProject(ctx.page, site.url, SITE_TITLE);
      await ui.importFilesToProject(ctx.page, [pdf, txt]);

      await ui.openTable(ctx.page);
      assert.deepEqual(
        (await ui.tableTitles(ctx.page)).sort(),
        [SITE_TITLE, "recovery-fixture.pdf", "recovery-note.txt"].sort()
      );

      await ui.openSource(ctx.page, "recovery-note.txt");
      await ui.addAnnotation(ctx.page, "annotation", "mentions chlorophyll");
      await ui.addTopic(ctx.page, "recoverytopic");
      await ctx.page.waitForTimeout(1500);
      await ui.closeDialog(ctx.page);

      const results = await ui.search(ctx.page, "Fixture Site");
      assert.ok(
        results.some((r) => r.includes(SITE_TITLE)),
        `search results: ${results}`
      );

      // The records are in the storage service, with managed file copies
      await ctx.page.waitForTimeout(1000);
      const library = await readLibrary(ctx.page);
      assert.equal(library.length, 1);
      assert.equal(library[0].name, PROJECT);
      const byTitle = Object.fromEntries(
        library[0].sources.map((s) => [s.title, s])
      );
      assert.equal(byTitle[SITE_TITLE].type, "website");
      assert.equal(byTitle[SITE_TITLE].assetId, null);
      assert.ok(byTitle["recovery-fixture.pdf"].assetId);
      assert.ok(byTitle["recovery-note.txt"].assetId);
      assert.deepEqual(byTitle["recovery-note.txt"].topics, ["recoverytopic"]);
      assert.deepEqual(byTitle["recovery-note.txt"].annotations, [
        "mentions chlorophyll",
      ]);

      // The renderer no longer stores projects or sources
      const legacyKeys = await ctx.page.evaluate(() =>
        Object.keys(localStorage).filter(
          (k) =>
            k === "kc-projects" ||
            /^ks-[0-9a-f-]{36}$/.test(k) ||
            /^[0-9a-f-]{36}$/.test(k)
        )
      );
      assert.deepEqual(legacyKeys, []);
      await close(ctx);
      ctx = undefined;

      // The service stopped with the app and released its data directory
      const storageDir = path.join(profileA, "data", "library");
      const lock = path.join(storageDir, "storage.lock");
      assert.ok(fs.existsSync(path.join(storageDir, "library.sqlite")));
      for (let i = 0; i < 20 && fs.existsSync(lock); i++) {
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.ok(!fs.existsSync(lock), "storage service still running");

      // 7-8: delete the originals, restart, and read the same records and files
      fs.rmSync(originals, { recursive: true });
      ctx = await launch(profileA, log);
      assert.deepEqual(
        sortByTitle((await readLibrary(ctx.page))[0].sources),
        sortByTitle(library[0].sources)
      );
      const pdfAsset = byTitle["recovery-fixture.pdf"].assetId;
      const txtAsset = byTitle["recovery-note.txt"].assetId;
      assert.ok((await readAsset(ctx.page, pdfAsset)).equals(pdfBytes));
      assert.ok((await readAsset(ctx.page, txtAsset)).equals(txtBytes));

      await ui.openTable(ctx.page);
      await ui.openSource(ctx.page, "recovery-fixture.pdf");
      await ui.openDocumentTab(ctx.page);
      assert.match(await documentSource(ctx.page), /^blob:/);
      await ctx.page.waitForTimeout(2000);
      await shot(ctx.page, run, "a-pdf-after-original-deleted");
      await ui.closeDialog(ctx.page);

      // Export the library through the UI
      const downloads = path.join(run, "downloads");
      await captureDownloads(ctx.app, downloads);
      await ui.openSettings(ctx.page, "Backup");
      await ctx.page.locator("button", { hasText: "Export Library" }).click();
      const date = new Date().toISOString().slice(0, 10);
      const tar = await waitForFile(
        path.join(downloads, `knowledge-library-${date}.tar`)
      );
      await close(ctx);
      ctx = undefined;

      // Restore through the UI into a new profile, then restart and open it
      ctx = await launch(profileB, log);
      const restore = await ui.restoreLibrary(ctx.page, tar);
      assert.match(restore.preview, /1 project, 3 sources, 2 files/);
      assert.match(
        restore.result,
        /Restored 1 project, 3 sources, and 2 files/
      );
      await close(ctx);
      ctx = undefined;

      ctx = await launch(profileB, log);
      await ui.selectProject(ctx.page, PROJECT);
      assert.deepEqual(
        sortByTitle((await readLibrary(ctx.page))[0].sources),
        sortByTitle(library[0].sources)
      );
      await ui.openTable(ctx.page);
      assert.equal((await ui.tableTitles(ctx.page)).length, 3);
      await ui.openSource(ctx.page, "recovery-fixture.pdf");
      await ui.openDocumentTab(ctx.page);
      assert.match(await documentSource(ctx.page), /^blob:/);
      await ctx.page.waitForTimeout(2000);
      await shot(ctx.page, run, "b-restored-pdf");

      // Desktop functions read the managed file, not the deleted original
      const thumbnail = await ctx.page.evaluate(
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
        pdfAsset
      );
      assert.match(thumbnail, /^data:image\/png;base64,.{100,}/);

      await ctx.page.evaluate(async (assetId) => {
        const { chat } = await window.api.invoke("A2E:Backend:Info");
        await fetch(`${chat.url}/sources/summarize`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${chat.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: {
              id: { value: "probe-source" },
              title: "probe",
              ingestType: "file",
              accessLink: "/nonexistent/recovery-fixture.pdf",
              assetId,
            },
            messages: [],
          }),
        });
      }, pdfAsset);
      const extracted = JSON.parse(
        fs.readFileSync(
          path.join(
            profileB,
            "data",
            "storage",
            "sources",
            "probe-source.json"
          ),
          "utf8"
        )
      );
      assert.match(extracted[0], /quasar-meridian-77/);
    } finally {
      if (ctx) await close(ctx);
      site.close();
    }
  }
);
