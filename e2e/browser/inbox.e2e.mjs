/*
 * Inbox, preferences, and platform limits in Google Chrome, without
 * Electron. Each test uses its own scratch library.
 *
 * Build first: yarn build-angular-dev
 * Run:         yarn e2e-browser
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { newRun } from "../lib.mjs";
import * as ui from "../steps.mjs";
import {
  assertNoErrors,
  counts,
  openBrowser,
  readLibrary,
  startLauncher,
  waitForValue,
} from "./helpers.mjs";

/** A fresh library has no saved browser settings yet. */
const FIRST_START = [/\/v1\/preferences\/browser-settings$/];

/** Requests that the service refuses while the session is broken. */
const REFUSED = [/status of 401/];

function scratchFiles(run, names) {
  return names.map((name) => {
    const file = path.join(run, name);
    fs.writeFileSync(file, `content of ${name}`);
    return file;
  });
}

async function uploadToInbox(page, files) {
  await page.locator("app-create input[type=file]").setInputFiles(files);
  await ui.openInbox(page);
  for (const file of files) {
    await page
      .getByText(path.basename(file))
      .first()
      .waitFor({ timeout: 15000 });
  }
}

/** Replace the session cookie, so the service refuses the next request. */
async function breakSession(context, origin) {
  const port = new URL(origin).port;
  await context.addCookies([
    { name: `kc_session_${port}`, value: "x".repeat(43), url: origin },
  ]);
}

/** Paste a new launch link into the session dialog. */
async function continueWithLink(page, link) {
  const dialog = page.locator(".session-dialog");
  await dialog.locator("[data-test=session-link]").fill(link);
  await dialog.locator("[data-test=session-continue]").click();
  await dialog.waitFor({ state: "hidden", timeout: 15000 });
}

async function autoplaySwitch(page) {
  await ui.openSettings(page, "Display");
  const control = page
    .locator("app-setting-template", { hasText: "Auto-play YouTube videos" })
    .locator(".p-inputswitch");
  await control.waitFor({ timeout: 15000 });
  return control;
}

test(
  "inbox entries and preferences survive a restart on a different port",
  { timeout: 300000 },
  async () => {
    const run = newRun("browser-inbox");
    const library = path.join(run, "library");
    const log = path.join(run, "launcher.log");
    let launcher;
    let b;
    try {
      launcher = await startLauncher(library, log);
      b = await openBrowser(launcher.url);
      const files = scratchFiles(run, ["first.txt", "second.txt"]);
      await uploadToInbox(b.page, files);

      // Change a preference in Settings > Display
      const toggle = await autoplaySwitch(b.page);
      const before = (await toggle.getAttribute("class")).includes(
        "p-inputswitch-checked"
      );
      await toggle.click();
      await waitForValue(
        b.page,
        () =>
          fetch("/v1/preferences/browser-settings")
            .then((r) => r.json())
            .then((j) => j.preference?.data.display?.autoplay),
        (value) => value === !before
      );
      const saved = await readLibrary(b.page);
      assert.deepEqual(
        saved.inbox.map((s) => s.title),
        ["first.txt", "second.txt"]
      );
      assertNoErrors(b.errors, "before the restart", FIRST_START);
      await b.close();
      b = undefined;
      await launcher.stop();

      // Same library, different port: a new browser address
      const oldPort = Number(new URL(launcher.url).port);
      launcher = await startLauncher(library, log, [
        "--port",
        String(oldPort + 1),
      ]);
      assert.notEqual(new URL(launcher.url).port, String(oldPort));
      b = await openBrowser(launcher.url);
      assert.deepEqual(await readLibrary(b.page), saved);
      await ui.openInbox(b.page);
      for (const name of ["first.txt", "second.txt"]) {
        await b.page.getByText(name).first().waitFor({ timeout: 15000 });
      }
      const after = await autoplaySwitch(b.page);
      assert.equal(
        (await after.getAttribute("class")).includes("p-inputswitch-checked"),
        !before,
        "the preference survives the address change"
      );
      assertNoErrors(b.errors, "after the restart");
    } finally {
      if (b) await b.close();
      if (launcher) await launcher.stop();
    }
  }
);

test(
  "an inbox transfer neither loses nor duplicates a source",
  { timeout: 300000 },
  async () => {
    const run = newRun("browser-transfer");
    let launcher;
    let b;
    try {
      launcher = await startLauncher(
        path.join(run, "library"),
        path.join(run, "launcher.log")
      );
      b = await openBrowser(launcher.url);
      await ui.createProject(b.page, "Target Project");
      const [file] = scratchFiles(run, ["move-me.txt"]);
      await uploadToInbox(b.page, [file]);
      const entry = (await readLibrary(b.page)).inbox[0];
      assertNoErrors(b.errors, "before the transfer", FIRST_START);

      // The service refuses the transfer: nothing moves, nothing is lost
      await breakSession(b.context, launcher.origin);
      await b.page.getByText("Import All").click();
      await b.page.locator("button", { hasText: "Import" }).first().click();
      const dialog = b.page.locator(".session-dialog");
      await dialog.waitFor({ timeout: 15000 });
      await dialog
        .locator("[data-test=session-unsaved]")
        .waitFor({ timeout: 15000 });
      assert.ok(
        await b.page.locator("app-home").getByText("move-me.txt").count(),
        "the entry stays in the inbox until the transfer is saved"
      );

      const observer = await openBrowser(await launcher.newLink());
      const pending = await readLibrary(observer.page);
      assert.deepEqual(
        pending.inbox.map((s) => s.title),
        ["move-me.txt"]
      );
      assert.deepEqual(pending.projects[0].sources, []);
      await observer.close();

      // A new session saves the held transfer once
      await continueWithLink(b.page, await launcher.newLink());
      await b.page
        .locator("[data-test=session-saving]")
        .waitFor({ state: "detached", timeout: 15000 });
      const moved = await readLibrary(b.page);
      assert.deepEqual(moved.inbox, []);
      assert.deepEqual(
        moved.projects[0].sources.map((s) => [s.title, s.assetId]),
        [["move-me.txt", entry.assetId]]
      );

      // Repeating the transfer request adds nothing
      const repeat = await b.page.evaluate(async () => {
        const csrf = await fetch("/v1/session")
          .then((r) => r.json())
          .then((s) => s.csrfToken);
        const { sources } = await fetch("/v1/sources").then((r) => r.json());
        const source = sources[0];
        const res = await fetch(`/v1/sources/${source.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Knowledge-CSRF": csrf,
          },
          body: JSON.stringify(source),
        });
        return res.status;
      });
      assert.equal(repeat, 200);
      assert.deepEqual(await counts(b.page), {
        projects: 1,
        sources: 1,
        inbox: 0,
        assets: 1,
      });
      await ui.selectProject(b.page, "Target Project");
      await ui.openTable(b.page);
      assert.deepEqual(await ui.tableTitles(b.page), ["move-me.txt"]);
      assertNoErrors(b.errors, "after the transfer", REFUSED);
    } finally {
      if (b) await b.close();
      if (launcher) await launcher.stop();
    }
  }
);

test(
  "Save as PDF is unavailable in Chrome and says why",
  { timeout: 300000 },
  async () => {
    const run = newRun("browser-pdf");
    let launcher;
    let b;
    try {
      launcher = await startLauncher(
        path.join(run, "library"),
        path.join(run, "launcher.log")
      );
      b = await openBrowser(launcher.url);
      await ui.createProject(b.page, "Web Project");

      // A website source, as the desktop app saves it
      await b.page.evaluate(async () => {
        const csrf = await fetch("/v1/session")
          .then((r) => r.json())
          .then((s) => s.csrfToken);
        const { projects } = await fetch("/v1/projects").then((r) => r.json());
        const link = "https://example.com/";
        await fetch("/v1/sources/web-1", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Knowledge-CSRF": csrf,
          },
          body: JSON.stringify({
            projectId: projects[0].id,
            title: "Example Website",
            ingestType: "website",
            assetId: null,
            data: {
              accessLink: link,
              reference: {
                ingestType: "website",
                source: { website: { accessLink: link } },
                link,
              },
              topics: [],
              meta: [],
              dateCreated: new Date().toISOString(),
              dateAccessed: [],
              dateModified: [],
            },
          }),
        });
      });
      await b.page.reload();
      await b.page.waitForSelector("app-create button");
      await ui.selectProject(b.page, "Web Project");
      await b.page.locator("i.pi-th-large").first().click();
      const card = b.page.locator("app-ks-card", {
        hasText: "Example Website",
      });
      await card.hover();

      const button = card.locator("[data-test=save-pdf]");
      await button.waitFor({ timeout: 15000 });
      assert.ok(await button.isDisabled());
      assert.match(await button.getAttribute("aria-label"), /desktop app/);
      await button.click({ force: true });
      await b.page.waitForTimeout(1500);
      assert.equal(await b.page.getByText("Creating PDF").count(), 0);
      assertNoErrors(b.errors, "after Save as PDF", FIRST_START);
    } finally {
      if (b) await b.close();
      if (launcher) await launcher.stop();
    }
  }
);
