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
import { Component, SecurityContext } from '@angular/core';
import { ProjectCreationDialogComponent } from '../project-components/project-creation-dialog.component';
import { DialogService } from 'primeng/dynamicdialog';
import {
  KnowledgeSourceFactoryRequest,
  KsFactoryService,
} from '@services/factory-services/ks-factory.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { IngestService } from '@services/ingest-services/ingest.service';
import { OverlayPanel } from 'primeng/overlaypanel';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ExtractorService } from '@services/ingest-services/extractor.service';
import { UuidService } from '@services/ipc-services/uuid.service';
import { DragAndDropService } from '@services/ingest-services/drag-and-drop.service';
import { FaviconService } from '@services/ingest-services/favicon.service';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer } from '@angular/platform-browser';
import { ConfirmationService } from 'primeng/api';

@Component({
  selector: 'app-create',
  template: `
    <div
      class="flex-row-center-center non-header"
      (dragstart)="$event.preventDefault()"
    >
      <button
        proTip
        tipHeader="Kickstart your Knowledge journey by creating a Project!"
        tipMessage="Think of creating a Project like setting up a new folder on your computer. You can add subprojects and Sources, just like adding files to a folder. But Projects are not just for organizing, they also help you map out your thoughts, making complex ideas easier to grasp. Ready to dive in? Click here to create a new Project!"
        [tipGroups]="['project', 'intro']"
        tipIcon="pi pi-folder"
        [tipShowOnHover]="true"
        pButton
        icon="pi pi-folder"
        class="create-project p-button-text outline-none shadow-none non-header"
        (click)="onNewProject()"
      >
        +
      </button>
      <button
        pButton
        proTip
        tipHeader="Voila! Transform local files into Sources"
        tipMessage="Your local files (PDFs, Word docs, PowerPoints, etc.) are waiting to jump into Knowledge. Import them using this button (or by dragging them into this window) and they'll be ready to spring open in their default apps with a single click. Go ahead, add some local spice!"
        [tipGroups]="['source', 'intro']"
        tipIcon="pi pi-file"
        [tipShowOnHover]="true"
        icon="pi pi-file"
        class="create-file p-button-text outline-none shadow-none non-header"
        (click)="newFile.click()"
      >
        +
      </button>
      <input
        [(ngModel)]="files"
        #newFile
        hidden
        type="file"
        [multiple]="true"
        (change)="onNewFile($event)"
      />
      <button
        pButton
        proTip
        tipHeader="Web Surfer? Turn URLs into Sources"
        tipMessage="Got a cool web link? Turn it into a Source! Not only will Knowledge store the link for you to access anytime, but it'll also extract relevant and useful metadata."
        [tipGroups]="['source', 'intro']"
        tipIcon="pi pi-link"
        [tipShowOnHover]="true"
        icon="pi pi-link"
        class="p-button-text outline-none shadow-none non-header"
        (click)="showImportDialog = true"
      >
        +
      </button>
    </div>

    <p-overlayPanel
      #createPanel
      appendTo="body"
      [focusOnShow]="true"
      (onShow)="onLinkShow()"
      styleClass="surface-100 shadow-7"
    >
      <ng-template pTemplate="content">
        <form [formGroup]="linkForm">
          <div class="p-inputgroup">
            <input
              pInputText
              #linkInput
              id="linkInput"
              formControlName="url"
              required
              [autofocus]="true"
              class="border-0"
              type="url"
              (keyup.enter)="onLinkSubmit(linkInput.value, createPanel)"
              style="min-width: 300px;"
              placeholder="Enter a URL and press enter/return"
            />
            <span
              class="p-inputgroup-addon"
              [class.p-disabled]="linkForm.controls.url.errors"
              [class.cursor-pointer]="linkInput.value.length"
              (click)="onLinkSubmit(linkInput.value, createPanel)"
            >
              <i class="pi pi-arrow-circle-right"></i>
            </span>
          </div>
          <div *ngIf="linkForm.controls.url.errors?.pattern" class="p-error">
            Enter a valid URL (e.g. https://example.com)
          </div>
        </form>
      </ng-template>
    </p-overlayPanel>

    <p-dialog #importDialog header="Web Import" [(visible)]="showImportDialog">
      <app-import-web (close)="showImportDialog = false"></app-import-web>
    </p-dialog>
  `,
  styles: [],
})
export class CreateComponent {
  ksList: KnowledgeSource[] = [];

  linkForm: FormGroup;

  files: any[] = [];

  showImportDialog = false;

  constructor(
    private dialog: DialogService,
    private confirm: ConfirmationService,
    private factory: KsFactoryService,
    private ingest: IngestService,
    private notifications: NotificationsService,
    private extractor: ExtractorService,
    private uuid: UuidService,
    private dnd: DragAndDropService,
    private favicon: FaviconService,
    private formBuilder: FormBuilder,
    private sanitizer: DomSanitizer,
    private httpClient: HttpClient
  ) {
    this.linkForm = formBuilder.group({
      url: ['', [Validators.required, Validators.pattern('https?://.+[.]+.+')]],
    });
  }

  linkExists(value: string) {
    return this.ksList.find((ks) => {
      if (typeof ks.accessLink === 'string') {
        return ks.accessLink.includes(value);
      } else {
        return ks.accessLink.href.includes(value);
      }
    });
  }

  async extract(value: string) {
    // Check for duplicates
    if (this.linkExists(value)) {
      this.notifications.debug('KsIngest', 'Link Already Pending', value);
      return;
    }

    const sanitized = this.sanitizer.sanitize(SecurityContext.URL, value);
    let url: URL;
    try {
      url = new URL(sanitized ? sanitized : value);
    } catch (e: any) {
      this.notifications.error('Source Import', 'Invalid URL', e);
      return;
    }

    this.httpClient.get(url.href, { responseType: 'text' }).subscribe(
      () => {
        const req: KnowledgeSourceFactoryRequest = {
          ingestType: 'website',
          links: [url],
        };

        this.factory
          .many(req)
          .then((ksList) => {
            if (!ksList || !ksList.length) {
              this.notifications.error(
                'Source Import',
                `Unable to import URL`,
                value
              );
              return;
            }

            this.ingest.enqueue(ksList);
          })
          .catch(() => {
            this.notifications.error(
              'Source Import',
              `Unable to import URL`,
              `Source Factory: ${value}`
            );
          });
      },
      () => {
        this.notifications.error(
          'Source Import',
          `Invalid URL`,
          `HTTP Client: ${value}`
        );

        // If the link cannot be reached, ask the user if they still want to import it anyway
        this.confirm.confirm({
          header: 'Link Unreachable',
          message: `
        <div>
            <div style="max-width: 12rem;">
                ${url.href} is unreachable.
            </div>
            <br>
            <div style="max-width: 12rem;">
                Sometimes this happens when the website is behind a paywall, requires authentication, or expects certain cookies.
            </div>
            <br>
            <div>
                  You can still add it to Knowledge and we will attempt to extract information from it later on.
            </div>
            <br>
            <div>
                  Do you want to import it anyway?
            </div>
        </div>
        `,
          icon: 'pi pi-warn',
          acceptLabel: 'Import',
          rejectLabel: 'Cancel',
          accept: () => {
            const req: KnowledgeSourceFactoryRequest = {
              ingestType: 'website',
              links: [url],
            };

            this.factory
              .many(req)
              .then((ksList) => {
                if (!ksList || !ksList.length) {
                  this.notifications.error(
                    'Source Import',
                    `Unable to import URL`,
                    value
                  );
                  return;
                }

                this.ingest.enqueue(ksList);
              })
              .catch(() => {
                this.notifications.error(
                  'Source Import',
                  `Unable to import URL`,
                  `Source Factory: ${value}`
                );
              });
          },
        });
        return;
      }
    );
    // TODO: make it so these things can be enqueued in Inbox even while they are still loading
  }

  onNewProject() {
    this.dialog.open(ProjectCreationDialogComponent, {
      header: 'Create Project',
      showHeader: true,
      width: `min(90vw, 52rem)`,
      data: { parentId: undefined },
      contentStyle: {
        'border-bottom-left-radius': '6px',
        'border-bottom-right-radius': '6px',
      },
    });
  }

  onNewFile($event: any) {
    const files: any[] = $event.target.files;
    if (!files) {
      return;
    }

    const req: KnowledgeSourceFactoryRequest = {
      ingestType: 'file',
      files: files,
    };

    this.factory
      .many(req)
      .then((ksList) => {
        if (!ksList || !ksList.length) {
          this.notifications.error(
            'Source Import',
            `Unable to import file${files.length > 1 ? 's' : ''}`,
            ''
          );
          return;
        }

        this.ingest.enqueue(ksList);
      })
      .catch((reason) => {
        this.notifications.error(
          'Source Import',
          `Unable to import file${files.length > 1 ? 's' : ''}`,
          reason
        );
      })
      .finally(() => {
        this.files = [];
      });
  }

  async onLinkSubmit(value: string, overlayPanel: OverlayPanel) {
    if (
      !this.linkForm.controls.url ||
      this.linkForm.controls.url.errors ||
      value.length < 4
    ) {
      this.notifications.error('Source Import', 'Invalid URL', value);
      return;
    }

    overlayPanel.hide();
    await this.extract(value);
  }

  onLinkShow() {
    this.linkForm.reset();
  }
}
