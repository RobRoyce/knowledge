/*
 * Request validation. Every value from a client passes through here.
 */

import type {
  JsonObject,
  ProjectRecord,
  SourceRecord,
} from "../../kc_contracts/storage.ts";
import { badRequest } from "./errors.ts";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

export const INGEST_TYPES = [
  "file",
  "website",
  "generic",
  "topic",
  "search",
  "note",
  "message",
];

export function validId(value: unknown, field = "id"): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw badRequest(
      `${field} must be 1-128 letters, digits, "-" or "_", starting with a letter or digit.`
    );
  }
  return value;
}

export function validAssetId(value: unknown): string {
  if (typeof value !== "string" || !ASSET_ID_PATTERN.test(value)) {
    throw badRequest("assetId must be a lowercase UUID v4.");
  }
  return value;
}

function text(value: unknown, field: string, max: number, allowEmpty: boolean) {
  if (typeof value !== "string") {
    throw badRequest(`${field} must be a string.`);
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw badRequest(`${field} must not be empty.`);
  }
  if (value.length > max || /[\u0000]/.test(value)) {
    throw badRequest(`${field} must be at most ${max} characters with no NUL.`);
  }
  return value;
}

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`${field} must be a JSON object.`);
  }
  return value as JsonObject;
}

function onlyKeys(body: JsonObject, allowed: string[]) {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    throw badRequest(`Unknown fields: ${extra.join(", ")}. Put them in data.`);
  }
}

export function validProject(pathId: string, input: unknown): ProjectRecord {
  const body = object(input, "body");
  onlyKeys(body, ["id", "parentId", "name", "data", "createdAt", "updatedAt"]);
  const id = validId(pathId);
  if (body["id"] !== undefined && body["id"] !== id) {
    throw badRequest("id in the body does not match the path.");
  }
  const parent = body["parentId"];
  return {
    id,
    parentId:
      parent === null || parent === undefined || parent === ""
        ? null
        : validId(parent, "parentId"),
    name: text(body["name"], "name", 1024, false),
    data: object(body["data"], "data"),
  };
}

export function validSource(pathId: string, input: unknown): SourceRecord {
  const body = object(input, "body");
  onlyKeys(body, [
    "id",
    "projectId",
    "title",
    "ingestType",
    "assetId",
    "position",
    "data",
    "createdAt",
    "updatedAt",
  ]);
  const id = validId(pathId);
  if (body["id"] !== undefined && body["id"] !== id) {
    throw badRequest("id in the body does not match the path.");
  }
  const ingestType = body["ingestType"];
  if (typeof ingestType !== "string" || !INGEST_TYPES.includes(ingestType)) {
    throw badRequest(`ingestType must be one of: ${INGEST_TYPES.join(", ")}.`);
  }
  const asset = body["assetId"];
  const project = body["projectId"];
  if (project === undefined) {
    throw badRequest("projectId is required. Use null for the inbox.");
  }
  return {
    id,
    projectId: project === null ? null : validId(project, "projectId"),
    title: text(body["title"] ?? "", "title", 4096, true),
    ingestType,
    assetId: asset === null || asset === undefined ? null : validAssetId(asset),
    data: object(body["data"], "data"),
  };
}

/** A preference document body: a JSON object up to 64 KiB. */
export function validPreference(input: unknown): JsonObject {
  const body = object(input, "body");
  if (JSON.stringify(body).length > 64 * 1024) {
    throw badRequest("A preference document must be at most 64 KiB.");
  }
  return body;
}

/** A display filename. Path separators and control characters are removed. */
export function validFilename(raw: string | undefined): string {
  if (!raw) {
    throw badRequest("The filename header is required.");
  }
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    throw badRequest("The filename header is not valid percent-encoding.");
  }
  name = name.replace(/[\u0000-\u001f\u007f]/g, "");
  name = name.split(/[\\/]/).pop() ?? "";
  if (!name || name === "." || name === "..") {
    throw badRequest("The filename is empty after removing path parts.");
  }
  return text(name, "filename", 255, false);
}

/** Original location of an upload. Stored as text. The service never opens it. */
export function validOriginalPath(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  try {
    return text(decodeURIComponent(raw), "originalPath", 4096, false);
  } catch (e) {
    if (e instanceof URIError) {
      throw badRequest(
        "The original path header is not valid percent-encoding."
      );
    }
    throw e;
  }
}

export function validMediaType(raw: string | undefined): string {
  const value = (raw ?? "").split(";")[0].trim().toLowerCase();
  if (!value) {
    return "application/octet-stream";
  }
  if (!MEDIA_TYPE_PATTERN.test(value) || value.length > 255) {
    throw badRequest("Content-Type is not a valid media type.");
  }
  return value;
}
