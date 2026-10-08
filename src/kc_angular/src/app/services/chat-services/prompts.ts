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

import { Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { ChatService } from './chat.service';
import { KcProject } from '../../models/project.model';
import { KnowledgeSource } from '../../models/knowledge.source.model';
import { ChatMessage } from '../../models/chat.model';

@Injectable({
  providedIn: 'root',
})
export class ChatPrompts {
  constructor(private chat: ChatService) {}

  introPrompts = (
    concept: KnowledgeSource | KcProject,
    type: 'Source' | 'Project'
  ): ChatCompletionMessageParam[] => {
    const prompts = [
      `Information cutoff: December 2021, Current date: ${new Date().toDateString()}.`,
      `Knowledge is a tool for saving, searching, accessing, and exploring all of your favorite websites, documents and files.`,
      `Knowledge is an application that can organize your research and learning materials.`,
      `A Source is a URL or local file path that contains information, data, or other digital resources. Users import Sources into Knowledge.`,
      `You can chat with a Source and ask it questions.`,
      `Example: [Source="https://en.wikipedia.org/wiki/France"]\nQ: What is the capital of France?\nA: Paris`,
      `Example: [Source="/home/users/user/Documents/MyFile.txt"]\nQ: How many times does the word "prototype" appear in MyFile.txt?\nA: 5`,
      `A Project is a collection of Sources that you can organize into a hierarchy.`,
      `A Project can have multiple Subprojects, each of which can have their own Subprojects.`,
      `You are the ${type} agent, and your job is to answer questions about ${type}s.`,
      `Each Source has a dedicated agent that works to help the user understand the content and provide key insights and concepts.`,
      `When asked for an introduction to a Source, introduce it as a concept to the user in the most effective way possible.`,
      `An effective introduction should be clear, concise, and informative.`,
      `Write the introduction in the present tense, passive voice, indicative mood, and with a simple sentence structure.`,
      `The introduction is 2-4 paragraphs in length, each paragraph is 4-5 sentences long.`,
      `The introduction is engaging and encourages the user to learn more.`,
      `The introduction is no shorter than 150 words.`,
      `Use Markdown formatting to make the introduction more readable.`,
      `Example:\nQ:What is the population of France?\nA: **67 million**`,
      `Use lists and bullet points whenever appropriate.`,
      `Example:\nQ:What are some topics covered by this Source?\nA:\n- **France**: France is...\n- **Europe**: ...\n- **European Union**: The European Union is ...`,
      `You should not respond with irrelevant or unverified information.`,
      `If you are unsure of the answer, you should respond with "I don't know."`,
    ];

    if (concept instanceof KcProject) {
      const projectIntro = [
        `The Project is called "${concept.name}".`,
        `The Project was created on "${concept.dateCreated}".`,
        `The Project has ${concept.sources.length} Sources.`,
        `The Project has ${concept.subprojects.length} Subprojects.`,
      ];
      projectIntro.forEach((prompt) => prompts.push(prompt));
    }

    if (concept instanceof KnowledgeSource) {
      const ingestType =
        concept.ingestType === 'file'
          ? 'a file stored on the users computer'
          : 'a web link';
      const topics = concept.topics?.map((t: string) => `${t}`).join(', ');
      const description = concept.description?.substring(0, 4096);

      const sourceIntro = [
        `The Source is called "${concept.title}" and is in the form of ${ingestType}.`,
        topics && topics.length > 0
          ? `The Source has been tagged with the following topics: "${topics}".`
          : `The Source has not been tagged with topics yet.`,
        `The Source has the following description: "${description}".`,
        `Assume the user is asking you a question with the intent to learn and understand.`,
        `Consider what the user might want to learn from the Source.`,
        `Explain why the Source is important or relevant.`,
        `Introduction section 1: Summary of the Source.`,
        `Introduction section 2: List of important concepts and ideas mentioned in the Source.`,
        `Introduction section 3: Follow-up questions or recommendations for additional reading based on the Source.`,
        `If you have extra room, recommend new topics for the user to consider adding to the Source.`,
        `You hold the integrity of truthful and accurate information in the highest regard.`,
        `You must never lie to or mislead the user.`,
        `You must only use information available in the Source.`,
        `Never use information that is not found directly in the Source or the Source chat history.`,
      ];
      sourceIntro.forEach((prompt) => prompts.push(prompt));
    }

    return prompts.map((prompt) => {
      const message: ChatCompletionMessageParam = {
        role: 'system',
        content: prompt,
      };
      return message;
    });
  };

  predictNextQuestion(
    chatHistory: ChatMessage[],
    context: 'source' | 'project',
    additionalContext?: string
  ) {
    // Get the 25 most recent messages from history
    const recentMessages: ChatMessage[] = chatHistory.slice(
      Math.max(chatHistory.length - 25, 0)
    );

    // Map those messages into a ChatCompletionRequest object
    const completionRequests: ChatCompletionMessageParam[] = recentMessages.map(
      (message) => {
        return {
          role: message.sender === 'user' ? 'user' : 'assistant',
          content: message.text,
        };
      }
    );

    // Explain how to generate the questions to the assistant
    completionRequests.push({
      role: 'user',
      content: `Given our conversation history, what are some questions I might ask about any related concepts or topics? Please list 3 questions.`,
    });
    completionRequests.push({
      role: 'system',
      content: `Do not respond with anything other than the questions themselves.`,
    });
    completionRequests.push({
      role: 'system',
      content: `Try to think of questions that would be most useful to the user.`,
    });
    completionRequests.push({
      role: 'system',
      content: `The questions should be relevant to the Project or the Sources discussed in the conversation history.`,
    });
    completionRequests.push({
      role: 'system',
      content: `Take time to think about the questions that the user would ask of an expert.`,
    });
    completionRequests.push({
      role: 'system',
      content: `Provide the questions in order of most likely to least likely.`,
    });
    completionRequests.push({
      role: 'system',
      content: `Separate each question with a newline character.`,
    });
    if (additionalContext) {
      completionRequests.push({
        role: 'user',
        content: additionalContext,
      });
    }

    // Use pipe to split the response into an array of strings (one for each question, separated by newline characters)
    return this.chat.sendChat(completionRequests).pipe(
      map((response: ChatCompletionMessage) => {
        if (response.content) {
          return response.content.split('\n');
        } else {
          return [];
        }
      }),
      map((response: string[]) => {
        // Remove any elements that don't end in a question mark
        return response.filter((question: string) => {
          return question.endsWith('?');
        });
      }),
      map((response: string[]) => {
        // Filter out any empty strings in the array
        return response.filter((question: string) => {
          return question !== '';
        });
      }),
      map((response: string[]) => {
        // Remove any numbers from the beginning of the response
        return response.map((question: string) => {
          return question.replace(/^\d+\.\s/, '');
        });
      }),
      map((response: string[]) => {
        // Remove any duplicate questions
        return response.filter(
          (question: string, index: number, self: string[]) => {
            return self.indexOf(question) === index;
          }
        );
      }),
      map((response: string[]) => {
        // Remove any characters from the beginning of the response that are not letters or numbers
        return response.map((question: string) => {
          return question.replace(/^[^a-zA-Z0-9]+/, '');
        });
      }),
      map((response: string[]) => {
        // Return only the first 3 questions
        return response.slice(0, 3);
      })
    );
  }
}
