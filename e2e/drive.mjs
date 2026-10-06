/*
 * Interactive driver for manual exploration.
 *
 *   node e2e/drive.mjs <profileDir> [port]
 *   curl -s -X POST http://127.0.0.1:7777 -d '{"op":"launch"}'
 *
 * Operations: launch, close, eval {js}, main {js}, click {sel,nth},
 * dblclick {sel,nth}, fill {sel,value}, press {sel,key}, files {sel,paths},
 * text {sel}, shot {name}, wait {ms}.
 * Screenshots and the app log go into the profile directory.
 */

import http from "node:http";
import path from "node:path";
import { close, launch, shot } from "./lib.mjs";

const profile = process.argv[2] && path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 7777);
if (!profile) {
  console.error("Usage: node e2e/drive.mjs <profileDir> [port]");
  process.exit(1);
}

let ctx = null;
async function page() {
  if (!ctx) {
    ctx = await launch(profile, path.join(profile, "app.log"));
  }
  return ctx.page;
}

const ops = {
  launch: async () => ({ url: (await page()).url() }),
  close: async () => {
    if (ctx) {
      await close(ctx);
      ctx = null;
    }
    return { closed: true };
  },
  eval: async ({ js }) => ({ value: await (await page()).evaluate(js) }),
  main: async ({ js }) => {
    await page();
    const fn = new Function("electron", `return (async () => { ${js} })()`);
    return { value: await ctx.app.evaluate(fn) };
  },
  click: async ({ sel, nth = 0 }) => {
    await (await page()).locator(sel).nth(nth).click({ timeout: 10000 });
    return { ok: true };
  },
  dblclick: async ({ sel, nth = 0 }) => {
    await (await page()).locator(sel).nth(nth).dblclick({ timeout: 10000 });
    return { ok: true };
  },
  fill: async ({ sel, value, nth = 0 }) => {
    await (await page()).locator(sel).nth(nth).fill(value, { timeout: 10000 });
    return { ok: true };
  },
  press: async ({ sel, key, nth = 0 }) => {
    await (await page()).locator(sel).nth(nth).press(key);
    return { ok: true };
  },
  files: async ({ sel, paths, nth = 0 }) => {
    await (await page()).locator(sel).nth(nth).setInputFiles(paths);
    return { ok: true };
  },
  text: async ({ sel = "body" }) => ({
    value: (await (await page()).locator(sel).first().innerText()).slice(
      0,
      4000
    ),
  }),
  shot: async ({ name }) => ({ file: await shot(await page(), profile, name) }),
  wait: async ({ ms }) => {
    await new Promise((r) => setTimeout(r, ms));
    return { ok: true };
  },
};

http
  .createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const cmd = JSON.parse(body || "{}");
      if (!ops[cmd.op]) throw new Error(`Unknown op: ${cmd.op}`);
      res.end(JSON.stringify(await ops[cmd.op](cmd)));
    } catch (e) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({ error: String(e?.message ?? e).slice(0, 2000) })
      );
    }
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Driver on http://127.0.0.1:${port} (profile ${profile})`);
  });
