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
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';

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
 * How this client reaches the library API (and chat) and authorizes its
 * requests. One implementation per platform, chosen at startup.
 */
export abstract class BackendService {
  abstract get chat(): BackendEndpoint;
  abstract get storage(): BackendEndpoint;
  abstract load(): Promise<void>;
  /** Add the credentials that this request needs, if it goes to our servers. */
  abstract authorize(req: HttpRequest<unknown>): HttpRequest<unknown>;
}

/**
 * Desktop: Electron gives the addresses and bearer tokens of this
 * instance's local servers through IPC.
 */
@Injectable()
export class DesktopBackendService extends BackendService {
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
}

/**
 * Browser: the storage service serves this page, so the API is on the
 * same origin. A launch code in the URL fragment starts a session cookie.
 * State-changing requests carry the CSRF token, which stays in memory.
 */
@Injectable()
export class BrowserBackendService extends BackendService {
  private csrfToken = '';
  private storageEndpoint: BackendEndpoint = { error: 'No browser session.' };

  get chat(): BackendEndpoint {
    return { error: 'Chat is available in the desktop app.' };
  }

  get storage(): BackendEndpoint {
    return this.storageEndpoint;
  }

  async load() {
    const code = new URLSearchParams(location.hash.slice(1)).get('launch');
    if (code) {
      // Remove the one-time code from the address bar and history
      history.replaceState(null, '', location.pathname + location.search);
    }

    const res = code
      ? await fetch('/v1/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
      : await fetch('/v1/session');

    if (res.ok) {
      this.csrfToken = (await res.json()).csrfToken;
      this.storageEndpoint = { url: location.origin };
    } else {
      const message = await res
        .json()
        .then((b) => b?.error?.message)
        .catch(() => undefined);
      this.storageEndpoint = {
        error:
          message ??
          'No browser session. Open the launch link that "yarn browser" prints.',
      };
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
}

export function backendServiceFactory(desktop: boolean): BackendService {
  return desktop ? new DesktopBackendService() : new BrowserBackendService();
}

@Injectable()
export class BackendAuthInterceptor implements HttpInterceptor {
  constructor(private backend: BackendService) {}

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    return next.handle(this.backend.authorize(req));
  }
}

/**
 * Runs before the app starts: get this instance's server addresses, then
 * load projects and sources from the storage service.
 */
export function initializeBackend(
  backend: BackendService,
  storage: { load(): Promise<void> }
) {
  return async () => {
    await backend.load();
    try {
      await storage.load();
    } catch (e: any) {
      const reason = e?.error?.error?.message ?? e?.message ?? String(e);
      console.error('[Storage]: load failed', e);
      alert(`Knowledge could not load your library.\n\n${reason}`);
    }
  };
}
