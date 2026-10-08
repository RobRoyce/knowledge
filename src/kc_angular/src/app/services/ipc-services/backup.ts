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

/*
 * Backup and restore for renderer storage.
 *
 * A backup is a full snapshot of localStorage. It holds projects, their
 * sources and annotations, chat history, the inbox, topics and UI state.
 * It does not hold settings, imported files or the extracted-text cache.
 *
 * This module has no Angular or Electron imports so that Node can test it.
 */

export const BACKUP_FORMAT = 'knowledge-backup';
export const BACKUP_VERSION = 1;
export const PROJECT_LIST_KEY = 'kc-projects';

/** The subset of the Web Storage API that backup and restore use. */
export interface KeyValueStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appVersion?: string;
  data: Record<string, string>;
}

export interface RestoreResult {
  keysWritten: number;
  projectsAdded: number;
  projectsReplaced: number;
}

export function createBackup(
  store: KeyValueStore,
  appVersion?: string,
  now = new Date()
): Backup {
  const data: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key === null) {
      continue;
    }
    const value = store.getItem(key);
    if (value !== null) {
      data[key] = value;
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    data,
  };
}

/**
 * Restore a backup into the store.
 *
 * Keys from the backup replace keys with the same name. The project list is
 * merged so that projects already in the store remain listed.
 * Throws an Error with a user-facing message if the input is not a backup.
 */
export function restoreBackup(
  store: KeyValueStore,
  input: unknown
): RestoreResult {
  const data = toKeyValues(input);

  const existingIds = readProjectIds(store.getItem(PROJECT_LIST_KEY));
  const importedIds = readProjectIds(data[PROJECT_LIST_KEY] ?? null);

  let keysWritten = 0;
  for (const [key, value] of Object.entries(data)) {
    if (key === PROJECT_LIST_KEY) {
      continue;
    }
    store.setItem(key, value);
    keysWritten++;
  }

  const merged = [...existingIds];
  let projectsAdded = 0;
  let projectsReplaced = 0;
  for (const id of importedIds) {
    if (merged.includes(id)) {
      projectsReplaced++;
    } else {
      merged.push(id);
      projectsAdded++;
    }
  }
  store.setItem(PROJECT_LIST_KEY, JSON.stringify(merged));
  keysWritten++;

  return { keysWritten, projectsAdded, projectsReplaced };
}

/**
 * Convert a parsed backup file into storage keys and values.
 */
function toKeyValues(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') {
    throw new Error('The file is not a Knowledge backup.');
  }
  const obj = input as Record<string, unknown>;

  if (obj['format'] === BACKUP_FORMAT) {
    if (obj['version'] !== BACKUP_VERSION) {
      throw new Error(
        `Backup version ${obj['version']} is not supported. Expected ${BACKUP_VERSION}.`
      );
    }
    const data = obj['data'];
    if (!data || typeof data !== 'object') {
      throw new Error('The backup has no data.');
    }
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'string') {
        throw new Error(`The backup value for "${key}" is not text.`);
      }
    }
    return data as Record<string, string>;
  }

  throw new Error('The file is not a Knowledge backup.');
}

function readProjectIds(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}
