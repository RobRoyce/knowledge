/**
 Copyright 2022 Rob Royce

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
import { KnowledgeSourceModel } from "./knowledge.source.model";
import { UUID } from "./uuid.model";
import { EventModel } from "./event.model";

export type KcProjectType =
  | "default"
  | "school"
  | "work"
  | "hobby"
  | "research";

/**
 * S is the source type of the client. The default is the shared source
 * model. This file must not import from Angular or Electron.
 */
export interface KcProjectModel<S = KnowledgeSourceModel> {
  readonly id: UUID;
  name: string;
  type: KcProjectType;
  description: string;
  events?: EventModel[];
  authors: string[];
  parentId: UUID;
  subprojects: string[];
  topics: string[];
  sources: UUID[];

  // Sources are stored separately by the storage service. The UI keeps
  // them on the project object.
  knowledgeSource: S[];
}
