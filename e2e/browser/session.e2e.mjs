/*
 * Browser session expiry and logout in Google Chrome, without Electron.
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
  openBrowser,
  readLibrary,
  startLauncher,
} from "./helpers.mjs";

/** A fresh library has no saved browser settings yet. */
const FIRST_START = [/\/v1\/preferences\/browser-settings$/];

/** Projects and inbox titles, read with a separate session. */
async function serverView(launcher) {
  const observer = await openBrowser(await launcher.newLink());
  try {
    const library = await readLibrary(observer.page);
    return {
      projects: library.projects.map((p) => p.name).sort(),
      inbox: library.inbox.map((s) => s.title),
    };
  } finally {
    await observer.close();
  }
}

test(
  "session expiry blocks changes and keeps unsaved work; a new session saves it once",
  { timeout: 300000 },
  async () => {
    const run = newRun("browser-expiry");
    let launcher;
    let b;
    try {
      // Sessions end after 12 seconds without requests
      launcher = await startLauncher(
        path.join(run, "library"),
        path.join(run, "launcher.log"),
        ["--session-idle-minutes", "0.2"]
      );
      b = await openBrowser(launcher.url);
      await ui.createProject(b.page, "First Project");

      // Start an edit, then let the session end
      await b.page.locator("button.create-project").click();
      const form = b.page
        .locator(".p-dialog")
        .filter({ hasText: "Create Project" });
      await form.locator("input").first().fill("Pending Project");
      const dialog = b.page.locator(".session-dialog");
      await dialog.waitFor({ timeout: 30000 });
      assert.match(await dialog.innerText(), /Session ended/);
      assert.match(await dialog.innerText(), /press Enter for a new link/);

      // No change is possible while the session is invalid
      await assert.rejects(
        form.locator("button", { hasText: "Create" }).click({ timeout: 1500 }),
        /intercepts pointer events|Timeout/
      );
      assert.equal(
        await form.locator("input").first().inputValue(),
        "Pending Project",
        "the unsaved edit stays"
      );
      assert.deepEqual((await serverView(launcher)).projects, [
        "First Project",
      ]);

      // Recover without a reload: open a new link in another tab, then
      // select Check again
      const other = await openBrowser(await launcher.newLink(), {
        context: b.context,
      });
      await other.close();
      await dialog.locator("[data-test=session-check]").click();
      await dialog.waitFor({ state: "hidden", timeout: 15000 });

      // The pending edit completes once
      await form.locator("button", { hasText: "Create" }).click();
      await b.page
        .locator("p-tree, .p-tree")
        .getByText("Pending Project", { exact: true })
        .first()
        .waitFor({ timeout: 15000 });
      assert.deepEqual((await serverView(launcher)).projects, [
        "First Project",
        "Pending Project",
      ]);
      assertNoErrors(b.errors, "around the expiry", FIRST_START);
    } finally {
      if (b) await b.close();
      if (launcher) await launcher.stop();
    }
  }
);

test(
  "logout saves queued changes first, then ends access and clears the page",
  { timeout: 300000 },
  async () => {
    const run = newRun("browser-logout");
    let launcher;
    let b;
    try {
      launcher = await startLauncher(
        path.join(run, "library"),
        path.join(run, "launcher.log")
      );
      b = await openBrowser(launcher.url);
      await ui.createProject(b.page, "Secret Project");
      const file = path.join(run, "secret-inbox.txt");
      fs.writeFileSync(file, "secret inbox file");
      await b.page.locator("app-create input[type=file]").setInputFiles(file);
      await ui.openInbox(b.page);
      await b.page.getByText("secret-inbox.txt").first().waitFor();

      // A slow write is still running when the user logs out
      await b.page.route("**/v1/projects/*", async (route) => {
        if (route.request().method() === "PUT") {
          await new Promise((r) => setTimeout(r, 2000));
        }
        await route.continue();
      });
      await b.page.locator("button.create-project").click();
      const form = b.page
        .locator(".p-dialog")
        .filter({ hasText: "Create Project" });
      await form.locator("input").first().fill("Late Project");
      await form.locator("button", { hasText: "Create" }).click();
      await b.page.locator("[data-test=logout]").click();

      // Logged out: the page shows no library data and has no access
      const dialog = b.page.locator(".session-dialog");
      await dialog.waitFor({ timeout: 30000 });
      assert.match(await dialog.innerText(), /Logged out/);
      for (const text of [
        "Secret Project",
        "Late Project",
        "secret-inbox.txt",
      ]) {
        assert.equal(await b.page.getByText(text).count(), 0, text);
      }
      assert.equal(
        await b.page.evaluate(() =>
          fetch("/v1/projects").then((r) => r.status)
        ),
        401
      );
      const port = new URL(launcher.origin).port;
      const cookies = await b.context.cookies(launcher.origin);
      assert.equal(
        cookies.filter((c) => c.name === `kc_session_${port}` && c.value)
          .length,
        0,
        "the session cookie is gone"
      );
      const cached = await b.page.evaluate(() =>
        Object.keys(localStorage).filter(
          (k) => k.startsWith("icon-") || k === "current-project"
        )
      );
      assert.deepEqual(cached, []);

      // The queued change was saved before the session ended
      assert.deepEqual(await serverView(launcher), {
        projects: ["Late Project", "Secret Project"],
        inbox: ["secret-inbox.txt"],
      });

      // A new link opens the library again
      await dialog
        .locator("[data-test=session-link]")
        .fill(await launcher.newLink());
      await Promise.all([
        b.page.waitForEvent("load"),
        dialog.locator("[data-test=session-continue]").click(),
      ]);
      await b.page
        .locator("p-tree, .p-tree")
        .getByText("Secret Project", { exact: true })
        .first()
        .waitFor({ timeout: 15000 });
      assertNoErrors(b.errors, "around the logout", [
        ...FIRST_START,
        /status of 401/,
      ]);
    } finally {
      if (b) await b.close();
      if (launcher) await launcher.stop();
    }
  }
);
