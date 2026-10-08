/*
 * SQLite database and versioned schema migrations.
 */

import { DatabaseSync } from "node:sqlite";

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        name TEXT NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        size INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_path TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX assets_sha256 ON assets (sha256);

      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        ingest_type TEXT NOT NULL,
        asset_id TEXT REFERENCES assets (id) ON DELETE RESTRICT,
        position INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX sources_project ON sources (project_id, position);

      CREATE TABLE import_runs (
        id TEXT PRIMARY KEY,
        input_sha256 TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        report TEXT
      ) STRICT;
    `,
  },
  {
    // Inbox entries are sources with no project. Rebuild the table, because
    // SQLite cannot remove NOT NULL from a column. No table refers to it.
    version: 2,
    sql: `
      CREATE TABLE sources_v2 (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        ingest_type TEXT NOT NULL,
        asset_id TEXT REFERENCES assets (id) ON DELETE RESTRICT,
        position INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO sources_v2 SELECT
        id, project_id, title, ingest_type, asset_id, position, data,
        created_at, updated_at
      FROM sources;

      DROP TABLE sources;
      ALTER TABLE sources_v2 RENAME TO sources;
      CREATE INDEX sources_project ON sources (project_id, position);

      CREATE TABLE preferences (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL CHECK (json_valid(data)),
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function now() {
  return new Date().toISOString();
}

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  applyMigrations(db);
  return db;
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get() as { version: number | null };
  return row.version ?? 0;
}

function applyMigrations(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT
  `);

  const current = schemaVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${current} is newer than this service supports (${SCHEMA_VERSION}).`
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) {
      continue;
    }
    transaction(db, () => {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
      ).run(migration.version, now());
    });
  }
}

/** Run fn in one write transaction. Roll back if it throws. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
