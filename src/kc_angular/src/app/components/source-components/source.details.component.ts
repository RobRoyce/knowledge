/*
 * Copyright (c) 2023-2024 Rob Royce
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
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { ElectronIpcService } from '@services/ipc-services/electron-ipc.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { SearchService } from '@services/user-services/search.service';
import { skip } from 'rxjs';
import { Clipboard } from '@angular/cdk/clipboard';

@Component({
  selector: 'source-details',
  template: `
    <div class="w-full flex">
      <div class="source-header">
        <div class="source-header-div">
          <app-ks-card
            [ks]="source"
            [showEdit]="false"
            [showPreview]="false"
            [showFlag]="true"
            [showChat]="false"
            [showDescription]="false"
            [showTopics]="false"
            [allowDrag]="false"
            (onRemove)="remove.emit(source)"
            class="flex-grow-1"
          ></app-ks-card>
        </div>
      </div>

      <div class="source-header">
        <div class="source-model pb-0 pt-2">
          <div
            class="p-fluid flex-column surface-ground text-color border-round-2xl p-4 grid gap-2 border-1 surface-border hover:shadow-1 flex-grow-1"
          >
            <form [formGroup]="form" class="flex-grow-1">
              <div class="p-fluid grid h-full">
                <div class="col-12">
                  <label for="title">Title</label>
                  <input
                    formControlName="title"
                    id="title"
                    minlength="3"
                    pInputText
                    required
                    type="text"
                  />
                </div>
                <div class="col-12">
                  <label for="topics">Topics</label>
                  <p-chips
                    (onChipClick)="topicSearch($event)"
                    [addOnBlur]="true"
                    [addOnTab]="true"
                    [allowDuplicate]="false"
                    inputId="topics"
                    separator=","
                    formControlName="topics"
                    placeholder="Start typing to add a topic..."
                  >
                  </p-chips>
                </div>
                <div class="col-12">
                  <label for="ksProject">Project</label>
                  <input
                    [value]="
                      (source.associatedProject.value | projectName) || 'None'
                    "
                    id="ksProject"
                    disabled
                    pInputText
                    type="text"
                  />
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>

    <div class="source-metadata">
      <h3 class="text-2xl font-bold mt-4 ml-3">Metadata</h3>
      <div
        class="add-metadata bg-primary-reverse border-round-2xl flex-row-center-between w-full px-2 mb-4 text-color"
      >
        <div class="">
          <button
            pButton
            pRipple
            type="button"
            icon="pi pi-plus"
            (click)="addMeta(metaEntry)"
            class="p-button-sm p-button-secondary"
          ></button>
        </div>
        <div class="col-2">
          <input
            #tagInput
            pInputText
            type="text"
            class="w-full bg-primary-reverse text-color"
            placeholder="Tag"
            [(ngModel)]="metaEntry.key"
          />
        </div>
        <div class="col">
          <input
            pInputText
            type="text"
            placeholder="Value"
            (keydown.enter)="addMeta(metaEntry)"
            class="w-full bg-primary-reverse text-color"
            [(ngModel)]="metaEntry.value"
          />
        </div>
      </div>
      <p-card class="w-full">
        <div
          *ngIf="source.meta.length === 0"
          class="w-full text-xl flex-row-center-center"
        >
          Click the + button to add metadata...
        </div>
        <p-table
          *ngIf="source.meta.length > 0"
          [breakpoint]="'1200px'"
          [resizableColumns]="true"
          [value]="source.meta"
          [paginator]="true"
          [rows]="10"
          editMode="row"
          dataKey="id"
          class="w-full pb-1"
          tableStyleClass="w-full overflow-x-auto surface-ground"
        >
          <ng-template pTemplate="header">
            <tr>
              <th class="ks-info-table" pSortableColumn="key">
                Tag
                <p-sortIcon field="key"></p-sortIcon>
              </th>
              <th class="ks-info-table w-full" pSortableColumn="value">
                Value
                <p-sortIcon field="value"></p-sortIcon>
              </th>
              <th style="width:12rem" class="text-center"></th>
            </tr>
          </ng-template>
          <ng-template
            pTemplate="body"
            let-meta
            let-editing="editing"
            let-ri="rowIndex"
          >
            <tr
              [pEditableRow]="meta"
              *ngIf="meta.key.length > 0 && meta.value.length > 0"
            >
              <td class="ks-info-table select-text">
                <p-cellEditor>
                  <ng-template pTemplate="input">
                    <input pInputText type="text" [(ngModel)]="meta.key" />
                  </ng-template>
                  <ng-template pTemplate="output">
                    {{ meta.key }}
                  </ng-template>
                </p-cellEditor>
              </td>
              <td
                class="ks-info-table w-full select-text"
                style="text-wrap: inherit; overflow-wrap: anywhere"
              >
                <p-cellEditor>
                  <ng-template pTemplate="input">
                    <input
                      pInputText
                      class="w-full"
                      type="text"
                      [(ngModel)]="meta.value"
                    />
                  </ng-template>
                  <ng-template pTemplate="output">
                    <div>
                      {{ meta.value }}
                    </div>
                  </ng-template>
                </p-cellEditor>
              </td>
              <td class="ks-info-table">
                <div
                  class="flex align-items-center justify-content-center gap-2"
                >
                  <button
                    *ngIf="!editing && !meta.key.startsWith('knowledge:')"
                    pButton
                    type="button"
                    pInitEditableRow
                    icon="pi pi-pencil"
                    (click)="onRowEditInit(meta, ri)"
                    class="p-button-rounded p-button-text opacity-50 hover:opacity-100"
                  ></button>
                  <button
                    *ngIf="!editing && !meta.key.startsWith('knowledge:')"
                    pButton
                    type="button"
                    icon="pi pi-trash"
                    (click)="onRowDelete(meta, ri)"
                    class="p-button-rounded p-button-text p-button-danger opacity-50 hover:opacity-100"
                  ></button>
                  <div
                    *ngIf="!editing && meta.key.startsWith('knowledge:')"
                    class="p-button pi pi-info opacity-0 cursor-auto"
                    disabled
                  ></div>
                  <button
                    *ngIf="editing"
                    pButton
                    type="button"
                    pSaveEditableRow
                    icon="pi pi-check"
                    (click)="onRowEditSave(meta, ri)"
                    class="p-button-rounded p-button-text p-button-success mr-2"
                  ></button>
                  <button
                    *ngIf="editing"
                    pButton
                    pRipple
                    type="button"
                    pCancelEditableRow
                    icon="pi pi-times"
                    (click)="onRowEditCancel(meta, ri)"
                    class="p-button-rounded p-button-text p-button-danger"
                  ></button>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </p-card>
    </div>
  `,
  styleUrls: ['./source.styles.scss'],
})
export class SourceDetailsComponent implements OnInit {
  @ViewChild('tagInput') tagInput!: ElementRef;

  @Output() remove = new EventEmitter<KnowledgeSource>();

  @Output() update = new EventEmitter<KnowledgeSource>();

  source!: KnowledgeSource;

  form: FormGroup;

  showMarkdownPreview = true;

  metaUpdates: { [id: number]: { key: string; value: string } } = {};

  metaEntry: { key: string; value: string } = { key: '', value: '' };

  constructor(
    private clipboard: Clipboard,
    private fb: FormBuilder,
    private command: KsCommandService,
    private ipc: ElectronIpcService,
    private notify: NotificationsService,
    private search: SearchService
  ) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      topics: [[]],
      dateDue: [''],
    });

    this.form.valueChanges
      .pipe(skip(1), debounceTime(500), distinctUntilChanged(this.checkChanges))
      .subscribe((formValue) => {
        this.source.title = formValue.title;
        this.source.description = formValue.description;
        this.source.topics = formValue.topics;
        this.source.dateDue = formValue.dateDue;
        this.update.emit(this.source);
      });
  }

  checkChanges(prev: any, next: any) {
    return JSON.stringify(prev) === JSON.stringify(next);
  }

  ngOnInit() {
    this.form.patchValue(this.source);

    if (!this.source.meta) {
      this.source.meta = [];
    }

    if (this.source.reference.source.website?.metadata?.meta) {
      for (const m of this.source.reference.source.website.metadata.meta) {
        // Add to source.meta if it doesn't exist
        if (!this.source.meta.find((meta) => meta.key === m.key)) {
          if (m.key && m.value) {
            this.source.meta.push({ key: m.key, value: m.value });
          }
        }
      }
      delete this.source.reference.source.website.metadata.meta;
    }

    this.source.meta = [
      { key: 'knowledge:id', value: this.source.id.value },
      {
        key: 'knowledge:method',
        value: this.source.importMethod ?? 'manual',
      },
      {
        key: 'knowledge:link',
        value: this.source.accessLink.toString(),
      },
      {
        key: 'knowledge:type',
        value: this.source.ingestType,
      },
      ...this.source.meta,
    ];

    // Remove any duplicates
    this.source.meta = this.source.meta.filter(
      (meta, index, self) =>
        index ===
        self.findIndex((m) => m.key === meta.key && m.value === meta.value)
    );

    this.update.emit(this.source);

    for (let i = 0; i < this.source.meta.length; i++) {
      this.source.meta[i].id = i;
    }
  }

  flag() {
    this.source.flagged = !this.source.flagged;
    this.update.emit(this.source);
  }

  open() {
    this.command.open(this.source);
  }

  preview() {
    this.command.preview(this.source);
  }

  removeSource() {
    this.command.remove([this.source]);
    this.remove.emit(this.source);
  }

  topicSearch(topic: any) {
    this.search.executeSearch(topic.value);
  }

  show(accessLink: URL | string) {
    if (typeof accessLink === 'string') {
      this.ipc.showItemInFolder(accessLink);
      this.notify.debug('Source Info', 'Locating Folder', location, 'toast');
    } else {
      this.command.open(this.source);
    }
  }

  toClipboard(key: string) {
    if (key && key.trim().length > 0) {
      this.clipboard.copy(key);
      this.notify.success('Source Info', 'Copied to Clipboard', '');
    }
  }

  onRowEditSave(meta: { key: string; value: string }, ri: number) {
    if (!meta.key) {
      return;
    }
    const original = this.source.meta.find((m) => m.key === meta.key);
    const updated = this.metaUpdates[ri];
    // If they are the same, do nothing
    if (original && updated) {
      if (original.value === updated.value && original.key === updated.key) {
        return;
      } else {
        this.update.emit(this.source);
      }
    }
  }

  onRowEditCancel(meta: { key: string; value: string }, ri: number) {
    if (meta.key) {
      this.source.meta[ri] = this.metaUpdates[ri];
      delete this.metaUpdates[ri];
    }
  }

  onRowEditInit(meta: { key: string; value: string }, ri: number) {
    this.metaUpdates[ri] = { ...meta };
  }

  addMeta(metaEntry: { key: string; value: string }) {
    const entry = { ...metaEntry };

    if (entry.key && entry.value) {
      // If the key/value pair already exists, don't add it
      if (
        this.source.meta.find(
          (m) => m.key === entry.key && m.value === entry.value
        )
      ) {
        this.notify.warn(
          'Source Info',
          'Ignoring Duplicate',
          'That key/value pair already exists...',
          'toast'
        );
        return;
      }

      this.source.meta = [
        { key: entry.key, value: entry.value },
        ...this.source.meta,
      ];
      this.metaEntry = { key: '', value: '' };
      this.update.emit(this.source);
      this.tagInput.nativeElement.focus();
    } else {
      this.notify.error('Source Info', 'Missing Key or Value', '');
    }
  }

  onRowDelete(meta: { key: string; value: string }, ri: number) {
    this.source.meta = this.source.meta.filter(
      (m) => m.key !== meta.key && m.value !== meta.value
    );
    delete this.metaUpdates[ri];
    this.update.emit(this.source);
  }
}
