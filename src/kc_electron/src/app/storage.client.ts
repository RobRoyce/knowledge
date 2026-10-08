/*
 * Copyright (c) 2026 Rob Royce
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*
 * Desktop functions that need both the local filesystem and the storage
 * service. The renderer reaches them only through these IPC channels:
 *
 *   A2E:Storage:ImportFile  path -> AssetRecord (copy a local file into storage)
 *   A2E:Storage:OpenAsset   assetId -> open the managed file in its default app
 *
 * Thumbnails and chat text extraction use materializeAsset().
 */

import fs from "fs";
import http from "http";
import path from "path";
import { ipcMain, shell } from "electron";
import type { AssetRecord } from "../../../kc_contracts/storage";
import { BackendEndpoint } from "./backend";

const ASSET_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let endpoint: Promise<BackendEndpoint> | undefined;
let cacheDir = "";

function request(
  method: string,
  route: string,
  headers: http.OutgoingHttpHeaders = {}
): Promise<{
  ep: BackendEndpoint;
  req: http.ClientRequest;
  res: Promise<http.IncomingMessage>;
}> {
  if (!endpoint) {
    throw new Error("Storage client is not configured.");
  }
  return endpoint.then((ep) => {
    if (!ep.url || !ep.token) {
      throw new Error(ep.error ?? "Storage service unavailable.");
    }
    let resolveRes: (r: http.IncomingMessage) => void = () => undefined;
    let rejectRes: (e: Error) => void = () => undefined;
    const res = new Promise<http.IncomingMessage>((ok, fail) => {
      resolveRes = ok;
      rejectRes = fail;
    });
    const req = http.request(`${ep.url}${route}`, {
      method,
      headers: { ...headers, Authorization: `Bearer ${ep.token}` },
    });
    req.on("response", resolveRes);
    req.on("error", rejectRes);
    return { ep, req, res };
  });
}

async function readBody(res: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function errorFrom(res: http.IncomingMessage) {
  const text = await readBody(res);
  try {
    return new Error(JSON.parse(text).error.message);
  } catch {
    return new Error(`Storage service returned ${res.statusCode}.`);
  }
}

/** Copy a local file into managed storage. The original is not changed. */
export async function importFile(
  filePath: string,
  mediaType?: string
): Promise<AssetRecord> {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${resolved}`);
  }
  const { req, res } = await request("POST", "/v1/assets", {
    "Content-Type": mediaType || "application/octet-stream",
    "Content-Length": stat.size,
    "x-knowledge-filename": encodeURIComponent(path.basename(resolved)),
    "x-knowledge-original-path": encodeURIComponent(resolved),
  });
  fs.createReadStream(resolved).pipe(req);
  const response = await res;
  if (response.statusCode !== 201) {
    throw await errorFrom(response);
  }
  return JSON.parse(await readBody(response)).asset;
}

/**
 * A local copy of a managed file, for functions that need a path
 * (thumbnails, default app, text extraction). Cached by asset ID.
 */
export async function materializeAsset(assetId: string): Promise<string> {
  if (!ASSET_ID.test(assetId)) {
    throw new Error("Invalid asset ID.");
  }
  const meta = await request("GET", `/v1/assets/${assetId}`);
  meta.req.end();
  const metaRes = await meta.res;
  if (metaRes.statusCode !== 200) {
    throw await errorFrom(metaRes);
  }
  const asset: AssetRecord = JSON.parse(await readBody(metaRes)).asset;

  const target = path.join(cacheDir, assetId, path.basename(asset.filename));
  if (fs.existsSync(target) && fs.statSync(target).size === asset.size) {
    return target;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const content = await request("GET", `/v1/assets/${assetId}/content`);
  content.req.end();
  const contentRes = await content.res;
  if (contentRes.statusCode !== 200) {
    throw await errorFrom(contentRes);
  }
  const partial = `${target}.partial`;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(partial);
    contentRes.pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
    contentRes.on("error", reject);
  });
  fs.renameSync(partial, target);
  return target;
}

export function configureStorageClient(
  storage: Promise<BackendEndpoint>,
  assetCacheDir: string
) {
  endpoint = storage;
  cacheDir = assetCacheDir;

  ipcMain.handle(
    "A2E:Storage:ImportFile",
    (_event, args: { path: string; mediaType?: string }) =>
      importFile(args.path, args.mediaType)
  );

  ipcMain.handle("A2E:Storage:OpenAsset", async (_event, assetId: string) => {
    const file = await materializeAsset(assetId);
    const outcome = await shell.openPath(file);
    if (outcome) {
      throw new Error(outcome);
    }
    return true;
  });
}
