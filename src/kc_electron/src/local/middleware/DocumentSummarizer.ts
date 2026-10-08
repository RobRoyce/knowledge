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

import { NextFunction, Request, Response } from "express";
import ChatController from "../controllers/chat.controller";

export class DocumentSummarizer {
  private chatController: ChatController;
  constructor(chatController: ChatController) {
    this.chatController = chatController;
  }

  summarize() {
    return async (req: Request, res: Response, next: NextFunction) => {
      // If the request already contains a summary, skip this middleware
      if (req.body.summary) {
        console.log(
          "[DocumentSummarizer]: Summary already exists, skipping DocumentSummarizer"
        );
        return next();
      }

      // Break the text into chunks under the assumption that each token represents approximately 3 characters
      const CHUNK_SIZE =
        (this.chatController.getSettings().model.token_limit -
          this.chatController.getSettings().model.max_tokens) *
        3;
      const chunks = req.body.text.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "g"));

      console.log(
        `[DocumentSummarizer]: Splitting text into ${chunks.length} chunks of size ${CHUNK_SIZE}...`
      );

      if (chunks && chunks.length > 0) {
        const summaries = await Promise.all(
          chunks.map(
            this.chatController.summarizeChunk.bind(this.chatController)
          )
        );

        if (summaries.length === 1) {
          req.body.summary = summaries[0];
        } else {
          const response = await this.chatController.summarizeChunkResponses(
            summaries
          );

          if (response === "" || response === undefined || response === null) {
            return res.status(500).send({
              message: "OpenAI API Error - Unable to summarize text.",
            });
          }
          req.body.summary = response;
        }
      } else {
        console.warn(
          "[DocumentSummarizer]: unable to split text into chunks..."
        );
        req.body.summary = "";
      }

      next();
    };
  }

  topics() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (req.body.topcs) {
        return next();
      }
    };
  }
}
