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

import { Component, OnDestroy } from '@angular/core';
import { asapScheduler, observeOn, Subscription } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import {
  BackendService,
  ConnectionState,
} from '@services/ipc-services/backend.service';
import { StorageService } from '@services/ipc-services/storage.service';

const TITLES: Record<ConnectionState, string> = {
  active: '',
  none: 'Open your library',
  expired: 'Session ended',
  signedOut: 'Logged out',
  unreachable: 'Storage service not responding',
};

/**
 * Blocks the app while the connection is not active, so no change can look
 * saved. Queued changes stay in this tab. The user starts a new session
 * with a launch link, then the queued changes are saved in order.
 */
@Component({
  selector: 'app-session-dialog',
  template: `
    <p-dialog
      [visible]="state !== 'active'"
      [modal]="true"
      [closable]="false"
      [closeOnEscape]="false"
      [draggable]="false"
      [resizable]="false"
      [baseZIndex]="20000"
      appendTo="body"
      styleClass="session-dialog w-30rem"
      [header]="title"
    >
      <div class="flex flex-column gap-3">
        <div *ngIf="state === 'expired'">
          {{ reason }}
        </div>
        <div *ngIf="state === 'none'">This page has no browser session.</div>
        <div *ngIf="state === 'signedOut'">
          You logged out. This tab shows no library data.
        </div>
        <div *ngIf="state === 'unreachable'">{{ reason }}</div>

        <div
          *ngIf="unsaved > 0"
          class="font-bold session-unsaved"
          data-test="session-unsaved"
        >
          {{ unsaved }} change{{ unsaved === 1 ? '' : 's' }} not saved yet. They
          stay in this tab and are saved when you continue.
        </div>

        <ng-container *ngIf="backend.sessions">
          <ol class="m-0 pl-4">
            <li>
              In the terminal that runs <code>yarn browser</code>, press Enter
              for a new link.
            </li>
            <li>Paste the link here, then select Continue.</li>
          </ol>
          <input
            pInputText
            data-test="session-link"
            placeholder="http://127.0.0.1:…/#launch=…"
            [(ngModel)]="link"
            (keydown.enter)="reconnect()"
          />
          <div class="text-sm">
            You can also open the link in a new tab, then select Check again
            here.
          </div>
        </ng-container>

        <div *ngIf="error" class="p-error" data-test="session-error">
          {{ error }}
        </div>
      </div>
      <ng-template pTemplate="footer">
        <button
          pButton
          class="p-button-text"
          data-test="session-check"
          [label]="backend.sessions ? 'Check again' : 'Retry'"
          [disabled]="busy"
          (click)="reconnect(true)"
        ></button>
        <button
          *ngIf="backend.sessions"
          pButton
          data-test="session-continue"
          label="Continue"
          [disabled]="busy || !link.trim()"
          (click)="reconnect()"
        ></button>
      </ng-template>
    </p-dialog>
  `,
})
export class SessionDialogComponent implements OnDestroy {
  state: ConnectionState = 'active';
  unsaved = 0;
  link = '';
  error = '';
  busy = false;
  private subscriptions: Subscription[] = [];

  constructor(public backend: BackendService, storage: StorageService) {
    this.subscriptions.push(
      backend.state.subscribe((state) => {
        this.state = state;
        this.error = '';
      }),
      storage.unsaved
        .pipe(observeOn(asapScheduler))
        .subscribe((count) => (this.unsaved = count))
    );
  }

  get title() {
    return TITLES[this.state];
  }

  get reason() {
    return this.backend.reason;
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe());
  }

  async reconnect(useCookie = false) {
    this.busy = true;
    this.error = '';
    try {
      await this.backend.reconnect(useCookie ? undefined : this.link);
      this.link = '';
      // Nothing loaded yet (no session at start, or after logout): load now
      if (!this.backend.libraryLoaded) {
        location.reload();
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
    }
  }
}

/** Title bar of the browser client: save state and logout. */
@Component({
  selector: 'app-session-status',
  template: `
    <div class="flex align-items-center gap-2 pr-2 h-full">
      <span
        *ngIf="unsaved > 0"
        class="text-sm text-color-secondary"
        data-test="session-saving"
        >{{ state === 'active' ? 'Saving…' : unsaved + ' not saved' }}</span
      >
      <button
        pButton
        class="p-button-text p-button-sm py-0"
        style="height: 28px"
        icon="pi pi-sign-out"
        label="Log out"
        data-test="logout"
        [disabled]="state === 'signedOut' || state === 'none'"
        (click)="logout()"
      ></button>
    </div>
  `,
})
export class SessionStatusComponent implements OnDestroy {
  state: ConnectionState = 'active';
  unsaved = 0;
  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private storage: StorageService,
    private confirm: ConfirmationService
  ) {
    this.subscriptions.push(
      backend.state.subscribe((state) => (this.state = state)),
      storage.unsaved
        .pipe(observeOn(asapScheduler))
        .subscribe((count) => (this.unsaved = count))
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe());
  }

  /** Save queued changes first. Ask before changes are lost. */
  async logout() {
    const saved = await this.storage.flush();
    if (saved) {
      return this.endSession();
    }
    const count = this.storage.unsavedCount;
    this.confirm.confirm({
      key: 'session-logout',
      header: 'Changes not saved',
      message: `${count} change${
        count === 1 ? ' is' : 's are'
      } not saved. If you log out now, ${
        count === 1 ? 'it is' : 'they are'
      } lost.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Log out and discard',
      rejectLabel: 'Stay',
      acceptButtonStyleClass: 'p-button-danger p-button-text',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => this.endSession(),
    });
  }

  private async endSession() {
    try {
      await this.backend.logout();
    } catch (e) {
      this.confirm.confirm({
        key: 'session-logout',
        header: 'Logout failed',
        message: e instanceof Error ? e.message : String(e),
        rejectVisible: false,
        acceptLabel: 'OK',
      });
      return;
    }
    // Remove library data from this page, then load a page without it
    this.storage.closeLibrary();
    location.replace(`${location.origin}/#signed-out`);
  }
}
