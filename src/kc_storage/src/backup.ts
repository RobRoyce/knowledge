/*
 * Portable library backup: a tar file with manifest.json and assets/<id>.
 * It holds projects, sources, and managed files. It does not hold chat
 * history, UI preferences, settings, or credentials.
 */

import type { Writable } from "node:stream";
import type { LibraryBackupManifest } from "../../kc_contracts/storage.ts";
import type { DataDir } from "./datadir.ts";
import { SCHEMA_VERSION } from "./db.ts";
import { TarWriter } from "./tar.ts";
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
