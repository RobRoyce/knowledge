/*
 * The library workflow in Google Chrome, without Electron.
 *
 * The test starts scripts/start-browser.mjs (the "yarn browser" launcher)
 * with a scratch library, opens the printed launch link in Chrome, and runs:
 * create a project, upload a PDF and a text file, show both, annotate,
 * search, restart the service and reopen the browser, open the managed
 * files, keep a file in the inbox, export the library, and restore it
 * into a second, empty library. It also checks unauthorized and
 * cross-origin requests, and console and page errors at each stage.
 *
 * Build first: yarn build-angular-dev
 * Run:         yarn e2e-browser
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FIXTURES, newRun, startFixtureSite } from "../lib.mjs";
import * as ui from "../steps.mjs";
import {
  assertNoErrors,
  counts,
  openBrowser,
  readLibrary,
  startLauncher,
} from "./helpers.mjs";

const PROJECT = "Browser Project";
const PDF = "recovery-fixture.pdf";
const TXT = "recovery-note.txt";
const PENDING = "pending-inbox.txt";

/** A fresh library has no saved browser settings yet. */
const FIRST_START = [/\/v1\/preferences\/browser-settings$/];

test(
  "library workflow in Chrome without Electron",
  { timeout: 300000 },
  async () => {
    const run = newRun("browser");
    const libraryA = path.join(run, "library-a");
    const libraryB = path.join(run, "library-b");
    const log = path.join(run, "launcher.log");
    const pdfBytes = fs.readFileSync(path.join(FIXTURES, PDF));
    const txtBytes = fs.readFileSync(path.join(FIXTURES, TXT));
    const other = await startFixtureSite();

    let launcher;
    let b;
    try {
      // 1. Service and UI, no Electron
      launcher = await startLauncher(libraryA, log);
      b = await openBrowser(launcher.url);
      assert.equal(await b.page.evaluate(() => typeof window.api), "undefined");
      assert.ok(
        !b.page.url().includes("launch="),
        "the launch code stays in the address bar"
      );

      // Desktop-only actions are disabled or hidden with an explanation
      const linkButton = b.page.locator("app-create button").nth(2);
      assert.ok(await linkButton.isDisabled());
      assert.match(await linkButton.getAttribute("title"), /desktop app/);

      // 2-3. Create a project, upload a PDF and a text file
      await ui.createProject(b.page, PROJECT, "Browser workflow");
      await ui.importFilesToProject(b.page, [
        path.join(FIXTURES, PDF),
        path.join(FIXTURES, TXT),
      ]);
      await b.page.waitForTimeout(1500);

      // 4. Show both sources from the managed copies
      await ui.openTable(b.page);
      assert.deepEqual((await ui.tableTitles(b.page)).sort(), [PDF, TXT]);
      for (const name of [PDF, TXT]) {
        await ui.openSource(b.page, name);
        await ui.openDocumentTab(b.page);
        const embed = b.page.locator("source-document embed");
        await embed.waitFor({ timeout: 15000 });
        const src = await embed.getAttribute("src");
        assert.match(
          src,
          new RegExp(
            `^/v1/assets/[0-9a-f-]{36}/content/${name.replace(".", "\\.")}$`
          )
        );
        await b.page.waitForTimeout(1500);
        await ui.closeDialog(b.page);
      }

      // 5. Annotate
      await ui.openSource(b.page, TXT);
      await ui.addAnnotation(b.page, "annotation", "browser note");
      await ui.addTopic(b.page, "browsertopic");
      await b.page.waitForTimeout(1500);
      await ui.closeDialog(b.page);

      // 6. Search
      const results = await ui.search(b.page, "recovery-note");
      assert.ok(
        results.some((r) => r.includes(TXT)),
        `search results: ${results}`
      );

      const library = await readLibrary(b.page);
      assert.equal(library.projects.length, 1);
      assert.deepEqual(library.inbox, []);
      const note = library.projects[0].sources.find((s) => s.title === TXT);
      assert.deepEqual(note.topics, ["browsertopic"]);
      assert.deepEqual(note.annotations, ["browser note"]);
      for (const s of library.projects[0].sources) {
        assert.match(s.assetId, /^[0-9a-f-]{36}$/);
        assert.equal(s.originalPath, "", "the browser sends no local path");
      }

      // Unauthorized: no session cookie
      const anonymous = await b.browser.newContext();
      assert.equal(
        (
          await anonymous.request.get(`${launcher.origin}/v1/projects`)
        ).status(),
        401
      );
      assert.equal(
        (
          await anonymous.request.get(
            `${launcher.origin}/v1/assets/${note.assetId}/content/${TXT}`
          )
        ).status(),
        401
      );
      await anonymous.close();

      // Another local site in the same browser cannot read or write
      const attacker = await b.context.newPage();
      await attacker.goto(other.url);
      const attack = await attacker.evaluate(async (target) => {
        const out = {};
        try {
          await fetch(`${target}/v1/projects`, { credentials: "include" });
          out.read = "readable";
        } catch {
          out.read = "blocked";
        }
        await fetch(`${target}/v1/assets`, {
          method: "POST",
          mode: "no-cors",
          credentials: "include",
          headers: { "Content-Type": "text/plain" },
          body: "planted",
        }).catch(() => {});
        try {
          await fetch(`${target}/v1/projects/planted`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "planted", parentId: null, data: {} }),
          });
          out.write = "sent";
        } catch {
          out.write = "blocked";
        }
        return out;
      }, launcher.origin);
      await attacker.close();
      assert.equal(attack.read, "blocked");
      assert.equal(attack.write, "blocked");
      assert.deepEqual(
        await counts(b.page),
        { projects: 1, sources: 2, inbox: 0, assets: 2 },
        "no planted records or files"
      );

      // The launcher never prints the bearer token
      assert.doesNotMatch(launcher.output(), /[0-9a-f]{64}/);
      assertNoErrors(b.errors, "before the restart", FIRST_START);
      await b.close();
      b = undefined;

      // 7. Restart the service and reopen the browser
      await launcher.stop();
      launcher = await startLauncher(libraryA, log);
      b = await openBrowser(launcher.url);

      // 8. The records remain
      assert.deepEqual(await readLibrary(b.page), library);
      await ui.selectProject(b.page, PROJECT);

      // 9. Open the managed files (browser: a new tab with the filename)
      await ui.openTable(b.page);
      for (const [name, bytes] of [
        [PDF, pdfBytes],
        [TXT, txtBytes],
      ]) {
        const assetId = library.projects[0].sources.find(
          (s) => s.title === name
        ).assetId;
        const popup = b.context.waitForEvent("page");
        await b.page.evaluate(
          ({ id, file }) =>
            window.open(
              `/v1/assets/${id}/content/${encodeURIComponent(file)}`,
              "_blank",
              "noopener"
            ),
          { id: assetId, file: name }
        );
        const tab = await popup;
        assert.ok(tab.url().endsWith(`/content/${name}`), tab.url());
        const res = await b.context.request.get(tab.url());
        assert.equal(res.status(), 200);
        assert.ok((await res.body()).equals(bytes), `${name} bytes`);
        await tab.close();
      }

      // A file stays in the inbox. The backup must keep it.
      const pending = path.join(run, PENDING);
      fs.writeFileSync(pending, "pending inbox file");
      await b.page
        .locator("app-create input[type=file]")
        .setInputFiles(pending);
      await ui.openInbox(b.page);
      await b.page.getByText(PENDING).first().waitFor({ timeout: 15000 });
      await b.page.waitForTimeout(1500);
      const withInbox = await readLibrary(b.page);
      assert.deepEqual(
        withInbox.inbox.map((s) => s.title),
        [PENDING]
      );
      assertNoErrors(b.errors, "after the restart");

      // 10. Export the library through the UI
      await ui.openSettings(b.page, "Backup");
      const download = b.page.waitForEvent("download");
      await b.page.locator("button", { hasText: "Export Library" }).click();
      const tar = path.join(run, "library.tar");
      await (await download).saveAs(tar);
      assertNoErrors(b.errors, "during export");
      await b.close();
      b = undefined;
      await launcher.stop();

      // ...and restore it through the UI into a second, empty library
      launcher = await startLauncher(libraryB, log);
      b = await openBrowser(launcher.url);
      const restore = await ui.restoreLibrary(b.page, tar);
      assert.match(
        restore.preview,
        /1 project, 3 sources \(1 inbox entry\), 3 files/
      );
      assert.match(
        restore.result,
        /Restored 1 project, 3 sources \(1 inbox entry\), and 3 files/
      );
      assert.deepEqual(await readLibrary(b.page), withInbox);

      await ui.selectProject(b.page, PROJECT);
      await ui.openTable(b.page);
      await ui.openSource(b.page, PDF);
      await ui.openDocumentTab(b.page);
      await b.page.locator("source-document embed").waitFor({ timeout: 15000 });
      await b.page.waitForTimeout(1500);
      await ui.closeDialog(b.page);

      // The restored inbox shows the entry, and its file has the same bytes
      await ui.openInbox(b.page);
      await b.page.getByText(PENDING).first().waitFor({ timeout: 15000 });
      const restoredFile = await b.context.request.get(
        `${launcher.origin}/v1/assets/${withInbox.inbox[0].assetId}/content/${PENDING}`
      );
      assert.equal(await restoredFile.text(), "pending inbox file");

      assertNoErrors(b.errors, "after the restore", FIRST_START);
    } finally {
      if (b) await b.close();
      if (launcher) await launcher.stop();
      other.close();
    }
  }
);
