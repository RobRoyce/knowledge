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

import express from "express";
import SourceChatController from "../controllers/source.controller";
import { SourceParser } from "../middleware/SourceParser";
import { SourceLoader } from "../middleware/SourceLoader";
import { DocumentSummarizer } from "../middleware/DocumentSummarizer";
import { SourceValidator } from "../middleware/SourceValidator";

const router = express.Router();

export default class SourceRoutes {
  private sourceController: SourceChatController;
  private summarizer: DocumentSummarizer;

  constructor(controller: SourceChatController) {
    this.sourceController = controller;
    this.summarizer = new DocumentSummarizer(controller.getChatController());
  }

  get controller() {
    return this.sourceController;
  }

  getRouter() {
    router.use(SourceValidator.validate);

    // Load the source from the database
    router.use(SourceLoader.load);

    // Parse the source into text (if necessary)
    router.use(SourceParser.getText);

    router.use(SourceValidator.hasText);

    // Summarize the text (if necessary)
    router.use(this.summarizer.summarize());

    // Store the source in the database
    router.use(SourceLoader.store);

    // Regular chat with the source
    router.post("/", this.controller.chat.bind(this.controller));

    // Intro chat with the source (basically a summary)
    router.post("/summarize", this.controller.summarize.bind(this.controller));

    router.post(
      "/categorize",
      this.controller.categorize.bind(this.controller)
    );

    // Get customized advice on how to read the Source
    router.post("/tutor", this.controller.tutor.bind(this.controller));

    router.post("/quiz", this.controller.quiz.bind(this.controller));

    router.post("/topics", this.controller.topics.bind(this.controller));

    // An endpoint to regenerate previous responses
    // router.post(
    //   "/regenerate",
    //   this.controller.regenerate.bind(this.controller)
    // );

    return router;
  }
}
