import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FIXTURES,
  cli,
  client,
  startService,
  stopAll,
  tempDir,
} from "./helpers.ts";

afterEach(stopAll);

async function populate(dataDir: string, work: string) {
  const pdf = path.join(work, "paper.pdf");
  const txt = path.join(work, "note.txt");
  fs.copyFileSync(path.join(FIXTURES, "recovery-fixture.pdf"), pdf);
  fs.copyFileSync(path.join(FIXTURES, "recovery-note.txt"), txt);

  const svc = await startService(dataDir);
  const api = client(svc);
  await api.put("/v1/projects/p1", {
    name: "Backup Project",
    parentId: null,
    data: { description: "d" },
  });
  await api.put("/v1/projects/p2", { name: "Child", parentId: "p1", data: {} });
  const a1 = (await api.upload(pdf, "paper.pdf", "application/pdf", pdf)).body
    .asset;
  const a2 = (await api.upload(txt, "note.txt", "text/plain", txt)).body.asset;
  const file = (id: string, title: string, assetId: string) => ({
    projectId: "p1",
    title,
    ingestType: "file",
    assetId,
    data: { topics: ["x"], meta: [{ key: "annotation", value: title }] },
  });
  await api.put("/v1/sources/s-pdf", file("s-pdf", "paper.pdf", a1.id));
  await api.put("/v1/sources/s-txt", file("s-txt", "note.txt", a2.id));
  await api.put("/v1/sources/s-web", {
    projectId: "p2",
    title: "Site",
    ingestType: "website",
    assetId: null,
    data: { accessLink: "https://example.com/" },
  });
  return { svc, api, pdf, txt, assets: [a1, a2] };
}

async function snapshot(api: ReturnType<typeof client>) {
  const strip = (r: any) => {
    const { updatedAt, ...rest } = r;
    return rest;
  };
  return {
    projects: (await api.get("/v1/projects")).body.projects.map(strip),
    sources: (await api.get("/v1/sources")).body.sources.map(strip),
  };
}

test("backup restores into a different directory without the original files", async () => {
  const work = tempDir("bk-work");
  const source = tempDir("bk-source");
  const { svc, api, pdf, txt, assets } = await populate(source, work);
  const expected = await snapshot(api);
  const bytes = {
    [assets[0].id]: fs.readFileSync(pdf),
    [assets[1].id]: fs.readFileSync(txt),
  };

  // Backup over HTTP and through the command line
  const res = await fetch(`${svc.url}/v1/backup`, {
    headers: { Authorization: `Bearer ${svc.token}` },
  });
  assert.equal(res.status, 200);
  assert.match(
    res.headers.get("content-disposition")!,
    /knowledge-library-.*\.tar/
  );
  const httpTar = path.join(work, "http.tar");
  fs.writeFileSync(httpTar, Buffer.from(await res.arrayBuffer()));
  await svc.stop();

  const cliTar = path.join(work, "cli.tar");
  const made = cli(["backup", "--data-dir", source, "--out", cliTar]);
  assert.equal(made.status, 0, made.stderr);
  assert.deepEqual(JSON.parse(made.stdout).assets, 2);

  // The originals are no longer available
  fs.rmSync(pdf);
  fs.rmSync(txt);

  for (const tar of [httpTar, cliTar]) {
    const target = tempDir("bk-target");
    const restored = cli(["restore", "--data-dir", target, "--from", tar]);
    assert.equal(restored.status, 0, restored.stderr);
    assert.deepEqual(JSON.parse(restored.stdout).restored, {
      projects: 2,
      sources: 3,
      assets: 2,
    });

    const svc2 = await startService(target);
    const api2 = client(svc2);
    assert.deepEqual(await snapshot(api2), expected);
    for (const asset of assets) {
      const meta = (await api2.get(`/v1/assets/${asset.id}`)).body.asset;
      assert.deepEqual(meta, asset);
      assert.ok((await api2.content(asset.id)).bytes.equals(bytes[asset.id]));
    }
    await svc2.stop();
  }
});

test("restore refuses a directory that already has a library", async () => {
  const work = tempDir("bk2-work");
  const source = tempDir("bk2-source");
  const { svc } = await populate(source, work);
  await svc.stop();
  const tar = path.join(work, "b.tar");
  assert.equal(cli(["backup", "--data-dir", source, "--out", tar]).status, 0);

  const result = cli(["restore", "--data-dir", source, "--from", tar]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already has a library/);
});

test("a damaged backup is rejected and leaves the target empty", async () => {
  const work = tempDir("bk3-work");
  const source = tempDir("bk3-source");
  const { svc } = await populate(source, work);
  await svc.stop();
  const tar = path.join(work, "b.tar");
  assert.equal(cli(["backup", "--data-dir", source, "--out", tar]).status, 0);

  // Change one byte inside the last asset's content (before the end blocks)
  const buf = fs.readFileSync(tar);
  const marker = buf.indexOf("Knowledge recovery test note");
  assert.ok(marker > 0);
  buf[marker] ^= 0xff;
  fs.writeFileSync(tar, buf);

  const target = tempDir("bk3-target");
  const result = cli(["restore", "--data-dir", target, "--from", tar]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Hash mismatch/);

  const svc2 = await startService(target);
  const api2 = client(svc2);
  assert.deepEqual((await api2.get("/v1/projects")).body.projects, []);
  const assetDirs = fs
    .readdirSync(path.join(target, "assets"))
    .filter((d) => d !== "tmp");
  assert.deepEqual(
    assetDirs.flatMap((d) => fs.readdirSync(path.join(target, "assets", d))),
    []
  );
  await svc2.stop();
});

test("the manifest holds no credentials and states its format", async () => {
  const work = tempDir("bk4-work");
  const source = tempDir("bk4-source");
  const { svc } = await populate(source, work);
  const res = await fetch(`${svc.url}/v1/backup`, {
    headers: { Authorization: `Bearer ${svc.token}` },
  });
  const tar = Buffer.from(await res.arrayBuffer());
  assert.ok(!tar.includes(Buffer.from(svc.token)));
  const manifest = JSON.parse(
    tar
      .subarray(512, 512 + parseInt(tar.toString("ascii", 124, 135), 8))
      .toString()
  );
  assert.equal(manifest.format, "knowledge-library-backup");
  assert.equal(manifest.version, 1);
  assert.equal(manifest.service.schemaVersion, 1);
  assert.deepEqual(
    manifest.assets.map((a: any) => a.path).sort(),
    manifest.assets.map((a: any) => `assets/${a.id}`).sort()
  );
  await svc.stop();
});
