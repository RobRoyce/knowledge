/*
 * Basic local workflow on fresh, isolated profiles:
 * create a project, save a link, import a PDF and a text file, annotate,
 * search, restart, export a backup, and restore it into a second profile.
 *
 * Run: yarn build-dev && yarn e2e
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  FIXTURES,
  captureDownloads,
  close,
  launch,
  newRun,
  readLibrary,
  shot,
  startFixtureSite,
  waitForFile,
} from "./lib.mjs";
import * as ui from "./steps.mjs";

const PDF = path.join(FIXTURES, "recovery-fixture.pdf");
const TXT = path.join(FIXTURES, "recovery-note.txt");
const PROJECT = "Recovery Project";
const SITE_TITLE = "Knowledge Fixture Site";

const expected = [
  { title: SITE_TITLE, type: "website" },
  { title: "recovery-fixture.pdf", type: "file" },
  { title: "recovery-note.txt", type: "file" },
];

test(
  "basic workflow persists across restart and restores from backup",
  { timeout: 300000 },
  async () => {
    const run = newRun("workflow");
    const profileA = path.join(run, "profile-a");
    const profileB = path.join(run, "profile-b");
    const log = path.join(run, "app.log");
    const site = await startFixtureSite();

    try {
      // 1-6: create, save, import, view, annotate, search
      let ctx = await launch(profileA, log);
      await ui.createProject(ctx.page, PROJECT, "Created by the e2e workflow.");
      await ui.addLinkToProject(ctx.page, site.url, SITE_TITLE);
      await ui.importFilesToProject(ctx.page, [PDF, TXT]);

      await ui.openTable(ctx.page);
      assert.deepEqual(
        (await ui.tableTitles(ctx.page)).sort(),
        expected.map((e) => e.title).sort()
      );

      await ui.openSource(ctx.page, "recovery-note.txt");
      await ui.addAnnotation(ctx.page, "annotation", "mentions chlorophyll");
      await ui.addTopic(ctx.page, "recoverytopic");
      await ctx.page.waitForTimeout(1500);
      await ui.closeDialog(ctx.page);

      await ui.openSource(ctx.page, "recovery-fixture.pdf");
      await ui.openDocumentTab(ctx.page);
      await ctx.page.waitForTimeout(2000);
      await shot(ctx.page, run, "a-pdf-document");
      await ui.closeDialog(ctx.page);

      const results = await ui.search(ctx.page, "Fixture Site");
      assert.ok(
        results.some((r) => r.includes(SITE_TITLE)),
        `search results: ${results}`
      );
      await close(ctx);

      // 7-9: restart and confirm the data remains
      ctx = await launch(profileA, log);
      const library = await readLibrary(ctx.page);
      assert.equal(library.length, 1);
      assert.equal(library[0].name, PROJECT);
      assert.deepEqual(
        library[0].sources
          .map(({ title, type }) => ({ title, type }))
          .sort((a, b) => a.title.localeCompare(b.title)),
        [...expected].sort((a, b) => a.title.localeCompare(b.title))
      );
      const note = library[0].sources.find(
        (s) => s.title === "recovery-note.txt"
      );
      assert.deepEqual(note.topics, ["recoverytopic"]);
      assert.deepEqual(note.annotations, ["mentions chlorophyll"]);

      // 10: export a backup
      const downloads = path.join(run, "downloads");
      await captureDownloads(ctx.app, downloads);
      await ui.openSettings(ctx.page, "Backup");
      await ctx.page.locator("button", { hasText: "Export" }).click();
      const date = new Date().toISOString().slice(0, 10);
      const backup = await waitForFile(
        path.join(downloads, `knowledge-backup-${date}.json`)
      );
      await close(ctx);

      // 11: restore into an empty second profile, then restart it
      ctx = await launch(profileB, log);
      assert.deepEqual(await readLibrary(ctx.page), []);
      await ui.openSettings(ctx.page, "Backup");
      await ctx.page
        .locator("app-storage-settings input[type=file]")
        .setInputFiles(backup);
      await ctx.page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("kc-projects") ?? "[]").length === 1,
        null,
        { timeout: 15000 }
      );
      await close(ctx);

      ctx = await launch(profileB, log);
      assert.deepEqual(await readLibrary(ctx.page), library);
      await ui.openTable(ctx.page);
      await shot(ctx.page, run, "b-restored-table");
      await close(ctx);
    } finally {
      site.close();
    }
  }
);
