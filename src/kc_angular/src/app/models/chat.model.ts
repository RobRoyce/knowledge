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

import { KcProject } from './project.model';
import { KnowledgeSource } from './knowledge.source.model';
import { ChatModelName } from '@shared/models/chat.model';

export enum AgentType {
  Assistant = 'assistant',
  Knowledge = 'knowledge',
  Project = 'project',
  Source = 'source',
  System = 'system',
  User = 'user',
  Tutor = 'tutor',
  Quiz = 'quiz',
  Category = 'category',
  Topic = 'topic',
}

export type MessageRating = 'thumbs-up' | 'thumbs-down' | 'none';

export interface ChatMessage {
  id: string;
  sender: AgentType;
  recipient: AgentType;
  text: string;
  timestamp: Date;
  project?: KcProject;
  source?: KnowledgeSource;
  suggestion?: boolean;
  regenerated?: boolean;
  rating?: MessageRating;
  ephemeral?: boolean;
  model?: ChatModelName;
}
