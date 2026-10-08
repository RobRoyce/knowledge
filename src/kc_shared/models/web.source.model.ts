/*
 * Copyright (c) 2024 Rob Royce
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
import { WebSourceMarkup } from "./markup.model";

export interface WebSourceModel {
  accessLink: string;
  iconUrl?: string;
  topics?: string[];
  metadata?: WebsiteMetadataModel;
  markup?: WebSourceMarkup;
  flagged?: boolean;
  rawText?: string;
  thumbnail?: string;
  title?: string;
  description?: string;
}

export interface WebsiteMetadataModel {
  title?: string;
  meta?: WebsiteMetaTagsModel[];
  icon?: any;
  article?: ArticleModel;
  code?: CodeModel[];
  links?: string[];
}

export interface WebsiteMetaTagsModel {
  key?: string | null;
  value?: string | null;
  property?: string | null;
}

export interface WebsiteContentModel {
  title?: string;
  type?: string;
  text?: string;
  html?: string;
}

export type ArticleModel = WebsiteContentModel;

export type CodeModel = WebsiteContentModel;
