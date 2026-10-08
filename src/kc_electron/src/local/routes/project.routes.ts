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

import express from "express";
import ProjectChatController from "../controllers/project.controller";

const router = express.Router();

export default class ProjectRoutes {
  private projectController: ProjectChatController;

  constructor(controller: ProjectChatController) {
    this.projectController = controller;
  }

  getRouter() {
    router.post(
      "/quiz",
      this.projectController.quiz.bind(this.projectController)
    );

    return router;
  }
}
