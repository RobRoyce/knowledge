import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import {
  FIXTURES,
  cli,
  client,
  rawRequest,
  sha256,
  startService,
  stopAll,
  tempDir,
} from "./helpers.ts";

afterEach(stopAll);

const PDF = path.join(FIXTURES, "recovery-fixture.pdf");
const TXT = path.join(FIXTURES, "recovery-note.txt");

const project = (name: string, data: object = {}) => ({
  name,
  parentId: null,
  data,
});
const source = (projectId: string, title: string, extra: object = {}) => ({
  projectId,
  title,
  ingestType: "website",
  assetId: null,
  data: { accessLink: "https://example.com/", topics: ["t"], ...extra },
});

test("projects and sources persist across a restart, in order, with all fields", async () => {
  const dataDir = tempDir("persist");
  let svc = await startService(dataDir);
  let api = client(svc);

  assert.equal(
    (
      await api.put(
        "/v1/projects/p1",
        project("One", { anything: { nested: [1, 2] } })
      )
    ).status,
    201
  );
  assert.equal(
    (await api.put("/v1/projects/p2", { ...project("Two"), parentId: "p1" }))
      .status,
    201
  );
  for (const id of ["s1", "s2", "s3"]) {
    assert.equal(
      (
        await api.put(
          `/v1/sources/${id}`,
          source("p1", `Source ${id}`, { meta: [{ key: "k", value: id }] })
        )
      ).status,
      201
    );
  }
  // Update keeps position; move goes to the end of the new project
  assert.equal(
    (await api.put("/v1/sources/s1", source("p1", "Source s1 renamed"))).status,
    200
  );
  assert.equal(
    (await api.put("/v1/sources/s2", source("p2", "Source s2"))).status,
    200
  );
  assert.equal(await svc.stop(), 0);

  svc = await startService(dataDir);
  api = client(svc);
  const projects = (await api.get("/v1/projects")).body.projects;
  assert.deepEqual(
    projects.map((p: any) => [p.id, p.name, p.parentId]),
    [
      ["p1", "One", null],
      ["p2", "Two", "p1"],
    ]
  );
  assert.deepEqual(projects[0].data, { anything: { nested: [1, 2] } });

  const p1 = (await api.get("/v1/sources?projectId=p1")).body.sources;
  assert.deepEqual(
    p1.map((s: any) => s.title),
    ["Source s1 renamed", "Source s3"]
  );
  assert.deepEqual(p1[1].data.meta, [{ key: "k", value: "s3" }]);
  const p2 = (await api.get("/v1/sources?projectId=p2")).body.sources;
  assert.deepEqual(
    p2.map((s: any) => s.id),
    ["s2"]
  );

  // Deleting a project deletes its sources
  assert.equal((await api.del("/v1/projects/p2")).status, 204);
  assert.equal(
    (await api.get("/v1/sources?projectId=p2")).body.sources.length,
    0
  );
  assert.equal(await svc.stop(), 0);
});

test("uploaded files are copied, hashed, and served; originals stay unchanged", async () => {
  const dataDir = tempDir("assets");
  const work = tempDir("assets-originals");
  const original = path.join(work, "paper.pdf");
  fs.copyFileSync(PDF, original);
  const before = {
    sha: sha256(original),
    mtime: fs.statSync(original).mtimeMs,
  };

  const svc = await startService(dataDir);
  const api = client(svc);
  const up = await api.upload(
    original,
    "../../evil/paper.pdf",
    "application/pdf",
    original
  );
  assert.equal(up.status, 201);
  const asset = up.body.asset;
  assert.equal(asset.filename, "paper.pdf");
  assert.equal(asset.originalPath, original);
  assert.equal(asset.sha256, before.sha);
  assert.equal(asset.size, fs.statSync(original).size);

  // The original is not moved or changed
  assert.equal(sha256(original), before.sha);
  assert.equal(fs.statSync(original).mtimeMs, before.mtime);

  // The managed copy is independent of the original
  fs.rmSync(original);
  const got = await api.content(asset.id);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "application/pdf");
  assert.match(
    got.headers.get("content-disposition")!,
    /filename\*=UTF-8''paper\.pdf/
  );
  assert.ok(got.bytes.equals(fs.readFileSync(PDF)));

  // A source refers to the asset by ID
  await api.put("/v1/projects/p1", project("P"));
  const put = await api.put("/v1/sources/f1", {
    ...source("p1", "paper.pdf"),
    ingestType: "file",
    assetId: asset.id,
  });
  assert.equal(put.status, 201);
  assert.equal(put.body.source.assetId, asset.id);
  await svc.stop();
});

test("requests are validated and cannot reach arbitrary files", async () => {
  const dataDir = tempDir("validate");
  const svc = await startService(dataDir, [
    "--allow-origin",
    "null",
    "--max-upload-mb",
    "0.001",
  ]);
  const api = client(svc);
  const bearer = { Authorization: `Bearer ${svc.token}` };

  // Token
  assert.equal((await rawRequest(svc, { path: "/v1/projects" })).status, 401);
  assert.equal(
    (
      await rawRequest(svc, {
        path: "/v1/projects",
        headers: { Authorization: "Bearer wrong" },
      })
    ).status,
    401
  );
  assert.equal((await rawRequest(svc, { path: "/health" })).status, 200);

  // Host and Origin
  assert.equal(
    (
      await rawRequest(svc, {
        path: "/v1/projects",
        headers: { ...bearer, Host: `evil.example:${svc.port}` },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await rawRequest(svc, {
        path: "/v1/projects",
        headers: { ...bearer, Origin: "https://evil.example" },
      })
    ).status,
    403
  );
  const allowed = await rawRequest(svc, {
    path: "/v1/projects",
    headers: { ...bearer, Origin: "null" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers["access-control-allow-origin"], "null");

  // Paths and IDs
  for (const p of [
    "/v1/assets/..%2F..%2Flibrary.sqlite/content",
    "/v1/assets/%2E%2E/content",
    "/v1/assets/00000000-0000-4000-8000-000000000000/content",
  ]) {
    const res = await rawRequest(svc, { path: p, headers: bearer });
    assert.ok([400, 404].includes(res.status), `${p} -> ${res.status}`);
    assert.ok(
      !res.body.includes("SQLite format"),
      `${p} returned database bytes`
    );
  }
  assert.equal((await api.put("/v1/projects/..", project("x"))).status, 404);
  assert.equal(
    (await api.put("/v1/projects/bad%20id", project("x"))).status,
    400
  );

  // Bodies
  assert.equal(
    (await api.put("/v1/projects/p1", { name: "", parentId: null, data: {} }))
      .status,
    400
  );
  assert.equal(
    (await api.put("/v1/projects/p1", { ...project("x"), extra: 1 })).status,
    400
  );
  assert.equal(
    (await api.put("/v1/projects/p1", { ...project("x"), id: "other" })).status,
    400
  );
  assert.equal(
    (await api.put("/v1/sources/s1", source("missing", "x"))).status,
    409
  );
  await api.put("/v1/projects/p1", project("x"));
  assert.equal(
    (
      await api.put("/v1/sources/s1", {
        ...source("p1", "x"),
        assetId: "00000000-0000-4000-8000-000000000000",
      })
    ).status,
    409
  );
  assert.equal(
    (
      await api.put("/v1/sources/s1", {
        ...source("p1", "x"),
        ingestType: "exe",
      })
    ).status,
    400
  );

  // Upload limits and headers
  const big = path.join(tempDir("big"), "big.bin");
  fs.writeFileSync(big, Buffer.alloc(4096, 1));
  assert.equal(
    (await api.upload(big, "big.bin", "application/octet-stream")).status,
    413
  );
  const noName = await fetch(`${svc.url}/v1/assets`, {
    method: "POST",
    headers: bearer,
    body: "x",
  });
  assert.equal(noName.status, 400);

  // Nothing partial remains after rejected uploads
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "assets", "tmp")), []);
  await svc.stop();
});

test("one process per data directory, clean shutdown on SIGTERM and stdin close", async () => {
  const dataDir = tempDir("lock");
  const svc = await startService(dataDir);

  const second = cli(["serve", "--data-dir", dataDir], {
    KC_STORAGE_TOKEN: "x".repeat(64),
  });
  assert.equal(second.status, 1);
  assert.match(second.stderr, /in use by process/);

  assert.equal(await svc.stop(), 0);
  assert.ok(!fs.existsSync(path.join(dataDir, "storage.lock")));

  const viaStdin = await startService(dataDir, ["--exit-on-stdin-close"]);
  viaStdin.child.stdin!.end();
  const [code] = await once(viaStdin.child, "exit");
  assert.equal(code, 0);
  assert.match(viaStdin.stderr(), /stdin closed/);
});

test("serve fails clearly without a token", () => {
  const result = cli(["serve", "--data-dir", tempDir("notoken")], {
    KC_STORAGE_TOKEN: "",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /KC_STORAGE_TOKEN/);
});

test("text uploads keep their content", async () => {
  const svc = await startService(tempDir("text"));
  const api = client(svc);
  const up = await api.upload(TXT, "recovery-note.txt", "text/plain");
  assert.equal(up.status, 201);
  assert.ok(
    (await api.content(up.body.asset.id)).bytes.equals(fs.readFileSync(TXT))
  );
  await svc.stop();
});
