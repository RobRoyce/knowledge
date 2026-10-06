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

// Must load first. It sets the userData path before the session exists.
import { profile, resourcesDir } from "./app/profile";

import { autoUpdater, UpdateCheckResult } from "electron-updater";

import {
  app,
  BrowserView,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} from "electron";

import http from "http";

import url from "url";

import fs from "fs";

import path from "path";

import * as uuid from "uuid";
import KnowledgeIpc from "./local/utils/ipc.utils";
import ChatServer from "./local/chat.api";
import { newToken, registerBackendInfo } from "./app/backend";

const settingsService = require("./app/services/settings.service");

const MAIN_ENTRY: string = path.join(
  app.getAppPath(),
  "src",
  "kc_angular",
  "dist",
  "main",
  "index.html"
);

(global as any).share = {
  BrowserView,
  BrowserWindow,
  app,
  autoUpdater,
  dialog,
  fs,
  http,
  ipcMain,
  nativeImage,
  path,
  settingsService,
  shell,
  url,
  uuid,
};

console.log("[Knowledge]: running from directory with dirname: ", __dirname);

// Setup auto update
require("./app/services/auto.update.service");

// Setup IPC
require("./app/ipc");

// One instance per profile. Chromium keys this lock on the userData path.
if (!app.requestSingleInstanceLock()) {
  console.error(
    "[Knowledge]: this profile is already open in another instance. Exiting."
  );
  app.exit(0);
}

const chatServer = new ChatServer(newToken());
registerBackendInfo({ chat: chatServer.start() });

// Setup knowledge source ingestion
require("./app/services/index");

const browserIpc = require("./app/ipc").browserIpc;

// Declare main window for later use
let kcMainWindow: BrowserWindow;

/**
 * Main Window Functions
 */
function createMainWindow() {
  // Get application settings
  const appEnv = settingsService.getSettings();
  const darkMode = appEnv.display.theme.isDark;
  const backgroundColor = darkMode ? "#1E1E1E" : "#F9F9F9";
  console.log("Theme: ", appEnv.display.theme);

  console.log("Knowledge storage path: ", app.getPath("userData"));
  console.log(
    "Knowledge data path: ",
    settingsService.getSettings().system.appPath,
    profile ? "(profile)" : ""
  );

  app.setName("Knowledge");

  // kcMainWindow = new BrowserWindow(config);
  kcMainWindow = new BrowserWindow({
    title: "Knowledge",
    backgroundColor: backgroundColor,
    width: 1920,
    height: 1080,
    minWidth: 1000,
    minHeight: 850,
    frame: false,
    icon: path.join(resourcesDir(), "icon.png"),
    show: false,
    webPreferences: {
      nodeIntegration: false, // is default value after Electron v5
      contextIsolation: true, // protect against prototype pollution
      preload: path.join(
        app.getAppPath(),
        "src",
        "kc_electron",
        "dist",
        "preload.js"
      ),
    },
  });

  setMainWindowListeners();
}

function setMainWindowListeners() {
  kcMainWindow.webContents.on(
    "did-fail-load",
    (
      event: any,
      errorCode: number,
      errorDescription: string,
      validatedURL: string
    ) => {
      event.preventDefault();

      const defaultAction = () => {
        browserIpc.destroyBrowserViews(kcMainWindow);
        kcMainWindow.loadFile(MAIN_ENTRY);
        return;
      };

      const sender = event.sender;

      if (errorCode === -6 || errorDescription === "ERR_FILE_NOT_FOUND") {
        if (validatedURL.includes(process.cwd())) {
          defaultAction();
        }
      }

      if (!sender || sender.isCrashed() || sender.isDestroyed()) {
        defaultAction();
      }
    }
  );

  // Destroy window on close
  kcMainWindow.on("closed", function () {
    kcMainWindow.destroy();
    app.quit();
  });

  kcMainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("New window requested: ", url);
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Show the window once it's ready
  kcMainWindow.once("ready-to-show", () => {
    kcMainWindow.show();
  });

  const ipcChannels = new KnowledgeIpc();
}

app.on("second-instance", () => {
  if (kcMainWindow) {
    if (kcMainWindow.isMinimized()) kcMainWindow.restore();
    kcMainWindow.focus();
  }
});

app.on("window-all-closed", function () {
  // MacOS apps typically do not quit all the way when a window is closed...
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

/**
 * Update checks are opt-in. Set KC_ENABLE_UPDATES=1 in a packaged build to
 * enable them. The check runs after the window loads and never blocks startup.
 */
function updatesEnabled() {
  return app.isPackaged && process.env.KC_ENABLE_UPDATES === "1";
}

function checkForUpdates() {
  if (!updatesEnabled()) {
    console.log("[Knowledge]: update check disabled (set KC_ENABLE_UPDATES=1)");
    return;
  }

  autoUpdater
    .checkForUpdatesAndNotify()
    .then((update: UpdateCheckResult | null) => {
      if (update) {
        console.log("Update Check Results: ", update);
      }
    })
    .catch((reason: any) => {
      console.error("Update Check Error: ", reason);
    });
}

app.on("ready", function () {
  createMainWindow();
  kcMainWindow.loadFile(MAIN_ENTRY);
  checkForUpdates();
});
