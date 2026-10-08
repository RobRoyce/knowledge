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

import {
  encoding_for_model,
  init,
  Tiktoken,
  TiktokenModel,
} from "@dqbd/tiktoken/init";
import fs from "fs";
import path from "path";
import { app } from "electron";
import {
  ChatModel,
  SupportedChatModels,
} from "../../../../kc_shared/models/chat.model";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const settingsService = require("../../app/services/settings.service");

export default class TokenizerUtils {
  private tiktoken!: Tiktoken;

  private model: TiktokenModel = "gpt-3.5-turbo";

  constructor() {
    this.initialize();
  }

  async initialize() {
    const tiktokenWasm = this.getWasmPath();
    const wasm = fs.readFileSync(tiktokenWasm);
    await init((imports) => WebAssembly.instantiate(wasm, imports));
    console.debug(`[Knowledge]: Initializing ${this.model} tokenizer...`);
    this.tiktoken = encoding_for_model(this.model);
  }

  async setModel(model: TiktokenModel) {
    if (this.model === model) {
      return;
    }

    try {
      console.debug(`[Knowledge]: Freeing ${this.model} tokenizer...`);
      this.tiktoken?.free();
    } catch (err) {
      console.error(
        `[Knowledge]: Trying to free ${this.model} tokenizer...`,
        err
      );
    }

    this.model = model;

    try {
      await this.initialize();
    } catch (e) {
      console.error("Error setting model to: ", model);
      console.error(e);
    }
  }

  shortenText(text: string, maxTokens: number): string {
    const tokenized = this.tiktoken.encode(text);
    if (tokenized.length <= maxTokens) {
      return text;
    }
    const model = this.verifiedModel();

    // If the current model has a lower token limit, use that instead
    maxTokens = Math.min(maxTokens, model.token_limit);

    const shortened = tokenized.slice(0, maxTokens);
    const decoded = this.tiktoken.decode(shortened);

    // Decoded is an array of Unit8Array, we need to convert that back into a string
    let shortenedText = "";
    decoded.forEach((unit8) => {
      shortenedText += String.fromCharCode.apply(null, [unit8]);
    });

    return shortenedText;
  }

  /**
   * Given a token limit, prune the messages to fit within the limit.
   * Fails if the last message is longer than the limit.
   * Removes non-system messages first, then removes system messages if necessary.
   */
  limitTokens(messages: ChatCompletionMessageParam[], max_tokens = 0) {
    if (messages.length === 0) {
      return messages;
    }

    // If max_tokens is 0, use the model's parameters
    if (max_tokens === 0) {
      const model = this.verifiedModel();
      max_tokens = model.token_limit - model.max_tokens - 512;
    }

    // If the messages are already within the token limit, return them.
    let tokenCount = this.countMessageTokens(messages);
    if (tokenCount < max_tokens) {
      return messages;
    }

    // Split messages into two, the first N messages and the last message
    const lastMessage = messages.pop();
    if (!lastMessage) {
      throw new Error("No message found.");
    }
    if (this.countMessageTokens([lastMessage]) > max_tokens) {
      throw new Error("Message is longer than the token limit.");
    }

    /* While the token count is greater than the limit, remove messages.
    Remove the first non-system message while the token count is greater than the limit.
    If no non-system messages are found, remove the first system message. */
    while (tokenCount > max_tokens) {
      const firstNonSystemMessage = messages.find(
        (message) => message.role !== "system"
      );
      if (
        firstNonSystemMessage &&
        firstNonSystemMessage.content !== lastMessage.content
      ) {
        const removed = messages.splice(
          messages.indexOf(firstNonSystemMessage),
          1
        );
        tokenCount -= this.countMessageTokens(removed);
      } else {
        const removed = messages.shift();
        if (!removed) {
          throw new Error("No message found.");
        }
        tokenCount -= this.countMessageTokens([removed]);
      }
    }
    messages.push(lastMessage);
    return messages;
  }

  /**
   * Remove duplicate messages from a list of messages.
   * @param messages
   */
  deduplicate(messages: ChatCompletionMessageParam[]) {
    const unique: ChatCompletionMessageParam[] = [];
    const hash: { [key: string]: boolean } = {};
    messages.forEach((message) => {
      if (
        message.content &&
        typeof message.content === "string" &&
        !hash[message.content]
      ) {
        hash[message.content] = true;
        unique.push(message);
      }
    });

    return unique;
  }

  /**
   * Count the number of tokens in a text for the current model.
   * @param text
   */
  countTokens(text: string) {
    return this.tiktoken.encode(text).length + 5;
  }

  /**
   * Count the number of tokens in a list of messages for the current model.
   * @param messages
   */
  countMessageTokens(messages: ChatCompletionMessageParam[]): number {
    let tokenCount = 0;
    messages.forEach((message: ChatCompletionMessageParam) => {
      if (message.content && typeof message.content === "string") {
        tokenCount += this.tiktoken.encode(message.content).length + 5;
      }
    });
    return tokenCount + (messages.length > 1 ? 3 : 0);
  }

  /**
   * Given a text, chunk it into smaller pieces that fit within the token limit.
   * @param text
   */
  chunkLimitText(text: string): string[] {
    const model = this.verifiedModel();
    const maxTokens = model.token_limit - model.max_tokens - 512;

    const tokenized = this.tiktoken.encode(text);
    if (tokenized.length <= maxTokens) {
      return [text];
    }

    const chunks = [];

    // Split the tokenized array into arrays of maxTokens length
    for (let i = 0; i < tokenized.length; i += maxTokens) {
      chunks.push(tokenized.slice(i, i + maxTokens));
    }

    // Convert each chunk back into a string
    const chunkedText: string[] = [];
    chunks.forEach((chunk) => {
      let text = "";
      chunk.forEach((unit8) => {
        text += String.fromCharCode.apply(null, [unit8]);
      });
      chunkedText.push(text);
    });

    return chunkedText;
  }

  /**
   * Given a text, limit it to the token limit of the model.
   * @param text The text to limit
   * @param padding The number of tokens to pad the limit with
   */
  limitText(text: string, padding = 350): string {
    const model = this.verifiedModel();
    const maxTokens = Math.max(
      model.token_limit - model.max_tokens - padding,
      0
    );

    let tokenized = this.tiktoken.encode(text);
    if (tokenized.length > maxTokens) {
      console.warn(
        `[Knowledge]: Tokenized length (${tokenized.length}) greater than max tokens (${maxTokens}), truncating.`
      );
      tokenized = tokenized.slice(0, maxTokens);
      const decoded = this.tiktoken.decode(tokenized);
      // Decoded is an array of Unit8Array, we need to convert that back into a string
      text = "";
      decoded.forEach((unit8) => {
        text += String.fromCharCode.apply(null, [unit8]);
      });
    }

    return text;
  }

  /**
   * Get the path to the tiktoken wasm file. This is used to initialize the tokenizer.
   * @private
   */
  private getWasmPath() {
    // TODO: Figure out how to do this in a cleaner way
    const possiblePaths = [
      path.resolve(app.getAppPath(), "..", "tiktoken_bg.wasm"),
      path.join(
        settingsService.getSettings().system.resourcesPath,
        "tiktoken_bg.wasm"
      ),
      path.join(process.cwd(), "Resources", "tiktoken_bg.wasm"),
      path.join(process.cwd(), "resources", "tiktoken_bg.wasm"),
      path.join(__dirname, "Resources", "tiktoken_bg.wasm"),
      path.join(__dirname, "resources", "tiktoken_bg.wasm"),
      path.join("tiktoken_bg.wasm"),
      path.join(process.cwd(), "tiktoken_bg.wasm"),
    ];

    for (const possible of possiblePaths) {
      if (fs.existsSync(possible)) {
        return possible;
      }
    }
    throw new Error("Could not find tiktoken wasm file.");
  }

  /**
   * Get the model object for the current model. Throws an error if the model is not found.
   */
  private verifiedModel(): ChatModel {
    const model = SupportedChatModels.find(
      (model) => model.name === this.model
    );
    if (!model) {
      throw new Error(
        `Model ${this.model} not found. You may need to check your settings and restart the app.`
      );
    } else {
      return model;
    }
  }
}
