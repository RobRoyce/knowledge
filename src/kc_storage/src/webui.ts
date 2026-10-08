/*
 * Serves the built Angular UI for the local browser client.
 *
 * Paths are resolved inside the web root only. Unknown paths without a
 * file extension return index.html, so client routes survive a reload.
 * The desktop build uses <base href="./"> for file:// pages. The service
 * changes it to "/" when it serves index.html.
 */

import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

/** Content Security Policy for UI pages. */
export const UI_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'self'",
  "frame-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function createWebUi(webRoot: string) {
  const root = path.resolve(webRoot);
  const indexFile = path.join(root, "index.html");
  if (!fs.existsSync(indexFile)) {
    throw new Error(
      `No index.html in the web root ${root}. Build the UI first.`
    );
  }

  return function serve(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string
  ): boolean {
    if (req.method !== "GET" && req.method !== "HEAD") return false;

    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    let file = path.resolve(root, "." + decoded);
    if (!file.startsWith(root + path.sep) && file !== root) return false;

    const isFile = fs.existsSync(file) && fs.statSync(file).isFile();
    if (!isFile) {
      // Client routes have no extension. Missing files with one are 404.
      if (path.extname(pathname)) return false;
      file = indexFile;
    }

    const headers: Record<string, string> = {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-cache",
    };

    if (file === indexFile) {
      const html = fs
        .readFileSync(indexFile, "utf8")
        .replace('<base href="./">', '<base href="/">');
      res.writeHead(200, {
        ...headers,
        "Content-Security-Policy": UI_CSP,
        "X-Frame-Options": "DENY",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : html);
      return true;
    }

    res.writeHead(200, {
      ...headers,
      "Content-Length": fs.statSync(file).size,
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
    return true;
  };
}
