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

import express, { Express, NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { AddressInfo } from "net";
import { BackendEndpoint } from "../app/backend";
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

  private token: string;

  constructor(token: string) {
    this.token = token;
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

  /**
   * Listen on an ephemeral loopback port. Resolves to the endpoint for this
   * instance, or to an error that the renderer can show.
   */
  start(): Promise<BackendEndpoint> {
    return new Promise((resolve) => {
      const server = this.app.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        const url = `http://127.0.0.1:${port}`;
        console.log(`[Knowledge]: chat server listening on ${url}`);
        resolve({ url, token: this.token });
      });

      server.on("error", (err: Error) => {
        console.error(`[Knowledge]: chat server unavailable: ${err.message}`);
        resolve({ error: `Chat server unavailable: ${err.message}` });
      });
    });
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(this.requireToken.bind(this));
    this.app.use(express.json({ limit: "50mb" }));
  }

  /**
   * Only the renderer of this instance knows the token. Loopback binding
   * and CORS alone do not restrict other local clients.
   */
  private requireToken(req: Request, res: Response, next: NextFunction) {
    if (req.method === "OPTIONS") {
      return next();
    }
    const expected = Buffer.from(`Bearer ${this.token}`);
    const actual = Buffer.from(req.headers.authorization ?? "");
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    ) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }
    next();
  }

  private setupRoutes() {
    this.app.use("/api", ErrorHandler.catchErrors(this.apiRouter));
    this.app.use("/sources", ErrorHandler.catchErrors(this.sourceRouter));
    this.app.use("/chat", ErrorHandler.catchErrors(this.chatRouter));
    this.app.use("/projects", ErrorHandler.catchErrors(this.projectRouter));
  }
}
