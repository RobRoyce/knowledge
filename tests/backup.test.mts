/*
 * Backup and restore checks. Run with `yarn test` (Node 22.18+ or 24).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBackup,
  restoreBackup,
} from "../src/kc_angular/src/app/services/ipc-services/backup.ts";
import type { KeyValueStore } from "../src/kc_angular/src/app/services/ipc-services/backup.ts";

class MemoryStore implements KeyValueStore {
  private items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }

  snapshot() {
    return Object.fromEntries(this.items);
  }
}

function project(id: string, sources: object[] = []) {
  return { id: { value: id }, name: `Project ${id}`, knowledgeSource: sources };
}

function populated() {
  const store = new MemoryStore();
  const source = {
    id: { value: "source-1" },
    title: "notes.txt",
    topics: ["biology"],
    meta: [{ key: "annotation", value: "mentions chlorophyll" }],
  };
  store.setItem("project-a", JSON.stringify(project("project-a", [source])));
  store.setItem("kc-projects", JSON.stringify(["project-a"]));
  store.setItem("chat-source-1", JSON.stringify([{ text: "hello" }]));
  store.setItem("ingest-queue", JSON.stringify([{ title: "pending" }]));
  store.setItem("current-project", "project-a");
  return store;
}

test("backup round trip restores every key into an empty profile", () => {
  const original = populated();
  const backup = JSON.parse(JSON.stringify(createBackup(original, "0.8.6")));

  const fresh = new MemoryStore();
  const result = restoreBackup(fresh, backup);

  assert.deepEqual(fresh.snapshot(), original.snapshot());
  assert.equal(result.keysWritten, original.length);
});

test("backup keeps chat history, inbox and source annotations", () => {
  const backup = createBackup(populated());

  assert.ok(backup.data["chat-source-1"]);
  assert.ok(backup.data["ingest-queue"]);
  const restored = JSON.parse(backup.data["project-a"]);
  assert.deepEqual(restored.knowledgeSource[0].meta, [
    { key: "annotation", value: "mentions chlorophyll" },
  ]);
});

test("restore replaces keys with the same name and keeps other keys", () => {
  const backup = createBackup(populated());

  const target = new MemoryStore();
  target.setItem("current-project", "old");
  target.setItem("chat-other", "kept");

  const result = restoreBackup(target, backup);

  assert.equal(target.getItem("current-project"), "project-a");
  assert.equal(target.getItem("chat-other"), "kept");
  assert.equal(
    target.getItem("chat-source-1"),
    JSON.stringify([{ text: "hello" }])
  );
  assert.equal(result.keysWritten, Object.keys(backup.data).length);
});

test("restore rejects invalid files and leaves the store unchanged", () => {
  const target = populated();
  const before = target.snapshot();

  assert.throws(() => restoreBackup(target, null), /not a Knowledge backup/);
  assert.throws(
    () => restoreBackup(target, { hello: 1 }),
    /not a Knowledge backup/
  );
  assert.throws(
    () =>
      restoreBackup(target, {
        format: "knowledge-backup",
        version: 99,
        data: {},
      }),
    /version 99 is not supported/
  );
  assert.throws(
    () =>
      restoreBackup(target, {
        format: "knowledge-backup",
        version: 1,
        data: { key: 42 },
      }),
    /not text/
  );

  assert.deepEqual(target.snapshot(), before);
});
