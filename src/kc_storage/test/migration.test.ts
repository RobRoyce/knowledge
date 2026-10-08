import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  FIXTURES,
  cli,
  client,
  sha256,
  startService,
  stopAll,
  tempDir,
} from "./helpers.ts";

afterEach(stopAll);

const P1 = "11111111-1111-4111-8111-111111111111";

/**
 * A renderer backup with the record shapes found in real profiles:
 * embedded sources, a differing ks- copy, a standalone ks- record,
 * an orphan ks- record, a missing file, derived fields, and other keys.
 */
function legacyBackup(work: string) {
  const pdf = path.join(work, "paper.pdf");
  const txt = path.join(work, "note.txt");
  fs.copyFileSync(path.join(FIXTURES, "recovery-fixture.pdf"), pdf);
  fs.copyFileSync(path.join(FIXTURES, "recovery-note.txt"), txt);
  const gone = path.join(work, "deleted.pdf");

  const fileSource = (
    id: string,
    title: string,
    file: string,
    type: string,
    extra = {}
  ) => ({
    id: { value: id },
    title,
    ingestType: "file",
    associatedProject: { value: P1 },
    accessLink: file,
    reference: {
      ingestType: "file",
      source: { file: { filename: title, path: file, size: 1, type } },
      link: file,
    },
    topics: [],
    meta: [{ key: "knowledge:type", value: "file" }],
    notes: [],
    icon: { changingThisBreaksApplicationSecurity: "blob:file:///x" },
    thumbnail: "data:image/png;base64,AAAA",
    ...extra,
  });

  const sources = [
    {
      id: { value: "web-1" },
      title: "Fixture Site",
      ingestType: "website",
      associatedProject: { value: P1 },
      accessLink: "http://127.0.0.1/index.html",
      topics: ["fixture"],
      meta: [{ key: "annotation", value: "web note" }],
      notes: [{ title: "kept note", body: "notes field is preserved" }],
      futureField: { unknown: true },
    },
    fileSource("pdf-1", "paper.pdf", pdf, "application/pdf", {
      topics: ["physics"],
      meta: [{ key: "annotation", value: "important" }],
    }),
    fileSource("txt-1", "note.txt", txt, "text/plain"),
    fileSource("gone-1", "deleted.pdf", gone, "application/pdf"),
  ];

  const project = {
    id: { value: P1 },
    name: "Legacy Project",
    parentId: { value: "" },
    subprojects: [],
    description: "from renderer",
    topics: ["t"],
    calendar: { events: [] },
    icon: "pi pi-folder",
    sources: [],
    knowledgeSource: sources,
  };

  const data: Record<string, string> = {
    [P1]: JSON.stringify(project),
    "kc-projects": JSON.stringify([P1]),
    // ks- copy that differs from the embedded copy: the embedded copy wins
    "ks-pdf-1": JSON.stringify({ ...sources[1], meta: [] }),
    // standalone ks- record whose project exists
    "ks-extra-1": JSON.stringify({
      id: { value: "extra-1" },
      title: "Standalone",
      ingestType: "website",
      associatedProject: { value: P1 },
      accessLink: "https://example.com/",
    }),
    // ks- record without a project
    "ks-orphan-1": JSON.stringify({
      id: { value: "orphan-1" },
      title: "Orphan",
      ingestType: "website",
      associatedProject: { value: "no-such-project" },
    }),
    "chat-web-1": JSON.stringify([{ text: "hello" }]),
    // UI preference whose key looks like a source key
    "ks-table-rows": "10",
    theme: JSON.stringify({ name: "dark" }),
    "ingest-queue": "[]",
    "current-project": P1,
  };

  const file = path.join(work, "knowledge-backup.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      format: "knowledge-backup",
      version: 1,
      exportedAt: "2026-10-06T00:00:00Z",
      data,
    })
  );
  return { file, pdf, txt };
}

function migrate(dataDir: string, input: string, env = {}) {
  const result = cli(["migrate", "--data-dir", dataDir, "--from", input], env);
  return {
    ...result,
    summary: result.stdout ? JSON.parse(result.stdout) : undefined,
  };
}

function report(summary: any) {
  return JSON.parse(
    fs.readFileSync(path.join(summary.runDirectory, "report.json"), "utf8")
  );
}

function count(dataDir: string, table: string) {
  const db = new DatabaseSync(path.join(dataDir, "library.sqlite"), {
    readOnly: true,
  });
  try {
    return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as any).n;
  } finally {
    db.close();
  }
}

function assetFiles(dataDir: string) {
  const root = path.join(dataDir, "assets");
  return fs
    .readdirSync(root)
    .filter((d) => d !== "tmp")
    .flatMap((d) => fs.readdirSync(path.join(root, d)));
}

test("migration imports, reports, and preserves data", async () => {
  const work = tempDir("mig-work");
  const dataDir = tempDir("mig-data");
  const { file, pdf } = legacyBackup(work);
  const inputSha = sha256(file);

  const first = migrate(dataDir, file);
  assert.equal(first.status, 0, first.stderr);
  const r = report(first.summary);

  assert.equal(r.status, "completed");
  assert.deepEqual(
    r.projects.imported.map((i: any) => i.id),
    [P1]
  );
  assert.deepEqual(r.sources.imported.map((i: any) => i.id).sort(), [
    "extra-1",
    "gone-1",
    "pdf-1",
    "txt-1",
    "web-1",
  ]);
  assert.deepEqual(
    r.sources.skipped.map((i: any) => i.id),
    ["orphan-1"]
  );
  assert.equal(r.files.copied.length, 2);
  assert.deepEqual(
    r.files.missing.map((m: any) => m.sourceId),
    ["gone-1"]
  );
  assert.deepEqual(r.superseded, [
    { key: "ks-pdf-1", differentFields: ["meta"] },
  ]);
  assert.deepEqual(r.droppedDerivedFields, { icon: 3, thumbnail: 3 });
  assert.deepEqual(r.rendererKeys, [
    "chat-web-1",
    "current-project",
    "ingest-queue",
    "ks-table-rows",
    "theme",
  ]);

  // Input unchanged; copy, report, and rollback snapshot exist
  assert.equal(sha256(file), inputSha);
  assert.equal(sha256(path.join(r.runDirectory, "input.json")), inputSha);
  assert.ok(fs.existsSync(r.rollback.snapshot));

  // Data through the API
  const svc = await startService(dataDir);
  const api = client(svc);
  const sources = (await api.get(`/v1/sources?projectId=${P1}`)).body.sources;
  const byId = Object.fromEntries(sources.map((s: any) => [s.id, s]));
  assert.deepEqual(byId["web-1"].data.notes, [
    { title: "kept note", body: "notes field is preserved" },
  ]);
  assert.deepEqual(byId["web-1"].data.futureField, { unknown: true });
  assert.deepEqual(byId["pdf-1"].data.meta, [
    { key: "annotation", value: "important" },
  ]);
  assert.equal(byId["pdf-1"].data.icon, undefined);
  assert.equal(byId["gone-1"].assetId, null);
  assert.equal(byId["gone-1"].data.accessLink, path.join(work, "deleted.pdf"));

  const asset = (await api.get(`/v1/assets/${byId["pdf-1"].assetId}`)).body
    .asset;
  assert.equal(asset.originalPath, pdf);
  assert.equal(asset.filename, "paper.pdf");
  assert.equal(asset.mediaType, "application/pdf");
  assert.ok((await api.content(asset.id)).bytes.equals(fs.readFileSync(pdf)));

  const projects = (await api.get("/v1/projects")).body.projects;
  assert.equal(projects[0].data.icon, "pi pi-folder");
  assert.equal(projects[0].data.description, "from renderer");
  await svc.stop();
});

test("a repeated migration creates no duplicates and keeps assets of deleted originals", () => {
  const work = tempDir("rep-work");
  const dataDir = tempDir("rep-data");
  const { file, pdf, txt } = legacyBackup(work);

  assert.equal(migrate(dataDir, file).status, 0);
  const counts = () =>
    ["projects", "sources", "assets"].map((t) => count(dataDir, t));
  const before = counts();
  const files = assetFiles(dataDir).sort();

  const again = report(migrate(dataDir, file).summary);
  assert.equal(again.status, "completed");
  assert.equal(again.projects.unchanged.length, 1);
  assert.equal(again.sources.unchanged.length, 5);
  assert.equal(again.sources.imported.length + again.sources.updated.length, 0);
  assert.equal(again.files.reused.length, 2);
  assert.deepEqual(counts(), before);
  assert.deepEqual(assetFiles(dataDir).sort(), files);

  // Originals deleted: the sources keep their managed copies
  fs.rmSync(pdf);
  fs.rmSync(txt);
  const third = report(migrate(dataDir, file).summary);
  assert.equal(third.files.kept.length, 2);
  assert.deepEqual(
    third.files.missing.map((m: any) => m.sourceId),
    ["gone-1"]
  );
  assert.equal(third.sources.unchanged.length, 5);
  assert.deepEqual(counts(), before);
});

test("a failed migration changes nothing and a later run succeeds", () => {
  const work = tempDir("fail-work");
  const dataDir = tempDir("fail-data");
  const { file } = legacyBackup(work);

  const failed = migrate(dataDir, file, {
    KC_STORAGE_TEST_FAULT: "migrate-before-commit",
  });
  assert.equal(failed.status, 1);
  const r = report(failed.summary);
  assert.equal(r.status, "failed");
  assert.match(r.error, /Injected test fault/);
  assert.equal(count(dataDir, "projects"), 0);
  assert.equal(count(dataDir, "sources"), 0);
  assert.equal(count(dataDir, "assets"), 0);
  assert.deepEqual(assetFiles(dataDir), []);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "assets", "tmp")), []);

  const ok = migrate(dataDir, file);
  assert.equal(ok.status, 0);
  assert.equal(count(dataDir, "sources"), 5);
});

test("invalid input is rejected before any write", () => {
  const work = tempDir("bad-work");
  const dataDir = tempDir("bad-data");
  const inputs = {
    "not-json.json": "{oops",
    "wrong-format.json": JSON.stringify({ projects: [] }),
    "bad-value.json": JSON.stringify({
      format: "knowledge-backup",
      version: 1,
      data: { a: 1 },
    }),
  };
  for (const [name, content] of Object.entries(inputs)) {
    const file = path.join(work, name);
    fs.writeFileSync(file, content);
    const result = migrate(dataDir, file);
    assert.equal(result.status, 1, name);
    assert.match(
      result.stderr,
      /not valid JSON|not a knowledge-backup|is not text/,
      name
    );
  }
  assert.ok(!fs.existsSync(path.join(dataDir, "migrations")));
  assert.equal(count(dataDir, "projects"), 0);
});

test("dry run reports without writing", () => {
  const work = tempDir("dry-work");
  const dataDir = tempDir("dry-data");
  const { file } = legacyBackup(work);
  const result = cli([
    "migrate",
    "--data-dir",
    dataDir,
    "--from",
    file,
    "--dry-run",
  ]);
  assert.equal(result.status, 0);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, "dry-run");
  assert.equal(summary.sources.imported, 5);
  assert.equal(count(dataDir, "sources"), 0);
  assert.ok(!fs.existsSync(path.join(dataDir, "migrations")));
});

test("the documented rollback restores the pre-migration state", async () => {
  const work = tempDir("rb-work");
  const dataDir = tempDir("rb-data");
  const { file } = legacyBackup(work);

  const r = report(migrate(dataDir, file).summary);
  assert.equal(count(dataDir, "sources"), 5);
  assert.equal(assetFiles(dataDir).length, 2);

  // Rollback: with the service stopped, replace the database with the snapshot
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(path.join(dataDir, `library.sqlite${suffix}`), { force: true });
  }
  fs.copyFileSync(r.rollback.snapshot, path.join(dataDir, "library.sqlite"));

  // The next start removes the copied files that no record refers to
  const svc = await startService(dataDir);
  const api = client(svc);
  assert.deepEqual((await api.get("/v1/projects")).body.projects, []);
  assert.deepEqual(assetFiles(dataDir), []);
  assert.match(svc.stderr(), /removed 2 unreferenced or temporary files/);
  await svc.stop();
});
