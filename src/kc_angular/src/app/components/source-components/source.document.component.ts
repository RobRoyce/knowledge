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
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ManagedFiles } from '@app/platform/managed-files';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'source-document',
  template: `
    <div class="source-pdf-viewer fadein">
      <div #document class="flex-col-center-center h-full surface-section">
        <embed
          #document
          *ngIf="safeUrl"
          [src]="safeUrl"
          [style]="style"
          class="p-fluid"
        />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex !important;
        flex-direction: column !important;
        height: 100% !important;
        width: 100% !important;
        overflow: auto !important;
        padding: 1.5rem !important;
      }

      .source-pdf-viewer {
        height: 100% !important;
      }
    `,
  ],
})
export class SourceDocumentComponent implements OnInit, OnDestroy {
  source!: KnowledgeSource;

  safeUrl: SafeUrl | undefined;

  style: { [key: string]: string } = {
    width: '100%',
    height: '100%',
    'max-width': '100%',
    'max-height': '100%',
    // Plain text has no background of its own
    'background-color': 'white',
  };

  styles = {
    unset: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif'],
    full: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  };

  @ViewChild('document', { static: true }) document!: ElementRef;

  @ViewChild('documentContainer', { static: true })
  documentContainer!: ElementRef<HTMLDivElement>;

  private viewUrl?: string;

  constructor(
    private sanitizer: DomSanitizer,
    private managedFiles: ManagedFiles
  ) {}

  ngOnDestroy() {
    if (this.viewUrl) {
      this.managedFiles.release(this.viewUrl);
    }
  }

  /** Managed files come from the storage service. Others use the file path. */
  private async documentUrl(): Promise<string> {
    if (this.source.assetId) {
      const filename =
        this.source.reference?.source?.file?.filename ?? this.source.title;
      this.viewUrl = await this.managedFiles.viewUrl(
        this.source.assetId,
        filename
      );
      return this.viewUrl;
    }
    return 'file://' + encodeURI(this.source.accessLink as string);
  }

  ngOnInit(): void {
    setTimeout(async () => {
      if (typeof this.source.accessLink === 'string' || this.source.assetId) {
        this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
          await this.documentUrl()
        );

        for (const type of this.styles.unset) {
          if (String(this.source.accessLink ?? '').endsWith(type)) {
            this.style = {
              'max-height': '100%',
              'max-width': '100%',
              width: 'unset',
              height: 'unset',
            };
            break;
          }
        }
      }
    }, 500);
  }
}
