/*
 * Copyright (c) 2023-2026 Rob Royce
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
 * Projects, sources, and the inbox. The storage service owns them. This
 * service keeps an in-memory copy for the UI and writes every change to the
 * service in order.
 *
 * Writes are idempotent (PUT or DELETE by ID). A write that fails because
 * the session ended or the service does not respond stays in the queue,
 * with every later write, until the connection is active again.
 *
 * localStorage keeps only UI state: the current project, chat history,
 * favicon cache, and preferences.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { KcProject } from '@app/models/project.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { AutoscanService } from '@services/ingest-services/autoscan.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { BackendService } from '@services/ipc-services/backend.service';
import { NativeFiles } from '@app/platform/native-files';
import {
  projectToRecord,
  recordToProject,
  recordToSource,
  sourceToRecord,
} from '@contracts/mapping';
import {
  ASSET_FILENAME_HEADER,
  ASSET_ORIGINAL_PATH_HEADER,
  CREATE_ONLY_HEADER,
} from '@contracts/storage';
import type {
  AssetRecord,
  LibraryStatus,
  ProjectList,
  ProjectRecord,
  RestorePreview,
  SourceList,
  SourceRecord,
} from '@contracts/storage';
import { createBackup, restoreBackup, RestoreResult } from './backup';

/** The inbox of earlier versions, in renderer localStorage. */
export const LEGACY_INBOX_KEY = 'ingest-queue';

/** localStorage keys with library data. Logout removes them. */
const LIBRARY_CACHE_KEYS = [
  'current-project',
  'topic-service-all-topics',
  LEGACY_INBOX_KEY,
];

interface WriteTask {
  run: () => Promise<void>;
  done: (saved: boolean) => void;
}

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  readonly KC_CURRENT_PROJECT = 'current-project';
  private db = window.localStorage;
  private projectList: KcProject[] = [];

  /** Inbox entries from the service, in order. */
  inbox: KnowledgeSource[] = [];

  /** JSON of the last record written to or read from the service, by ID. */
  private synced = new Map<string, string>();

  /** Writes not saved yet, in call order. They run one at a time. */
  private tasks: WriteTask[] = [];
  private running = false;
  private readonly _unsaved = new BehaviorSubject<number>(0);
  readonly unsaved = this._unsaved.asObservable();

  /** Set when the page may close without a warning (after logout). */
  private closing = false;

  constructor(
    private http: HttpClient,
    private backend: BackendService,
    private native: NativeFiles,
    private autoscan: AutoscanService,
    private notifications: NotificationsService
  ) {
    this.backend.state.subscribe((state) => {
      if (state === 'active') this.pump();
    });
    window.addEventListener('beforeunload', (event) => {
      if (this.tasks.length > 0 && !this.closing) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  private get api() {
    const url = this.backend.storage.url;
    if (!url) {
      throw new Error(
        this.backend.storage.error ?? 'Storage service unavailable.'
      );
    }
    return `${url}/v1`;
  }

  /** Load all projects, sources, and inbox entries. Runs once at startup. */
  async load() {
    const [{ projects }, { sources }] = await Promise.all([
      firstValueFrom(this.http.get<ProjectList>(`${this.api}/projects`)),
      firstValueFrom(this.http.get<SourceList>(`${this.api}/sources`)),
    ]);

    const byProject = new Map<string, KnowledgeSource[]>();
    for (const record of sources) {
      this.synced.set(`s:${record.id}`, JSON.stringify(this.writable(record)));
      const ks = this.revive(recordToSource(record) as KnowledgeSource);
      if (record.projectId === null) {
        this.inbox.push(ks);
        continue;
      }
      const list = byProject.get(record.projectId) ?? [];
      list.push(ks);
      byProject.set(record.projectId, list);
    }

    this.projectList = projects.map((record) => {
      this.synced.set(`p:${record.id}`, JSON.stringify(this.writable(record)));
      return recordToProject(
        record,
        byProject.get(record.id) ?? []
      ) as KcProject;
    });
  }

  /** Dates arrive as strings. The UI expects Date objects. */
  private revive(ks: KnowledgeSource): KnowledgeSource {
    ks.dateCreated = new Date(ks.dateCreated ?? Date.now());
    ks.dateAccessed = (ks.dateAccessed ?? []).map((d) => new Date(d));
    ks.dateModified = (ks.dateModified ?? []).map((d) => new Date(d));
    ks.dateDue = ks.dateDue ? new Date(ks.dateDue) : ks.dateDue;
    return ks;
  }

  /** The fields a client sends. The service sets position and times. */
  private writable(r: Partial<ProjectRecord & SourceRecord>) {
    const { position, createdAt, updatedAt, ...rest } = r;
    return JSON.parse(JSON.stringify(rest));
  }

  get projects(): KcProject[] {
    return this.projectList;
  }

  get kcCurrentProject(): string | null {
    return this.db.getItem(this.KC_CURRENT_PROJECT);
  }

  set kcCurrentProject(id: string | null) {
    this.db.setItem(this.KC_CURRENT_PROJECT, id ?? '');
  }

  async ksList() {
    return this.projectList.flatMap((p) => p.knowledgeSource ?? []);
  }

  async getProjects() {
    return this.projectList;
  }

  get unsavedCount() {
    return this.tasks.length;
  }

  /** The project that the service has for a source. null is the inbox. */
  savedProjectOf(sourceId: string): string | null | undefined {
    const json = this.synced.get(`s:${sourceId}`);
    return json === undefined ? undefined : JSON.parse(json).projectId;
  }

  /** Resolves true when saved, false when the service rejected the write. */
  async saveProject(project: KcProject): Promise<boolean> {
    if (!this.projectList.find((p) => p.id.value === project.id.value)) {
      this.projectList.push(project);
    }
    return this.enqueue(() => this.write(project));
  }

  async saveProjectList(projects: KcProject[]) {
    for (const project of projects) {
      this.saveProject(project);
    }
  }

  /** Resolves true when saved, false when the service rejected the write. */
  async updateProject(project: KcProject): Promise<boolean> {
    return this.enqueue(() => this.write(project));
  }

  deleteProject(id: string) {
    this.projectList = this.projectList.filter((p) => p.id.value !== id);
    this.db.removeItem(`chat-${id}`);
    this.enqueue(() => this.remove(`p:${id}`, `${this.api}/projects/${id}`));
  }

  deleteKnowledgeSource(ks: KnowledgeSource) {
    this.db.removeItem(`icon-${ks.id.value}`);
    this.db.removeItem(`chat-${ks.id.value}`);
    this.enqueue(() =>
      this.remove(`s:${ks.id.value}`, `${this.api}/sources/${ks.id.value}`)
    );

    if (ks.importMethod === 'autoscan' && typeof ks.accessLink === 'string') {
      this.autoscan.delete(ks.accessLink);
    }
  }

  /** Put new entries in the inbox on the service. */
  async saveInboxEntries(sources: KnowledgeSource[]): Promise<boolean> {
    const results = await Promise.all(
      sources.map((ks) => this.enqueue(() => this.writeInboxEntry(ks)))
    );
    return results.every(Boolean);
  }

  /** Remove an entry from the inbox. Its managed file stays. */
  deleteInboxEntry(ks: KnowledgeSource): Promise<boolean> {
    this.db.removeItem(`icon-${ks.id.value}`);
    this.db.removeItem(`chat-${ks.id.value}`);
    return this.enqueue(() =>
      this.remove(`s:${ks.id.value}`, `${this.api}/sources/${ks.id.value}`)
    );
  }

  private async writeInboxEntry(ks: KnowledgeSource) {
    if (ks.ingestType === 'file' && !ks.assetId) {
      await this.copyFile(ks);
    }
    const record = sourceToRecord(ks, null);
    await this.put(
      `s:${record.id}`,
      `${this.api}/sources/${record.id}`,
      record
    );
  }

  /**
   * Move an inbox that an earlier version kept in localStorage to the
   * service. Create-only writes: an entry that the service already has
   * (for example, one moved to a project) does not change. The key is
   * removed only after every entry is saved, so a stopped run repeats
   * safely. Returns the entries that were added.
   */
  async migrateLocalInbox(): Promise<KnowledgeSource[]> {
    const raw = this.db.getItem(LEGACY_INBOX_KEY);
    if (!raw) return [];
    let entries: unknown;
    try {
      entries = JSON.parse(raw);
    } catch {
      entries = undefined;
    }
    if (!Array.isArray(entries)) {
      this.notifications.error(
        'Storage',
        'Inbox Not Moved',
        'The inbox of an earlier version is not readable. It stays in this browser.',
        'toast'
      );
      return [];
    }

    const added: KnowledgeSource[] = [];
    let complete = true;
    for (const ks of entries as KnowledgeSource[]) {
      if (typeof ks?.id?.value !== 'string') continue;
      const saved = await this.enqueue(async () => {
        if (ks.ingestType === 'file' && !ks.assetId) {
          await this.copyFile(ks);
        }
        const record = sourceToRecord(ks, null);
        const body = this.writable(record);
        try {
          await firstValueFrom(
            this.http.put(`${this.api}/sources/${record.id}`, body, {
              headers: { [CREATE_ONLY_HEADER]: '*' },
            })
          );
        } catch (e) {
          if (e instanceof HttpErrorResponse && e.status === 412) return;
          throw e;
        }
        this.synced.set(`s:${record.id}`, JSON.stringify(body));
        added.push(this.revive(ks));
      });
      complete = complete && saved;
    }
    if (complete) this.db.removeItem(LEGACY_INBOX_KEY);
    return added;
  }

  /**
   * Resolve true when every queued write is saved. Resolve false after the
   * timeout, or when the connection is not active.
   */
  async flush(timeoutMs = 10000): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (
      this.tasks.length > 0 &&
      this.backend.current === 'active' &&
      Date.now() < end
    ) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return this.tasks.length === 0;
  }

  /**
   * After logout: drop queued writes and the library data that this page
   * keeps, so the page can close. UI preferences stay.
   */
  closeLibrary() {
    this.closing = true;
    const dropped = this.tasks;
    this.tasks = [];
    this._unsaved.next(0);
    for (const task of dropped) task.done(false);
    this.projectList = [];
    this.inbox = [];
    this.synced.clear();
    for (const key of Object.keys(this.db)) {
      if (
        key.startsWith('icon-') ||
        key.startsWith('chat-') ||
        LIBRARY_CACHE_KEYS.includes(key)
      ) {
        this.db.removeItem(key);
      }
    }
  }

  /** Resolves true when saved, false when the service rejected the write. */
  private enqueue(run: () => Promise<void>): Promise<boolean> {
    return new Promise<boolean>((done) => {
      this.tasks.push({ run, done });
      this._unsaved.next(this.tasks.length);
      this.pump();
    });
  }

  /** Run queued writes in order while the connection is active. */
  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.tasks.length > 0 && this.backend.current === 'active') {
        const task = this.tasks[0];
        let saved = true;
        try {
          await task.run();
        } catch (e) {
          if (this.backend.isConnectionFailure(e)) {
            // Keep this write and all later writes. Retry after reconnect.
            this.backend.connectionLost(e);
            break;
          }
          this.report(e);
          saved = false;
        }
        this.tasks.shift();
        this._unsaved.next(this.tasks.length);
        task.done(saved);
      }
    } finally {
      this.running = false;
    }
  }

  private report(e: unknown) {
    const message =
      e instanceof HttpErrorResponse
        ? e.error?.error?.message ?? e.message
        : e instanceof Error
        ? e.message
        : String(e);
    console.error('[Storage]:', e);
    this.notifications.error('Storage', 'Changes Not Saved', message, 'toast');
  }

  /** Write the project and every changed source. Copy new files first. */
  private async write(project: KcProject) {
    const projectRecord = projectToRecord(project);
    await this.put(
      `p:${projectRecord.id}`,
      `${this.api}/projects/${projectRecord.id}`,
      projectRecord
    );

    for (const ks of project.knowledgeSource ?? []) {
      if (ks.ingestType === 'file' && !ks.assetId) {
        await this.copyFile(ks);
      }
      const record = sourceToRecord(ks, projectRecord.id);
      await this.put(
        `s:${record.id}`,
        `${this.api}/sources/${record.id}`,
        record
      );
    }
  }

  /**
   * Upload the bytes of a selected file. The service returns the managed
   * asset. Desktop and browser use this same operation. The original path
   * is sent as information only, when the desktop knows it.
   *
   * The upload waits while the connection is not active. It repeats only
   * after 401 or 403, which the service returns before it stores anything.
   */
  async uploadFile(
    file: File,
    originalPath: string | null
  ): Promise<AssetRecord> {
    const headers: Record<string, string> = {
      'Content-Type': file.type || 'application/octet-stream',
      [ASSET_FILENAME_HEADER]: encodeURIComponent(file.name),
    };
    if (originalPath) {
      headers[ASSET_ORIGINAL_PATH_HEADER] = encodeURIComponent(originalPath);
    }
    for (;;) {
      await this.backend.whenActive();
      try {
        const { asset } = await firstValueFrom(
          this.http.post<{ asset: AssetRecord }>(`${this.api}/assets`, file, {
            headers,
          })
        );
        return asset;
      } catch (e) {
        if (!this.backend.isAuthFailure(e)) throw e;
      }
    }
  }

  /**
   * A file source without a managed copy, for example from a watched
   * folder (desktop). Copy it by path through the desktop app.
   */
  private async copyFile(ks: KnowledgeSource) {
    const file = ks.reference?.source?.file;
    const path =
      file?.path ?? (typeof ks.accessLink === 'string' ? ks.accessLink : '');
    try {
      const asset = await this.native.importFromPath(
        path,
        file?.type || undefined
      );
      ks.assetId = asset.id;
    } catch (e) {
      // The source is saved without a managed copy. Report it.
      this.notifications.error(
        'Storage',
        'File Not Copied',
        `${ks.title}: ${e instanceof Error ? e.message : e}`,
        'toast'
      );
    }
  }

  private async put(key: string, url: string, record: object) {
    const json = JSON.stringify(this.writable(record));
    if (this.synced.get(key) === json) {
      return;
    }
    await firstValueFrom(this.http.put(url, JSON.parse(json)));
    this.synced.set(key, json);
  }

  private async remove(key: string, url: string) {
    try {
      await firstValueFrom(this.http.delete(url));
    } catch (e) {
      if (!(e instanceof HttpErrorResponse && e.status === 404)) {
        throw e;
      }
    }
    this.synced.delete(key);
  }

  /** Download the library backup (projects, sources, managed files). */
  async exportLibrary() {
    const blob = await firstValueFrom(
      this.http.get(`${this.api}/backup`, { responseType: 'blob' })
    );
    const date = new Date().toISOString().slice(0, 10);
    this.download(blob, `knowledge-library-${date}.tar`);
    return blob.size;
  }

  libraryStatus(): Promise<LibraryStatus> {
    return firstValueFrom(this.http.get<LibraryStatus>(`${this.api}/library`));
  }

  /**
   * Upload a library backup. The service validates it and keeps it staged.
   * Nothing becomes active until activateRestore().
   */
  async stageRestore(file: Blob): Promise<RestorePreview> {
    const { restore } = await firstValueFrom(
      this.http.post<{ restore: RestorePreview }>(
        `${this.api}/restores`,
        file,
        {
          headers: { 'Content-Type': 'application/x-tar' },
        }
      )
    );
    return restore;
  }

  async activateRestore(id: string) {
    const { restored } = await firstValueFrom(
      this.http.post<{
        restored: {
          projects: number;
          sources: number;
          inbox: number;
          assets: number;
        };
      }>(`${this.api}/restores/${id}/activate`, null)
    );
    return restored;
  }

  async cancelRestore(id: string) {
    await firstValueFrom(this.http.delete(`${this.api}/restores/${id}`));
  }

  /**
   * Download a backup of renderer storage: chat history and preferences.
   * Projects and sources are not in it. They are in the library backup.
   */
  export(appVersion?: string) {
    const backup = createBackup(this.db, appVersion);
    const date = backup.exportedAt.slice(0, 10);
    this.download(
      new Blob([JSON.stringify(backup)], {
        type: 'application/json;charset=utf-8;',
      }),
      `knowledge-backup-${date}.json`
    );
    return Object.keys(backup.data).length;
  }

  private download(blob: Blob, filename: string) {
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Chromium reads the blob after click() returns
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  /**
   * Restore a renderer backup. The caller must reload the app afterwards.
   * Throws an Error with a user-facing message if the file is invalid.
   */
  restore(fileText: string): RestoreResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileText);
    } catch {
      throw new Error('The file is not valid JSON.');
    }
    return restoreBackup(this.db, parsed);
  }
}
