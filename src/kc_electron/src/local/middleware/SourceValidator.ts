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

import { NextFunction, Request, Response } from "express";

export class SourceValidator {
  static async validate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body.source) {
        return res.status(400).send("Missing Source");
      }
    } catch (err) {
      return res.status(400).send("Invalid source");
    }

    try {
      if (!req.body.source.id?.value) {
        return res.status(400).send("Missing Source ID");
      } else {
        req.body.id = req.body.source.id.value;
      }
    } catch (err) {
      return res.status(400).send("Invalid source ID");
    }

    try {
      if (!req.body.source.title) {
        return res.status(400).send("Missing Source Title");
      }
    } catch (err) {
      return res.status(400).send("Invalid Source Title");
    }

    try {
      if (!req.body.source.ingestType) {
        return res.status(400).send("Missing Source Type");
      }
      req.body.ingestType = req.body.source.ingestType;
    } catch (err) {
      return res.status(400).send("Invalid Source Type");
    }

    try {
      if (!req.body.source.accessLink) {
        return res.status(400).send("Missing Source Access Link");
      }
      req.body.accessLink = req.body.source.accessLink;
    } catch (err) {
      return res.status(400).send("Invalid Source Access link");
    }

    next();
  }

  static async hasText(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body.text || req.body.text.trim().length === 0) {
        const helpLink =
          "https://github.com/KnowledgeCanvas/knowledge/wiki/Chat#supported-file-types";
        return res.json({
          choices: [
            {
              message: {
                content: `I'm sorry, but I am unable to read the associated ${req.body.ingestType}. Please see ${helpLink} for more info on supported file types.`,
                role: "assistant",
              },
            },
          ],
        });
      }
    } catch (err) {
      return res.status(400).send("Invalid Source Text");
    }
    next();
  }
}
