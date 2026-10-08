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

import express, { Express } from "express";
import cors from "cors";
import { ErrorHandler } from "./middleware/ErrorHandler";
import ChatController from "./controllers/chat.controller";
import ChatRoutes from "./routes/chat.routes";
import ApiKeyController from "./controllers/api.controller";
import SourceRoutes from "./routes/source.routes";
import ApiRoutes from "./routes/api.routes";
import SourceChatController from "./controllers/source.controller";
import TokenizerUtils from "./utils/tokenizer.utils";
import { debounceTime, map, tap } from "rxjs";
import {
  ChatSettingsModel,
  SettingsModel,
} from "../../../kc_shared/models/settings.model";
import ProjectChatController from "./controllers/project.controller";
import ProjectRoutes from "./routes/project.routes";

const settings = require("../app/services/settings.service");

export default class ChatServer {
  private app: Express;

  private tokenizerUtils: TokenizerUtils;

  private chatController;
  private apiController;
  private sourceController;
  private projectController;

  private chatRouter;
  private apiRouter;
  private sourceRouter;
  private projectRouter;

  constructor() {
    this.tokenizerUtils = new TokenizerUtils();

    settings.all
      .pipe(
        debounceTime(1000),
        map((s: SettingsModel) => s.app.chat),
        tap((chatSettings: ChatSettingsModel) => {
          this.tokenizerUtils.setModel(chatSettings.model.name);
        })
      )
      .subscribe();

    this.chatController = new ChatController(this.tokenizerUtils);
    this.apiController = new ApiKeyController();
    this.sourceController = new SourceChatController(
      this.tokenizerUtils,
      this.chatController
    );
    this.projectController = new ProjectChatController(
      this.tokenizerUtils,
      this.chatController
    );

    const chatRoutes = new ChatRoutes(this.chatController);
    const apiRoutes = new ApiRoutes(this.apiController);
    const sourceRoutes = new SourceRoutes(this.sourceController);
    const projectRoutes = new ProjectRoutes(this.projectController);

    this.chatRouter = chatRoutes.getRouter();
    this.apiRouter = apiRoutes.getRouter();
    this.sourceRouter = sourceRoutes.getRouter();
    this.projectRouter = projectRoutes.getRouter();

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  start(port: number) {
    this.app.listen(port, () => {
      console.log(`[Knowledge]: chat server listening on port ${port}`);
    });
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: "50mb" })); // Parse JSON request bodies
    this.app.use(cors()); // Enable CORS
  }

  private setupRoutes() {
    this.app.use("/api", ErrorHandler.catchErrors(this.apiRouter));
    this.app.use("/sources", ErrorHandler.catchErrors(this.sourceRouter));
    this.app.use("/chat", ErrorHandler.catchErrors(this.chatRouter));
    this.app.use("/projects", ErrorHandler.catchErrors(this.projectRouter));
  }
}
