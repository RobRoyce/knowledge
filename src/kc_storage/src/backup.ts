/*
 * Portable library backup: a tar file with manifest.json and assets/<id>.
 * It holds projects, sources, and managed files. It does not hold chat
 * history, UI preferences, settings, or credentials.
 */

import fs from "node:fs";
import path from "node:path";
import type { Writable } from "node:stream";
import type { LibraryBackupManifest } from "../../kc_contracts/storage.ts";
import { DATABASE_FILE, openDataDir, type DataDir } from "./datadir.ts";
import { SCHEMA_VERSION, transaction } from "./db.ts";
import type { StagedFile } from "./assets.ts";
import {
  readTarEntry,
  readTarIndex,
  streamTarEntry,
  TarWriter,
} from "./tar.ts";
import { validAssetId, validProject, validSource } from "./validate.ts";
import { VERSION } from "./version.ts";

export const BACKUP_FORMAT = "knowledge-library-backup";

export async function writeBackup(dir: DataDir, out: Writable) {
  const { library, assets } = dir;
  const manifest: LibraryBackupManifest = {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    service: { version: VERSION, schemaVersion: SCHEMA_VERSION },
    projects: library.listProjects(),
    sources: library.listSources(),
    assets: library.listAssets().map((a) => ({ ...a, path: `assets/${a.id}` })),
  };

  for (const asset of manifest.assets) {
    if (!assets.exists(asset.id)) {
      throw new Error(`Managed file for asset ${asset.id} is missing.`);
    }
  }

  const tar = new TarWriter(out);
  await tar.addBuffer(
    "manifest.json",
    Buffer.from(JSON.stringify(manifest, null, 2))
  );
  for (const asset of manifest.assets) {
    await tar.addFile(asset.path, assets.pathFor(asset.id));
  }
  await tar.finish();
  return manifest;
}

export interface RestoreSummary {
  projects: number;
  sources: number;
  assets: number;
}

/**
 * Restore a backup into a new or empty data directory. Validates the
 * manifest and every file hash before the database changes.
 */
export async function restoreBackup(
  archive: string,
  root: string
): Promise<RestoreSummary> {
  if (fs.existsSync(path.join(root, DATABASE_FILE))) {
    const probe = openDataDir(root);
    const empty = probe.library.isEmpty();
    probe.close();
    if (!empty) {
      throw new Error(
        `The data directory ${root} already has a library. Use an empty directory.`
      );
    }
  }

  const index = readTarIndex(archive);
  const manifestEntry = index.get("manifest.json");
  if (!manifestEntry) {
    throw new Error("The backup has no manifest.json.");
  }
  const manifest = JSON.parse(
    readTarEntry(archive, manifestEntry).toString("utf8")
  );
  if (manifest?.format !== BACKUP_FORMAT || manifest.version !== 1) {
    throw new Error("The file is not a knowledge-library-backup version 1.");
  }

  const projects = (manifest.projects ?? []).map((p: any) =>
    validProject(p.id, p)
  );
  const sources = (manifest.sources ?? []).map((s: any) =>
    validSource(s.id, s)
  );
  const assetList = (manifest.assets ?? []).map((a: any) => {
    validAssetId(a.id);
    const entry = index.get(`assets/${a.id}`);
    if (!entry || entry.size !== a.size) {
      throw new Error(`The backup has no valid file for asset ${a.id}.`);
    }
    return { record: a, entry };
  });

  const dir = openDataDir(root);
  const staged: { id: string; file: StagedFile }[] = [];
  try {
    for (const { record, entry } of assetList) {
      const file = await dir.assets.stage(
        streamTarEntry(archive, entry),
        Number.MAX_SAFE_INTEGER
      );
      staged.push({ id: record.id, file });
      if (file.sha256 !== record.sha256) {
        throw new Error(
          `Hash mismatch for asset ${record.id}. The backup is damaged.`
        );
      }
    }

    const createdAt = new Map<string, string>();
    for (const r of [
      ...(manifest.projects ?? []),
      ...(manifest.sources ?? []),
    ]) {
      if (r.createdAt) createdAt.set(r.id, r.createdAt);
    }

    transaction(dir.db, () => {
      for (const { record } of assetList) {
        dir.library.insertAsset({
          id: record.id,
          sha256: record.sha256,
          size: record.size,
          mediaType: record.mediaType,
          filename: record.filename,
          originalPath: record.originalPath ?? null,
          createdAt: record.createdAt,
        });
      }
      for (const p of projects) dir.library.putProject(p, createdAt.get(p.id));
      for (const s of sources) dir.library.putSource(s, createdAt.get(s.id));
      for (const { id, file } of staged) dir.assets.commit(file, id);
    });
    return {
      projects: projects.length,
      sources: sources.length,
      assets: assetList.length,
    };
  } catch (e) {
    for (const { id, file } of staged) {
      dir.assets.discard(file);
      if (!dir.library.getAsset(id)) dir.assets.remove(id);
    }
    throw e;
  } finally {
    dir.close();
  }
}
