import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readTarEntry, readTarIndex, TarWriter } from "../src/tar.ts";
import {
  FIXTURES,
  cli,
  client,
  startService,
  stopAll,
  tempDir,
  type Service,
} from "./helpers.ts";

afterEach(stopAll);

const inboxEntry = (title: string, extra: object = {}) => ({
  projectId: null,
  title,
  ingestType: "website",
  assetId: null,
  data: { accessLink: `https://example.com/${title}`, topics: [title] },
  ...extra,
});

async function putCreateOnly(svc: Service, id: string, body: object) {
  const res = await fetch(`${svc.url}/v1/sources/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${svc.token}`,
      "Content-Type": "application/json",
      "If-None-Match": "*",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const inboxOf = async (api: ReturnType<typeof client>) =>
  (await api.get("/v1/sources")).body.sources.filter(
    (s: any) => s.projectId === null
  );

test("inbox entries are sources without a project, in order, and survive a restart", async () => {
  const dataDir = tempDir("inbox");
  let svc = await startService(dataDir);
  let api = client(svc);

  for (const id of ["b", "a", "c"]) {
    assert.equal(
      (await api.put(`/v1/sources/in-${id}`, inboxEntry(id))).status,
      201
    );
  }
  const pdf = (
    await api.upload(
      path.join(FIXTURES, "recovery-fixture.pdf"),
      "paper.pdf",
      "application/pdf"
    )
  ).body.asset;
  await api.put(
    "/v1/sources/in-file",
    inboxEntry("paper.pdf", { ingestType: "file", assetId: pdf.id })
  );

  // projectId is required; null means the inbox
  const { projectId, ...noProject } = inboxEntry("x");
  assert.equal((await api.put("/v1/sources/in-x", noProject)).status, 400);

  assert.deepEqual((await api.get("/v1/library")).body.counts, {
    projects: 0,
    sources: 4,
    inbox: 4,
    assets: 1,
  });

  await svc.stop();
  svc = await startService(dataDir);
  api = client(svc);
  const inbox = await inboxOf(api);
  assert.deepEqual(
    inbox.map((s: any) => [s.id, s.position]),
    [
      ["in-b", 0],
      ["in-a", 1],
      ["in-c", 2],
      ["in-file", 3],
    ]
  );
  assert.deepEqual(inbox[0].data.topics, ["b"]);
  assert.equal(inbox[3].assetId, pdf.id);
  assert.ok(
    (await api.content(pdf.id)).bytes.equals(
      fs.readFileSync(path.join(FIXTURES, "recovery-fixture.pdf"))
    )
  );
});

test("a transfer moves the entry in one write; a repeated transfer adds nothing", async () => {
  const svc = await startService(tempDir("transfer"));
  const api = client(svc);
  await api.put("/v1/projects/p1", {
    name: "Project",
    parentId: null,
    data: {},
  });
  await api.put("/v1/sources/s-existing", {
    ...inboxEntry("existing"),
    projectId: "p1",
  });
  await api.put("/v1/sources/in-1", inboxEntry("one"));
  await api.put("/v1/sources/in-2", inboxEntry("two"));

  const moved = { ...inboxEntry("one"), projectId: "p1" };
  const first = await api.put("/v1/sources/in-1", moved);
  assert.equal(first.status, 200);
  assert.equal(first.body.source.projectId, "p1");
  assert.equal(first.body.source.position, 1);

  // Repeat after a lost response: same record, same position, no copy
  const again = await api.put("/v1/sources/in-1", moved);
  assert.equal(again.status, 200);
  assert.equal(again.body.source.position, 1);
  const inProject = (await api.get("/v1/sources?projectId=p1")).body.sources;
  assert.deepEqual(
    inProject.map((s: any) => s.id),
    ["s-existing", "in-1"]
  );
  assert.deepEqual(
    (await inboxOf(api)).map((s: any) => s.id),
    ["in-2"]
  );
  assert.equal((await api.get("/v1/library")).body.counts.sources, 3);

  // A transfer to a project that does not exist changes nothing
  const bad = await api.put("/v1/sources/in-2", {
    ...inboxEntry("two"),
    projectId: "missing",
  });
  assert.equal(bad.status, 409);
  assert.deepEqual(
    (await inboxOf(api)).map((s: any) => s.id),
    ["in-2"]
  );
});

test("a create-only write never moves or changes an existing source", async () => {
  const svc = await startService(tempDir("create-only"));
  const api = client(svc);
  await api.put("/v1/projects/p1", {
    name: "Project",
    parentId: null,
    data: {},
  });
  await api.put("/v1/sources/s1", {
    ...inboxEntry("in project"),
    projectId: "p1",
  });

  const blocked = await putCreateOnly(
    svc,
    "s1",
    inboxEntry("stale inbox copy")
  );
  assert.equal(blocked.status, 412);
  assert.equal(blocked.body.error.code, "precondition_failed");
  const s1 = (await api.get("/v1/sources?projectId=p1")).body.sources[0];
  assert.equal(s1.title, "in project");

  assert.equal(
    (await putCreateOnly(svc, "new-1", inboxEntry("new"))).status,
    201
  );
  assert.equal(
    (await putCreateOnly(svc, "new-1", inboxEntry("new"))).status,
    412
  );
  assert.deepEqual(
    (await inboxOf(api)).map((s: any) => s.id),
    ["new-1"]
  );
});

test("backup and restore keep inbox entries, their order, and their files", async () => {
  const work = tempDir("inbox-bk-work");
  const source = tempDir("inbox-bk-source");
  const svc = await startService(source);
  const api = client(svc);
  await api.put("/v1/projects/p1", {
    name: "Project",
    parentId: null,
    data: {},
  });
  const txt = (
    await api.upload(
      path.join(FIXTURES, "recovery-note.txt"),
      "note.txt",
      "text/plain"
    )
  ).body.asset;
  await api.put(
    "/v1/sources/in-file",
    inboxEntry("note.txt", { ingestType: "file", assetId: txt.id })
  );
  await api.put("/v1/sources/in-web", inboxEntry("web"));
  await api.put("/v1/sources/s1", {
    ...inboxEntry("project source"),
    projectId: "p1",
  });
  const expected = (await api.get("/v1/sources")).body.sources.map(
    ({ updatedAt, ...r }: any) => r
  );
  await svc.stop();

  const tar = path.join(work, "library.tar");
  assert.equal(cli(["backup", "--data-dir", source, "--out", tar]).status, 0);
  const index = readTarIndex(tar, { allowName: () => true, maxEntries: 10 });
  const manifest = JSON.parse(
    readTarEntry(tar, index.get("manifest.json")!).toString()
  );
  assert.equal(manifest.version, 2);

  // Restore through the API: the preview counts the inbox
  const target = tempDir("inbox-bk-target");
  const svc2 = await startService(target);
  const res = await fetch(`${svc2.url}/v1/restores`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${svc2.token}`,
      "Content-Type": "application/x-tar",
    },
    body: fs.readFileSync(tar),
  });
  const { restore } = (await res.json()) as any;
  assert.equal(restore.counts.inbox, 2);
  const done = await fetch(`${svc2.url}/v1/restores/${restore.id}/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${svc2.token}` },
  });
  assert.deepEqual(((await done.json()) as any).restored, {
    projects: 1,
    sources: 3,
    inbox: 2,
    assets: 1,
  });

  const api2 = client(svc2);
  const restored = (await api2.get("/v1/sources")).body.sources.map(
    ({ updatedAt, ...r }: any) => r
  );
  assert.deepEqual(restored, expected);
  assert.equal(
    (await api2.content(txt.id)).bytes.toString(),
    fs.readFileSync(path.join(FIXTURES, "recovery-note.txt"), "utf8")
  );
});

test("version 1 backups still restore; a version 1 backup cannot hold inbox entries", async () => {
  const work = tempDir("v1-work");
  const source = tempDir("v1-source");
  const svc = await startService(source);
  const api = client(svc);
  await api.put("/v1/projects/p1", {
    name: "Old Project",
    parentId: null,
    data: {},
  });
  await api.put("/v1/sources/s1", { ...inboxEntry("old"), projectId: "p1" });
  await svc.stop();
  const tar = path.join(work, "v2.tar");
  assert.equal(cli(["backup", "--data-dir", source, "--out", tar]).status, 0);

  const rewrite = async (out: string, change: (m: any) => void) => {
    const index = readTarIndex(tar, { allowName: () => true, maxEntries: 10 });
    const manifest = JSON.parse(
      readTarEntry(tar, index.get("manifest.json")!).toString()
    );
    change(manifest);
    const stream = fs.createWriteStream(out);
    const writer = new TarWriter(stream);
    await writer.addBuffer(
      "manifest.json",
      Buffer.from(JSON.stringify(manifest))
    );
    await writer.finish();
    await new Promise<void>((r) => stream.end(r));
    return out;
  };

  const v1 = await rewrite(path.join(work, "v1.tar"), (m) => (m.version = 1));
  const ok = cli(["restore", "--data-dir", tempDir("v1-target"), "--from", v1]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout).restored, {
    projects: 1,
    sources: 1,
    inbox: 0,
    assets: 0,
  });

  const bad = await rewrite(path.join(work, "v1-inbox.tar"), (m) => {
    m.version = 1;
    m.sources[0].projectId = null;
  });
  const refused = cli([
    "restore",
    "--data-dir",
    tempDir("v1-bad"),
    "--from",
    bad,
  ]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr + refused.stdout, /Version 1 has no inbox/);
});

test("a schema 1 library upgrades to schema 2 without data changes", async () => {
  const dataDir = tempDir("schema1");
  const db = new DatabaseSync(path.join(dataDir, "library.sqlite"));
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
    INSERT INTO schema_migrations VALUES (1, '2026-10-01T00:00:00.000Z');
    CREATE TABLE projects (id TEXT PRIMARY KEY, parent_id TEXT, name TEXT NOT NULL,
      data TEXT NOT NULL CHECK (json_valid(data)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
    CREATE TABLE assets (id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, size INTEGER NOT NULL, media_type TEXT NOT NULL,
      filename TEXT NOT NULL, original_path TEXT, created_at TEXT NOT NULL) STRICT;
    CREATE INDEX assets_sha256 ON assets (sha256);
    CREATE TABLE sources (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
      title TEXT NOT NULL, ingest_type TEXT NOT NULL, asset_id TEXT REFERENCES assets (id) ON DELETE RESTRICT,
      position INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
    CREATE INDEX sources_project ON sources (project_id, position);
    CREATE TABLE import_runs (id TEXT PRIMARY KEY, input_sha256 TEXT NOT NULL, started_at TEXT NOT NULL,
      finished_at TEXT, status TEXT NOT NULL, report TEXT) STRICT;
    INSERT INTO projects VALUES ('p1', NULL, 'Kept', '{"k":1}', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
    INSERT INTO sources VALUES ('s1', 'p1', 'One', 'website', NULL, 0, '{"a":1}', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
    INSERT INTO sources VALUES ('s2', 'p1', 'Two', 'note', NULL, 1, '{"b":2}', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  `);
  db.close();

  const svc = await startService(dataDir);
  const api = client(svc);
  assert.equal((await api.get("/health")).body.schemaVersion, 2);
  const sources = (await api.get("/v1/sources")).body.sources;
  assert.deepEqual(
    sources.map((s: any) => [
      s.id,
      s.projectId,
      s.position,
      s.data,
      s.createdAt,
    ]),
    [
      ["s1", "p1", 0, { a: 1 }, "2026-10-01T00:00:00.000Z"],
      ["s2", "p1", 1, { b: 2 }, "2026-10-01T00:00:00.000Z"],
    ]
  );
  assert.equal(
    (await api.put("/v1/sources/in-1", inboxEntry("new"))).status,
    201
  );

  // Foreign keys still hold after the rebuild
  assert.equal((await api.del("/v1/projects/p1")).status, 204);
  assert.deepEqual(
    (await api.get("/v1/sources")).body.sources.map((s: any) => s.id),
    ["in-1"]
  );
});

test("preferences persist across restarts and are not in the backup", async () => {
  const dataDir = tempDir("prefs");
  let svc = await startService(dataDir);
  let api = client(svc);
  assert.equal((await api.get("/v1/preferences/browser-settings")).status, 404);
  assert.equal(
    (await api.put("/v1/preferences/browser-settings", ["x"])).status,
    400
  );
  assert.equal((await api.put("/v1/preferences/bad%20key", {})).status, 400);
  assert.equal(
    (
      await api.put("/v1/preferences/browser-settings", {
        big: "x".repeat(70 * 1024),
      })
    ).status,
    400
  );
  const put = await api.put("/v1/preferences/browser-settings", {
    display: { theme: "dark" },
  });
  assert.equal(put.status, 200);
  await svc.stop();

  svc = await startService(dataDir);
  api = client(svc);
  const got = (await api.get("/v1/preferences/browser-settings")).body
    .preference;
  assert.deepEqual(got.data, { display: { theme: "dark" } });
  assert.equal((await api.get("/v1/library")).body.empty, true);
  await svc.stop();

  const tar = path.join(tempDir("prefs-bk"), "b.tar");
  assert.equal(cli(["backup", "--data-dir", dataDir, "--out", tar]).status, 0);
  const index = readTarIndex(tar, { allowName: () => true, maxEntries: 10 });
  assert.doesNotMatch(
    readTarEntry(tar, index.get("manifest.json")!).toString(),
    /theme/
  );
});
