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
}

/**
 * Addresses and tokens of the local servers that belong to this instance.
 * Electron provides them through IPC. Load before the app starts.
 */
@Injectable({
  providedIn: 'root',
})
export class BackendService {
  private info: BackendInfo = {
    chat: { error: 'Backend information not loaded.' },
  };

  get chat(): BackendEndpoint {
    return this.info.chat;
  }

  async load() {
    try {
      this.info = await window.api.invoke('A2E:Backend:Info');
    } catch (e) {
      this.info = { chat: { error: `Backend information unavailable: ${e}` } };
    }
    if (this.info.chat.error) {
      console.error('[Backend]:', this.info.chat.error);
    }
  }

  /** Bearer token for a URL that belongs to this instance, if any. */
  tokenFor(url: string): string | undefined {
    for (const endpoint of Object.values(this.info)) {
      if (
        endpoint.url &&
        endpoint.token &&
        url.startsWith(endpoint.url + '/')
      ) {
        return endpoint.token;
      }
    }
    return undefined;
  }
}

@Injectable()
export class BackendAuthInterceptor implements HttpInterceptor {
  constructor(private backend: BackendService) {}

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const token = this.backend.tokenFor(req.url);
    if (!token) {
      return next.handle(req);
    }
    return next.handle(
      req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    );
  }
}

export function loadBackend(backend: BackendService) {
  return () => backend.load();
}
