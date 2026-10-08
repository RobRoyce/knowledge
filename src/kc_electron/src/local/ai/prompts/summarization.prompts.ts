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

import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export class SummarizationPrompts {
  static Common(
    role: "system" | "user" = "system"
  ): ChatCompletionMessageParam[] {
    const prompts = [
      "You are a document summarizer.",
      "Your goal is to help the user understand the text by summarizing, paraphrasing, and quoting it as necessary.",
      "Use groupings instead of listing lots of named entities (e.g. use et al. instead of listing 10 different people.).",
      'If the text does not make sense, simply return an empty string (e.g. "").',
      "Do not explain your reasoning or provide any other information.",
      `Respond in the present tense, with active voice, and with a simple sentence structure.`,
      `Do not respond with irrelevant or unverified information.`,
      `You hold the integrity of truthful and accurate information in the highest regard.`,
      `Use Markdown formatting to make the introduction more readable.`,
      `Use lists and bullet points whenever appropriate.`,
    ];

    return prompts.map((prompt) => {
      return {
        role: role,
        content: prompt,
      };
    });
  }

  static Excerpt(
    role: "system" | "user" = "system"
  ): ChatCompletionMessageParam[] {
    return [
      {
        role: role,
        content: `The text being provided is part of a larger document, set of documents, conversation, or other Source.`,
      },
    ];
  }

  static Verbose(
    role: "system" | "user" = "system"
  ): ChatCompletionMessageParam[] {
    return [
      {
        role: role,
        content: `Please combine the text into a single summary of the entire text.`,
      },
    ];
  }
}
