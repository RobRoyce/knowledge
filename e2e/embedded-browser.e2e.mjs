/*
 * Desktop embedded browser (WebContentsView since the Electron 44 upgrade):
 * open a website source in the Browser tab, check the view and its URL,
 * follow a link to a second page, go Back and Forward with the app's
 * buttons, resize the window, then close the view.
 *
 * Run: yarn build-dev && yarn e2e
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { close, launch, newRun, startFixtureSite } from "./lib.mjs";
import * as ui from "./steps.mjs";

const SITE_TITLE = "Knowledge Fixture Site";

/** Child views of the main window, with their URLs and bounds. */
function views(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win.contentView.children.map((v) => ({
      id: v.webContents?.id,
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
  "embedded browser opens, goes back and forward, resizes, and closes",
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

      // The app may open the view again while the dialog settles. Wait
      // until the same view stays for two seconds.
      let stable = open[0].id;
      for (let quiet = 0; quiet < 8; ) {
        await ctx.page.waitForTimeout(250);
        const now = await views(ctx.app);
        if (now.length === 1 && now[0].id === stable) quiet++;
        else (quiet = 0), (stable = now[0]?.id);
      }

      // Follow a link inside the page, then use the app's Back and Forward
      const page2 = site.url.replace("index.html", "page2.html");
      const history = () =>
        ctx.app.evaluate(({ BrowserWindow }) => {
          const view = BrowserWindow.getAllWindows()[0].contentView.children[0];
          if (!view) return null;
          return {
            url: view.webContents.getURL(),
            back: view.webContents.navigationHistory.canGoBack(),
            forward: view.webContents.navigationHistory.canGoForward(),
          };
        });
      assert.deepEqual(await waitFor(history, (h) => h !== null), {
        url: site.url,
        back: false,
        forward: false,
      });
      await ctx.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.executeJavaScript(
          "document.getElementById('next').click()",
          // A user gesture: Chromium skips entries without one on Back
          true
        )
      );
      const at = (url, back, forward) => (h) =>
        h?.url === url && h.back === back && h.forward === forward;
      assert.deepEqual(await waitFor(history, at(page2, true, false)), {
        url: page2,
        back: true,
        forward: false,
      });

      const header = ctx.page.locator("ks-lib-viewport-header");
      const back = header.locator('button[icon="pi pi-arrow-left"]');
      const forward = header.locator('button[icon="pi pi-arrow-right"]');
      await waitFor(() => back.isEnabled(), Boolean);
      await back.click();
      assert.deepEqual(await waitFor(history, at(site.url, false, true)), {
        url: site.url,
        back: false,
        forward: true,
      });
      await waitFor(() => forward.isEnabled(), Boolean);
      // The app ignores navigation clicks less than 250 ms apart
      await ctx.page.waitForTimeout(300);
      await forward.click();
      assert.deepEqual(await waitFor(history, at(page2, true, false)), {
        url: page2,
        back: true,
        forward: false,
      });
      // Known limit: a window resize reopens the view at the source URL,
      // so the navigation check runs first.
      // The view follows the window size: after a resize it stays inside
      // the window. The app can also hide the project tree and make the
      // view wider, so only the window bounds are checked.
      const size = await ctx.app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const [w, h] = win.getContentSize();
        win.setContentSize(w - 100, h - 50);
        return { width: w - 100, height: h - 50 };
      });
      await ctx.page.waitForTimeout(1500);
      const after = await waitFor(
        () => views(ctx.app),
        (v) =>
          v.length === 1 &&
          v[0].url === site.url &&
          v[0].bounds.x + v[0].bounds.width <= size.width &&
          v[0].bounds.y + v[0].bounds.height <= size.height
      );
      assert.equal(after.length, 1, JSON.stringify(after));
      assert.ok(
        after[0].bounds.x + after[0].bounds.width <= size.width &&
          after[0].bounds.y + after[0].bounds.height <= size.height,
        JSON.stringify({ size, after })
      );

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
