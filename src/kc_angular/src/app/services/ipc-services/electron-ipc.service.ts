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
import { isDesktop } from '@app/platform/platform';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  BrowserViewRequest,
  IpcMessage,
  PromptForDirectoryRequest,
  ThumbnailRequest,
} from '@shared/models/electron.ipc.model';
import { UUID } from '@shared/models/uuid.model';

export interface ElectronNavEvent {
  stack: string[];
}

@Injectable({
  providedIn: 'root',
})
export class ElectronIpcService {
  receiveChannels = {
    browserViewExtractText: 'E2A:BrowserView:ExtractedText',
  };
  private ClassName = 'ElectronIpcService';
  private send = window.api?.send ?? (() => undefined);
  private receive = window.api?.receive ?? (() => undefined);
  private receiveOnce = window.api?.receiveOnce ?? (() => undefined);
  private removeAllListeners =
    window.api?.removeAllListeners ?? (() => undefined);
  private channels = {
    autoUpdateReceive: 'E2A:AutoUpdate:Update',
    browserView: 'A2E:BrowserView:Open',
    browserViewCanGoBack: 'A2E:BrowserView:CanGoBack',
    browserViewCanGoBackResults: 'E2A:BrowserView:CanGoBack',
    browserViewCanGoForward: 'A2E:BrowserView:CanGoForward',
    browserViewCanGoForwardResults: 'E2A:BrowserView:CanGoForward',
    browserViewCurrentUrl: 'A2E:BrowserView:CurrentUrl',
    browserViewCurrentUrlResults: 'E2A:BrowserView:CurrentUrl',
    browserViewGoBack: 'A2E:BrowserView:GoBack',
    browserViewGoForward: 'A2E:BrowserView:GoForward',
    browserViewInvert: 'A2E:BrowserView:Invert',
    browserViewNavEvents: 'E2A:BrowserView:NavEvent',
    browserViewRefresh: 'A2E:BrowserView:Refresh',
    browserViewResults: 'E2A:BrowserView:Open',
    checkCurrentVersion: 'A2E:Version:Get',
    checkCurrentVersionResults: 'E2A:Version:Get',
    checkForUpdates: 'A2E:AutoUpdate:Check',
    checkForUpdatesResults: 'E2A:AutoUpdate:Check',
    closeBrowserView: 'A2E:BrowserView:Close',
    closeBrowserViewResults: 'E2A:BrowserView:Close',
    generateUuid: 'A2E:Uuid:Generate',
    generateUuidResults: 'E2A:Uuid:Generate',
    getFileIcon: 'A2E:FileSystem:FileIcon',
    getFileIconResults: 'E2A:FileSystem:FileIcon',
    getFileThumbnail: 'A2E:FileSystem:FileThumbnail',
    getFileThumbnailResults: 'E2A:FileSystem:FileThumbnail',
    openLocalFile: 'A2E:FileSystem:OpenFile',
    openLocalFileResults: 'E2A:FileSystem:OpenFile',
    promptForDirectory: 'A2E:FileSystem:DirectoryPrompt',
    promptForDirectoryResults: 'E2A:FileSystem:DirectoryPrompt',
    showItemInFolder: 'A2E:FileSystem:ShowFile',
    showItemInFolderResults: 'E2A:FileSystem:ShowFile',
  };
  // Subscribers will be alerted when the browser view navigates to a new URL
  private browserViewNavEvent = new BehaviorSubject<string>('');
  navEvent = this.browserViewNavEvent.asObservable();

  // Subscribers will be alerted when the browser view state is changed
  private _bvCanGoBack = new BehaviorSubject<boolean>(false);
  browserViewCanGoBackResult = this._bvCanGoBack.asObservable();

  private _bvCanGoForward = new BehaviorSubject<boolean>(false);
  browserViewCanGoForwardResult = this._bvCanGoForward.asObservable();

  private _bvUrl = new BehaviorSubject<string>('');
  browserViewCurrentUrlResult = this._bvUrl.asObservable();

  private _bvStateTimer: any = Date.now();

  private _currentVersion = new BehaviorSubject<string>('');
  version = this._currentVersion.asObservable();

  private _thumbnails = new BehaviorSubject<{ id: string; thumbnail: any }>({
    id: '',
    thumbnail: undefined,
  });
  thumbnail = this._thumbnails.asObservable();

  private _extractedText = new BehaviorSubject<{
    url: string;
    text: string;
    method: string;
  }>({
    url: '',
    text: '',
    method: '',
  });
  extractedText = this._extractedText.asObservable();

  constructor(private zone: NgZone) {
    // Desktop only. In a browser there is no Electron bridge.
    if (!isDesktop()) {
      return;
    }

    /**
     * Listen for auto update messages
     */
    this.receive(this.channels.autoUpdateReceive, (response: IpcMessage) => {
      console.log('Auto update message: ', response);
    });

    this.receive(
      this.channels.checkCurrentVersionResults,
      (response: IpcMessage) => {
        this._currentVersion.next(response.success?.data);
      }
    );

    /**
     * Listen for incoming browser extension results
     */
    this.receive(this.channels.browserViewNavEvents, (response: IpcMessage) => {
      this.run(() => {
        if (response.error) {
          console.error(response.error);
          return;
        } else if (response.success?.data) {
          const url = response.success.data;
          this.browserViewNavEvent.next(url);
        }
        this.triggerBrowserViewStateUpdate();
      });
    });

    /**
     * Pre-register call backs which will feed the above observables
     *
     */
    this.receive(
      this.channels.browserViewCanGoBackResults,
      (response: IpcMessage) => {
        this.run(() => {
          if (response.success) this._bvCanGoBack.next(response.success.data);
        });
      }
    );

    this.receive(
      this.channels.browserViewCanGoForwardResults,
      (response: IpcMessage) => {
        this.run(() => {
          if (response.success)
            this._bvCanGoForward.next(response.success.data);
        });
      }
    );

    this.receive(
      this.channels.browserViewCurrentUrlResults,
      (response: IpcMessage) => {
        this.run(() => {
          if (response.success) this._bvUrl.next(response.success.data);
        });
      }
    );

    this.receive(
      this.receiveChannels.browserViewExtractText,
      (response: any) => {
        this._extractedText.next(response);
      }
    );

    this.receive(
      this.channels.getFileThumbnailResults,
      (response: IpcMessage[]) => {
        for (const res of response) {
          this.run(() => {
            if (res.success?.data) {
              this._thumbnails.next(res.success.data);
            }
          });
        }
      }
    );
  }

  checkForUpdates() {
    this.send(this.channels.checkForUpdates);
  }

  getCurrentVersion() {
    this.send(this.channels.checkCurrentVersion);
  }

  triggerBrowserViewStateUpdate() {
    this.send(this.channels.browserViewCanGoBack);
    this.send(this.channels.browserViewCanGoForward);
    this.send(this.channels.browserViewCurrentUrl);
  }

  browserViewGoBack() {
    if (this.canSubmitBrowserViewAction()) {
      this.send(this.channels.browserViewGoBack);
    }
  }

  browserViewGoForward() {
    if (this.canSubmitBrowserViewAction()) {
      this.send(this.channels.browserViewGoForward);
    }
  }

  browserViewInvert() {
    if (this.canSubmitBrowserViewAction()) {
      this.send(this.channels.browserViewInvert);
    }
  }

  browserViewRefresh() {
    if (this.canSubmitBrowserViewAction()) {
      this.send(this.channels.browserViewRefresh);
    }
  }

  closeBrowserView() {
    this.browserViewNavEvent.next('');
    this._bvCanGoBack.next(false);
    this._bvCanGoForward.next(false);
    this._bvUrl.next('');

    this.receiveOnce(
      this.channels.closeBrowserViewResults,
      (response: IpcMessage) => {
        this.removeAllListeners(this.channels.closeBrowserViewResults);
        this.run(() => {
          if (response.success) {
            return response.success.data;
          } else {
            console.error('ElectronIpcService -- ', response.error);
          }
        });
      }
    );
    this.send(this.channels.closeBrowserView);
  }

  run = (fn: () => void) => {
    this.zone.run(fn);
  };

  getFileIcon(paths: string[]): Promise<any[]> {
    return new Promise<any[]>((resolve) => {
      this.receiveOnce(
        this.channels.getFileIconResults,
        (responses: IpcMessage[]) => {
          if (paths.length <= 0) {
            this.run(() => {
              resolve([]);
            });
          }

          const icons: any[] = [];
          for (const response of responses) {
            if (response.success?.data) icons.push(response.success.data);
          }

          this.run(() => {
            resolve(icons);
          });
        }
      );
      this.send(this.channels.getFileIcon, paths);
    });
  }

  getFileThumbnail(requests: ThumbnailRequest[]) {
    if (requests.length > 0) {
      this.send(this.channels.getFileThumbnail, requests);
    }
  }

  promptForDirectory(request: PromptForDirectoryRequest): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.receiveOnce(
        this.channels.promptForDirectoryResults,
        (response: IpcMessage) => {
          this.removeAllListeners(this.channels.promptForDirectoryResults);
          this.run(() => {
            if (response.error) {
              console.error(response.error);
              reject(response.error);
            }
            if (response.success) {
              resolve(response.success.data);
            }
          });
        }
      );
      this.send(this.channels.promptForDirectory, request);
    });
  }

  openBrowserView(request: BrowserViewRequest): Promise<IpcMessage> {
    return new Promise<IpcMessage>((resolve) => {
      this.receiveOnce(
        this.channels.browserViewResults,
        (response: IpcMessage) => {
          this.removeAllListeners(this.channels.browserViewResults);
          this.run(() => {
            resolve(response);
          });
        }
      );
      this.send(this.channels.browserView, request);
    });
  }

  openLocalFile(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (path.length === 0 || path.trim() === '') {
        resolve(false);
      }

      this.receiveOnce(
        this.channels.openLocalFileResults,
        (response: IpcMessage) => {
          this.removeAllListeners(this.channels.openLocalFileResults);
          this.run(() => {
            if (response.success?.data) {
              resolve(true);
            } else {
              resolve(false);
            }
          });
        }
      );
      this.send(this.channels.openLocalFile, path);
    });
  }

  generateUuid(quantity: number): Promise<UUID[]> {
    return new Promise<UUID[]>((resolve, reject) => {
      if (quantity <= 0) {
        resolve([]);
      }

      this.receiveOnce(
        this.channels.generateUuidResults,
        (response: IpcMessage) => {
          this.removeAllListeners(this.channels.generateUuidResults);
          this.run(() => {
            if (response.success?.data) {
              const uuids: UUID[] = [];
              for (const id of response.success.data) {
                const uuid = { value: id };
                uuids.push(uuid);
              }
              resolve(uuids);
            } else {
              console.error(
                `${this.ClassName} error generating UUIDs: `,
                response.error
              );
              reject([]);
            }
          });
        }
      );
      this.send(this.channels.generateUuid, { quantity: quantity });
    });
  }

  showItemInFolder(accessLink: string) {
    this.send(this.channels.showItemInFolder, accessLink);
  }

  /**
   * This function acts as a "de-bouncer" on browser view navigation actions In other words, it prevents users from
   * clicking the button so quick that state cannot be maintained properly This is necessary because Electron appears
   * to fall out of sync if a user presses "back" or "forward" to quickly..
   */
  private canSubmitBrowserViewAction(): boolean {
    if (Date.now() - this._bvStateTimer > 250) {
      this._bvStateTimer = Date.now();
      return true;
    } else {
      return false;
    }
  }
}
