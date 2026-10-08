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
  type LibraryStatus,
} from "../../kc_contracts/storage.ts";
import { writeBackup } from "./backup.ts";
import {
  activateRestore,
  assertEmpty,
  discardRestore,
  newStagingDir,
  RESTORE_LIMITS,
  RestoreError,
  stageRestore,
  type StagedRestore,
} from "./restore.ts";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
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
import {
  equalSecrets,
  readCookie,
  SessionStore,
  type Session,
  type SessionOptions,
} from "./sessions.ts";
import { createWebUi } from "./webui.ts";

/** How long a validated restore waits for confirmation. */
const RESTORE_PENDING_MS = 30 * 60 * 1000;

export interface ServerOptions {
  dir: DataDir;
  token: string;
  /** Other origins that may read responses (CORS). "null" for file:// pages. */
  allowedOrigins: string[];
  maxJsonBytes?: number;
  maxUploadBytes?: number;
  /** Serve the browser UI from this directory and enable browser sessions. */
  webRoot?: string;
  sessionOptions?: SessionOptions;
}

const CSRF_HEADER = "x-knowledge-csrf";
const UNSAFE_METHODS = ["POST", "PUT", "DELETE", "PATCH"];

/** Managed file types that a browser may show inline. */
const INLINE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/**
 * Response headers for a managed file. Imported content must not run with
 * the application's origin: only PDF, raster images, and text show inline.
 * Text is always served as text/plain. Other files are downloads. All
 * files except PDF get a sandbox CSP.
 */
export function contentHeaders(asset: {
  mediaType: string;
  size: number;
  filename: string;
}) {
  const name = encodeURIComponent(asset.filename);
  const isText =
    asset.mediaType.startsWith("text/") &&
    !["text/html", "text/xml"].includes(asset.mediaType);
  const inline = INLINE_TYPES.includes(asset.mediaType) || isText;
  const headers: Record<string, string | number> = {
    "Content-Type": isText
      ? "text/plain; charset=utf-8"
      : inline
      ? asset.mediaType
      : "application/octet-stream",
    "Content-Length": asset.size,
    "Content-Disposition": `${
      inline ? "inline" : "attachment"
    }; filename*=UTF-8''${name}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  if (asset.mediaType !== "application/pdf") {
    headers["Content-Security-Policy"] =
      "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";
  }
  return headers;
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
  const webUi = options.webRoot ? createWebUi(options.webRoot) : undefined;
  const sessions = webUi ? new SessionStore(options.sessionOptions) : undefined;

  // A validated restore waits here for confirmation. One at a time.
  let pending: { staged: StagedRestore; timer: NodeJS.Timeout } | undefined;
  const dropPending = () => {
    if (pending) {
      clearTimeout(pending.timer);
      discardRestore(pending.staged);
      pending = undefined;
    }
  };

  async function receiveArchive(req: IncomingMessage, file: string) {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > RESTORE_LIMITS.archiveBytes) {
      throw tooLarge(
        `The backup is larger than ${RESTORE_LIMITS.archiveBytes} bytes.`
      );
    }
    let size = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        size += chunk.length;
        if (size > RESTORE_LIMITS.archiveBytes) {
          done(
            tooLarge(
              `The backup is larger than ${RESTORE_LIMITS.archiveBytes} bytes.`
            )
          );
          return;
        }
        done(null, chunk);
      },
    });
    await pipeline(req, meter, fs.createWriteStream(file, { flags: "wx" }));
  }

  const port = () => (server.address() as AddressInfo).port;

  /** Cookie names are per port: browsers share 127.0.0.1 cookies across ports. */
  const cookieName = () => `kc_session_${port()}`;

  /** The origin of this service, as the browser addressed it. */
  const ownOrigin = (req: IncomingMessage) => `http://${req.headers.host}`;

  /**
   * Requests with a session cookie must come from this service's own pages.
   * State-changing requests also need the CSRF token and the own Origin.
   */
  function checkSessionRequest(
    req: IncomingMessage,
    method: string,
    session: Session
  ) {
    const site = req.headers["sec-fetch-site"];
    if (site !== undefined && site !== "same-origin" && site !== "none") {
      throw forbidden("Session requests must come from this service's pages.");
    }
    if (UNSAFE_METHODS.includes(method)) {
      if (req.headers.origin !== ownOrigin(req)) {
        throw forbidden(
          "A state-changing session request needs this service's Origin."
        );
      }
      const csrf = req.headers[CSRF_HEADER];
      if (typeof csrf !== "string" || !equalSecrets(csrf, session.csrfToken)) {
        throw forbidden("Missing or invalid CSRF token.");
      }
    }
  }

  async function sessionRoute(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    sub: string | undefined,
    bearer: boolean
  ) {
    const store = sessions!;
    const describe = (session: Session) => ({
      csrfToken: session.csrfToken,
      expiresAt: new Date(store.expiresAt(session)).toISOString(),
    });

    // A bearer client (the launcher) asks for a one-time launch code
    if (sub === "launch" && method === "POST") {
      if (!bearer) throw unauthorized("A launch code needs the bearer token.");
      const { code, expiresAt } = store.createLaunchCode();
      return send(res, 201, {
        url: `http://127.0.0.1:${port()}/#launch=${code}`,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    }
    if (sub) throw notFound(`No route for ${method} ${req.url}.`);

    if (method === "POST") {
      if (req.headers.origin !== ownOrigin(req)) {
        throw forbidden("A session can start only from this service's pages.");
      }
      const body = (await readJson(req, 4096)) as { code?: unknown };
      const session = store.exchange(body?.code);
      if (!session) {
        throw unauthorized(
          "The launch link is invalid, used, or expired. Get a new link from the terminal."
        );
      }
      res.setHeader(
        "Set-Cookie",
        `${cookieName()}=${session.id}; HttpOnly; SameSite=Strict; Path=/`
      );
      return send(res, 201, describe(session));
    }

    const id = readCookie(req.headers.cookie, cookieName());
    const session = store.get(id);
    if (!session)
      throw unauthorized(
        "No browser session. Open the launch link from the terminal."
      );
    checkSessionRequest(req, method, session);

    if (method === "GET") return send(res, 200, describe(session));
    if (method === "DELETE") {
      store.end(session.id);
      res.setHeader(
        "Set-Cookie",
        `${cookieName()}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
      );
      return send(res, 204);
    }
    throw notFound(`No route for ${method} ${req.url}.`);
  }

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
      if (webUi && webUi(req, res, url.pathname)) return;
      throw notFound(`No route for ${method} ${url.pathname}.`);
    }

    const [, resource, id, sub] = parts;
    const bearer = tokenMatches(req.headers.authorization, token);

    // Browser session routes
    if (sessions && resource === "session") {
      return sessionRoute(req, res, method, id, bearer);
    }

    if (!bearer) {
      // A browser session can use the API in place of the bearer token
      const session = sessions?.get(
        readCookie(req.headers.cookie, cookieName())
      );
      if (!session) {
        throw unauthorized("Missing or invalid bearer token or session.");
      }
      checkSessionRequest(req, method, session);
    }

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
          // An optional last path part (the filename) only names the response
          res.writeHead(200, contentHeaders(asset));
          fs.createReadStream(file).pipe(res);
          return;
        }
      }
    }

    if (resource === "library" && !id && method === "GET") {
      const counts = library.counts();
      const status: LibraryStatus = {
        empty: counts.projects + counts.sources + counts.assets === 0,
        counts,
      };
      return send(res, 200, status);
    }

    if (resource === "restores") {
      // Upload and validate. Nothing becomes active.
      if (method === "POST" && !id) {
        assertEmpty(dir);
        dropPending();
        const staging = newStagingDir(dir);
        const archive = path.join(staging.stagingDir, "archive.tar");
        try {
          await receiveArchive(req, archive);
        } catch (e) {
          fs.rmSync(staging.stagingDir, { recursive: true, force: true });
          throw e;
        }
        const staged = await stageRestore(dir, archive, staging);
        fs.rmSync(archive, { force: true });
        const timer = setTimeout(dropPending, RESTORE_PENDING_MS);
        timer.unref();
        pending = { staged, timer };
        return send(res, 201, { restore: staged.preview });
      }

      const current = pending && pending.staged.id === id ? pending : undefined;
      if (id && !sub && method === "DELETE") {
        if (current) dropPending();
        return send(res, 204);
      }
      if (id && sub === "activate" && method === "POST") {
        if (!current) {
          throw notFound(
            "This restore is not pending. It expired or the service restarted. Select the backup again."
          );
        }
        clearTimeout(current.timer);
        pending = undefined;
        const restored = activateRestore(dir, current.staged);
        return send(res, 200, { restored });
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
      const host = req.headers.host;
      if (host !== `127.0.0.1:${port()}` && host !== `localhost:${port()}`) {
        throw forbidden("Invalid Host header.");
      }

      // CORS lets the configured page read responses. It is not authentication.
      const origin = req.headers.origin;
      if (origin !== undefined && !(webUi && origin === ownOrigin(req))) {
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
          : e instanceof RestoreError
          ? badRequest(e.message)
          : new StorageError(
              500,
              "internal",
              "Internal error. See the service log."
            );
      if (!(e instanceof StorageError) && !(e instanceof RestoreError)) {
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
