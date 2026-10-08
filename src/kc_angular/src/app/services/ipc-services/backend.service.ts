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

import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { BehaviorSubject, filter, firstValueFrom, Observable, tap } from 'rxjs';
import { SESSION_TTL_HEADER } from '@contracts/storage';

export interface BackendEndpoint {
  url?: string;
  token?: string;
  error?: string;
}

export interface BackendInfo {
  chat: BackendEndpoint;
  storage: BackendEndpoint;
}

/**
 * State of the connection to the library API.
 * - active: requests can change the library.
 * - none: the page has no browser session yet.
 * - expired: the browser session ended or another tab replaced it.
 * - signedOut: the user logged out in this tab.
 * - unreachable: the storage service does not respond.
 * In every state except active, writes wait in the StorageService queue.
 */
export type ConnectionState =
  | 'active'
  | 'none'
  | 'expired'
  | 'signedOut'
  | 'unreachable';

/**
 * How this client reaches the library API (and chat), authorizes its
 * requests, and tracks whether it can still write. One implementation per
 * platform, chosen at startup.
 */
export abstract class BackendService {
  protected readonly _state = new BehaviorSubject<ConnectionState>('none');
  readonly state = this._state.asObservable();

  /** Why the connection is not active. Shown to the user. */
  reason = '';

  /** True after the library loaded at startup. */
  libraryLoaded = false;

  /** Browser sessions (launch link, logout). False on the desktop. */
  abstract readonly sessions: boolean;

  abstract get chat(): BackendEndpoint;
  abstract get storage(): BackendEndpoint;
  abstract load(): Promise<void>;
  /** Add the credentials that this request needs, if it goes to our servers. */
  abstract authorize(req: HttpRequest<unknown>): HttpRequest<unknown>;
  /**
   * Make the connection active again. Browser: with a pasted launch link,
   * or with the session cookie that another tab started.
   */
  abstract reconnect(launchLink?: string): Promise<void>;
  /** End the browser session. */
  abstract logout(): Promise<void>;

  get current(): ConnectionState {
    return this._state.value;
  }

  /** Resolve when the connection is active. */
  whenActive(): Promise<unknown> {
    return firstValueFrom(this.state.pipe(filter((s) => s === 'active')));
  }

  /**
   * The service refused the request before it changed anything (401, 403),
   * or the request did not reach it (status 0). A retry after reconnect is
   * safe for idempotent requests.
   */
  isConnectionFailure(e: unknown): e is HttpErrorResponse {
    return e instanceof HttpErrorResponse && [0, 401, 403].includes(e.status);
  }

  /** The service refused the request before it read it. Any retry is safe. */
  isAuthFailure(e: unknown): e is HttpErrorResponse {
    return e instanceof HttpErrorResponse && [401, 403].includes(e.status);
  }

  /** Called for each response of the library API. */
  onResponse(_res: HttpResponse<unknown>): void {
    return;
  }

  /** Called for each failed request to the library API. */
  connectionLost(e: HttpErrorResponse) {
    if (this.current !== 'active') return;
    if (e.status === 0) {
      this.set('unreachable', 'The storage service does not respond.');
    } else if (this.isAuthFailure(e)) {
      this.authFailed(e.error?.error?.message ?? e.message);
    }
  }

  /** True if the request goes to the library API. */
  isLibraryRequest(url: string) {
    const base = this.storage.url;
    return !!base && url.startsWith(base + '/');
  }

  protected abstract authFailed(message: string): void;

  protected set(state: ConnectionState, reason = '') {
    this.reason = reason;
    if (this._state.value !== state) this._state.next(state);
  }
}

/**
 * Desktop: Electron gives the addresses and bearer tokens of this
 * instance's local servers through IPC.
 */
@Injectable()
export class DesktopBackendService extends BackendService {
  readonly sessions = false;

  private info: BackendInfo = {
    chat: { error: 'Backend information not loaded.' },
    storage: { error: 'Backend information not loaded.' },
  };

  get chat(): BackendEndpoint {
    return this.info.chat;
  }

  get storage(): BackendEndpoint {
    return this.info.storage;
  }

  async load() {
    try {
      this.info = await window.api.invoke('A2E:Backend:Info');
    } catch (e) {
      const error = `Backend information unavailable: ${e}`;
      this.info = { chat: { error }, storage: { error } };
    }
    for (const [name, endpoint] of Object.entries(this.info)) {
      if (endpoint.error) {
        console.error(`[Backend]: ${name}: ${endpoint.error}`);
      }
    }
    if (this.info.storage.url) this.set('active');
    else this.set('unreachable', this.info.storage.error);
  }

  authorize(req: HttpRequest<unknown>) {
    for (const endpoint of Object.values(this.info)) {
      if (
        endpoint.url &&
        endpoint.token &&
        req.url.startsWith(endpoint.url + '/')
      ) {
        return req.clone({
          setHeaders: { Authorization: `Bearer ${endpoint.token}` },
        });
      }
    }
    return req;
  }

  async reconnect() {
    await this.load();
    const url = this.info.storage.url;
    const ok = url && (await fetch(`${url}/health`).catch(() => undefined))?.ok;
    if (!ok) {
      this.set('unreachable', 'The storage service does not respond.');
      throw new Error('The storage service does not respond.');
    }
    this.set('active');
  }

  async logout() {
    throw new Error('The desktop app has no browser session.');
  }

  protected authFailed(message: string) {
    this.set(
      'unreachable',
      `The storage service refused the request: ${message}`
    );
  }
}

const LAUNCH_CODE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Browser: the storage service serves this page, so the API is on the
 * same origin. A launch code in the URL fragment starts a session cookie.
 * State-changing requests carry the CSRF token, which stays in memory.
 * The service reports the remaining session time on each response, so the
 * page knows when the session ends without another request.
 */
@Injectable()
export class BrowserBackendService extends BackendService {
  readonly sessions = true;

  private csrfToken = '';
  private storageEndpoint: BackendEndpoint = { error: 'No browser session.' };
  private expiry?: ReturnType<typeof setTimeout>;

  get chat(): BackendEndpoint {
    return { error: 'Chat is available in the desktop app.' };
  }

  get storage(): BackendEndpoint {
    return this.storageEndpoint;
  }

  async load() {
    const params = new URLSearchParams(location.hash.slice(1));
    const code = params.get('launch');
    const signedOut = params.has('signed-out');
    if (code || signedOut) {
      // Remove the one-time code from the address bar and history
      history.replaceState(null, '', location.pathname + location.search);
    }
    try {
      await this.startSession(code ?? undefined);
    } catch (e) {
      if (signedOut) this.set('signedOut', 'You logged out.');
      else this.set('none', e instanceof Error ? e.message : String(e));
    }
  }

  authorize(req: HttpRequest<unknown>) {
    const sameOrigin =
      req.url.startsWith('/') || req.url.startsWith(location.origin + '/');
    if (sameOrigin && !['GET', 'HEAD'].includes(req.method) && this.csrfToken) {
      return req.clone({ setHeaders: { 'X-Knowledge-CSRF': this.csrfToken } });
    }
    return req;
  }

  override onResponse(res: HttpResponse<unknown>) {
    const ttl = Number(res.headers.get(SESSION_TTL_HEADER));
    if (res.headers.has(SESSION_TTL_HEADER) && Number.isFinite(ttl)) {
      this.expireAfter(ttl * 1000);
    }
  }

  async reconnect(launchLink?: string) {
    const input = launchLink?.trim();
    let code: string | undefined;
    if (input) {
      code = LAUNCH_CODE.test(input) ? input : this.codeFromLink(input);
    }
    await this.startSession(code);
  }

  async logout() {
    const res = await fetch('/v1/session', {
      method: 'DELETE',
      headers: { 'X-Knowledge-CSRF': this.csrfToken },
    });
    // 401: the session already ended. The result is the same.
    if (!res.ok && res.status !== 401) {
      throw new Error(await this.errorMessage(res, 'Logout failed.'));
    }
    this.csrfToken = '';
    clearTimeout(this.expiry);
    this.set('signedOut', 'You logged out.');
  }

  protected authFailed(message: string) {
    this.set(
      'expired',
      `The browser session ended or was replaced (${message})`
    );
  }

  /** Exchange a launch code, or read the current session cookie. */
  private async startSession(code?: string) {
    const res = code
      ? await fetch('/v1/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
      : await fetch('/v1/session');
    if (!res.ok) {
      throw new Error(
        await this.errorMessage(
          res,
          'No browser session. Open the launch link that "yarn browser" prints.'
        )
      );
    }
    const session = await res.json();
    this.csrfToken = session.csrfToken;
    this.storageEndpoint = { url: location.origin };
    this.expireAfter(Date.parse(session.expiresAt) - Date.now());
    this.set('active');
  }

  /** Mark the session expired when the service ends it. */
  private expireAfter(ms: number) {
    clearTimeout(this.expiry);
    // One second late, so the service has ended the session for certain
    this.expiry = setTimeout(() => {
      if (this.current === 'active') {
        this.set(
          'expired',
          'The browser session ended after a period without activity.'
        );
      }
    }, Math.max(0, ms) + 1000);
  }

  private codeFromLink(link: string): string {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      throw new Error('Paste the complete launch link from the terminal.');
    }
    if (url.origin !== location.origin) {
      throw new Error(
        `This link opens ${url.origin}, but this tab uses ${location.origin}. ` +
          'Unsaved changes in this tab can only go to the service at its own address. ' +
          'Start "yarn browser" again with the same library to use the same address.'
      );
    }
    const code = new URLSearchParams(url.hash.slice(1)).get('launch');
    if (!code) {
      throw new Error('The link has no launch code. Copy the complete link.');
    }
    return code;
  }

  private async errorMessage(res: Response, fallback: string) {
    return res
      .json()
      .then((b) => b?.error?.message ?? fallback)
      .catch(() => fallback);
  }
}

@Injectable()
export class BackendAuthInterceptor implements HttpInterceptor {
  constructor(private backend: BackendService) {}

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const library = this.backend.isLibraryRequest(req.url);
    return next.handle(this.backend.authorize(req)).pipe(
      tap({
        next: (event) => {
          if (library && event instanceof HttpResponse) {
            this.backend.onResponse(event);
          }
        },
        error: (e) => {
          if (library && e instanceof HttpErrorResponse) {
            this.backend.connectionLost(e);
          }
        },
      })
    );
  }
}

/**
 * Runs before the app starts: get this instance's server addresses, then
 * load projects, sources, and the inbox from the storage service. Without
 * an active connection the session dialog explains what to do.
 */
export function initializeBackend(
  backend: BackendService,
  storage: { load(): Promise<void> },
  settings: { ready(): Promise<void> }
) {
  return async () => {
    await backend.load();
    if (backend.current !== 'active') return;
    try {
      await storage.load();
      await settings.ready();
      backend.libraryLoaded = true;
    } catch (e: any) {
      if (backend.isConnectionFailure(e)) return;
      const reason = e?.error?.error?.message ?? e?.message ?? String(e);
      console.error('[Storage]: load failed', e);
      alert(`Knowledge could not load your library.\n\n${reason}`);
    }
  };
}
