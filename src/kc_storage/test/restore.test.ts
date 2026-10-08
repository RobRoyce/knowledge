import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readTarEntry, readTarIndex, tarHeader, TarWriter } from "../src/tar.ts";
import { FIXTURES, cli, client, startService, stopAll, tempDir, type Service } from "./helpers.ts";

afterEach(stopAll);

/** A library with two projects, three sources, and two files, and its backup. */
async function makeBackup() {
  const work = tempDir("rs-work");
  const source = tempDir("rs-source");
  const svc = await startService(source);
  const api = client(svc);
  await api.put("/v1/projects/p1", { name: "Restore Project", parentId: null, data: { description: "d" } });
  await api.put("/v1/projects/p2", { name: "Child", parentId: "p1", data: {} });
  const pdf = (await api.upload(path.join(FIXTURES, "recovery-fixture.pdf"), "paper.pdf", "application/pdf")).body.asset;
  const txt = (await api.upload(path.join(FIXTURES, "recovery-note.txt"), "note.txt", "text/plain")).body.asset;
  const file = (title: string, assetId: string) => ({
    projectId: "p1",
    title,
    ingestType: "file",
    assetId,
    data: { topics: ["t"], meta: [{ key: "annotation", value: title }] },
  });
  await api.put("/v1/sources/s-pdf", file("paper.pdf", pdf.id));
  await api.put("/v1/sources/s-txt", file("note.txt", txt.id));
  await api.put("/v1/sources/s-web", {
    projectId: "p2",
    title: "Site",
    ingestType: "website",
    assetId: null,
    data: { accessLink: "https://example.com/" },
  });
  const expected = {
    projects: (await api.get("/v1/projects")).body.projects.map(({ updatedAt, ...r }: any) => r),
    sources: (await api.get("/v1/sources")).body.sources.map(({ updatedAt, ...r }: any) => r),
  };
  await svc.stop();
  const tar = path.join(work, "library.tar");
  assert.equal(cli(["backup", "--data-dir", source, "--out", tar]).status, 0);
  return { work, tar, expected, assets: { pdf, txt } };
}

/** Read a backup into a manifest and its asset files. */
function unpack(tar: string) {
  const index = readTarIndex(tar, { allowName: () => true, maxEntries: 100 });
  const manifest = JSON.parse(readTarEntry(tar, index.get("manifest.json")!).toString());
  const files = new Map<string, Buffer>();
  for (const [name, entry] of index) if (name !== "manifest.json") files.set(name, readTarEntry(tar, entry));
  return { manifest, files };
}

/** Write a tar from entries. type "0" is a regular file. */
async function pack(file: string, entries: { name: string; data?: Buffer; type?: string }[]) {
  const out = fs.createWriteStream(file);
  const tar = new TarWriter(out);
  for (const e of entries) {
    if (!e.type || e.type === "0") {
      await tar.addBuffer(e.name, e.data ?? Buffer.alloc(0));
    } else {
      out.write(tarHeader(e.name, 0, new Date(), e.type));
    }
  }
  await tar.finish();
  await new Promise<void>((r) => out.end(r));
  return file;
}

async function modified(tar: string, out: string, change: (m: any, f: Map<string, Buffer>) => void, extra: any[] = []) {
  const { manifest, files } = unpack(tar);
  change(manifest, files);
  return pack(out, [
    { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest)) },
    ...[...files].map(([name, data]) => ({ name, data })),
    ...extra,
  ]);
}

async function upload(svc: Service, tar: string) {
  const res = await fetch(`${svc.url}/v1/restores`, {
    method: "POST",
    headers: { Authorization: `Bearer ${svc.token}`, "Content-Type": "application/x-tar" },
    body: fs.readFileSync(tar),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function activate(svc: Service, id: string) {
  const res = await fetch(`${svc.url}/v1/restores/${id}/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${svc.token}` },
  });
  return { status: res.status, body: (await res.json()) as any };
}

function allFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.relative(dir, path.join(d.parentPath, d.name)));
}

/** Managed files and staging files in a data directory. */
function storedFiles(dataDir: string) {
  return [
    ...allFiles(path.join(dataDir, "assets")).filter((f) => !f.startsWith("tmp")),
    ...allFiles(path.join(dataDir, "restore")),
  ];
}

test("restore through the API: validate, preview, activate, refuse a second time", async () => {
  const { tar, expected, assets } = await makeBackup();
  const target = tempDir("rs-target");
  const svc = await startService(target);
  const api = client(svc);

  // An initialized but empty library is accepted
  assert.deepEqual((await api.get("/v1/library")).body, {
    empty: true,
    counts: { projects: 0, sources: 0, inbox: 0, assets: 0 },
  });

  const up = await upload(svc, tar);
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const preview = up.body.restore;
  assert.deepEqual(preview.counts, { projects: 2, sources: 3, inbox: 0, assets: 2, bytes: assets.pdf.size + assets.txt.size });
  assert.deepEqual(preview.projectNames.sort(), ["Child", "Restore Project"]);
  assert.equal(preview.backupVersion, 2);
  assert.ok(preview.notIncluded.includes("Chat history"));
  assert.ok(preview.notIncluded.includes("API keys"));

  // Nothing is active before confirmation
  assert.equal((await api.get("/v1/library")).body.empty, true);

  const done = await activate(svc, preview.id);
  assert.equal(done.status, 200);
  assert.deepEqual(done.body.restored, { projects: 2, sources: 3, inbox: 0, assets: 2 });
  assert.deepEqual(
    (await api.get("/v1/projects")).body.projects.map(({ updatedAt, ...r }: any) => r),
    expected.projects
  );
  assert.deepEqual(
    (await api.get("/v1/sources")).body.sources.map(({ updatedAt, ...r }: any) => r),
    expected.sources
  );
  assert.ok((await api.content(assets.pdf.id)).bytes.equals(fs.readFileSync(path.join(FIXTURES, "recovery-fixture.pdf"))));
  assert.deepEqual(allFiles(path.join(target, "restore")), []);

  // A library with records is refused before the upload is read
  const again = await upload(svc, tar);
  assert.equal(again.status, 409);
  assert.match(again.body.error.message, /Restore needs an empty library\. This library has 2 projects, 3 sources, and 2 files/);
  assert.equal((await api.get("/v1/sources")).body.sources.length, 3);
  assert.equal((await activate(svc, preview.id)).status, 404);
});

test("a write after validation blocks activation; nothing is merged", async () => {
  const { tar } = await makeBackup();
  const target = tempDir("rs-race");
  const svc = await startService(target);
  const api = client(svc);
  const up = await upload(svc, tar);
  assert.equal(up.status, 201);

  await api.put("/v1/projects/mine", { name: "Created meanwhile", parentId: null, data: {} });
  const done = await activate(svc, up.body.restore.id);
  assert.equal(done.status, 409);
  assert.deepEqual((await api.get("/v1/projects")).body.projects.map((p: any) => p.id), ["mine"]);
  assert.deepEqual(storedFiles(target), []);
});

test("cancel removes the staged files", async () => {
  const { tar } = await makeBackup();
  const target = tempDir("rs-cancel");
  const svc = await startService(target);
  const up = await upload(svc, tar);
  assert.ok(allFiles(path.join(target, "restore")).length > 0);
  const res = await fetch(`${svc.url}/v1/restores/${up.body.restore.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${svc.token}` },
  });
  assert.equal(res.status, 204);
  assert.deepEqual(allFiles(path.join(target, "restore")), []);
  assert.equal((await activate(svc, up.body.restore.id)).status, 404);
});

test("invalid backups are rejected before activation and leave nothing behind", async () => {
  const { tar, work, assets } = await makeBackup();
  const target = tempDir("rs-invalid");
  const svc = await startService(target);
  const api = client(svc);
  const out = (name: string) => path.join(work, name);

  const cases: [string, Promise<string>, RegExp][] = [
    [
      "unsupported version",
      modified(tar, out("v3.tar"), (m) => (m.version = 3)),
      /Backup version 3 is not supported/,
    ],
    [
      "missing asset file",
      modified(tar, out("missing.tar"), (_m, f) => f.delete(`assets/${assets.txt.id}`)),
      /is missing from the backup/,
    ],
    [
      "damaged asset file",
      modified(tar, out("damaged.tar"), (_m, f) => {
        const data = Buffer.from(f.get(`assets/${assets.txt.id}`)!);
        data[0] ^= 0xff;
        f.set(`assets/${assets.txt.id}`, data);
      }),
      /is damaged/,
    ],
    [
      "source refers to a missing project",
      modified(tar, out("orphan.tar"), (m) => (m.sources[0].projectId = "nope")),
      /not in the backup/,
    ],
    [
      "path traversal entry",
      modified(tar, out("traversal.tar"), () => {}, [{ name: "../escaped.txt", data: Buffer.from("x") }]),
      /Unexpected tar entry/,
    ],
    [
      "absolute path entry",
      modified(tar, out("absolute.tar"), () => {}, [{ name: "/tmp/kc-escaped.txt", data: Buffer.from("x") }]),
      /Unexpected tar entry/,
    ],
    [
      "symbolic link entry",
      modified(tar, out("symlink.tar"), () => {}, [{ name: "assets/link", type: "2" }]),
      /Unsupported tar entry type "2"/,
    ],
    [
      "unlisted asset entry",
      modified(tar, out("unlisted.tar"), () => {}, [
        { name: "assets/00000000-0000-4000-8000-000000000000", data: Buffer.from("x") },
      ]),
      /does not list/,
    ],
    ["not a tar file", Promise.resolve(path.join(FIXTURES, "recovery-note.txt")), /not a valid library backup/],
  ];

  for (const [label, file, message] of cases) {
    const res = await upload(svc, await file);
    assert.equal(res.status, 400, `${label}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error.message, message, label);
    assert.deepEqual(storedFiles(target), [], `${label}: files left behind`);
    assert.equal((await api.get("/v1/library")).body.empty, true, label);
  }
  assert.ok(!fs.existsSync(path.join(work, "escaped.txt")));
  assert.ok(!fs.existsSync("/tmp/kc-escaped.txt"));

  // The command line uses the same validation
  const viaCli = cli(["restore", "--data-dir", tempDir("rs-cli"), "--from", out("v3.tar")]);
  assert.equal(viaCli.status, 1);
  assert.match(viaCli.stderr, /Backup version 3 is not supported/);
});

test("a failure during activation rolls back records and files", async () => {
  const { tar } = await makeBackup();
  const target = tempDir("rs-fail");
  const result = cli(["restore", "--data-dir", target, "--from", tar], {
    KC_STORAGE_TEST_FAULT: "restore-fail-before-commit",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Injected test fault/);
  assert.deepEqual(storedFiles(target), []);

  const svc = await startService(target);
  assert.equal((await client(svc).get("/v1/library")).body.empty, true);
});

test("a process stop during activation leaves an empty library after restart", async () => {
  const { tar, expected } = await makeBackup();
  const target = tempDir("rs-crash");
  const result = cli(["restore", "--data-dir", target, "--from", tar], {
    KC_STORAGE_TEST_FAULT: "restore-exit-during-activation",
  });
  assert.equal(result.status, 70);
  // The process stopped after it moved a file and before it committed
  assert.ok(storedFiles(target).length > 0);

  const svc = await startService(target);
  const api = client(svc);
  assert.equal((await api.get("/v1/library")).body.empty, true);
  assert.deepEqual(storedFiles(target), []);
  assert.match(svc.stderr(), /removed \d+ unreferenced or temporary files/);

  // A later restore succeeds
  const up = await upload(svc, tar);
  assert.equal((await activate(svc, up.body.restore.id)).status, 200);
  assert.equal((await api.get("/v1/sources")).body.sources.length, expected.sources.length);
});
