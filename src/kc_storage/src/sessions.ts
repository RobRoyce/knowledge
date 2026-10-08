/*
 * Browser sessions for the local web UI. See docs/browser-library.md.
 *
 * - A bearer-token client creates a launch code (single use, short-lived).
 * - The page exchanges the code for a session cookie and a CSRF token.
 * - Sessions live in memory. They end after an idle time, after a maximum
 *   age, on logout, or when the service stops.
 */

import crypto from "node:crypto";

export interface SessionOptions {
  launchCodeMs: number;
  idleMs: number;
  maxMs: number;
}

export const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  launchCodeMs: 5 * 60 * 1000,
  idleMs: 30 * 60 * 1000,
  maxMs: 12 * 60 * 60 * 1000,
};

export interface Session {
  id: string;
  csrfToken: string;
  createdAt: number;
  lastSeen: number;
}

const random = () => crypto.randomBytes(32).toString("base64url");

export function equalSecrets(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export class SessionStore {
  private codes = new Map<string, number>();
  private sessions = new Map<string, Session>();
  readonly options: SessionOptions;

  constructor(options: SessionOptions = DEFAULT_SESSION_OPTIONS) {
    this.options = options;
  }

  createLaunchCode(now = Date.now()) {
    this.prune(now);
    const code = random();
    const expiresAt = now + this.options.launchCodeMs;
    this.codes.set(code, expiresAt);
    return { code, expiresAt };
  }

  /** Use a launch code once. Returns a new session, or undefined. */
  exchange(code: unknown, now = Date.now()): Session | undefined {
    this.prune(now);
    if (typeof code !== "string") return undefined;
    const expiresAt = this.codes.get(code);
    this.codes.delete(code);
    if (expiresAt === undefined || expiresAt < now) return undefined;
    const session: Session = {
      id: random(),
      csrfToken: random(),
      createdAt: now,
      lastSeen: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** A valid session for the cookie value. Updates its idle time. */
  get(id: string | undefined, now = Date.now()): Session | undefined {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (
      now - session.lastSeen > this.options.idleMs ||
      now - session.createdAt > this.options.maxMs
    ) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastSeen = now;
    return session;
  }

  expiresAt(session: Session) {
    return Math.min(
      session.lastSeen + this.options.idleMs,
      session.createdAt + this.options.maxMs
    );
  }

  end(id: string) {
    this.sessions.delete(id);
  }

  private prune(now: number) {
    for (const [code, expiresAt] of this.codes) {
      if (expiresAt < now) this.codes.delete(code);
    }
  }
}

/** Value of one cookie from a Cookie header. */
export function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
