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

import { Injectable } from '@angular/core';
import { AgentType, ChatMessage } from '@app/models/chat.model';
import { UuidService } from '../ipc-services/uuid.service';
import { UUID } from '@shared/models/uuid.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { KcProject } from '@app/models/project.model';

@Injectable({
  providedIn: 'root',
})
export class ChatFactoryService {
  constructor(private uuid: UuidService) {}

  message(sender: AgentType, recipient: AgentType, text: string): ChatMessage {
    const id: UUID = this.uuid.generate(1)[0];

    return {
      id: id.value,
      recipient: recipient,
      sender: sender,
      text: text,
      timestamp: new Date(),
      rating: 'none',
      ephemeral: sender === AgentType.System,
    };
  }

  /**
   * Create a message either from or to a Source
   * @param text The text of the message
   * @param source The Source
   * @param sender The sender of the message (User or Source)
   */
  sourceMessage(
    text: string,
    source: KnowledgeSource,
    sender: AgentType
  ): ChatMessage {
    const id: UUID = this.uuid.generate(1)[0];

    return {
      text: text,
      id: id.value,
      sender: sender,
      recipient:
        sender === AgentType.Source ? AgentType.User : AgentType.Source,
      source: source,
      timestamp: new Date(),
      rating: 'none',
    };
  }

  projectMessage(
    text: string,
    project: KcProject,
    sender: AgentType
  ): ChatMessage {
    const id: UUID = this.uuid.generate(1)[0];

    return {
      text: text,
      id: id.value,
      sender: sender,
      recipient:
        sender === AgentType.Project ? AgentType.User : AgentType.Project,
      project: project,
      timestamp: new Date(),
      rating: 'none',
    };
  }

  topicMessage(
    text: string,
    source?: KnowledgeSource,
    project?: KcProject | null
  ): ChatMessage {
    const id: UUID = this.uuid.generate(1)[0];

    return {
      text: text,
      id: id.value,
      sender: AgentType.Topic,
      recipient: AgentType.User,
      source: source,
      project: project ? project : undefined,
      timestamp: new Date(),
      rating: 'none',
    };
  }

  loadSourceMessages(id: UUID, source: KnowledgeSource) {
    const messages: ChatMessage[] = this.loadMessages(id);

    for (const msg of messages) {
      if (
        msg.sender === AgentType.Source ||
        msg.recipient === AgentType.Source ||
        msg.sender === AgentType.Topic
      ) {
        msg.source = source;
      }
    }

    return messages;
  }

  /**
   * Load messages for a given project
   * @param project The project to load messages for
   */
  loadProjectMessages(project: KcProject) {
    let messages: ChatMessage[] = this.loadMessages(project.id);

    for (const msg of messages) {
      // If the message is to/from a Project or Topic, set the project
      if (
        msg.sender === AgentType.Project ||
        msg.recipient === AgentType.Project ||
        msg.sender === AgentType.Topic
      )
        msg.project = project;
    }

    // Filter out any messages that are to/from a Source
    messages = messages.filter((msg) => {
      return (
        msg.sender !== AgentType.Source &&
        msg.recipient !== AgentType.Source &&
        msg.sender !== AgentType.Category
      );
    });

    return messages;
  }

  private loadMessages(id: UUID): ChatMessage[] {
    let messages: ChatMessage[] = [];

    const stored = localStorage.getItem(`chat-${id.value}`);
    if (stored) {
      messages = JSON.parse(stored);

      for (const msg of messages) {
        msg.timestamp = new Date(msg.timestamp);
      }
    }

    // Remove any duplicates
    messages = messages.filter((msg, index, self) => {
      return (
        index ===
        self.findIndex((m) => {
          return m.id === msg.id;
        })
      );
    });

    return messages;
  }

  saveChat(newHistory: ChatMessage[], id: UUID) {
    localStorage.setItem(`chat-${id.value}`, JSON.stringify(newHistory));
  }
}
