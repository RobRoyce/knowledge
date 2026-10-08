/*
 * Copyright (c) 2022-2024 Rob Royce
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
import { KcTheme } from "./style.model";
import { ChatModel, SupportedChatModels } from "./chat.model";

/**
 * All of these are set to default values inside the Electron Settings Service file under the `defaults()` function.
 */
export interface SettingsModel {
  env: EnvironmentSettingsModel;
  app: ApplicationSettingsModel;
  display: DisplaySettingsModel;
  docker: DockerSettingsModel;
  ingest: IngestSettingsModel;
  system: SystemSettingsModel;
  search: SearchSettingsModel;
  user: UserSettingsModel;
}

export class DockerSettingsModel {
  enabled = false;
  dockerPath = "";

  constructor(path?: string) {
    if (path) {
      this.dockerPath = path;
    }
  }
}

export class UserSettingsModel {
  firstName = "";
  lastName = "";
  userName = "";
  birthdate = "";
  tutorials: {
    showFirstRunTutorial: boolean;
    apiKeyTutorial: boolean;
  } = {
    showFirstRunTutorial: true,
    apiKeyTutorial: true,
  };
}

export interface EnvironmentSettingsModel {
  appTitle: string;
  settingsFilename: string;
  DEFAULT_WINDOW_HEIGHT: number;
  DEFAULT_WINDOW_WIDTH: number;
  STARTUP_WINDOW_HEIGHT: number;
  STARTUP_WINDOW_WIDTH: number;
}

export interface SystemSettingsModel {
  appPath: string; // Root storage location
  appVersion: string; // Knowledge version
  cwd: string; // The current working directory, dynamically set on App startup
  downloadPath: string; // Default downloads location
  electronVersion: string; // Current version of Electron, determined by process.versions.electron
  envPath: string; // Location of `.env` file
  firstRun: boolean; // Set to true if this is the first time the app is run, otherwise false, used for lifecycle
  homePath: string; // Depends on OS, equivalent to `~/` in Linux/MacOS
  nodeVersion: string; // Current version of node, determined by process.versions.node
  osPlatform: string; // Current platform as determined by process.platform
  osVersion: string; // Current platform version, set to process.getSystemVersion()
  pathSep: string; // Set to "/" for Linux and MacOS, set to "\" for Windows using `path.sep`
  resourcesPath: string; // Location of the Resources directory, copied into the final build but must be computed dynamically
  settingsPath: string; // Location of the directory containing the settings file
  settingsFilePath: string; // Fully qualified path to the JSON settings file
}

export interface ApplicationSettingsModel {
  projects: ProjectSettingsModel;
  table: TableSettingsModel;
  grid: GridSettingsModel;
  calendar: CalendarSettingsModel;
  graph: GraphSettingsModel;
  chat: ChatSettingsModel;
}

export class ProjectSettingsModel {
  ksInherit = true;
}

export class TableSettingsModel {
  showSubProjects = true;
  showCountdown = true;
}

export class GridSettingsModel {
  size: CardSizeType = "auto";
  sorter: CardSortType = "title-a";
}

export type CardSizeType = "auto" | "xs" | "sm" | "md" | "lg";
export type CardSortType =
  | "title-a"
  | "title-d"
  | "created-a"
  | "created-d"
  | "type-a"
  | "type-d"
  | "accessed-d"
  | "accessed-a";
export type CardOptions = {
  showThumbnail: boolean;
  showDescription: boolean;
  showProjectSelection: boolean;
  showTopics: boolean;
  showChat: boolean;
  showIcon: boolean;
  showRemove: boolean;
  showPreview: boolean;
  showEdit: boolean;
  showOpen: boolean;
  showSavePdf: boolean;
  showContentType: boolean;
  showProjectName: boolean;
};

export class CalendarSettingsModel {}

export type GraphActions = "open" | "preview" | "details" | "select";

export class GraphSettingsModel {
  animation: {
    enabled: boolean;
    duration: number;
  } = {
    enabled: true,
    duration: 1000,
  };

  display: {
    showSources: boolean;
    autoFit: boolean;
    largeGraphWarning: boolean;
  } = {
    showSources: true,
    autoFit: true,
    largeGraphWarning: true,
  };

  simulation: {
    enabled: boolean;
    infinite: boolean;
    maxTime: number;
    delay: number;
  } = {
    enabled: true,
    infinite: false,
    maxTime: 2500,
    delay: 500,
  };

  actions: {
    tap: GraphActions;
    dblTap: GraphActions;
  } = {
    tap: "details",
    dblTap: "preview",
  };

  minimal = false;
}

export class SearchSettingsModel {
  provider: "google" | "bing" | "duck" = "google";
  fuzzy = true;
  threshold = 50;
}

export class DisplaySettingsModel {
  theme: KcTheme = new KcTheme();
  syncTheme = true;
  logging: LoggingSettingsModel = new LoggingSettingsModel();
  zoom = 100;
  autoplay = true;
  animations = true;
}

export class LoggingSettingsModel {
  warn = false;
  error = false;
  debug = false;
}

export class IngestSettingsModel {
  manager: FileManagerSettingsModel = new FileManagerSettingsModel();
  extensions: ExtensionServerSettingsModel = new ExtensionServerSettingsModel();
  autoscan: AutoscanSettingsModel = new AutoscanSettingsModel();
}

export class ExtensionServerSettingsModel {
  enabled = false;
  port = 9000;
  path = "";

  constructor(path?: string) {
    if (path) {
      this.path = path;
    }
  }
}

export class AutoscanSettingsModel {
  enabled = false;
  path = "";
  interval = 15;

  constructor(path?: string) {
    if (path) {
      this.path = path;
    }
  }
}

export class FileManagerSettingsModel {
  enabled = false;
  storageLocation = "";
  target: "autoscan" | "all" = "autoscan";

  constructor(location?: string) {
    if (location) {
      this.storageLocation = location;
    }
  }
}

export class ChatSettingsModel {
  suggestions?: {
    enabled?: boolean;
    onInput?: boolean;
  } = {
    enabled: false,
    onInput: false,
  };

  display?: {
    introductions?: boolean;
    sourceMessages?: boolean;
  } = {
    introductions: false,
    sourceMessages: true,
  };

  model: ChatModel = SupportedChatModels[0];
}
