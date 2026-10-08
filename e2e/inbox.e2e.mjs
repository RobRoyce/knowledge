/*
 * Desktop inbox: an inbox that an earlier version kept in renderer
 * localStorage moves to the storage service once, and inbox entries
 * survive restarts.
 *
 * Run: yarn build-dev && yarn e2e
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { close, FIXTURES, launch, newRun, readAsset } from "./lib.mjs";
import * as ui from "./steps.mjs";

/** Inbox entries (sources without a project) from this instance's service. */
function readInbox(page) {
  return page.evaluate(async () => {
    const { storage } = await window.api.invoke("A2E:Backend:Info");
    const res = await fetch(`${storage.url}/v1/sources`, {
      headers: { Authorization: `Bearer ${storage.token}` },
    });
    const { sources } = await res.json();
    return sources
      .filter((s) => s.projectId === null)
      .map((s) => ({ id: s.id, title: s.title, assetId: s.assetId }));
  });
}

test(
  "an earlier local inbox moves to the service once and survives restarts",
  { timeout: 300000 },
  async () => {
    const run = newRun("desktop-inbox");
    const profile = path.join(run, "profile");
    const log = path.join(run, "app.log");
    const legacyFile = path.join(run, "legacy-note.txt");
    fs.copyFileSync(path.join(FIXTURES, "recovery-note.txt"), legacyFile);

    // An earlier version left two entries in localStorage
    let ctx = await launch(profile, log);
    await ctx.page.evaluate((file) => {
      localStorage.setItem(
        "ingest-queue",
        JSON.stringify([
          {
            id: { value: "legacy-file" },
            title: "legacy-note.txt",
            ingestType: "file",
            accessLink: file,
            associatedProject: { value: "" },
            reference: {
              ingestType: "file",
              source: {
                file: {
                  filename: "legacy-note.txt",
                  path: file,
                  size: 1,
                  type: "text/plain",
                },
              },
              link: file,
            },
            dateCreated: "2026-10-01T00:00:00.000Z",
            topics: [],
          },
          {
            id: { value: "legacy-web" },
            title: "Legacy Website",
            ingestType: "website",
            accessLink: "https://example.com/",
            associatedProject: { value: "" },
            dateCreated: "2026-10-01T00:00:01.000Z",
            topics: ["kept"],
          },
        ])
      );
    }, legacyFile);
    await close(ctx);

    // Next start: the entries move to the service; the old key is removed
    ctx = await launch(profile, log);
    await ctx.page.waitForFunction(
      () => localStorage.getItem("ingest-queue") === null,
      null,
      { timeout: 15000 }
    );
    const moved = await readInbox(ctx.page);
    assert.deepEqual(
      moved.map((s) => s.title),
      ["legacy-note.txt", "Legacy Website"]
    );
    assert.match(moved[0].assetId, /^[0-9a-f-]{36}$/, "the file is copied");
    assert.ok(
      (await readAsset(ctx.page, moved[0].assetId)).equals(
        fs.readFileSync(legacyFile)
      )
    );

    // A file added to the inbox now is saved by the service
    await ctx.page
      .locator("app-create input[type=file]")
      .setInputFiles(path.join(FIXTURES, "recovery-fixture.pdf"));
    await ui.openInbox(ctx.page);
    await ctx.page.getByText("recovery-fixture.pdf").first().waitFor();
    await ctx.page.waitForTimeout(1500);
    const withNew = await readInbox(ctx.page);
    assert.equal(withNew.length, 3);
    await close(ctx);

    // A repeated start changes nothing and shows every entry
    fs.rmSync(legacyFile);
    ctx = await launch(profile, log);
    assert.deepEqual(await readInbox(ctx.page), withNew);
    await ui.openInbox(ctx.page);
    for (const title of [
      "legacy-note.txt",
      "Legacy Website",
      "recovery-fixture.pdf",
    ]) {
      await ctx.page.getByText(title).first().waitFor({ timeout: 15000 });
    }
    await close(ctx);
  }
);
