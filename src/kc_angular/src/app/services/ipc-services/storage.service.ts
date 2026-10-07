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
 * Projects and sources. The storage service owns them. This service keeps
 * an in-memory copy for the UI and writes every change to the service in
 * order. It does not use localStorage for projects or sources.
 *
 * localStorage keeps only UI state: the current project, chat history,
 * favicon cache, the inbox, and preferences.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { KcProject } from '@app/models/project.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { AutoscanService } from '@services/ingest-services/autoscan.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { BackendService } from '@services/ipc-services/backend.service';
import { ElectronIpcService } from '@services/ipc-services/electron-ipc.service';
import {
  projectToRecord,
  recordToProject,
  recordToSource,
  sourceToRecord,
} from '@contracts/mapping';
import type {
  LibraryStatus,
  ProjectList,
  ProjectRecord,
  RestorePreview,
  SourceList,
  SourceRecord,
} from '@contracts/storage';
import { createBackup, restoreBackup, RestoreResult } from './backup';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  readonly KC_CURRENT_PROJECT = 'current-project';
  private db = window.localStorage;
  private projectList: KcProject[] = [];

  /** JSON of the last record written to or read from the service, by ID. */
  private synced = new Map<string, string>();

  /** Writes run one at a time, in call order. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private http: HttpClient,
    private backend: BackendService,
    private ipc: ElectronIpcService,
    private autoscan: AutoscanService,
    private notifications: NotificationsService
  ) {}

  private get api() {
    const url = this.backend.storage.url;
    if (!url) {
      throw new Error(
        this.backend.storage.error ?? 'Storage service unavailable.'
      );
    }
    return `${url}/v1`;
  }

  /** Load all projects and sources. Runs once before the app starts. */
  async load() {
    const [{ projects }, { sources }] = await Promise.all([
      firstValueFrom(this.http.get<ProjectList>(`${this.api}/projects`)),
      firstValueFrom(this.http.get<SourceList>(`${this.api}/sources`)),
    ]);

    const byProject = new Map<string, KnowledgeSource[]>();
    for (const record of sources) {
      this.synced.set(`s:${record.id}`, JSON.stringify(this.writable(record)));
      const ks = this.revive(recordToSource(record) as KnowledgeSource);
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

  async saveProject(project: KcProject) {
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

  async updateProject(project: KcProject) {
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

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task).catch((e) => this.report(e));
    return this.queue;
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

  private async copyFile(ks: KnowledgeSource) {
    const file = ks.reference?.source?.file;
    const path =
      file?.path ?? (typeof ks.accessLink === 'string' ? ks.accessLink : '');
    try {
      const asset = await this.ipc.importFile(path, file?.type || undefined);
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

  /** URL of a managed file's content. Fetch it with HttpClient (adds the token). */
  assetContentUrl(assetId: string) {
    return `${this.api}/assets/${assetId}/content`;
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
        restored: { projects: number; sources: number; assets: number };
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
