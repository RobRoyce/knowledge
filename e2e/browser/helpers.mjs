/*
 * Shared helpers for the Chrome tests: the "yarn browser" launcher, a
 * Chrome page that records errors, and library reads through the page's
 * own session.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { REPO } from "../lib.mjs";

const LINK = /http:\/\/127\.0\.0\.1:\d+\/#launch=[A-Za-z0-9_-]+/g;

/**
 * Start the launcher. Resolves with its first launch link. newLink()
 * presses Enter in the launcher, as a user does, and resolves with the
 * next link.
 */
export async function startLauncher(dataDir, log, args = []) {
  const child = spawn(
    process.execPath,
    [
      path.join(REPO, "scripts/start-browser.mjs"),
      "--data-dir",
      dataDir,
      ...args,
    ],
    { cwd: REPO, stdio: ["pipe", "pipe", "pipe"] }
  );
  let output = "";
  const write = (d) => {
    output += d;
    fs.appendFileSync(log, d);
  };
  child.stdout.on("data", write);
  child.stderr.on("data", write);

  const nextLink = (count) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`No launch link:\n${output}`)),
        30000
      );
      const check = () => {
        const links = output.match(LINK) ?? [];
        if (links.length >= count) {
          clearTimeout(timer);
          child.stdout.off("data", check);
          resolve(links[count - 1]);
        }
      };
      child.stdout.on("data", check);
      child.once("exit", (code) =>
        reject(new Error(`Launcher exited (${code}):\n${output}`))
      );
      check();
    });

  const url = await nextLink(1);
  return {
    url,
    origin: new URL(url).origin,
    output: () => output,
    async newLink() {
      const count = (output.match(LINK) ?? []).length + 1;
      child.stdin.write("\n");
      return nextLink(count);
    },
    async stop() {
      if (child.exitCode !== null) return;
      child.kill("SIGINT");
      await new Promise((r) => child.on("exit", r));
    },
  };
}

/**
 * Open Chrome on a launch link. errors collects uncaught page errors,
 * console errors (with the URL that caused them), and alert dialogs.
 */
export async function openBrowser(url, { context: shared } = {}) {
  const browser = shared
    ? undefined
    : await chromium.launch({ channel: "chrome", headless: true });
  const context =
    shared ??
    (await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      acceptDownloads: true,
    }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push({ kind: "page", text: e.message }));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push({
        kind: "console",
        text: m.text(),
        url: m.location()?.url ?? "",
      });
    }
  });
  page.on("dialog", (d) => {
    errors.push({ kind: "dialog", text: d.message() });
    d.dismiss();
  });
  await page.goto(url);
  await page.waitForSelector("app-create button", { timeout: 30000 });
  return {
    browser,
    context,
    page,
    errors,
    async close() {
      if (browser) await browser.close();
      else await page.close();
    },
  };
}

/**
 * Fail on any recorded error that no pattern allows, then clear the list.
 * A pattern matches the error text or the URL that caused it.
 */
export function assertNoErrors(errors, where, allowed = []) {
  const unexpected = errors.filter(
    (e) => !allowed.some((re) => re.test(e.text) || re.test(e.url ?? ""))
  );
  errors.length = 0;
  assert.deepEqual(unexpected, [], `errors ${where}`);
}

/** Projects, sources, and the inbox through the page's own session. */
export function readLibrary(page) {
  return page.evaluate(async () => {
    const get = (r) => fetch(`/v1/${r}`).then((res) => res.json());
    const { projects } = await get("projects");
    const { sources } = await get("sources");
    const view = (s) => ({
      title: s.title,
      type: s.ingestType,
      assetId: s.assetId,
      originalPath: s.data.reference?.source?.file?.path ?? null,
      topics: s.data.topics ?? [],
      annotations: (s.data.meta ?? [])
        .filter((m) => m.key === "annotation")
        .map((m) => m.value),
    });
    return {
      projects: projects.map((p) => ({
        name: p.name,
        sources: sources
          .filter((s) => s.projectId === p.id)
          .map(view)
          .sort((a, b) => a.title.localeCompare(b.title)),
      })),
      inbox: sources.filter((s) => s.projectId === null).map(view),
    };
  });
}

/** Read the library with the bearer-free page session, as JSON counts. */
export async function counts(page) {
  return page.evaluate(() =>
    fetch("/v1/library")
      .then((r) => r.json())
      .then((b) => b.counts)
  );
}

/** Poll a value that the page reads (it may await), until check passes. */
export async function waitForValue(page, read, check, timeout = 15000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await page.evaluate(read);
    if (check(value)) return value;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out. Last value: ${JSON.stringify(value)}`);
}
