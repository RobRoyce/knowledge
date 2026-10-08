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
import { Platform } from '@app/platform/platform';
import { WebsitePdf } from '@app/platform/website-pdf';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { ExtractorService } from '@services/ingest-services/extractor.service';

@Component({
  selector: 'app-action-bar',
  template: `
    <div class="w-full flex flex-row align-items-center justify-content-center">
      <button
        pButton
        *ngIf="showEdit"
        class="m-1 p-button-text"
        icon="pi pi-info"
        pTooltip="Details"
        [tooltipOptions]="actionButtonTooltipOptions"
        (click)="edit.emit()"
      ></button>
      <button
        pButton
        *ngIf="showPreview"
        class="m-1 p-button-text "
        icon="pi pi-eye"
        pTooltip="Preview"
        [tooltipOptions]="actionButtonTooltipOptions"
        (click)="preview.emit()"
      ></button>
      <button
        pButton
        *ngIf="showOpen"
        class="m-1 p-button-text "
        icon="pi pi-external-link"
        pTooltip="Open In..."
        [tooltipOptions]="actionButtonTooltipOptions"
        (click)="open.emit()"
      ></button>
      <button
        pButton
        *ngIf="showChat && platform.has('chat')"
        class="m-1 p-button-text"
        icon="pi pi-comments"
        pTooltip="Chat"
        [tooltipOptions]="actionButtonTooltipOptions"
        (click)="chat.emit()"
      ></button>
      <span
        *ngIf="showSavePdf && ks.ingestType !== 'file'"
        [pTooltip]="pdf.available ? 'Save as PDF' : unavailablePdf"
        [tooltipOptions]="actionButtonTooltipOptions"
      >
        <button
          pButton
          class="m-1 p-button-text"
          icon="pi pi-file-pdf"
          data-test="save-pdf"
          [attr.aria-label]="pdf.available ? 'Save as PDF' : unavailablePdf"
          [disabled]="!pdf.available"
          (click)="saveAsPdf()"
        ></button>
      </span>
      <button
        pButton
        *ngIf="showRemove"
        class="m-1 p-button-text p-button-danger"
        icon="pi pi-trash"
        pTooltip="Remove"
        [tooltipOptions]="actionButtonTooltipOptions"
        (click)="remove.emit()"
      ></button>
      <button
        pButton
        [icon]="ks.flagged ? 'pi pi-flag-fill' : 'pi pi-flag'"
        class="m-1 p-button-text p-button-outlined"
        (click)="flag.emit({ checked: !ks.flagged })"
      ></button>
    </div>
  `,
  styles: [``],
})
export class KsActionsComponent {
  @Input() actionButtonTooltipOptions = {
    showDelay: 750,
    tooltipPosition: 'top',
  };

  @Input() ks!: KnowledgeSource;

  @Input() showFlag = true;

  @Input() showEdit = true;

  @Input() showPreview = true;

  @Input() showOpen = true;

  @Input() showRemove = true;

  @Input() showChat = true;

  @Input() showSavePdf = true;

  @Output() edit = new EventEmitter<any>();

  @Output() preview = new EventEmitter<any>();

  @Output() open = new EventEmitter<any>();

  @Output() remove = new EventEmitter<any>();

  @Output() chat = new EventEmitter<any>();

  @Output() flag = new EventEmitter<any>();

  readonly unavailablePdf =
    'Save as PDF is available in the desktop app. It renders the website in a hidden desktop window.';

  constructor(
    private extractor: ExtractorService,
    public pdf: WebsitePdf,
    public platform: Platform
  ) {}

  saveAsPdf() {
    this.extractor.websiteToPdf(
      typeof this.ks.accessLink === 'string'
        ? this.ks.accessLink
        : this.ks.accessLink.href,
      this.ks.title
        .trim()
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(' ', '_')
    );
  }
}
