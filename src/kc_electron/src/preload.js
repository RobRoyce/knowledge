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

import { contextBridge, ipcRenderer, webUtils } from "electron";

/**
 * IPC Channels must be placed in one of the following lists before it
 * can be invoked.
 *
 * Channels take the form <Direction>:<Module>:<Function>
 *     Direction := A2E | E2A
 *     A2E: Angular-to-Electron
 *     E2A: Electron-to-Angular
 */
const ipcSendChannels = [
  "A2E:AutoUpdate:Check",
  "A2E:BrowserView:CanGoBack",
  "A2E:BrowserView:CanGoForward",
  "A2E:BrowserView:Close",
  "A2E:BrowserView:CurrentUrl",
  "A2E:BrowserView:GoBack",
  "A2E:BrowserView:GoForward",
  "A2E:BrowserView:Invert",
  "A2E:BrowserView:Open",
  "A2E:BrowserView:Refresh",
  "A2E:Extraction:Website",
  "A2E:FileSystem:DirectoryPrompt",
  "A2E:FileSystem:FileIcon",
  "A2E:FileSystem:FileThumbnail",
  "A2E:FileSystem:OpenFile",
  "A2E:FileSystem:ShowFile",
  "A2E:Autoscan:Delete",
  "A2E:Autoscan:Finalize",
  "A2E:Settings:Defaults",
  "A2E:Settings:Get",
  "A2E:Settings:Set",
  "A2E:Uuid:Generate",
  "A2E:Version:Get",
  "A2E:Window:Minimize",
  "A2E:Window:Maximize",
  "A2E:Window:ZoomOut",
  "A2E:Window:ZoomIn",
];

const ipcInvokeChannels = [
  "A2E:Backend:Info",
  "A2E:Storage:ImportFile",
  "A2E:Storage:OpenAsset",
];

const ipcReceiveOnceChannels = [
  "E2A:BrowserView:Close",
  "E2A:BrowserView:Open",
  "E2A:Extraction:Website",
  "E2A:FileSystem:DirectoryPrompt",
  "E2A:FileSystem:FileIcon",
  "E2A:FileSystem:OpenFile",
  "E2A:Settings:Defaults",
  "E2A:Uuid:Generate",
];

const ipcReceiveChannels = [
  "E2A:AutoUpdate:Update",
  "E2A:BrowserView:CanGoBack",
  "E2A:BrowserView:CanGoForward",
  "E2A:BrowserView:CurrentUrl",
  "E2A:BrowserView:ExtractedText",
  "E2A:BrowserView:NavEvent",
  "E2A:Extension:Import",
  "E2A:Extraction:Website",
  "E2A:FileSystem:FileThumbnail",
  "E2A:FileManager:ConfirmAdd",
  "E2A:FileManager:Error",
  "E2A:FileManager:NewFiles",
  "E2A:FileManager:Warn",
  "E2A:Settings:All",
  "E2A:Version:Get",
  "E2A:Window:ZoomLevel",
];

let datetime = () => {
  return new Date().toLocaleString();
};

contextBridge.exposeInMainWorld("api", {
  /**
   * Local path of a File the user selected or dropped. Electron removed
   * File.path in version 32. Returns "" for files without a local path.
   */
  pathForFile: (file) => webUtils.getPathForFile(file),
  invoke: (channel, data) => {
    if (ipcInvokeChannels.includes(channel)) {
      console.debug(
        `[Debug]-[${datetime()}]-[Electron IPC]: Invoke - Invoked on ${channel} with data: `,
        data
      );
      return ipcRenderer.invoke(channel, data);
    } else {
      console.error(
        `[Error]-[${datetime()}]-[Electron IPC]: Invalid Invoke Channel -- ${channel}`
      );
      return Promise.reject(new Error(`Invalid invoke channel: ${channel}`));
    }
  },
  send: (channel, data) => {
    if (ipcSendChannels.includes(channel)) {
      console.debug(
        `[Debug]-[${datetime()}]-[Electron IPC]: Send - Invoked on ${channel} with data: `,
        data
      );
      ipcRenderer.send(channel, data);
    } else {
      console.error(
        `[Error]-[${datetime()}]-[Electron IPC]: Invalid Send Channel -- ${channel}`
      );
    }
  },
  receive: (channel, func) => {
    if (ipcReceiveChannels.includes(channel)) {
      if (func) {
        console.debug(
          `[Debug]-[${datetime()}]-[Electron IPC]: Receive - Invoked on ${channel}.`
        );
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    } else {
      console.error(
        `[Error]-[${datetime()}]-[Electron IPC]: Invalid Receive -- ${channel}`
      );
    }
  },
  receiveOnce: (channel, func) => {
    if (ipcReceiveOnceChannels.includes(channel)) {
      if (func) {
        console.debug(
          `[Debug]-[${datetime()}]-[Electron IPC]: Receive Once - Invoked on ${channel}.`
        );
        ipcRenderer.once(channel, (event, ...args) => func(...args));
      }
    } else {
      console.error(
        `[Error]-[${datetime()}]-[Electron IPC]: Invalid Receive Once -- ${channel}`
      );
    }
  },
  removeAllListeners: (channel) => {
    console.debug(
      `[Debug]-[${datetime()}]-[Electron IPC]: Remove All Listeners - Invoked on ${channel}`
    );
    ipcRenderer.removeAllListeners(channel);
  },
});

contextBridge.exposeInMainWorld("electron", {
  startDrag: (ks) => {
    ipcRenderer.send("A2E:FileSystem:StartDrag", ks);
  },
});
