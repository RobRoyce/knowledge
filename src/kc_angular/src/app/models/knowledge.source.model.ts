/*
 * Copyright (c) 2023-2024 Rob Royce
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
import { AuthorModel } from '@shared/models/author.model';
import { FileSourceModel } from '@shared/models/file.source.model';
import { UUID } from '@shared/models/uuid.model';
import { ImportMethod } from '@shared/models/knowledge.source.model';
import { WebSourceModel } from '@shared/models/web.source.model';

export type IngestType =
  | 'file'
  | 'website'
  | 'generic'
  | 'topic'
  | 'search'
  | 'note'
  | 'message';

export class SourceModel {
  file: FileSourceModel | undefined;
  website: WebSourceModel | undefined;

  constructor(file?: FileSourceModel, website?: WebSourceModel) {
    if (!file && !website) {
      throw new Error('SourceModel must contain at lesat one valid source.');
    }
    this.file = file;
    this.website = website;
  }
}

export class KnowledgeSourceReference {
  ingestType: IngestType;
  source: SourceModel;
  link: URL | string;

  constructor(ingestType: IngestType, source: SourceModel, link: URL | string) {
    this.ingestType = ingestType;
    this.source = source;
    this.link = link;
  }
}

export type KnowledgeSourceEvent = {
  date: Date;
  label: string;
  hash?: string;
  primeIcon?: string;
  imageIcon?: string;
  iconText?: string;
};

export type SourceNote = {
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

export class KnowledgeSource {
  associatedProject: UUID;
  authors: AuthorModel[];
  dateDue?: Date;
  dateCreated: Date;
  dateAccessed: Date[];
  dateModified: Date[];
  description = '';
  events?: KnowledgeSourceEvent[] = [];
  icon?: any;
  iconUrl?: string;
  id: UUID;
  ingestType: IngestType;
  rawText?: string;
  flagged?: boolean;
  meta: { id?: number; key: string; value: string }[] = [];
  notes: SourceNote[] = [];
  title: string;
  topics?: string[];
  accessLink: URL | string;
  readonly reference: KnowledgeSourceReference;
  importMethod?: ImportMethod = 'manual';
  thumbnail?: string;

  constructor(
    title: string,
    id: UUID,
    ingestType: IngestType,
    reference: KnowledgeSourceReference
  ) {
    this.title = title;
    this.id = id;
    this.associatedProject = { value: '' };
    this.authors = [];
    this.reference = reference;
    this.ingestType = ingestType;
    this.dateCreated = new Date();
    this.dateModified = [];
    this.dateAccessed = [];
    this.accessLink = reference.link;
    this.flagged = false;
    this.notes = [];
    this.topics = [];
    // TODO: this should be replaced with the new EventModel
    this.events = [
      {
        date: new Date(),
        label: 'Created',
      },
    ];
  }
}

export class KnowledgeSourceMarkup {}
