/*
 * Test helpers. Each test starts the service as a separate Node.js process
 * with a temporary data directory. Electron is not involved.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

export const MAIN = path.resolve(import.meta.dirname, "..", "src", "main.ts");
export const FIXTURES = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "e2e",
  "fixtures"
);

export function tempDir(name: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `kc-storage-${name}-`));
}

export function sha256(file: string) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

const running = new Set<Service>();

/** Stop every service that a test started. Use in afterEach. */
export async function stopAll() {
  await Promise.all([...running].map((s) => s.stop()));
}

export interface Service {
  url: string;
  port: number;
  token: string;
  child: ChildProcess;
  stderr: () => string;
  stop(): Promise<number | null>;
}

export async function startService(
  dataDir: string,
  args: string[] = [],
  env: Record<string, string> = {}
): Promise<Service> {
  const token = crypto.randomBytes(32).toString("hex");
  const child = spawn(
    process.execPath,
    [MAIN, "serve", "--data-dir", dataDir, ...args],
    {
      env: { ...process.env, KC_STORAGE_TOKEN: token, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  let err = "";
  child.stderr!.on("data", (d) => (err += d));

  const line = await new Promise<string>((resolve, reject) => {
    let out = "";
    child.stdout!.on("data", (d) => {
      out += d;
      if (out.includes("\n")) resolve(out.split("\n")[0]);
    });
    child.on("exit", (code) =>
      reject(new Error(`service exited (${code}): ${err}`))
    );
  });
  const ready = JSON.parse(line);
  const service: Service = {
    url: ready.url,
    port: Number(new URL(ready.url).port),
    token,
    child,
    stderr: () => err,
    async stop() {
      if (child.exitCode !== null) return child.exitCode;
      child.kill("SIGTERM");
      const [code] = await once(child, "exit");
      return code as number | null;
    },
  };
  running.add(service);
  child.on("exit", () => running.delete(service));
  return service;
}

export function cli(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [MAIN, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function client(service: Service) {
  const headers = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${service.token}`,
    ...extra,
  });
  const json = async (method: string, route: string, body?: unknown) => {
    const res = await fetch(service.url + route, {
      method,
      headers: headers(
        body === undefined ? {} : { "Content-Type": "application/json" }
      ),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };
  return {
    get: (route: string) => json("GET", route),
    put: (route: string, body: unknown) => json("PUT", route, body),
    del: (route: string) => json("DELETE", route),
    async upload(
      file: string,
      filename: string,
      type: string,
      originalPath?: string
    ) {
      const extra: Record<string, string> = {
        "Content-Type": type,
        "x-knowledge-filename": encodeURIComponent(filename),
      };
      if (originalPath)
        extra["x-knowledge-original-path"] = encodeURIComponent(originalPath);
      const res = await fetch(service.url + "/v1/assets", {
        method: "POST",
        headers: headers(extra),
        body: fs.readFileSync(file),
      });
      return { status: res.status, body: (await res.json()) as any };
    },
    async content(assetId: string) {
      const res = await fetch(`${service.url}/v1/assets/${assetId}/content`, {
        headers: headers(),
      });
      return {
        status: res.status,
        headers: res.headers,
        bytes: Buffer.from(await res.arrayBuffer()),
      };
    },
  };
}

/** Raw request with full control of headers (Host, Origin). */
export function rawRequest(
  service: Service,
  options: {
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
  }
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: service.port,
        method: options.method ?? "GET",
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () =>
          resolve({ status: res.statusCode!, headers: res.headers, body })
        );
      }
    );
    req.on("error", reject);
    req.setTimeout(5000, () =>
      req.destroy(new Error(`Timed out: ${options.path}`))
    );
    req.end(options.body);
  });
}
