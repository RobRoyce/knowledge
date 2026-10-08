/*
 * Copyright (c) 2023 Rob Royce
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

const share: any = (global as any).share;
const ipcMain = share.ipcMain;
const autoUpdater = share.autoUpdater;

import { IpcMessage } from "../../../../kc_shared/models/electron.ipc.model";

const checkForUpdate = ipcMain.on("A2E:AutoUpdate:Check", (_: any) => {
  if (!share.app.isPackaged || process.env.KC_ENABLE_UPDATES !== "1") {
    console.log(
      "[AutoUpdate]: update check disabled (set KC_ENABLE_UPDATES=1)"
    );
    return;
  }
  autoUpdater
    .checkForUpdates()
    .then((result: any) => {
      console.warn("Result from check for update: ", result);
    })
    .catch((error: any) => {
      console.warn("Error from check for update: ", error);
    });
});

const getCurrentVersion = ipcMain.on("A2E:Version:Get", (_: any) => {
  const kcMainWindow: any = share.BrowserWindow.getAllWindows()[0];
  const message: IpcMessage = {
    error: undefined,
    success: {
      data: autoUpdater.currentVersion.version,
    },
  };
  kcMainWindow.webContents.send("E2A:Version:Get", message);
});

module.exports = {
  checkForUpdate,
  getCurrentVersion,
};
