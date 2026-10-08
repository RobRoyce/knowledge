/*
 * Prepare the Node.js runtime that the desktop package uses to run the
 * storage service.
 *
 *   node scripts/prepare-node-runtime.mjs [--platform darwin] [--arch arm64]
 *
 * Downloads the official archive from nodejs.org, checks its SHA-256
 * against the value pinned here and against the upstream SHASUMS256.txt,
 * and extracts bin/node and LICENSE to vendor/node/<platform>-<arch>/.
 * The archive is cached in vendor/node/cache/. Run it again: it does
 * nothing when the runtime is already prepared.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const VERSION = "24.21.0";

/** SHA-256 of node-v<VERSION>-<platform>-<arch>.tar.gz, from SHASUMS256.txt. */
const PINNED_SHA256 = {
  "darwin-arm64":
    "bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057",
  "darwin-x64":
    "1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097",
};

const ROOT = path.resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    platform: { type: "string", default: process.platform },
    arch: { type: "string", default: process.arch },
  },
});

const target = `${values.platform}-${values.arch}`;
const expected = PINNED_SHA256[target];
if (!expected) {
  console.error(
    `No pinned Node.js runtime for ${target}. Supported: ${Object.keys(PINNED_SHA256).join(", ")}`
  );
  process.exit(1);
}

const name = `node-v${VERSION}-${target}`;
const archiveName = `${name}.tar.gz`;
const baseUrl = `https://nodejs.org/dist/v${VERSION}`;
const outDir = path.join(ROOT, "vendor", "node", target);
const cacheDir = path.join(ROOT, "vendor", "node", "cache");
const stamp = path.join(outDir, "VERSION");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${url} (${res.status})`);
  }
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === `${VERSION} ${expected}`) {
  console.log(`Node.js ${VERSION} for ${target} is ready: ${outDir}`);
  process.exit(0);
}

fs.mkdirSync(cacheDir, { recursive: true });
const archive = path.join(cacheDir, archiveName);
if (!fs.existsSync(archive) || sha256(archive) !== expected) {
  console.log(`Downloading ${baseUrl}/${archiveName}`);
  await download(`${baseUrl}/${archiveName}`, archive);
}

const actual = sha256(archive);
if (actual !== expected) {
  fs.rmSync(archive, { force: true });
  throw new Error(`SHA-256 mismatch for ${archiveName}: got ${actual}, pinned ${expected}`);
}

const sums = await (await fetch(`${baseUrl}/SHASUMS256.txt`)).text();
const upstream = sums
  .split("\n")
  .map((line) => line.trim().split(/\s+/))
  .find(([, file]) => file === archiveName)?.[0];
if (upstream !== expected) {
  throw new Error(`Upstream SHASUMS256.txt does not match the pinned hash for ${archiveName}.`);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "bin"), { recursive: true });
execFileSync("tar", [
  "-xzf",
  archive,
  "-C",
  outDir,
  "--strip-components=1",
  `${name}/bin/node`,
  `${name}/LICENSE`,
]);

const reported = execFileSync(path.join(outDir, "bin", "node"), ["--version"], {
  encoding: "utf8",
}).trim();
if (reported !== `v${VERSION}`) {
  throw new Error(`Extracted runtime reports ${reported}, expected v${VERSION}.`);
}

fs.writeFileSync(stamp, `${VERSION} ${expected}\n`);
console.log(`Node.js ${VERSION} for ${target} is ready: ${outDir} (sha256 ${expected})`);
