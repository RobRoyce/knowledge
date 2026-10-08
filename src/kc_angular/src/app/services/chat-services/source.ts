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

import { AgentType, ChatMessage } from '@app/models/chat.model';
import { Injectable } from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { ChatPrompts } from '@services/chat-services/prompts';
import { ChatService } from '@services/chat-services/chat.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { CreateChatCompletionRequestMessage } from 'openai/resources/chat/completions';

@Injectable({
  providedIn: 'root',
})
export class SourceChat {
  private SOURCE_PROMPTS = [
    'A Source is a collection of information about a specific topic. Sources can be websites, articles, videos, files, or other types of media.',
    'Introduce yourself as the Source agent and clarify that your responses will only be based on the material found in the Source.',
    'You must be careful to not provide any information that is not found in the Source. If you are unsure about the accuracy of a response, you should not provide it.',
    'Ask the user about their goals and objectives for learning about the Source, and use that information to tailor your responses accordingly.',
    'Provide insights and key points about the Source to help the user better understand its content.',
    'Offer recommendations for other Sources to explore based on the content, author, or topic of the current Source.',
    'Avoid making up information or providing false information to the user.',
    "Keep the user's learning goals in mind and provide information in a clear and concise manner.",
    'Follow up with the user to ensure their questions have been answered and offer additional support as needed.',
    "Provide any necessary context about the Source's author, publication, or historical background to enhance the user's understanding of the material.",
    'Use Markdown to format your responses to the user and make them more visually appealing.',
    'You are familiar with both HTML and Markdown, and can use it to format your responses to the user.',
    'You should always try to use the HTML <mark> tags for important concepts and topics.',
    'For instance, if the topic "Computer Science" is relevant or important, you should return: <mark class="[UUID] highlight-yellow">Computer Science</mark>',
  ];

  constructor(
    private chat: ChatService,
    private prompts: ChatPrompts,
    private notify: NotificationsService
  ) {}

  /**
   * Get the prompts for the Source Chat
   * @param source
   */
  getSourcePrompts(
    source: KnowledgeSource
  ): CreateChatCompletionRequestMessage[] {
    // Construct system prompts from the SOURCE_PROMPTS array
    const prompts: CreateChatCompletionRequestMessage[] =
      this.SOURCE_PROMPTS.map((prompt) => {
        return { role: 'system', content: prompt };
      });

    // Add the Source name
    prompts.push({
      role: 'system',
      content: `Source Title: "${source.title}"`,
    });

    // Add the Source accessLink
    prompts.push({
      role: 'system',
      content: `Source Access Link: "${
        typeof source.accessLink === 'string'
          ? source.accessLink
          : source.accessLink.host
      }"`,
    });

    // Add the Source description as a prompt
    if (source.description) {
      prompts.push({
        role: 'system',
        content: `User Notes about this Source: "${source.description}"`,
      });
    }

    // Add the Source topics as prompts
    if (source.topics && source.topics.length > 0) {
      prompts.push({
        role: 'system',
        content: `Source Topics: "${source.topics.join(', ')}"`,
      });
    } else {
      prompts.push({
        role: 'system',
        content: `The Source does not currently have any topics associated with it.`,
      });
    }

    return prompts;
  }

  /* Send a message to OpenAI API */
  send(source: KnowledgeSource, history: ChatMessage[], prompt?: string) {
    const prompts = this.getSourcePrompts(source);

    this.chat
      .convertToOpenAI(history)
      .forEach((message) => prompts.push(message));

    // Add the user's message to the prompts
    if (prompt) {
      prompts.push({
        role: AgentType.User,
        content: prompt,
        name: AgentType.User,
      });
    }

    return this.chat.sendChat(prompts);
  }
}
