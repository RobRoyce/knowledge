/*
 * A data directory: library.sqlite, assets/, migrations/, and a lock file.
 * Only one process may open a data directory at a time.
 */

import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { AssetStore } from "./assets.ts";
import { openDatabase } from "./db.ts";
import { Library } from "./library.ts";

export interface DataDir {
  root: string;
  db: DatabaseSync;
  library: Library;
  assets: AssetStore;
  /** Files removed at open because no record referred to them. */
  swept: string[];
  close(): void;
}

export const DATABASE_FILE = "library.sqlite";

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code === "EPERM";
  }
}

function acquireLock(root: string): () => void {
  const lockPath = path.join(root, "storage.lock");
  const content = JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockPath, content, { flag: "wx" });
      return () => {
        try {
          const held = JSON.parse(fs.readFileSync(lockPath, "utf8"));
          if (held.pid === process.pid) {
            fs.rmSync(lockPath, { force: true });
          }
        } catch {
          // The lock file is already gone
        }
      };
    } catch (e: any) {
      if (e.code !== "EEXIST") {
        throw e;
      }
      let holder = 0;
      try {
        holder = JSON.parse(fs.readFileSync(lockPath, "utf8")).pid;
      } catch {
        // Unreadable lock file: treat as stale
      }
      if (holder && holder !== process.pid && alive(holder)) {
        throw new Error(
          `The data directory ${root} is in use by process ${holder}.`
        );
      }
      fs.rmSync(lockPath, { force: true });
    }
  }
  throw new Error(`Could not lock the data directory ${root}.`);
}

export function openDataDir(root: string): DataDir {
  const resolved = path.resolve(root);
  fs.mkdirSync(resolved, { recursive: true });
  const release = acquireLock(resolved);

  try {
    const db = openDatabase(path.join(resolved, DATABASE_FILE));
    const library = new Library(db);
    const assets = new AssetStore(path.join(resolved, "assets"));

    // Recover from an interrupted upload, migration, or restore
    const swept = assets.sweep(library.assetIds());

    return {
      root: resolved,
      db,
      library,
      assets,
      swept,
      close() {
        db.close();
        release();
      },
    };
  } catch (e) {
    release();
    throw e;
  }
}
