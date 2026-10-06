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
import {
  IpcMessage,
  PromptForDirectoryRequest,
  ThumbnailRequest,
} from "../../../../kc_shared/models/electron.ipc.model";

import { materializeAsset } from "../storage.client";

const fse = require("fs-extra");
const settingsService = require("../services/settings.service");

const share: any = (global as any).share;
const ipcMain: any = share.ipcMain;
const dialog: any = share.dialog;
const http: any = share.http;
const shell: any = share.shell;
const path: any = share.path;
const nativeImage: any = share.nativeImage;
const app: any = share.app;
const fs: any = share.fs;

let promptForDirectory,
  openLocalFile,
  getFileThumbnail,
  getFileIcon,
  showItemInFolder,
  dragFileFromApp;

/**
 * @param path: [string] the path to file selected by user
 * @return none
 * @callback none
 * @description shows the file located at <path> in native file explorer
 */
showItemInFolder = ipcMain.on(
  "A2E:FileSystem:ShowFile",
  (_: any, path: string) => {
    shell.showItemInFolder(path);
  }
);

/**
 * promptForDirectory
 * @param request: [PromptForDirectoryRequest] configuration for dialog.showOpenDialogSync
 * @return path: [string] the path selected by user
 * @callback E2A:FileSystem:DirectoryPrompt
 * @description opens a file chooser dialog that allows the user to select a path
 */
promptForDirectory = ipcMain.on(
  "A2E:FileSystem:DirectoryPrompt",
  (event: any, request: PromptForDirectoryRequest) => {
    if (!request) {
      request = { properties: ["openDirectory", "createDirectory"] };
    }
    const kcMainWindow: any = share.BrowserWindow.getAllWindows()[0];
    const result = dialog.showOpenDialogSync(kcMainWindow, request);
    const response: IpcMessage = {
      error: undefined,
      success: undefined,
    };
    if (result && result[0]) {
      const dir = result[0];
      response.success = { data: dir };
    } else {
      response.error = {
        code: 412,
        label: http.STATUS_CODES["412"],
        message: "Invalid or non-existent path or directory chosen.",
      };
    }
    kcMainWindow.webContents.send("E2A:FileSystem:DirectoryPrompt", response);
  }
);

/**
 * openLocalFile
 * @param filePath: [string] path of file to open
 * @return none
 * @callback E2A:FileSystem:OpenFile [boolean]
 * @description opens the file located at filePath in the OS-level default application
 */
openLocalFile = ipcMain.on(
  "A2E:FileSystem:OpenFile",
  (event: any, filePath: string) => {
    shell.openPath(path.resolve(filePath)).then((outcome: string) => {
      const response: IpcMessage = { error: undefined, success: undefined };
      if (outcome === "") {
        response.success = { data: true };
      } else {
        response.error = {
          message: outcome,
          code: 501,
          label: http.STATUS_CODES["501"],
        };
      }
      const kcMainWindow: any = share.BrowserWindow.getAllWindows()[0];
      kcMainWindow.webContents.send("E2A:FileSystem:OpenFile", response);
    });
  }
);

/**
 * getFileThumbnail
 * @param requests: [KsThumbnailRequest[]] an array of thumbnail requests
 * @return thumbnails: [nativeImage[]] an array of thumbnails
 * @callback E2A:FileSystem:FileThumbnail [IpcResponse[]]
 * @description requests thumbnails for files in each request and returns them in an array
 */
getFileThumbnail = ipcMain.on(
  "A2E:FileSystem:FileThumbnail",
  (event: any, requests: ThumbnailRequest[]) => {
    const kcMainWindow: any = share.BrowserWindow.getAllWindows()[0];
    let responses: IpcMessage[] = [];
    const actions: any[] = [];

    if (requests.length <= 0) {
      responses = [
        {
          error: {
            code: 412,
            label: http.STATUS_CODES["412"],
            message: "Invalid thumbnail request.",
          },
          success: undefined,
        },
      ];
      const kcMainWindow: any = share.BrowserWindow.getAllWindows()[0];
      kcMainWindow.webContents.send("E2A:FileSystem:FileThumbnail", responses);
      return;
    }

    if (process.platform != "darwin" && process.platform != "win32") {
      // The `createThumbnailFromPath` function is only available on Windows and MacOS
      responses = [
        {
          error: {
            code: 412,
            label: http.STATUS_CODES["412"],
            message: "Thumbnail creation only supported on Windows and MacOS",
          },
          success: undefined,
        },
      ];
      const kcMainWindow: any = share.BrowserWindow.getAllWindows()[0];
      kcMainWindow.webContents.send("E2A:FileSystem:FileThumbnail", responses);
      return;
    }

    for (const request of requests) {
      const height = request.height ?? 1920;
      const width = request.width ?? 1080;
      // Managed files come from the storage service. Others use the given path.
      const file = request.assetId
        ? materializeAsset(request.assetId)
        : Promise.resolve(path.resolve(request.path));
      actions.push(
        file.then((p: string) =>
          nativeImage.createThumbnailFromPath(p, { width, height })
        )
      );
    }

    Promise.all(actions)
      .then((thumbnails) => {
        for (let i = 0; i < thumbnails.length; i++) {
          const response: IpcMessage = {
            error: undefined,
            success: {
              data: {
                id: requests[i].id ?? "",
                thumbnail: thumbnails[i].toDataURL(),
              },
            },
          };
          responses.push(response);
        }
        kcMainWindow.webContents.send(
          "E2A:FileSystem:FileThumbnail",
          responses
        );
      })
      .catch((reason) => {
        console.error(
          "Caught promise exception while getting thumbnail: ",
          reason,
          requests
        );
        const response: IpcMessage = {
          error: {
            code: 501,
            label: http.STATUS_CODES["501"],
            message: "OS failed to generate thumbnails",
          },
          success: undefined,
        };
        // The caller is expecting an array, so even though we're only sending a single response, we wrap it in array
        kcMainWindow.webContents.send("E2A:FileSystem:FileThumbnail", [
          response,
        ]);
      });
  }
);

/**
 * getFileIcon
 * @param filePaths: [string] an array of file paths for which to get the icons
 * @return thumbnails: [nativeImage[]] an array of icons
 * @callback E2A:FileSystem:FileIcon [IpcResponse[]]
 * @description requests icons for files in each request and returns them in an array
 */
getFileIcon = ipcMain.on(
  "A2E:FileSystem:FileIcon",
  (event: any, filePaths: string[]) => {
    if (filePaths.length <= 0) {
      return;
    }
    const kcMainWindow: any = share.BrowserWindow.getAllWindows()[0];
    const responses: IpcMessage[] = [];
    const options = { size: "normal" };
    const actions: any[] = [];
    for (const filePath of filePaths) {
      actions.push(app.getFileIcon(path.resolve(filePath), options));
    }
    Promise.all(actions).then((icons) => {
      for (const icon of icons) {
        const response: IpcMessage = {
          error: undefined,
          success: { data: icon.toDataURL() },
        };
        responses.push(response);
      }
      kcMainWindow.webContents.send("E2A:FileSystem:FileIcon", responses);
    });
  }
);

/**
 * @param args: [KnowledgeSource] the KS (file) to be exported
 * @return none
 * @callback none
 * @description creates a new drag-and-drop event using the actual file pointed to be the KS
 */
dragFileFromApp = ipcMain.on(
  "A2E:FileSystem:StartDrag",
  (event: any, args: any) => {
    const ks = args;
    if (!ks) {
      console.error(
        "Invalid or no Knowledge Source passed to electron IPC A2E:FileSystem:StartDrag handler."
      );
      return;
    }

    if (ks.ingestType !== "file") {
      console.error("Cannot drag and drop non-file sources just yet...");
      return;
    }

    const options = { size: "normal" };

    // First, copy file to centralized location
    const appPath = settingsService.getSettings().system.appPath;
    const copyPath = path.join(appPath, "tmp");
    const filename = path.basename(ks.accessLink);
    const filePath = path.join(copyPath, filename);

    // TODO: periodically purge the tmp folder
    try {
      fs.mkdirSync(copyPath, { recursive: true });
    } catch (e) {
      console.error(
        "File IPC Unable to create temporary directory for drag/drop..."
      );
    }

    try {
      fse.cpSync(ks.accessLink, filePath);
    } catch (e) {
      console.error(
        "File IPC Unable to copy file to temporary directory for drag/drop..."
      );
    }

    // Then, use NEW file for drag handler

    app
      .getFileIcon(filePath, options)
      .then((icon: any) => {
        event.sender.startDrag({
          file: path.resolve(filePath),
          icon: icon,
        });

        setTimeout(() => {
          try {
            fse.remove(filePath);
          } catch (e) {}
        }, 30000);
      })
      .catch((reason: any) => {
        console.error("Error in main process, dragging file from app", reason);
      });
  }
);

module.exports = {
  promptForDirectory,
  openLocalFile,
  getFileThumbnail: getFileThumbnail,
  getFileIcon,
  dragFileFromApp,
};
