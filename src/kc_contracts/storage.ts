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
 * Storage service API contract, version 1.
 *
 * Types only. This file must not import from any application.
 */

export type JsonObject = { [key: string]: unknown };

export interface ProjectRecord {
  id: string;
  parentId: string | null;
  name: string;
  /** Every project field that has no column. */
  data: JsonObject;
  createdAt?: string;
  updatedAt?: string;
}

export interface SourceRecord {
  id: string;
  /** null: the source is in the inbox, not in a project yet. */
  projectId: string | null;
  title: string;
  ingestType: string;
  /** Managed file of a file source. */
  assetId: string | null;
  /** Order inside the project or the inbox. Set by the service. */
  position?: number;
  /** Every source field that has no column. */
  data: JsonObject;
  createdAt?: string;
  updatedAt?: string;
}

export interface AssetRecord {
  id: string;
  sha256: string;
  size: number;
  mediaType: string;
  filename: string;
  /** Location of the file when it was imported. Information only. */
  originalPath: string | null;
  createdAt: string;
}

export interface HealthResponse {
  status: "ok";
  service: "kc-storage";
  version: string;
  schemaVersion: number;
}

export type StorageErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "precondition_failed"
  | "payload_too_large"
  | "internal";

export interface ErrorResponse {
  error: { code: StorageErrorCode; message: string };
}

export interface ProjectList {
  projects: ProjectRecord[];
}

export interface SourceList {
  sources: SourceRecord[];
}

/** Request headers for POST /v1/assets. Values are percent-encoded. */
export const ASSET_FILENAME_HEADER = "x-knowledge-filename";
export const ASSET_ORIGINAL_PATH_HEADER = "x-knowledge-original-path";

/** Library counts. `sources` includes the inbox entries. */
export interface LibraryCounts {
  projects: number;
  sources: number;
  inbox: number;
  assets: number;
}

/** GET /v1/library */
export interface LibraryStatus {
  empty: boolean;
  counts: LibraryCounts;
}

/**
 * Request header for PUT /v1/sources/<id>. With the value "*", the service
 * creates the source only if no source has this ID. Otherwise it returns
 * 412 and changes nothing.
 */
export const CREATE_ONLY_HEADER = "if-none-match";

/** GET and PUT /v1/preferences/<key>. Not part of a library backup. */
export interface PreferenceDocument {
  key: string;
  data: JsonObject;
  updatedAt: string;
}

/**
 * Response header on requests that use a browser session: seconds until
 * the session ends if no other request arrives.
 */
export const SESSION_TTL_HEADER = "x-knowledge-session-ttl";

/** Result of POST /v1/restores: a validated backup that is not active yet. */
export interface RestorePreview {
  id: string;
  backupCreatedAt: string | null;
  backupVersion: number;
  counts: LibraryCounts & { bytes: number };
  /** First 50 project names. */
  projectNames: string[];
  warnings: string[];
  /** Data that a library backup never contains. */
  notIncluded: string[];
}

/**
 * Version 1: projects, sources, and managed files.
 * Version 2: also inbox entries (sources with projectId null).
 */
export interface LibraryBackupManifest {
  format: "knowledge-library-backup";
  version: 1 | 2;
  createdAt: string;
  service: { version: string; schemaVersion: number };
  projects: ProjectRecord[];
  sources: SourceRecord[];
  assets: (AssetRecord & { path: string })[];
}
