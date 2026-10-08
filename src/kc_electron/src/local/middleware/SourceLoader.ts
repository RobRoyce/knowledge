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
import fs from "fs";
import path from "path";

const settingsService = require("../../app/services/settings.service");

export class SourceLoader {
  static async load(req: Request, res: Response, next: NextFunction) {
    const id = req.body.id;
    const filename = `${id}.json`;

    const filepath = path.resolve(
      settingsService.getSettings().system.appPath,
      "storage",
      "sources",
      filename
    );

    // Make sure the directory exists, if not create it
    const dirname = path.dirname(filepath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    // Check for the Source in local JSON files. Append to req.body if found.
    if (fs.existsSync(filepath)) {
      const json = fs.readFileSync(filepath, "utf8");
      const data = JSON.parse(json);
      req.body.text = data[0] ?? undefined;
      req.body.summary = data[1] ?? undefined;
    }

    next();
  }

  static async store(req: Request, res: Response, next: NextFunction) {
    const text = req.body.text;
    const summary = req.body.summary;
    const id = req.body.id;
    const filename = `${id}.json`;

    const filepath = path.resolve(
      settingsService.getSettings().system.appPath,
      "storage",
      "sources",
      filename
    );

    // Make sure the directory exists, if not create it
    const dirname = path.dirname(filepath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    // Store the Source into local JSON file using ID as filename.
    const json = JSON.stringify([text, summary]);
    fs.writeFileSync(filepath, json, "utf8");

    next();
  }
}
