/*
 * Projects, sources, and asset records. All SQL for these tables is here.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  AssetRecord,
  ProjectRecord,
  SourceRecord,
} from "../../kc_contracts/storage.ts";
import { conflict } from "./errors.ts";
import { now } from "./db.ts";

export type WriteResult = "created" | "updated" | "unchanged";

interface ProjectRow {
  id: string;
  parent_id: string | null;
  name: string;
  data: string;
  created_at: string;
  updated_at: string;
}

interface SourceRow {
  id: string;
  project_id: string;
  title: string;
  ingest_type: string;
  asset_id: string | null;
  position: number;
  data: string;
  created_at: string;
  updated_at: string;
}

interface AssetRow {
  id: string;
  sha256: string;
  size: number;
  media_type: string;
  filename: string;
  original_path: string | null;
  created_at: string;
}

const toProject = (r: ProjectRow): ProjectRecord => ({
  id: r.id,
  parentId: r.parent_id,
  name: r.name,
  data: JSON.parse(r.data),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toSource = (r: SourceRow): SourceRecord => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  ingestType: r.ingest_type,
  assetId: r.asset_id,
  position: r.position,
  data: JSON.parse(r.data),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toAsset = (r: AssetRow): AssetRecord => ({
  id: r.id,
  sha256: r.sha256,
  size: r.size,
  mediaType: r.media_type,
  filename: r.filename,
  originalPath: r.original_path,
  createdAt: r.created_at,
});

export class Library {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  listProjects(): ProjectRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY created_at, id")
      .all() as unknown as ProjectRow[];
    return rows.map(toProject);
  }

  getProject(id: string): ProjectRecord | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return row ? toProject(row as unknown as ProjectRow) : undefined;
  }

  putProject(p: ProjectRecord, createdAt?: string): WriteResult {
    const data = JSON.stringify(p.data);
    const old = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(p.id) as unknown as ProjectRow | undefined;

    if (!old) {
      const time = now();
      this.db
        .prepare(
          "INSERT INTO projects (id, parent_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(p.id, p.parentId, p.name, data, createdAt ?? time, time);
      return "created";
    }
    if (
      old.parent_id === p.parentId &&
      old.name === p.name &&
      old.data === data
    ) {
      return "unchanged";
    }
    this.db
      .prepare(
        "UPDATE projects SET parent_id = ?, name = ?, data = ?, updated_at = ? WHERE id = ?"
      )
      .run(p.parentId, p.name, data, now(), p.id);
    return "updated";
  }

  deleteProject(id: string): boolean {
    return (
      this.db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0
    );
  }

  listSources(projectId?: string): SourceRecord[] {
    const rows = (projectId
      ? this.db
          .prepare(
            "SELECT * FROM sources WHERE project_id = ? ORDER BY position, id"
          )
          .all(projectId)
      : this.db
          .prepare("SELECT * FROM sources ORDER BY project_id, position, id")
          .all()) as unknown as SourceRow[];
    return rows.map(toSource);
  }

  getSource(id: string): SourceRecord | undefined {
    const row = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id);
    return row ? toSource(row as unknown as SourceRow) : undefined;
  }

  putSource(s: SourceRecord, createdAt?: string): WriteResult {
    if (!this.getProject(s.projectId)) {
      throw conflict(`Project ${s.projectId} does not exist.`);
    }
    if (s.assetId && !this.getAsset(s.assetId)) {
      throw conflict(`Asset ${s.assetId} does not exist.`);
    }

    const data = JSON.stringify(s.data);
    const old = this.db
      .prepare("SELECT * FROM sources WHERE id = ?")
      .get(s.id) as unknown as SourceRow | undefined;

    // New sources and moved sources go to the end of their project
    const position =
      old && old.project_id === s.projectId
        ? old.position
        : this.nextPosition(s.projectId);

    if (!old) {
      const time = now();
      this.db
        .prepare(
          `INSERT INTO sources (id, project_id, title, ingest_type, asset_id, position, data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          s.id,
          s.projectId,
          s.title,
          s.ingestType,
          s.assetId,
          position,
          data,
          createdAt ?? time,
          time
        );
      return "created";
    }
    if (
      old.project_id === s.projectId &&
      old.title === s.title &&
      old.ingest_type === s.ingestType &&
      old.asset_id === s.assetId &&
      old.data === data
    ) {
      return "unchanged";
    }
    this.db
      .prepare(
        `UPDATE sources SET project_id = ?, title = ?, ingest_type = ?, asset_id = ?, position = ?, data = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        s.projectId,
        s.title,
        s.ingestType,
        s.assetId,
        position,
        data,
        now(),
        s.id
      );
    return "updated";
  }

  deleteSource(id: string): boolean {
    return (
      this.db.prepare("DELETE FROM sources WHERE id = ?").run(id).changes > 0
    );
  }

  private nextPosition(projectId: string): number {
    const row = this.db
      .prepare("SELECT MAX(position) AS p FROM sources WHERE project_id = ?")
      .get(projectId) as { p: number | null };
    return (row.p ?? -1) + 1;
  }

  listAssets(): AssetRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM assets ORDER BY created_at, id")
      .all() as unknown as AssetRow[];
    return rows.map(toAsset);
  }

  getAsset(id: string): AssetRecord | undefined {
    const row = this.db.prepare("SELECT * FROM assets WHERE id = ?").get(id);
    return row ? toAsset(row as unknown as AssetRow) : undefined;
  }

  /** An existing asset with the same content and origin, if any. */
  findAsset(
    sha256: string,
    originalPath: string | null
  ): AssetRecord | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM assets WHERE sha256 = ? AND original_path IS ? ORDER BY created_at LIMIT 1"
      )
      .get(sha256, originalPath);
    return row ? toAsset(row as unknown as AssetRow) : undefined;
  }

  insertAsset(a: AssetRecord) {
    this.db
      .prepare(
        `INSERT INTO assets (id, sha256, size, media_type, filename, original_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        a.id,
        a.sha256,
        a.size,
        a.mediaType,
        a.filename,
        a.originalPath,
        a.createdAt
      );
  }

  deleteAsset(id: string) {
    this.db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  }

  assetIds(): Set<string> {
    const rows = this.db.prepare("SELECT id FROM assets").all() as {
      id: string;
    }[];
    return new Set(rows.map((r) => r.id));
  }

  isEmpty(): boolean {
    const row = this.db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM projects) + (SELECT COUNT(*) FROM sources) + (SELECT COUNT(*) FROM assets) AS n"
      )
      .get() as { n: number };
    return row.n === 0;
  }
}
