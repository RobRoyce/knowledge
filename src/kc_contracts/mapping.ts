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
 * Conversion between the UI object shapes (KcProject, KnowledgeSource) and
 * storage records. The UI and the migration use the same rules.
 *
 * This file must not import from any application. It uses structural
 * types so that both sides can call it.
 */

type Json = { [key: string]: any };

export interface MappedProject {
  id: string;
  parentId: string | null;
  name: string;
  data: Json;
}

export interface MappedSource {
  id: string;
  /** null: inbox */
  projectId: string | null;
  title: string;
  ingestType: string;
  assetId: string | null;
  data: Json;
}

/** Source fields that the UI derives again. Clients do not store them. */
export const DERIVED_SOURCE_FIELDS = ["icon", "thumbnail"];

const PROJECT_COLUMNS = ["id", "name", "parentId", "knowledgeSource"];
const SOURCE_COLUMNS = [
  "id",
  "title",
  "ingestType",
  "associatedProject",
  "assetId",
];

function without(obj: Json, keys: string[]): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!keys.includes(key) && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function projectToRecord(project: Json): MappedProject {
  const parent = project["parentId"]?.value;
  return {
    id: project["id"]?.value,
    parentId: typeof parent === "string" && parent ? parent : null,
    name: project["name"],
    data: without(project, PROJECT_COLUMNS),
  };
}

export function sourceToRecord(
  source: Json,
  projectId: string | null
): MappedSource {
  return {
    id: source["id"]?.value,
    projectId,
    title: source["title"] ?? "",
    ingestType: source["ingestType"],
    assetId: source["assetId"] ?? null,
    data: without(source, [...SOURCE_COLUMNS, ...DERIVED_SOURCE_FIELDS]),
  };
}

/** Rebuild the UI project object. Sources must be in project order. */
export function recordToProject(project: MappedProject, sources: Json[]): Json {
  return {
    ...project.data,
    id: { value: project.id },
    name: project.name,
    parentId: { value: project.parentId ?? "" },
    knowledgeSource: sources,
  };
}

export function recordToSource(source: MappedSource): Json {
  const out: Json = {
    ...source.data,
    id: { value: source.id },
    title: source.title,
    ingestType: source.ingestType,
    // The UI uses an empty ID for a source without a project (inbox)
    associatedProject: { value: source.projectId ?? "" },
  };
  if (source.assetId) {
    out["assetId"] = source.assetId;
  }
  return out;
}
