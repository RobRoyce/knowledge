/*
 * Minimal POSIX ustar writer and reader for backups. Regular files only.
 */

import fs from "node:fs";
import { once } from "node:events";
import { Readable, type Writable } from "node:stream";

const BLOCK = 512;

function header(name: string, size: number, mtime: Date): Buffer {
  if (Buffer.byteLength(name) > 100) {
    throw new Error(`Tar entry name is too long: ${name}`);
  }
  const h = Buffer.alloc(BLOCK);
  const octal = (value: number, length: number) =>
    value.toString(8).padStart(length - 1, "0") + "\0";

  h.write(name, 0, 100, "utf8");
  h.write(octal(0o644, 8), 100, 8, "ascii");
  h.write(octal(0, 8), 108, 8, "ascii");
  h.write(octal(0, 8), 116, 8, "ascii");
  h.write(octal(size, 12), 124, 12, "ascii");
  h.write(octal(Math.floor(mtime.getTime() / 1000), 12), 136, 12, "ascii");
  h.write("        ", 148, 8, "ascii");
  h.write("0", 156, 1, "ascii");
  h.write("ustar\0", 257, 6, "ascii");
  h.write("00", 263, 2, "ascii");

  let sum = 0;
  for (const byte of h) sum += byte;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return h;
}

function padding(size: number) {
  return Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK);
}

export class TarWriter {
  private out: Writable;

  constructor(out: Writable) {
    this.out = out;
  }

  private async write(chunk: Buffer) {
    if (!this.out.write(chunk)) {
      await once(this.out, "drain");
    }
  }

  async addBuffer(name: string, data: Buffer) {
    await this.write(header(name, data.length, new Date()));
    await this.write(data);
    await this.write(padding(data.length));
  }

  async addFile(name: string, file: string) {
    const { size, mtime } = fs.statSync(file);
    await this.write(header(name, size, mtime));
    let written = 0;
    for await (const chunk of fs.createReadStream(file)) {
      written += chunk.length;
      await this.write(chunk);
    }
    if (written !== size) {
      throw new Error(`File changed while it was being archived: ${file}`);
    }
    await this.write(padding(size));
  }

  async finish() {
    await this.write(Buffer.alloc(BLOCK * 2));
  }
}

export interface TarEntry {
  name: string;
  offset: number;
  size: number;
}

/** Read the entry index of a tar file. Validates every header checksum. */
export function readTarIndex(file: string): Map<string, TarEntry> {
  const fd = fs.openSync(file, "r");
  const entries = new Map<string, TarEntry>();
  try {
    const total = fs.fstatSync(fd).size;
    const h = Buffer.alloc(BLOCK);
    let offset = 0;

    while (offset + BLOCK <= total) {
      fs.readSync(fd, h, 0, BLOCK, offset);
      if (h.every((b) => b === 0)) {
        return entries;
      }

      const stored = parseInt(h.toString("ascii", 148, 156).trim(), 8);
      let sum = 0;
      for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
      if (stored !== sum) {
        throw new Error(`Invalid tar header checksum at offset ${offset}.`);
      }

      const name = h.toString("utf8", 0, 100).replace(/\0.*$/s, "");
      const size = parseInt(h.toString("ascii", 124, 136).trim(), 8);
      const type = h.toString("ascii", 156, 157);
      if (!Number.isFinite(size) || size < 0 || offset + BLOCK + size > total) {
        throw new Error(`Invalid tar entry size for ${name}.`);
      }
      if (type === "0" || type === "\0") {
        entries.set(name, { name, offset: offset + BLOCK, size });
      }
      offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    }
    throw new Error("The tar file ends without an end-of-archive marker.");
  } finally {
    fs.closeSync(fd);
  }
}

export function readTarEntry(file: string, entry: TarEntry): Buffer {
  const buf = Buffer.alloc(entry.size);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buf, 0, entry.size, entry.offset);
  } finally {
    fs.closeSync(fd);
  }
  return buf;
}

export function streamTarEntry(file: string, entry: TarEntry) {
  if (entry.size === 0) {
    return Readable.from([]);
  }
  return fs.createReadStream(file, {
    start: entry.offset,
    end: entry.offset + entry.size - 1,
  });
}
