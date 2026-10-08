/*
 * Managed file storage. Files live at assets/<first two chars>/<assetId>.
 * New content goes to assets/tmp first and moves into place after the
 * hash and size are known.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";
import { tooLarge } from "./errors.ts";
import { validAssetId } from "./validate.ts";

export interface StagedFile {
  tmpPath: string;
  sha256: string;
  size: number;
}

export class AssetStore {
  readonly root: string;
  private tmpDir: string;

  constructor(root: string) {
    this.root = root;
    this.tmpDir = path.join(root, "tmp");
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  /** Path of a managed file. Only a valid asset ID can form a path. */
  pathFor(id: string): string {
    validAssetId(id);
    return path.join(this.root, id.slice(0, 2), id);
  }

  /** Write a stream to a temporary file and hash it. */
  async stage(input: Readable, maxBytes: number): Promise<StagedFile> {
    const tmpPath = path.join(this.tmpDir, crypto.randomUUID());
    const hash = crypto.createHash("sha256");
    let size = 0;

    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        size += chunk.length;
        if (size > maxBytes) {
          done(tooLarge(`The file is larger than ${maxBytes} bytes.`));
          return;
        }
        hash.update(chunk);
        done(null, chunk);
      },
    });

    try {
      await pipeline(
        input,
        meter,
        fs.createWriteStream(tmpPath, { flags: "wx" })
      );
    } catch (e) {
      fs.rmSync(tmpPath, { force: true });
      throw e;
    }
    return { tmpPath, sha256: hash.digest("hex"), size };
  }

  /** Move a staged file to its permanent path. */
  commit(staged: StagedFile, id: string) {
    const target = this.pathFor(id);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(staged.tmpPath, target);
  }

  discard(staged: StagedFile) {
    fs.rmSync(staged.tmpPath, { force: true });
  }

  remove(id: string) {
    fs.rmSync(this.pathFor(id), { force: true });
  }

  exists(id: string): boolean {
    return fs.existsSync(this.pathFor(id));
  }

  /**
   * Remove temporary files and files with no database record. Call only
   * while this process holds the data-directory lock and no request runs.
   */
  sweep(known: Set<string>): string[] {
    const removed: string[] = [];
    for (const entry of fs.readdirSync(this.tmpDir)) {
      fs.rmSync(path.join(this.tmpDir, entry), {
        force: true,
        recursive: true,
      });
      removed.push(`tmp/${entry}`);
    }
    for (const dir of fs.readdirSync(this.root)) {
      if (dir === "tmp" || !/^[0-9a-f]{2}$/.test(dir)) {
        continue;
      }
      for (const file of fs.readdirSync(path.join(this.root, dir))) {
        if (!known.has(file)) {
          fs.rmSync(path.join(this.root, dir, file), { force: true });
          removed.push(`${dir}/${file}`);
        }
      }
    }
    return removed;
  }
}
