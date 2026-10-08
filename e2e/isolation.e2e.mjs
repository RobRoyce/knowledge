/*
 * Instance isolation. Two profiles run at the same time. Each renderer
 * must reach only its own local server. A second launch of the same
 * profile must exit.
 *
 * Run: yarn build-dev && yarn e2e
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import CryptoJS from "crypto-js";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ELECTRON, REPO, appEnv, close, launch, newRun } from "./lib.mjs";

function backendInfo(page) {
  return page.evaluate(() => window.api.invoke("A2E:Backend:Info"));
}

function callChat(page, url, token) {
  return page.evaluate(
    async ({ url, token }) => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${url}/api/key`, { headers });
      return { status: res.status, body: await res.text() };
    },
    { url, token }
  );
}

test(
  "two profiles get separate servers and cannot use each other's",
  { timeout: 180000 },
  async () => {
    const run = newRun("isolation");
    const profileA = path.join(run, "profile-a");
    const profileB = path.join(run, "profile-b");
    const log = path.join(run, "app.log");

    // Profile A has an API key file. Profile B has none.
    fs.mkdirSync(path.join(profileA, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(profileA, "data", "openai.encrypted"),
      CryptoJS.AES.encrypt("sk-dummy-profile-a", "unsecured").toString()
    );

    const a = await launch(profileA, log);
    const b = await launch(profileB, log);
    try {
      const infoA = await backendInfo(a.page);
      const infoB = await backendInfo(b.page);

      assert.match(infoA.chat.url, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.match(infoB.chat.url, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.notEqual(infoA.chat.url, infoB.chat.url);
      assert.notEqual(infoA.chat.token, infoB.chat.token);

      // Each renderer reaches its own server with its own token
      const ownA = await callChat(a.page, infoA.chat.url, infoA.chat.token);
      assert.equal(ownA.status, 200, ownA.body);
      assert.equal(JSON.parse(ownA.body).apiKeySet, true);
      const ownB = await callChat(b.page, infoB.chat.url, infoB.chat.token);
      assert.equal(ownB.status, 200, ownB.body);
      assert.equal(JSON.parse(ownB.body).apiKeySet, false);

      // B cannot use A's server: no token, or B's token, gives 401
      assert.equal((await callChat(b.page, infoA.chat.url)).status, 401);
      assert.equal(
        (await callChat(b.page, infoA.chat.url, infoB.chat.token)).status,
        401
      );

      // A second launch of profile A exits and leaves the first instance running
      const second = spawnSync(ELECTRON, [REPO], {
        cwd: REPO,
        env: { ...appEnv(), KC_PROFILE_DIR: profileA },
        encoding: "utf8",
        timeout: 30000,
      });
      assert.equal(
        second.status,
        0,
        `second instance did not exit: ${second.signal}`
      );
      assert.match(
        second.stdout + second.stderr,
        /already open in another instance/
      );
      assert.equal(a.app.windows().length, 1);
    } finally {
      await close(b);
      await close(a);
    }
  }
);
