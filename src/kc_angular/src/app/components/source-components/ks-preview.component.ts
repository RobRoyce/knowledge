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
import { ManagedFiles } from '@app/platform/managed-files';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { ElectronIpcService } from '@services/ipc-services/electron-ipc.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { ExtractorService } from '@services/ingest-services/extractor.service';
import {
  BrowserViewClickEvent,
  BrowserViewConfig,
  BrowserViewNavEvent,
  FileViewClickEvent,
  FileViewConfig,
} from '@shared/models/browser.view.model';
import { KsFactoryService } from '@services/factory-services/ks-factory.service';
import { IngestService } from '@services/ingest-services/ingest.service';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { NotificationsService } from '@services/user-services/notifications.service';
import { KsCommandService } from '@services/command-services/ks-command.service';

export interface KsPreviewInput {
  ks: KnowledgeSource;
}

@Component({
  selector: 'app-ks-preview',
  template: `
    <div class="ks-preview-viewport">
      <div class="ks-preview-body surface-100">
        <ks-lib-browser-view
          *ngIf="browserViewConfig"
          (clickEvent)="onBrowserViewClickEvent($event)"
          (navEvent)="onBrowserViewNavEvent($event)"
          (viewReady)="setViewReady($event)"
          [kcBrowserViewConfig]="browserViewConfig"
        >
        </ks-lib-browser-view>

        <ks-lib-file-view
          *ngIf="fileViewConfig"
          (clickEvent)="onFileViewClickEvent($event)"
          (fileError)="onError($event)"
          (viewReady)="setViewReady($event)"
          [config]="fileViewConfig"
        >
        </ks-lib-file-view>
      </div>

      <div class="ks-preview-footer w-full flex-row-center-center">
        <div *ngIf="!viewReady">
          <img
            src="assets/img/kc-icon-transparent.png"
            alt="Knowledge Logo"
            class="pulsate-fwd"
            style="filter: drop-shadow(0 0 1px var(--primary-color)); height: 8rem; position: absolute; left: calc(50vw - 4rem); top: calc(50vh - 4rem)"
          />
        </div>
        <p-progressBar
          [style]="{ height: '4px' }"
          mode="indeterminate"
          id="progress-bar"
          class="p-fluid w-full"
        ></p-progressBar>
      </div>
    </div>
  `,
  styles: [
    `
      .ks-preview-viewport {
        //background-color: black;
        min-height: calc(100vh - 48px);
        max-height: calc(100vh - 48px);
        min-width: 100%;
        max-width: 100%;
        overflow: hidden;
      }

      .ks-preview-body {
        // The dialog itself should be opened with a height of 100vh, the footer should be 8px, and the header should be 32px
        height: calc(100vh - 48px);
      }

      .ks-preview-footer {
        height: 8px;
        display: flex;
        flex-direction: column;
        flex-wrap: nowrap;
        justify-content: flex-end;
      }

      ::ng-deep {
        .p-dialog {
          max-height: unset;
        }
      }
    `,
  ],
})
export class KsPreviewComponent implements OnInit, OnDestroy {
  // Must be configured to display file view. Should be undefined when displaying browser view
  fileViewConfig: FileViewConfig | undefined = undefined;

  // Must be configured to display browser view. Should be undefined when displaying file view
  browserViewConfig: BrowserViewConfig | undefined = undefined;

  // Can be set to any color, rgb, rgba, or hex
  backgroundColor = 'white';

  // The KS for which this preview is being opened
  ks: KnowledgeSource;

  // Set to true if something changes that requires the KS to be updated after dialog close
  ksChanged = false;

  // An array of file types that have been tested and are to be supported in file viewer
  supportedFileTypes: string[] = ['pdf', 'jpeg', 'png', 'mp4'];

  // Set to true once file or browser viewers have loaded properly
  viewReady = false;

  // Should be set to file path (if file) or current browser view URL (if website)
  private activeBrowserViewUrl = '';

  constructor(
    private extractor: ExtractorService,
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
    private ipc: ElectronIpcService,
    private factory: KsFactoryService,
    private command: KsCommandService,
    private ingest: IngestService,
    private clipboard: Clipboard,
    private notifications: NotificationsService,
    private managedFiles: ManagedFiles
  ) {
    this.ks = config.data.ks;
  }

  ngOnInit(): void {
    switch (this.ks.reference.ingestType) {
      case 'file':
        this.previewFile();
        break;
      default:
        this.previewWebsite();
    }
    this.ks.dateAccessed.push(new Date());
    this.ksChanged = true;
  }

  ngOnDestroy() {
    this.close();
  }

  close() {
    this.ipc.closeBrowserView();
    this.ref.close(this.ks);
  }

  copy(text: string) {
    this.clipboard.copy(text);
  }

  onFileViewClickEvent(clickEvent: FileViewClickEvent) {
    if (!this.fileViewConfig) {
      this.notifications.error(
        'Preview',
        'Invalid File',
        'Expected file view configuration.'
      );
      return;
    }

    if (clickEvent.copyClicked) {
      this.copy(this.fileViewConfig.filePath);
    }
    if (clickEvent.closeClicked) {
      this.close();
    }

    if (clickEvent.openClicked) {
      if (this.ks.assetId) {
        this.managedFiles.open(
          this.ks.assetId,
          this.ks.reference?.source?.file?.filename ?? this.ks.title
        );
      } else {
        this.ipc.openLocalFile(this.fileViewConfig.filePath);
      }
    }
  }

  onBrowserViewClickEvent(clickEvent: BrowserViewClickEvent) {
    if (!this.browserViewConfig) {
      this.notifications.error(
        'Preview',
        'Invalid File',
        'Expected file view configuration.'
      );
      return;
    }

    if (clickEvent.copyClicked) {
      this.copy(this.activeBrowserViewUrl);
    }

    if (clickEvent.closeClicked) {
      this.close();
    }

    if (clickEvent.saveClicked) {
      this.save();
    }

    if (clickEvent.openClicked) {
      window.open(this.activeBrowserViewUrl);
    }
  }

  onBrowserViewNavEvent(navEvent: BrowserViewNavEvent) {
    this.activeBrowserViewUrl = navEvent.url?.href || '';

    if (!this.browserViewConfig) return;

    if (navEvent.url?.href !== this.browserViewConfig.url.href) {
      this.browserViewConfig = {
        ...this.browserViewConfig,
        ...{ canSave: true },
      };
    } else {
      this.browserViewConfig = {
        ...this.browserViewConfig,
        ...{ canSave: undefined },
      };
    }
  }

  previewFile() {
    // Make sure browserViewConfig is undefined
    this.browserViewConfig = undefined;
    if (
      !this.ks.reference.source.file ||
      typeof this.ks.accessLink !== 'string'
    ) {
      return;
    }

    const fileType = this.ks.reference.source.file.type;

    if (fileType === '') {
      this.notifications.error(
        'Source Preview',
        'Unsupported File Type',
        `Knowledge cannot preview that file`
      );
      this.ref.close();
      return;
    }

    let supported = false;
    for (const supportedType of this.supportedFileTypes) {
      if (fileType.indexOf(supportedType) > 0) {
        supported = true;
        this.previewSupportedType(supportedType);
        break;
      }
    }

    if (!supported) {
      this.notifications.error(
        'Source Preview',
        'Unsupported File Type',
        `Knowledge cannot preview ${fileType} files`
      );
      this.ref.close();
    }
  }

  previewSupportedType(type: string) {
    switch (type) {
      case 'pdf':
        this.previewPdf();
        break;
      case 'png':
      case 'mp4':
        this.previewImage();
        break;
    }
  }

  previewPdf() {
    if (typeof this.ks.accessLink !== 'string') {
      this.notifications.error(
        'Preview',
        'Invalid Path',
        'Expected a path to the PDF file.'
      );
      return;
    }

    this.fileViewConfig = {
      filePath: this.ks.accessLink,
      isDialog: true,
    };
    this.viewReady = true;
  }

  previewImage() {
    if (typeof this.ks.accessLink !== 'string') {
      this.notifications.error(
        'Preview',
        'Invalid Path',
        'Expected a path to the image file.'
      );
      return;
    }

    this.fileViewConfig = {
      filePath: this.ks.accessLink,
      isDialog: true,
    };

    this.viewReady = true;
  }

  previewWebsite() {
    this.fileViewConfig = undefined;
    let webUrl: URL;

    if (typeof this.ks.accessLink === 'string') {
      webUrl = new URL(this.ks.accessLink);
    } else {
      webUrl = this.ks.accessLink;
    }

    this.browserViewConfig = {
      url: webUrl,
      isDialog: true,
    };
  }

  save() {
    this.factory
      .make('website', this.activeBrowserViewUrl)
      .then((ks) => {
        if (!ks) {
          this.notifications.warn(
            'Preview',
            'Invalid Source',
            'Success was reported but the Source is undefined.'
          );
          return;
        }
        this.ingest.enqueue([ks]);
      })
      .catch((reason) => {
        this.notifications.error('KsPreview', 'Invalid Import', reason);
      });
  }

  setViewReady(viewReady: boolean) {
    this.viewReady = viewReady;
  }

  onError(error: string) {
    this.notifications.error('KsPreview', 'File Preview Error', error);
    this.command.open(this.ks);
    this.ref.close();
  }
}
