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
  projectId: string;
  title: string;
  ingestType: string;
  /** Managed file of a file source. */
  assetId: string | null;
  /** Order inside the project. Set by the service. */
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

/** GET /v1/library */
export interface LibraryStatus {
  empty: boolean;
  counts: { projects: number; sources: number; assets: number };
}

/** Result of POST /v1/restores: a validated backup that is not active yet. */
export interface RestorePreview {
  id: string;
  backupCreatedAt: string | null;
  backupVersion: number;
  counts: { projects: number; sources: number; assets: number; bytes: number };
  /** First 50 project names. */
  projectNames: string[];
  warnings: string[];
  /** Data that a library backup never contains. */
  notIncluded: string[];
}

export interface LibraryBackupManifest {
  format: "knowledge-library-backup";
  version: 1;
  createdAt: string;
  service: { version: string; schemaVersion: number };
  projects: ProjectRecord[];
  sources: SourceRecord[];
  assets: (AssetRecord & { path: string })[];
}
