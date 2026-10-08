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
import { OpenAI } from "openai";

import fs from "fs";
import chatEncrypt from "../utils/encrypt.utils";

const settings = require("../../app/services/settings.service");

export default class ApiKeyController {
  async checkApiKey(req: Request, res: Response): Promise<Response> {
    // Returns true if API key is set and works as expected, otherwise false
    const apiKey = await this.loadApiKey();
    const apiKeyWorks = await this.testApiKey(apiKey);
    return res.json({
      apiKeySet: apiKeyWorks,
    });
  }

  async hasApiKey(req: Request, res: Response): Promise<Response> {
    // Returns true if API key is set, otherwise false
    try {
      const apiKey = await this.loadApiKey();
      return res.json({
        apiKeySet: Boolean(apiKey && apiKey.length > 0),
      });
    } catch {
      return res.json({ apiKeySet: false });
    }
  }

  async deleteApiKey(req: Request, res: Response): Promise<Response> {
    const apiKeyPath = this.getApiKeyPath();
    if (fs.existsSync(apiKeyPath)) {
      console.debug("Deleting API key at path: ", apiKeyPath);
      fs.unlinkSync(apiKeyPath);
      return res.json({ success: true });
    }
    return res.json({ success: false });
  }

  async setApiKey(req: Request, res: Response): Promise<Response> {
    const apiKeyWorks = await this.testApiKey(req.body.apiKey);
    if (!apiKeyWorks) {
      return res.status(400).json({ success: false });
    }

    const saved = await this.saveApiKey(req.body.apiKey);
    return res.json({ success: saved });
  }

  private getApiKeyPath(): string {
    const userDataPath = settings.getSettings().system.appPath;
    return `${userDataPath}/openai.encrypted`;
  }

  private async loadApiKey() {
    return chatEncrypt.readAndDecryptApiKey(this.getApiKeyPath(), "unsecured");
  }

  private async saveApiKey(apiKey: string) {
    const encryptedApiKey = chatEncrypt.encryptApiKey(apiKey, "unsecured");
    const filePath = this.getApiKeyPath();
    fs.writeFileSync(filePath, encryptedApiKey);
    return true;
  }

  private async testApiKey(apiKey: string) {
    try {
      const openaiTest = new OpenAI({
        apiKey: apiKey,
      });
      const models = await openaiTest.models.list();
      return models.data.length > 0;
    } catch (e) {
      return false;
    }
  }
}
