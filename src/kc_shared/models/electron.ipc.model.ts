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
import { KnowledgeSource } from "./knowledge.source.model";

export interface IpcSuccess {
  message?: string;
  data?: any;
}

export interface IpcError {
  code: number;
  label: string;
  message: string;
}

export interface IpcMessage {
  error: IpcError | undefined;
  success: IpcSuccess | undefined;
}

export interface IpcRequest {
  responseChannel: string;
  data: any;
}

export interface UuidRequest {
  quantity: number;
}

export interface BrowserViewRequest {
  url: string;
  x: number;
  y: number;
  height: number;
  width: number;
  returnHtml?: boolean;
}

export interface BrowserViewResponse {
  html: string;
  backgroundColor: string;
}

export interface DialogRequest {
  ksList: KnowledgeSource[];
}

export interface ThumbnailRequest {
  path: string;
  /** Managed file in the storage service. Used instead of path when set. */
  assetId?: string;
  width?: number;
  height?: number;
  id?: string;
}

export interface PromptForDirectoryRequest {
  title?: string; // Dialog window title
  defaultPath?: string; // Path to point to when dialog loads
  buttonLabel?: string; // Custom label for the confirmation button, when left empty the default label will be used.
  filters?: FileFilter[]; // Filters for displaying certain file types
  properties?: PromptForDirectoryProperties[]; // Contains which features the dialog should use.
  message?: string; // [MacOS Only] Message to display above input boxes.
  securityScopedBookmarks?: boolean; // [MacOS Only] Create security scoped bookmarks when packaged for the Mac App Store
}

export type PromptForDirectoryProperties =
  | "openFile" // Allow files to be selected
  | "openDirectory" // Allow directories to be selected.
  | "multiSelections" // Allow multiple paths to be selected.
  | "showHiddenFiles" // Show hidden files in dialog.
  | "createDirectory" // [MacOS Only] Allow creating new directories from dialog.
  | "promptToCreate" // [Windows Only] Prompt for creation if the file path entered in the dialog does not exist. This does not actually create the file at the path but allows non-existent paths to be returned that should be created by the application.
  | "noResolveAliases" // [MacOS Only] Disable the automatic alias (symlink) path resolution. Selected aliases will now return the alias path instead of their target path.
  | "treatPackageAsDirectory" // [MacOS Only] Treat packages, such as .app folders, as a directory instead of a file.
  | "dontAddToRecent"; // [Windows Only]  Do not add the item being opened to the recent documents list.

export type FileFilter = {
  name: string;
  extensions: string[];
};
