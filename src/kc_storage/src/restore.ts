/*
 * Library restore in two steps.
 *
 *   stageRestore()    Validate the whole backup and copy its files into a
 *                     staging directory. The active library does not change.
 *   activateRestore() One synchronous step: check that the library is
 *                     empty, insert the records, move the staged files into
 *                     place, commit. No other request runs during it.
 *
 * If the process stops during activation, SQLite discards the transaction
 * and the next start removes files without records and old staging
 * directories. The library is empty again.
 *
 * The command line and the HTTP API both use this module.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AssetRecord,
  ProjectRecord,
  RestorePreview,
  SourceRecord,
} from "../../kc_contracts/storage.ts";
import type { StagedFile } from "./assets.ts";
import { RESTORE_DIR, type DataDir } from "./datadir.ts";
import { transaction } from "./db.ts";
import { conflict } from "./errors.ts";
import { readTarEntry, readTarIndex, streamTarEntry } from "./tar.ts";
import { validAssetId, validProject, validSource } from "./validate.ts";
import { BACKUP_FORMAT } from "./backup.ts";

export const SUPPORTED_BACKUP_VERSIONS = [1];

export const RESTORE_LIMITS = {
  archiveBytes: 8 * 1024 ** 3,
  manifestBytes: 64 * 1024 ** 2,
  entries: 1_000_000,
  assetBytes: 2 * 1024 ** 3,
};

/** What a library backup never contains. Shown before confirmation. */
export const NOT_IN_LIBRARY_BACKUP = [
  "Chat history",
  "Inbox and UI preferences",
  "Application settings",
  "API keys",
  "Extracted-text cache",
];

const ASSET_ENTRY =
  /^assets\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A validated backup with its files in a staging directory. */
export interface StagedRestore {
  id: string;
  dir: string;
  preview: RestorePreview;
  projects: ProjectRecord[];
  sources: SourceRecord[];
  assets: { record: AssetRecord; file: StagedFile }[];
  createdAt: Map<string, string>;
}

export interface RestoreResult {
  projects: number;
  sources: number;
  assets: number;
}

export class RestoreError extends Error {}

function fail(message: string): never {
  throw new RestoreError(message);
}

/** Refuse a library that has user records. Never merge or replace them. */
export function assertEmpty(dir: DataDir) {
  const counts = dir.library.counts();
  if (counts.projects + counts.sources + counts.assets > 0) {
    const n = (count: number, noun: string) =>
      `${count} ${noun}${count === 1 ? "" : "s"}`;
    throw conflict(
      `Restore needs an empty library. This library has ${n(
        counts.projects,
        "project"
      )}, ` +
        `${n(counts.sources, "source")}, and ${n(counts.assets, "file")}. ` +
        "Restore into a new profile instead. Existing data is not changed."
    );
  }
}

/** New staging directory inside the data directory (same filesystem). */
export function newStagingDir(dir: DataDir) {
  const id = crypto.randomUUID();
  const stagingDir = path.join(dir.root, RESTORE_DIR, id);
  fs.mkdirSync(path.join(stagingDir, "files"), { recursive: true });
  return { id, stagingDir };
}

/**
 * Validate a backup archive and stage its files. Throws RestoreError with
 * a user-facing message. Removes the staging directory on failure.
 */
export async function stageRestore(
  dir: DataDir,
  archive: string,
  staging = newStagingDir(dir)
): Promise<StagedRestore> {
  const { id, stagingDir } = staging;
  try {
    const size = fs.statSync(archive).size;
    if (size > RESTORE_LIMITS.archiveBytes) {
      fail(`The backup is larger than ${RESTORE_LIMITS.archiveBytes} bytes.`);
    }

    let index;
    try {
      index = readTarIndex(archive, {
        allowName: (name) => name === "manifest.json" || ASSET_ENTRY.test(name),
        maxEntries: RESTORE_LIMITS.entries,
      });
    } catch (e: any) {
      fail(`The file is not a valid library backup: ${e.message}`);
    }

    const manifestEntry = index.get("manifest.json");
    if (!manifestEntry) fail("The backup has no manifest.json.");
    if (manifestEntry.size > RESTORE_LIMITS.manifestBytes) {
      fail("The backup manifest is too large.");
    }
    let manifest: any;
    try {
      manifest = JSON.parse(
        readTarEntry(archive, manifestEntry).toString("utf8")
      );
    } catch {
      fail("The backup manifest is not valid JSON.");
    }
    if (manifest?.format !== BACKUP_FORMAT) {
      fail("The file is not a Knowledge library backup.");
    }
    if (!SUPPORTED_BACKUP_VERSIONS.includes(manifest.version)) {
      fail(
        `Backup version ${
          manifest.version
        } is not supported. Supported versions: ${SUPPORTED_BACKUP_VERSIONS.join(
          ", "
        )}.`
      );
    }
    for (const list of ["projects", "sources", "assets"]) {
      if (!Array.isArray(manifest[list]))
        fail(`The manifest has no ${list} list.`);
    }

    // Records
    const projects: ProjectRecord[] = [];
    const sources: SourceRecord[] = [];
    const createdAt = new Map<string, string>();
    const unique = (seen: Set<string>, id: string, kind: string) => {
      if (seen.has(id)) fail(`Duplicate ${kind} ID ${id} in the backup.`);
      seen.add(id);
    };
    const projectIds = new Set<string>();
    for (const p of manifest.projects) {
      let record: ProjectRecord;
      try {
        record = validProject(p?.id, p);
      } catch (e: any) {
        fail(`Invalid project ${JSON.stringify(p?.id)}: ${e.message}`);
      }
      unique(projectIds, record.id, "project");
      projects.push(record);
      if (typeof p.createdAt === "string")
        createdAt.set(`p:${record.id}`, p.createdAt);
    }

    // Assets: manifest and archive entries must match one to one
    const assets: StagedRestore["assets"] = [];
    const assetIds = new Set<string>();
    let bytes = 0;
    for (const a of manifest.assets) {
      try {
        validAssetId(a?.id);
      } catch {
        fail(`Invalid asset ID ${JSON.stringify(a?.id)}.`);
      }
      unique(assetIds, a.id, "asset");
      if (
        !Number.isSafeInteger(a.size) ||
        a.size < 0 ||
        a.size > RESTORE_LIMITS.assetBytes
      ) {
        fail(`Invalid size for asset ${a.id}.`);
      }
      if (typeof a.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(a.sha256)) {
        fail(`Invalid SHA-256 for asset ${a.id}.`);
      }
      if (
        typeof a.filename !== "string" ||
        !a.filename ||
        typeof a.mediaType !== "string"
      ) {
        fail(`Invalid filename or media type for asset ${a.id}.`);
      }
      const entry = index.get(`assets/${a.id}`);
      if (!entry)
        fail(
          `The file for asset ${a.id} (${a.filename}) is missing from the backup.`
        );
      if (entry.size !== a.size)
        fail(`The file for asset ${a.id} has the wrong size.`);
      bytes += a.size;
    }
    for (const name of index.keys()) {
      if (
        name !== "manifest.json" &&
        !assetIds.has(name.slice("assets/".length))
      ) {
        fail(`The backup has a file that the manifest does not list: ${name}.`);
      }
    }

    const sourceIds = new Set<string>();
    const usedAssets = new Set<string>();
    for (const s of manifest.sources) {
      let record: SourceRecord;
      try {
        record = validSource(s?.id, s);
      } catch (e: any) {
        fail(`Invalid source ${JSON.stringify(s?.id)}: ${e.message}`);
      }
      unique(sourceIds, record.id, "source");
      if (!projectIds.has(record.projectId)) {
        fail(
          `Source ${record.id} refers to project ${record.projectId}, which is not in the backup.`
        );
      }
      if (record.assetId) {
        if (!assetIds.has(record.assetId)) {
          fail(
            `Source ${record.id} refers to asset ${record.assetId}, which is not in the backup.`
          );
        }
        usedAssets.add(record.assetId);
      }
      sources.push(record);
      if (typeof s.createdAt === "string")
        createdAt.set(`s:${record.id}`, s.createdAt);
    }

    const warnings: string[] = [];
    const dangling = projects.filter(
      (p) => p.parentId && !projectIds.has(p.parentId)
    );
    if (dangling.length > 0) {
      warnings.push(
        `${dangling.length} projects refer to a parent project that is not in the backup.`
      );
    }
    const unused = [...assetIds].filter((id) => !usedAssets.has(id));
    if (unused.length > 0) {
      warnings.push(`${unused.length} files are not used by any source.`);
    }

    // Copy and hash every file before anything becomes active
    const filesDir = path.join(stagingDir, "files");
    for (const a of manifest.assets) {
      const file = await dir.assets.stage(
        streamTarEntry(archive, index.get(`assets/${a.id}`)!),
        RESTORE_LIMITS.assetBytes,
        filesDir
      );
      if (file.sha256 !== a.sha256 || file.size !== a.size) {
        fail(
          `The file for asset ${a.id} (${a.filename}) is damaged. Its SHA-256 does not match.`
        );
      }
      assets.push({
        record: {
          id: a.id,
          sha256: a.sha256,
          size: a.size,
          mediaType: a.mediaType,
          filename: a.filename,
          originalPath:
            typeof a.originalPath === "string" ? a.originalPath : null,
          createdAt:
            typeof a.createdAt === "string"
              ? a.createdAt
              : new Date().toISOString(),
        },
        file,
      });
    }

    const preview: RestorePreview = {
      id,
      backupCreatedAt:
        typeof manifest.createdAt === "string" ? manifest.createdAt : null,
      backupVersion: manifest.version,
      counts: {
        projects: projects.length,
        sources: sources.length,
        assets: assets.length,
        bytes,
      },
      projectNames: projects.slice(0, 50).map((p) => p.name),
      warnings,
      notIncluded: NOT_IN_LIBRARY_BACKUP,
    };
    return {
      id,
      dir: stagingDir,
      preview,
      projects,
      sources,
      assets,
      createdAt,
    };
  } catch (e) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw e;
  }
}

/**
 * Make a staged restore active. Synchronous: no other request runs during
 * it. Refuses a library that has records. Removes the staging directory.
 */
export function activateRestore(
  dir: DataDir,
  staged: StagedRestore
): RestoreResult {
  const moved: string[] = [];
  try {
    transaction(dir.db, () => {
      assertEmpty(dir);
      for (const { record } of staged.assets) dir.library.insertAsset(record);
      for (const p of staged.projects)
        dir.library.putProject(p, staged.createdAt.get(`p:${p.id}`));
      for (const s of staged.sources)
        dir.library.putSource(s, staged.createdAt.get(`s:${s.id}`));

      // Files move before the commit. A stop before the commit leaves files
      // without records, which the next start removes.
      for (const { record, file } of staged.assets) {
        dir.assets.commit(file, record.id);
        moved.push(record.id);
        if (
          process.env.KC_STORAGE_TEST_FAULT === "restore-exit-during-activation"
        ) {
          process.exit(70);
        }
      }
      if (process.env.KC_STORAGE_TEST_FAULT === "restore-fail-before-commit") {
        throw new RestoreError("Injected test fault before commit.");
      }
    });
    return {
      projects: staged.projects.length,
      sources: staged.sources.length,
      assets: staged.assets.length,
    };
  } catch (e) {
    for (const id of moved) dir.assets.remove(id);
    throw e;
  } finally {
    discardRestore(staged);
  }
}

export function discardRestore(staged: { dir: string }) {
  fs.rmSync(staged.dir, { recursive: true, force: true });
}
