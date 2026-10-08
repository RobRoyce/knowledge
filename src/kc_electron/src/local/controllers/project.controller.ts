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

import { Request, Response } from "express";
import TokenizerUtils from "../utils/tokenizer.utils";
import ChatController from "./chat.controller";

export default class ProjectChatController {
  constructor(
    private tokenizerUtils: TokenizerUtils,
    private chatController: ChatController
  ) {}

  async chat(req: Request, res: Response): Promise<Response> {
    // Load the entire source here
    return res.status(500).json({ message: "Not implemented" });
  }

  async intro(req: Request, res: Response): Promise<Response> {
    // Load the entire source here
    console.log("Got request on sources/intro...");
    return res.status(500).json({ message: "Not implemented" });
  }

  async quiz(req: Request, res: Response): Promise<Response> {
    const messages = this.tokenizerUtils.limitTokens(
      this.tokenizerUtils.deduplicate(req.body.messages)
    );

    const prompts = [
      ...messages,
      {
        role: "system",
        content:
          "You are a teacher giving a quiz about a Project and its Sources.",
      },
      {
        role: "system",
        content:
          "Your goal is to test the students understanding of the Sources.",
      },
      {
        role: "system",
        content:
          "You will be provided with the chat history between you and the student.",
      },
      {
        role: "system",
        content:
          "You may use any questions from the Project and Sources as part of the quiz.",
      },
      {
        role: "system",
        content:
          "You may also use any questions that you think would be appropriate.",
      },
      {
        role: "system",
        content: "Questions must be in multiple choice format.",
      },
      {
        role: "system",
        content:
          "Provide the student with 5-7 questions that have not been asked before.",
      },
      {
        role: "system",
        content: "Do not ask the same question twice in the same quiz.",
      },
      {
        role: "system",
        content: "Do not ask questions about people or places.",
      },
      {
        role: "system",
        content:
          "Avoid asking too questions where the answer is 'all of the above'.",
      },
      {
        role: "system",
        content: "Please avoid asking questions that are too easy or obvious.",
      },
    ];

    prompts.push({
      role: "system",
      content:
        "Please use the following format for each question." +
        "Q1. {{Question}}\n" +
        "A) {{Choice}}\n" +
        "B) {{Choice}}\n" +
        "C) {{Choice}}\n" +
        "D) {{Choice}}\n" +
        "Answer: {{letter of the answer}}\n\n\n" +
        "Q2. {{Question}}\n" +
        "A) {{Choice}}\n" +
        "B) {{Choice}}\n" +
        "C) {{Choice}}\n" +
        "D) {{Choice}}\n" +
        "Answer: {{letter of the answer}}\n\n\n" +
        "...",
    });

    prompts.push({
      role: "user",
      content: "Please give me a quiz about this Project and its Sources.",
    });

    req.body.messages = prompts;

    return this.chatController.passthrough(req, res);
  }
}
