/*
 * HTTP API, version 1. See docs/storage-service.md.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  ASSET_FILENAME_HEADER,
  ASSET_ORIGINAL_PATH_HEADER,
  type ErrorResponse,
  type HealthResponse,
} from "../../kc_contracts/storage.ts";
import { writeBackup } from "./backup.ts";
import type { DataDir } from "./datadir.ts";
import { now, SCHEMA_VERSION } from "./db.ts";
import {
  badRequest,
  forbidden,
  notFound,
  StorageError,
  tooLarge,
  unauthorized,
} from "./errors.ts";
import {
  validFilename,
  validId,
  validMediaType,
  validOriginalPath,
  validProject,
  validSource,
} from "./validate.ts";
import { VERSION } from "./version.ts";

export interface ServerOptions {
  dir: DataDir;
  token: string;
  /** Value of the Origin header that may use the API. "null" for file:// pages. */
  allowedOrigins: string[];
  maxJsonBytes?: number;
  maxUploadBytes?: number;
}

const ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  ASSET_FILENAME_HEADER,
  ASSET_ORIGINAL_PATH_HEADER,
].join(", ");

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store",
  });
  res.end(json);
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const type = req.headers["content-type"] ?? "";
  if (!type.startsWith("application/json")) {
    throw badRequest("Content-Type must be application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw tooLarge(`The request body is larger than ${limit} bytes.`);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
}

function tokenMatches(header: string | undefined, token: string) {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? "");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

export function createServer(options: ServerOptions): http.Server {
  const { dir, token, allowedOrigins } = options;
  const { library, assets } = dir;
  const maxJson = options.maxJsonBytes ?? 10 * 1024 * 1024;
  const maxUpload = options.maxUploadBytes ?? 2 * 1024 ** 3;

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    let parts: string[];
    try {
      parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      throw badRequest("The path is not valid percent-encoding.");
    }
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/health") {
      const body: HealthResponse = {
        status: "ok",
        service: "kc-storage",
        version: VERSION,
        schemaVersion: SCHEMA_VERSION,
      };
      return send(res, 200, body);
    }

    if (parts[0] !== "v1") {
      throw notFound(`No route for ${method} ${url.pathname}.`);
    }
    if (!tokenMatches(req.headers.authorization, token)) {
      throw unauthorized("Missing or invalid bearer token.");
    }

    const [, resource, id, sub] = parts;

    if (resource === "projects" && !sub) {
      if (method === "GET" && !id)
        return send(res, 200, { projects: library.listProjects() });
      if (method === "PUT" && id) {
        const record = validProject(id, await readJson(req, maxJson));
        const result = library.putProject(record);
        return send(res, result === "created" ? 201 : 200, {
          project: library.getProject(record.id),
        });
      }
      if (method === "DELETE" && id) {
        if (!library.deleteProject(validId(id)))
          throw notFound(`Project ${id} does not exist.`);
        return send(res, 204);
      }
    }

    if (resource === "sources" && !sub) {
      if (method === "GET" && !id) {
        const projectId = url.searchParams.get("projectId");
        return send(res, 200, {
          sources: library.listSources(
            projectId ? validId(projectId, "projectId") : undefined
          ),
        });
      }
      if (method === "PUT" && id) {
        const record = validSource(id, await readJson(req, maxJson));
        const result = library.putSource(record);
        return send(res, result === "created" ? 201 : 200, {
          source: library.getSource(record.id),
        });
      }
      if (method === "DELETE" && id) {
        if (!library.deleteSource(validId(id)))
          throw notFound(`Source ${id} does not exist.`);
        return send(res, 204);
      }
    }

    if (resource === "assets") {
      if (method === "POST" && !id) {
        const filename = validFilename(
          req.headers[ASSET_FILENAME_HEADER] as string | undefined
        );
        const originalPath = validOriginalPath(
          req.headers[ASSET_ORIGINAL_PATH_HEADER] as string | undefined
        );
        const mediaType = validMediaType(req.headers["content-type"]);
        const declared = Number(req.headers["content-length"] ?? 0);
        if (declared > maxUpload) {
          throw tooLarge(`The file is larger than ${maxUpload} bytes.`);
        }

        const staged = await assets.stage(req, maxUpload);
        const assetId = crypto.randomUUID();
        try {
          assets.commit(staged, assetId);
          library.insertAsset({
            id: assetId,
            sha256: staged.sha256,
            size: staged.size,
            mediaType,
            filename,
            originalPath,
            createdAt: now(),
          });
        } catch (e) {
          assets.discard(staged);
          assets.remove(assetId);
          throw e;
        }
        return send(res, 201, { asset: library.getAsset(assetId) });
      }

      if (method === "GET" && id) {
        const asset = library.getAsset(id);
        if (!asset) throw notFound(`Asset ${id} does not exist.`);
        if (!sub) return send(res, 200, { asset });
        if (sub === "content") {
          const file = assets.pathFor(asset.id);
          if (!fs.existsSync(file)) {
            throw new StorageError(
              500,
              "internal",
              `Managed file for asset ${asset.id} is missing.`
            );
          }
          res.writeHead(200, {
            "Content-Type": asset.mediaType,
            "Content-Length": asset.size,
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
              asset.filename
            )}`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          });
          fs.createReadStream(file).pipe(res);
          return;
        }
      }
    }

    if (resource === "backup" && !id && method === "GET") {
      const date = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        "Content-Type": "application/x-tar",
        "Content-Disposition": `attachment; filename="knowledge-library-${date}.tar"`,
        "Cache-Control": "no-store",
      });
      await writeBackup(dir, res);
      res.end();
      return;
    }

    throw notFound(`No route for ${method} ${url.pathname}.`);
  }

  const server = http.createServer(async (req, res) => {
    try {
      // Reject requests that do not address this server by its loopback name
      const port = (server.address() as AddressInfo).port;
      const host = req.headers.host;
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
        throw forbidden("Invalid Host header.");
      }

      // CORS lets the configured page read responses. It is not authentication.
      const origin = req.headers.origin;
      if (origin !== undefined) {
        if (!allowedOrigins.includes(origin)) {
          throw forbidden("Origin not allowed.");
        }
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Expose-Headers", "content-disposition");
      }
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE");
        res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
        res.setHeader("Access-Control-Max-Age", "600");
        return send(res, 204);
      }

      await route(req, res);
    } catch (e: any) {
      const error =
        e instanceof StorageError
          ? e
          : new StorageError(
              500,
              "internal",
              "Internal error. See the service log."
            );
      if (!(e instanceof StorageError)) {
        console.error(
          `[kc-storage] ${req.method} ${req.url}: ${e?.stack ?? e}`
        );
      }
      if (res.headersSent) {
        res.destroy();
        return;
      }
      req.resume();
      const body: ErrorResponse = {
        error: { code: error.code, message: error.message },
      };
      send(res, error.status, body);
    }
  });
  return server;
}
