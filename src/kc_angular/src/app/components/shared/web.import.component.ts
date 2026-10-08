/*
 * Copyright (c) 2024 Rob Royce
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
  HostListener,
  Output,
  ViewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  KnowledgeSourceFactoryRequest,
  KsFactoryService,
} from '@services/factory-services/ks-factory.service';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { IngestService } from '@services/ingest-services/ingest.service';
import { ProjectService } from '@services/factory-services/project.service';
import { tap } from 'rxjs';
import { ProjectUpdateRequest } from '@app/models/project.model';

@Component({
  selector: 'app-import-web',
  template: `
    <form [formGroup]="linkForm">
      <input
        pInputText
        #linkInput
        id="linkInput"
        formControlName="url"
        required
        [autofocus]="true"
        class="border-0 mt-1 pb-3 mb-2"
        type="url"
        (keyup.enter)="onSubmit(linkInput.value)"
        style="min-width: 35vw;"
        placeholder="Enter a URL or a list of URLs and press enter/return..."
      />
    </form>

    <div class="">
      <div style="height: 26rem; max-height: 26rem; overflow: overlay">
        <p-table
          *ngIf="sources.length > 0; else noSources"
          [value]="sources"
          [tableStyle]="{ 'min-width': '50rem' }"
        >
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 32px"></th>
              <th>Title</th>
              <th style="width: 32px"></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-source>
            <tr>
              <td>
                <app-ks-icon [ks]="source"></app-ks-icon>
              </td>
              <td>
                <!--                Input for users to edit the source title-->
                <input
                  pInputText
                  [(ngModel)]="source.title"
                  class="border-0"
                  type="text"
                  style="min-width: 20rem;"
                  placeholder="source.title"
                />
              </td>
              <td>
                <app-action-bar
                  [ks]="source"
                  [showChat]="false"
                  [showPreview]="true"
                  [showEdit]="false"
                  [showOpen]="true"
                  [showSavePdf]="false"
                  [showFlag]="true"
                  [showRemove]="true"
                  (flag)="addFlag(source)"
                  (remove)="removeSource(source)"
                  (open)="openSource(source)"
                  (preview)="previewSource(source)"
                >
                </app-action-bar>
              </td>
            </tr>
          </ng-template>
        </p-table>

        <ng-template #noSources>
          <div class="flex-col-center-center h-full">
            <div class="text-500">
              <b>No Sources</b>
            </div>
          </div>
        </ng-template>
      </div>

      <div class="flex-row-center-between mt-6">
        <p-selectButton
          #destinationSelect
          [options]="destinations"
          [(ngModel)]="destination"
          optionLabel="name"
          class="w-9"
        ></p-selectButton>
        <button
          pButton
          label="Import"
          class="p-button p-button-sm w-8rem"
          [disabled]="sources.length === 0"
          (click)="import(destination.name)"
        ></button>
      </div>
    </div>
  `,
})
export class WebImportComponent {
  @Output() close = new EventEmitter();

  @ViewChild('linkInput', { static: false }) linkInput: any;

  linkForm: FormGroup;

  sources: KnowledgeSource[] = [];

  destinations: { name: string; code: string }[] = [
    { name: 'Inbox', code: '1' },
    { name: 'Project', code: '2' },
  ];

  destination: { name: string; code: string } = this.destinations[0];

  constructor(
    private formBuilder: FormBuilder,
    private factory: KsFactoryService,
    private command: KsCommandService,
    private ingest: IngestService,
    private projects: ProjectService
  ) {
    this.linkForm = formBuilder.group({
      url: ['', [Validators.required, Validators.pattern('https?://.+[.]+.+')]],
    });

    projects.currentProject
      .pipe(
        tap((project) => {
          if (project) {
            this.destinations = [
              { name: 'Inbox', code: '1' },
              { name: `Project (${project.name})`, code: '2' },
            ];
          }
        })
      )
      .subscribe();
  }

  // HostListener for pasting text
  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text');

    // Get all URLs in text
    const regex = /https?:\/\/[^\s]+/g;
    const matches = text?.match(regex);

    // Add URLs to array
    if (matches) {
      const urls: string[] = [];
      matches.forEach((match) => {
        // Remove commas from end of URLs
        if (match.endsWith(',')) {
          match = match.slice(0, -1);
        }
        urls.push(match);
      });
      this.createSource(urls);
    }

    // Clear form by resetting URL field, making sure the value is updated
    setTimeout(() => {
      this.linkForm.setValue({
        url: '',
      });
      this.linkForm.reset();
    });
  }

  onSubmit(value: string) {}

  createSource(urls: string[]) {
    const requests: KnowledgeSourceFactoryRequest = {
      ingestType: 'website',
      links: urls,
    };

    this.factory.many(requests).then((sources) => {
      for (const source of sources) {
        this.sources.push(source);
      }
    });
  }

  addFlag(source: KnowledgeSource) {
    source.flagged = !source.flagged;
  }

  removeSource(source: KnowledgeSource) {
    this.sources = this.sources.filter((s) => s !== source);
  }

  openSource(source: KnowledgeSource) {
    this.command.open(source);
  }

  previewSource(source: KnowledgeSource) {
    this.command.preview(source);
  }

  import(destination: string) {
    console.log('Importing to ' + destination);

    if (destination === 'Inbox') {
      this.ingest.enqueue(this.sources);
    } else {
      const project = this.projects.getCurrentProjectId();
      if (project) {
        const req: ProjectUpdateRequest = {
          id: project,
          addKnowledgeSource: this.sources,
        };
        this.projects.updateProjects([req]);
      }
    }

    this.linkForm.reset();
    this.sources = [];
    this.close.emit();
  }
}
