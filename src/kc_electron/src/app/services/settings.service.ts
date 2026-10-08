/*
 * Copyright (c) 2022-2023 Rob Royce
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

import * as fs from "fs";
import { BehaviorSubject, Observable } from "rxjs";
import {
  AutoscanSettingsModel,
  CalendarSettingsModel,
  ChatSettingsModel,
  DockerSettingsModel,
  EnvironmentSettingsModel,
  ExtensionServerSettingsModel,
  FileManagerSettingsModel,
  GraphSettingsModel,
  GridSettingsModel,
  LoggingSettingsModel,
  ProjectSettingsModel,
  SearchSettingsModel,
  SettingsModel,
  SystemSettingsModel,
  TableSettingsModel,
  UserSettingsModel,
} from "../../../../kc_shared/models/settings.model";
import * as dotenv from "dotenv";
import path from "path";
import os from "os";
import * as lodash from "lodash";
import { KcTheme } from "../../../../kc_shared/models/style.model";
import { app, BrowserWindow, ipcMain } from "electron";
import { profile, resourcesDir } from "../profile";

const RET_OK = 0;
const RET_FAIL = -1;
const RET_ERR = -1;

let GLOBAL_ERROR = "";

/**
 * The general workflow for SettingsService is as follows:
 *
 *      1. Load optimal default settings on every startup
 *      2. Instantiate the `all` settings Observable for Electron-side usage
 *      3. Read settings from file or create a new file if one does not exist
 *      4. Make sure all necessary local paths exist
 *      5. Listen to IPC channels for incoming requests
 *      6. Broadcast settings via IPC whenever settings are changed or requested
 */
class SettingsService {
  all: Observable<SettingsModel>;
  private ipcChannels = {
    getSettings: "A2E:Settings:Get",
    getDefaults: "A2E:Settings:Defaults",
    setSettings: "A2E:Settings:Set",
    sendAll: "E2A:Settings:All",
    sendDefaults: "E2A:Settings:Defaults",
  };
  private _all: BehaviorSubject<SettingsModel>;

  constructor() {
    // 1. Load optimal default settings on every startup
    const envPath = path.resolve(resourcesDir(), "app.env");
    const defaults = this.defaults(envPath);

    // 2. Instantiate the `all` settings Observable for Electron-side usage
    this._all = new BehaviorSubject<SettingsModel>(defaults);
    this.all = this._all.asObservable();

    // 3. Read settings from file or create a new file if one does not exist
    this.loadFile();

    // 4. Make sure all necessary local paths exist
    checkPaths([this._all.value.system.appPath]);

    // 5. Listen to IPC channels for incoming requests
    ipcMain.on(
      this.ipcChannels.setSettings,
      (_: any, settings: SettingsModel) => {
        const next: SettingsModel = lodash.merge(this._all.value, settings);
        this.writeSettings(next).then(() => {});
        this._all.next(next);
      }
    );
    ipcMain.on(this.ipcChannels.getSettings, (_: any) => {
      const kcMainWindow = BrowserWindow.getAllWindows()[0];
      kcMainWindow.webContents.send(this.ipcChannels.sendAll, this._all.value);
    });
    ipcMain.on(this.ipcChannels.getDefaults, (_: any) => {
      const defaultSettings = this.defaults(envPath);
      const kcMainWindow = BrowserWindow.getAllWindows()[0];
      kcMainWindow.webContents.send(
        this.ipcChannels.sendDefaults,
        defaultSettings
      );
    });

    // 6. Broadcast settings via IPC whenever settings are changed or requested
    setTimeout(() => {
      this.all.subscribe((settings: SettingsModel) => {
        const kcMainWindow = BrowserWindow.getAllWindows()[0];
        kcMainWindow.webContents.send(this.ipcChannels.sendAll, settings);
      });
    }, 2500);
  }

  private static getEnvironment(envPath: string): EnvironmentSettingsModel {
    const env = dotenv.config({ path: envPath });
    if (env.error || !env.parsed) {
      return {
        appTitle: "Knowledge",
        settingsFilename: "knowledge.settings.json",
        DEFAULT_WINDOW_HEIGHT: 1280,
        DEFAULT_WINDOW_WIDTH: 1000,
        STARTUP_WINDOW_HEIGHT: 1280,
        STARTUP_WINDOW_WIDTH: 1000,
      };
    } else {
      return {
        appTitle: env.parsed.appTitle ?? "Knowledge",
        settingsFilename:
          env.parsed.settingsFilename ?? "knowledge.settings.json",
        DEFAULT_WINDOW_HEIGHT:
          parseInt(env.parsed.DEFAULT_WINDOW_HEIGHT) ?? 1280,
        DEFAULT_WINDOW_WIDTH: parseInt(env.parsed.DEFAULT_WINDOW_WIDTH) ?? 1000,
        STARTUP_WINDOW_HEIGHT:
          parseInt(env.parsed.STARTUP_WINDOW_HEIGHT) ?? 1280,
        STARTUP_WINDOW_WIDTH: parseInt(env.parsed.STARTUP_WINDOW_WIDTH) ?? 1000,
      };
    }
  }

  system(envPath: string): SystemSettingsModel {
    const env = SettingsService.getEnvironment(envPath);
    const system: SystemSettingsModel = {
      appPath: path.join(os.homedir(), "." + env.appTitle),
      cwd: process.cwd(),
      downloadPath: path.join(os.homedir(), "Downloads"),
      envPath: envPath,
      firstRun: true,
      homePath: os.homedir(),
      pathSep: path.sep,
      resourcesPath: resourcesDir(),
      settingsPath: "",
      settingsFilePath: "",
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      osPlatform: process.platform,
      osVersion: process.getSystemVersion(),
    };

    switch (process.platform) {
      case "darwin": // MacOS -- /Users/username/Library/Preferences/Knowledge
        system.settingsPath = path.join(
          os.homedir(),
          "Library",
          "Preferences",
          env.appTitle
        );
        break;
      case "linux": // Linux -- ~/.local/share/Knowledge
        system.settingsPath = path.join(
          os.homedir(),
          ".local",
          "share",
          env.appTitle
        );
        break;
      case "win32": // Windows -- C:\Users\username\AppData\Local\Knowledge
        system.settingsPath = path.join(
          os.homedir(),
          "AppData",
          "Roaming",
          env.appTitle
        );
        break;
      default:
        console.error(
          "Settings directory not configured properly. Shutting down."
        );
        process.exit(-1);
    }

    if (profile) {
      system.appPath = profile.data;
      system.downloadPath = profile.downloads;
      system.settingsPath = profile.settings;
    }

    system.settingsFilePath = path.resolve(
      system.settingsPath,
      env.settingsFilename
    );
    return system;
  }

  defaults(envPath: string): SettingsModel {
    const env = SettingsService.getEnvironment(envPath);
    const system: SystemSettingsModel = this.system(envPath);
    return {
      env: env,
      system: system,
      app: {
        table: new TableSettingsModel(),
        grid: new GridSettingsModel(),
        calendar: new CalendarSettingsModel(),
        projects: new ProjectSettingsModel(),
        graph: new GraphSettingsModel(),
        chat: new ChatSettingsModel(),
      },
      display: {
        theme: new KcTheme(),
        syncTheme: true,
        logging: new LoggingSettingsModel(),
        zoom: 100,
        autoplay: true,
        animations: true,
      },
      docker: new DockerSettingsModel(),
      ingest: {
        manager: new FileManagerSettingsModel(path.resolve(system.appPath)),
        extensions: new ExtensionServerSettingsModel(__dirname),
        autoscan: new AutoscanSettingsModel(
          path.resolve(system.downloadPath, "Knowledge")
        ),
      },
      search: new SearchSettingsModel(),
      user: new UserSettingsModel(),
    };
  }

  error(summary: string, description: string) {
    console.error(`ElectronSettingsService: ${summary} - ${description}`);
  }

  warn(summary: string, description: string) {
    console.warn(`ElectronSettingsService: ${summary} - ${description}`);
  }

  getSettings(): SettingsModel {
    return this._all.value;
  }

  async writeSettings(settings: SettingsModel): Promise<any> {
    // First attempt to create the settings directory.
    // Ignore if it already exists and return error if creation fails.
    return new Promise((resolve, reject) => {
      try {
        fs.mkdirSync(settings.system.settingsPath, { recursive: true });
      } catch (e) {
        console.error("Unable to create: ", settings.system.settingsPath, e);
        GLOBAL_ERROR =
          "Could not create settings directory: " +
          settings.system.settingsPath;
        reject({ GLOBAL_ERROR });
      }

      try {
        const str = JSON.stringify(settings);
        fs.writeFileSync(settings.system.settingsFilePath, str);
        return RET_OK;
      } catch (e) {
        GLOBAL_ERROR =
          "Could not write startup settings: " +
          settings.system.settingsFilePath;
        return RET_FAIL;
      }
    });
  }

  private loadFile() {
    const filePath = this._all.value.system.settingsFilePath;
    let settings: SettingsModel;
    let raw;

    try {
      raw = fs.readFileSync(filePath);
      settings = JSON.parse(raw.toString());

      // settings.system.appVersion was added in >=0.5.5. If it does not exist, we do not want to include the file
      if (settings && settings.system.appVersion) {
        const pinned = { ...this._all.value.system };
        const merged = lodash.merge(this._all.value, settings);

        // Make sure we always have the latest version numbers (otherwise the versions from the file will overwrite actual values)
        merged.system.appVersion = app.getVersion();
        merged.system.electronVersion = process.versions.electron;
        merged.system.nodeVersion = process.versions.node;
        merged.system.osPlatform = process.platform;
        merged.system.osVersion = process.getSystemVersion();

        // A profile always owns its storage paths, even if the file says otherwise
        if (profile) {
          merged.system.appPath = pinned.appPath;
          merged.system.downloadPath = pinned.downloadPath;
          merged.system.settingsPath = pinned.settingsPath;
          merged.system.settingsFilePath = pinned.settingsFilePath;
          merged.system.resourcesPath = pinned.resourcesPath;
        }

        this._all.next(merged);
      } else {
        this.warn(
          "Deprecated Settings File Found",
          "Replacing with new schema."
        );
        this.writeSettings(this._all.value).then(() => {
          this._all.next(this._all.value);
        });
      }
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        this.warn(
          "Settings File Does Not Exist",
          "Creating new settings file."
        );
      } else {
        // Keep the unreadable file so the user can recover it
        const backupPath = `${filePath}.unreadable-${Date.now()}`;
        try {
          fs.renameSync(filePath, backupPath);
        } catch (renameError) {
          console.error("Could not move unreadable settings file", renameError);
        }
        this.error(
          "Settings File Unreadable",
          `Moved to ${backupPath}. Creating new settings file. ${e}`
        );
      }
      if (makeDirectory(this._all.value.system.settingsPath) !== RET_OK) {
        console.error("Exiting with code ", -1);
        process.exit(-1);
      }
      const data = JSON.stringify(this._all.value);
      if (writeFile(filePath, data) !== RET_OK) {
        console.error("Exiting with code ", -1);
        process.exit(-1);
      }
    }
  }
}

function checkPaths(paths: string[]) {
  for (const pathToCheck of paths) {
    if (makeDirectory(pathToCheck) !== RET_OK) {
      console.error(
        "Unexpected error while attempting to create directory: ",
        pathToCheck
      );
    }
  }
}

function writeFile(dir: string, data: any) {
  dir = path.join(dir);
  try {
    fs.writeFileSync(dir, data);
    return RET_OK;
  } catch (e) {
    console.error("Could not write settings file: ", dir);
    console.error(e);
    return RET_ERR;
  }
}

function makeDirectory(dir: string) {
  dir = path.resolve(dir);
  try {
    fs.mkdirSync(dir, { recursive: true });
    return RET_OK;
  } catch (e) {
    console.error(e);
    return RET_ERR;
  }
}

export const settingsService = new SettingsService();
module.exports = settingsService;
