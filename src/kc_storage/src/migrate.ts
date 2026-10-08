/*
 * Controlled import of renderer data (a Settings > Backup file,
 * format "knowledge-backup" version 1) into the library.
 *
 * - The input file is never changed. A copy goes into the run directory.
 * - The whole input is parsed and validated before any write.
 * - The database is copied (VACUUM INTO) before any write.
 * - All records are written in one transaction. Copied files are removed
 *   if the transaction fails.
 * - IDs are kept. A repeated run updates or skips records.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DERIVED_SOURCE_FIELDS,
  projectToRecord,
  sourceToRecord,
} from "../../kc_contracts/mapping.ts";
import type {
  ProjectRecord,
  SourceRecord,
} from "../../kc_contracts/storage.ts";
import type { StagedFile } from "./assets.ts";
import type { DataDir } from "./datadir.ts";
import { now, transaction } from "./db.ts";
import { StorageError } from "./errors.ts";
import { validProject, validSource } from "./validate.ts";

const INPUT_FORMAT = "knowledge-backup";
const MAX_FILE_BYTES = 2 * 1024 ** 3;

interface Item {
  id: string;
  title?: string;
  reason?: string;
}

export interface MigrationReport {
  runId: string;
  status: "completed" | "failed" | "dry-run";
  startedAt: string;
  finishedAt?: string;
  input: { path: string; sha256: string };
  runDirectory: string | null;
  projects: {
    imported: Item[];
    updated: Item[];
    unchanged: Item[];
    failed: Item[];
  };
  sources: {
    imported: Item[];
    updated: Item[];
    unchanged: Item[];
    skipped: Item[];
    failed: Item[];
  };
  files: {
    copied: { sourceId: string; path: string; assetId: string }[];
    reused: { sourceId: string; path: string; assetId: string }[];
    kept: { sourceId: string; assetId: string }[];
    missing: { sourceId: string; title: string; path: string | null }[];
  };
  /** ks-<id> records that differ from the copy inside the project. */
  superseded: { key: string; differentFields: string[] }[];
  /** Derived source fields that were not stored, by field name. */
  droppedDerivedFields: Record<string, number>;
  /** IDs of inbox entries (ingest-queue) planned as sources without a project. */
  inbox: string[];
  /** Renderer keys that stay in localStorage (chat history, preferences). */
  rendererKeys: string[];
  rollback: { snapshot: string | null };
  error?: string;
}

interface PlannedSource {
  record: SourceRecord;
  filePath: string | null;
}

function isProjectValue(value: any, key: string) {
  return (
    value &&
    typeof value === "object" &&
    value.id?.value === key &&
    typeof value.name === "string" &&
    Array.isArray(value.knowledgeSource)
  );
}

function parse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The input is not valid JSON.");
  }
}

function filePathOf(source: any): string | null {
  const candidate = source?.reference?.source?.file?.path ?? source?.accessLink;
  return typeof candidate === "string" && path.isAbsolute(candidate)
    ? candidate
    : null;
}

function differentFields(a: any, b: any): string[] {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].filter(
    (k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])
  );
}

export async function migrate(
  dir: DataDir,
  inputPath: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationReport> {
  const text = fs.readFileSync(inputPath, "utf8");
  const inputSha = crypto.createHash("sha256").update(text).digest("hex");
  const runId = `${now().replace(/[:.]/g, "-")}-${crypto
    .randomBytes(3)
    .toString("hex")}`;

  const report: MigrationReport = {
    runId,
    status: options.dryRun ? "dry-run" : "completed",
    startedAt: now(),
    input: { path: path.resolve(inputPath), sha256: inputSha },
    runDirectory: null,
    projects: { imported: [], updated: [], unchanged: [], failed: [] },
    sources: {
      imported: [],
      updated: [],
      unchanged: [],
      skipped: [],
      failed: [],
    },
    files: { copied: [], reused: [], kept: [], missing: [] },
    superseded: [],
    droppedDerivedFields: {},
    inbox: [],
    rendererKeys: [],
    rollback: { snapshot: null },
  };

  // 1. Validate the input as a whole. Nothing is written yet.
  const input = parse(text);
  if (
    input?.format !== INPUT_FORMAT ||
    input.version !== 1 ||
    typeof input.data !== "object"
  ) {
    throw new Error(`The input is not a ${INPUT_FORMAT} version 1 file.`);
  }
  const data: Record<string, string> = input.data;

  const projects: ProjectRecord[] = [];
  const projectIds = new Set<string>();
  const planned: PlannedSource[] = [];
  const plannedIds = new Set<string>();
  const separate = new Map<string, any>();
  const consumed = new Set<string>();

  for (const [key, raw] of Object.entries(data)) {
    if (typeof raw !== "string") {
      throw new Error(`The value of ${key} is not text.`);
    }
    let value: any;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    // ks-<id> holds a separate source copy. Other ks- keys are UI preferences.
    if (key.startsWith("ks-") && value?.id?.value === key.slice(3)) {
      separate.set(key, raw);
      continue;
    }
    if (!isProjectValue(value, key)) {
      continue;
    }
    consumed.add(key);
    try {
      const mapped = projectToRecord(value);
      const record = validProject(mapped.id, mapped);
      projects.push(record);
      projectIds.add(record.id);
      for (const ks of value.knowledgeSource) {
        planSource(ks, record.id);
      }
    } catch (e: any) {
      report.projects.failed.push({
        id: key,
        title: value.name,
        reason: e.message,
      });
      for (const ks of value.knowledgeSource) {
        report.sources.skipped.push({
          id: ks?.id?.value ?? "(no id)",
          title: ks?.title,
          reason: `Project ${key} failed validation.`,
        });
      }
    }
  }
  consumed.add("kc-projects");

  function planSource(ks: any, projectId: string | null) {
    const id = ks?.id?.value ?? "(no id)";
    try {
      for (const field of DERIVED_SOURCE_FIELDS) {
        if (ks?.[field] !== undefined) {
          report.droppedDerivedFields[field] =
            (report.droppedDerivedFields[field] ?? 0) + 1;
        }
      }
      const mapped = sourceToRecord(ks, projectId);
      const record = validSource(mapped.id, mapped);
      // A managed file that this library does not have: copy it by path again
      if (record.assetId && !dir.library.getAsset(record.assetId)) {
        record.assetId = null;
      }
      if (plannedIds.has(record.id)) {
        report.sources.skipped.push({
          id,
          title: ks.title,
          reason: "Duplicate source ID in input.",
        });
        return;
      }
      plannedIds.add(record.id);
      planned.push({
        record,
        filePath: record.ingestType === "file" ? filePathOf(ks) : null,
      });
    } catch (e: any) {
      report.sources.failed.push({ id, title: ks?.title, reason: e.message });
    }
  }

  // Separate ks-<id> records: superseded by the embedded copy, or standalone
  for (const [key, raw] of separate) {
    consumed.add(key);
    let ks: any;
    try {
      ks = JSON.parse(raw);
    } catch {
      report.sources.failed.push({ id: key, reason: "Not valid JSON." });
      continue;
    }
    const id = key.slice(3);
    const embedded = planned.find((p) => p.record.id === id);
    if (embedded) {
      const fields = differentFields(
        sourceToRecord(ks, embedded.record.projectId).data,
        embedded.record.data
      );
      if (fields.length > 0) {
        report.superseded.push({ key, differentFields: fields });
      }
      continue;
    }
    const projectId = ks?.associatedProject?.value;
    if (typeof projectId === "string" && projectIds.has(projectId)) {
      planSource(ks, projectId);
    } else {
      report.sources.skipped.push({
        id,
        title: ks?.title,
        reason: `Separate record ${key} has no project in the input.`,
      });
    }
  }

  // Inbox entries. Import an entry only if no source has its ID, so a
  // repeated run or an entry already moved to a project stays unchanged.
  const inboxRaw = data["ingest-queue"];
  if (inboxRaw !== undefined) {
    consumed.add("ingest-queue");
    let queue: unknown;
    try {
      queue = JSON.parse(inboxRaw);
    } catch {
      queue = undefined;
    }
    if (!Array.isArray(queue)) {
      report.sources.failed.push({
        id: "ingest-queue",
        reason: "The inbox is not a JSON list.",
      });
    } else {
      for (const ks of queue) {
        const id = ks?.id?.value;
        if (
          typeof id === "string" &&
          (plannedIds.has(id) || dir.library.getSource(id))
        ) {
          report.sources.skipped.push({
            id,
            title: ks?.title,
            reason: "The inbox entry is already in the library.",
          });
          continue;
        }
        const before = planned.length;
        planSource(ks, null);
        if (planned.length > before) report.inbox.push(id);
      }
    }
  }

  report.rendererKeys = Object.keys(data)
    .filter((k) => !consumed.has(k))
    .sort();

  // 2. Find the files. A missing file is reported, and the source is kept.
  for (const p of planned) {
    if (p.record.ingestType !== "file") continue;
    const existing = dir.library.getSource(p.record.id);
    const usable =
      p.filePath &&
      fs.existsSync(p.filePath) &&
      fs.statSync(p.filePath).isFile();
    if (!usable) {
      if (existing?.assetId) {
        p.record.assetId = existing.assetId;
        report.files.kept.push({
          sourceId: p.record.id,
          assetId: existing.assetId,
        });
      } else {
        report.files.missing.push({
          sourceId: p.record.id,
          title: p.record.title,
          path: p.filePath,
        });
      }
      p.filePath = null;
    }
  }

  if (options.dryRun) {
    for (const p of projects)
      report.projects.imported.push({ id: p.id, title: p.name });
    for (const s of planned)
      report.sources.imported.push({ id: s.record.id, title: s.record.title });
    report.finishedAt = now();
    return report;
  }

  // 3. Prepare the run directory and a database snapshot for rollback
  const runDir = path.join(dir.root, "migrations", runId);
  fs.mkdirSync(runDir, { recursive: true });
  report.runDirectory = runDir;
  fs.copyFileSync(inputPath, path.join(runDir, "input.json"));
  const snapshot = path.join(runDir, "pre-migration.sqlite");
  dir.db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
  report.rollback.snapshot = snapshot;

  // 4. Stage file copies, then write everything in one transaction
  const staged: { sourceId: string; path: string; file: StagedFile }[] = [];
  const committed: string[] = [];
  try {
    for (const p of planned) {
      if (p.filePath) {
        const file = await dir.assets.stage(
          fs.createReadStream(p.filePath),
          MAX_FILE_BYTES
        );
        staged.push({ sourceId: p.record.id, path: p.filePath, file });
      }
    }

    transaction(dir.db, () => {
      for (const p of projects) {
        const created = p.data["dateCreated"];
        const result = dir.library.putProject(
          p,
          typeof created === "string" ? created : undefined
        );
        const item = { id: p.id, title: p.name };
        if (result === "created") report.projects.imported.push(item);
        else if (result === "updated") report.projects.updated.push(item);
        else report.projects.unchanged.push(item);
      }

      for (const p of planned) {
        const stage = staged.find((s) => s.sourceId === p.record.id);
        if (stage) {
          const reuse = dir.library.findAsset(stage.file.sha256, stage.path);
          if (reuse) {
            p.record.assetId = reuse.id;
            report.files.reused.push({
              sourceId: p.record.id,
              path: stage.path,
              assetId: reuse.id,
            });
          } else {
            const id = crypto.randomUUID();
            const filename = path.basename(stage.path);
            dir.library.insertAsset({
              id,
              sha256: stage.file.sha256,
              size: stage.file.size,
              mediaType:
                (p.record.data as any)?.reference?.source?.file?.type ||
                "application/octet-stream",
              filename,
              originalPath: stage.path,
              createdAt: now(),
            });
            dir.assets.commit(stage.file, id);
            committed.push(id);
            p.record.assetId = id;
            report.files.copied.push({
              sourceId: p.record.id,
              path: stage.path,
              assetId: id,
            });
          }
        }

        const result = dir.library.putSource(p.record);
        const item = { id: p.record.id, title: p.record.title };
        if (result === "created") report.sources.imported.push(item);
        else if (result === "updated") report.sources.updated.push(item);
        else report.sources.unchanged.push(item);
      }

      if (process.env.KC_STORAGE_TEST_FAULT === "migrate-before-commit") {
        throw new Error("Injected test fault before commit.");
      }
    });
  } catch (e: any) {
    for (const id of committed) dir.assets.remove(id);
    report.status = "failed";
    report.error =
      e instanceof StorageError || e instanceof Error ? e.message : String(e);
    // Nothing was written. Keep validation results, clear write results.
    for (const list of [
      report.projects.imported,
      report.projects.updated,
      report.projects.unchanged,
    ])
      list.length = 0;
    for (const list of [
      report.sources.imported,
      report.sources.updated,
      report.sources.unchanged,
    ])
      list.length = 0;
    report.files.copied.length = 0;
    report.files.reused.length = 0;
  } finally {
    for (const s of staged) dir.assets.discard(s.file);
  }

  report.finishedAt = now();
  dir.db
    .prepare(
      "INSERT INTO import_runs (id, input_sha256, started_at, finished_at, status, report) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      runId,
      inputSha,
      report.startedAt,
      report.finishedAt,
      report.status,
      JSON.stringify(report)
    );
  fs.writeFileSync(
    path.join(runDir, "report.json"),
    JSON.stringify(report, null, 2)
  );
  return report;
}
