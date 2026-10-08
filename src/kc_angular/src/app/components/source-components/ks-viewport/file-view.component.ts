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
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import {
  BrowserViewHeaderConfig,
  BrowserViewHeaderEvent,
  FileViewClickEvent,
  FileViewConfig,
} from '@shared/models/browser.view.model';

@Component({
  selector: 'ks-lib-file-view',
  template: `
    <ks-lib-viewport-header
      *ngIf="headerConfig"
      [config]="headerConfig"
      (headerEvents)="headerEvents($event)"
    >
    </ks-lib-viewport-header>
    <iframe class="file-view" *ngIf="ready" [src]="safeUrl"></iframe>
  `,
  styles: [
    `
      .file-view {
        height: calc(100vh - 68px);
        width: 100%;
      }
    `,
  ],
})
export class FileViewComponent implements OnInit, OnChanges {
  @Input() config!: FileViewConfig;
  @Input() showHeader = false;
  @Output() viewReady = new EventEmitter<boolean>();
  @Output() clickEvent = new EventEmitter<FileViewClickEvent>();
  @Output() fileError = new EventEmitter<string>();
  safeUrl: SafeUrl | undefined;
  headerConfig: BrowserViewHeaderConfig | undefined;
  ready = false;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    this.headerConfig = {
      canCopy: true,
      canClose: this.config.isDialog,
      displayText: this.config.filePath,
      displayTextReadOnly: true,
      showActionButtons: true,
      showDisplayText: true,
      showCloseButton: true,
      showOpenButton: true,
    };
  }

  ngOnChanges(changes: SimpleChanges) {
    const config: FileViewConfig = changes.config.currentValue;
    if (config?.url) {
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(config.url);
      this.ready = true;
      this.viewReady.emit(true);
    } else if (config) {
      if (config.filePath) {
        if (this.validateFileURI(config.filePath)) {
          this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
            'file://' + encodeURI(config.filePath)
          );
          this.ready = true;
          this.viewReady.emit(true);
        } else {
          this.fileError.emit(
            'The file path contains invalid characters and cannot be previewed.'
          );
        }
      }
    }
  }

  headerEvents(headerEvent: BrowserViewHeaderEvent) {
    this.clickEvent.emit(headerEvent);
  }

  validateFileURI(uri: string) {
    return !uri.includes('#');
  }
}
