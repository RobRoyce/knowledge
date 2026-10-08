/*
 * Data profile checks. Development runs must never resolve to per-user data.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { resolveProfile } from "../src/kc_electron/src/app/profile.paths.ts";

const repo = "/work/knowledge";

test("unpackaged runs default to the repository dev profile", () => {
  const profile = resolveProfile(undefined, false, repo)!;

  assert.equal(profile.root, path.join(repo, ".dev-profiles", "dev"));
  for (const dir of Object.values(profile)) {
    assert.ok(dir.startsWith(profile.root), `${dir} is outside the profile`);
  }
});

test("KC_PROFILE_DIR places every location under that directory", () => {
  const profile = resolveProfile("/tmp/kc-test", false, repo)!;

  assert.deepEqual(profile, {
    root: "/tmp/kc-test",
    userData: "/tmp/kc-test/userData",
    data: "/tmp/kc-test/data",
    settings: "/tmp/kc-test/settings",
    downloads: "/tmp/kc-test/downloads",
  });
});

test("no profile location falls inside the home directory defaults", () => {
  const home = os.homedir();
  const real = [
    path.join(home, ".Knowledge"),
    path.join(home, "Library", "Preferences", "Knowledge"),
    path.join(home, "Library", "Application Support"),
    path.join(home, "Downloads"),
  ];
  const profile = resolveProfile(undefined, false, repo)!;

  for (const dir of Object.values(profile)) {
    for (const prefix of real) {
      assert.ok(!dir.startsWith(prefix), `${dir} is inside ${prefix}`);
    }
  }
});

test("packaged builds and KC_PROFILE_DIR=system use per-user locations", () => {
  assert.equal(resolveProfile(undefined, true, repo), null);
  assert.equal(resolveProfile("system", false, repo), null);
});
