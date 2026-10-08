/*
 * Desktop embedded browser (WebContentsView since the Electron 44 upgrade):
 * open a website source in the Browser tab, check the view, its URL,
 * resizing, and navigation state, then close it.
 *
 * Run: yarn build-dev && yarn e2e
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { close, launch, newRun, shot, startFixtureSite } from "./lib.mjs";
import * as ui from "./steps.mjs";

const SITE_TITLE = "Knowledge Fixture Site";

/** Child views of the main window, with their URLs and bounds. */
function views(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win.contentView.children.map((v) => ({
      url: v.webContents?.getURL(),
      bounds: v.getBounds(),
    }));
  });
}

async function waitFor(fn, check, timeout = 15000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await fn();
    if (check(value)) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  return value;
}

test(
  "embedded browser opens, resizes, navigates, and closes",
  { timeout: 180000 },
  async () => {
    const run = newRun("embedded-browser");
    const site = await startFixtureSite();
    const ctx = await launch(
      path.join(run, "profile"),
      path.join(run, "app.log")
    );
    try {
      await ui.createProject(ctx.page, "Browser View Project");
      await ui.addLinkToProject(ctx.page, site.url, SITE_TITLE);
      await ui.openTable(ctx.page);
      await ui.openSource(ctx.page, SITE_TITLE);
      await ctx.page.getByText("Browser", { exact: true }).click();

      const open = await waitFor(
        () => views(ctx.app),
        (v) => v.length === 1 && v[0].url === site.url
      );
      assert.equal(open.length, 1, JSON.stringify(open));
      assert.equal(open[0].url, site.url);
      await ctx.page.waitForTimeout(1000);

      // The view follows the window size. The app may replace the view with
      // a new one at the new size; wait for one view again.
      const before = open[0].bounds;
      await ctx.app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const [w, h] = win.getContentSize();
        win.setContentSize(w - 100, h - 50);
      });
      await ctx.page.waitForTimeout(1500);
      const after = await waitFor(
        () => views(ctx.app),
        (v) =>
          v.length === 1 &&
          v[0].bounds.width < before.width &&
          v[0].url === site.url
      );
      assert.equal(after.length, 1, JSON.stringify(after));
      assert.ok(
        after[0].bounds.width < before.width,
        JSON.stringify({ before, after })
      );
      assert.ok(
        after[0].bounds.height < before.height,
        JSON.stringify({ before, after })
      );

      // Navigation state through navigationHistory
      const history = await waitFor(
        () =>
          ctx.app.evaluate(({ BrowserWindow }) => {
            const view =
              BrowserWindow.getAllWindows()[0].contentView.children[0];
            if (!view) return null;
            return {
              back: view.webContents.navigationHistory.canGoBack(),
              forward: view.webContents.navigationHistory.canGoForward(),
            };
          }),
        (h) => h !== null
      );
      assert.deepEqual(history, { back: false, forward: false });
      await shot(ctx.page, run, "browser-tab");

      // Closing the source dialog removes the view
      await ui.closeDialog(ctx.page);
      const closed = await waitFor(
        () => views(ctx.app),
        (v) => v.length === 0
      );
      assert.deepEqual(closed, []);
    } finally {
      await close(ctx);
      site.close();
    }
  }
);
