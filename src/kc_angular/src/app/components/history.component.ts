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
import { Component, HostListener, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ProjectService } from '@services/factory-services/project.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { OverlayPanel } from 'primeng/overlaypanel';
import { ScrollPanel } from 'primeng/scrollpanel';

const SIZE_OF_UUID = 36;

type HistoryEntry = {
  viewLabel: string;
  projectId: string;
  index: number;
  timestamp: string;
};

type HistoryEvent = {
  url: string;
  timestamp: string;
};

@Component({
  selector: 'app-history',
  template: `
    <div
      class="flex-row-center-center non-header"
      (dragstart)="$event.preventDefault()"
    >
      <button
        pButton
        proTip
        tipHeader="Oops, wrong turn?"
        tipMessage="No worries! The 'Back' button is your personal time machine. One click and you're zapped back to your previous view. Easy peasy!"
        [tipGroups]="['navigation']"
        tipIcon="pi pi-arrow-left"
        [tipHidden]="backDisabled"
        [tipShowOnHover]="true"
        [disabled]="backDisabled"
        icon="pi pi-arrow-left"
        class="p-button-text outline-none shadow-none non-header"
        (click)="onBack()"
      ></button>
      <button
        pButton
        proTip
        tipHeader="Ready to leap forward?"
        tipMessage="The 'Forward' button is your springboard to the future. Click to jump right back to where you left off. Onward and upward!"
        [tipGroups]="['navigation']"
        tipIcon="pi pi-arrow-right"
        [tipHidden]="forwardDisabled"
        [tipShowOnHover]="true"
        [disabled]="forwardDisabled"
        icon="pi pi-arrow-right"
        class="p-button-text outline-none shadow-none non-header"
        (click)="onForward()"
      ></button>
      <button
        id="historyButton"
        pButton
        proTip
        tipHeader="Care to take a stroll down memory lane? (⌘/Ctrl + G)"
        tipMessage="Hit the history button and unveil a timeline of your active projects and past views. Want to revisit a view? Just click, and you're back in time!"
        [tipGroups]="['navigation']"
        tipIcon="pi pi-clock"
        [tipHidden]="historyDisabled"
        [tipShowOnHover]="true"
        [disabled]="historyDisabled"
        icon="pi pi-clock"
        class="p-button-text outline-none shadow-none non-header"
        (click)="historyPanel.show($event)"
      ></button>
    </div>

    <p-overlayPanel
      #historyPanel
      appendTo="body"
      [focusOnShow]="true"
      styleClass="history-panel shadow-6 surface-ground"
    >
      <ng-template pTemplate="content">
        <div class="mb-3 static sticky">
          <div class="text-2xl font-bold">History</div>
        </div>
        <p-scrollPanel
          #historyScroll
          [style]="{ 'max-height': '50vh' }"
          styleClass="pb-0"
        >
          <p-timeline [value]="history">
            <ng-template pTemplate="marker" let-entry>
              <div
                class="py-2 px-3 no-select text-lg flex-row-center-start"
                [class.text-primary]="entry === active"
                [class.font-bold]="entry === active"
                style="width: 8rem"
              >
                <div class="{{ entry.viewLabel | viewIcon }}"></div>
                <div class="pl-3">{{ entry.viewLabel | titlecase }}</div>
              </div>
            </ng-template>

            <ng-template pTemplate="content" let-entry>
              <div
                class="white-space-nowrap px-4 py-2 hover:surface-300 hover:text-primary no-select border-round cursor-pointer flex-row-center-between overflow-x-auto"
                (click)="onHistoryEntryClick(entry)"
                [class.text-primary]="entry === active"
                [class.font-bold]="entry === active"
              >
                <div class="mx-3 text-lg">
                  {{ entry.projectId | projectBreadcrumb | truncate : [72] }}
                </div>
                <div class="text-500" [class.text-primary]="entry === active">
                  {{ entry.timestamp | date : 'short' }}
                </div>
              </div>
            </ng-template>
          </p-timeline>
        </p-scrollPanel>
      </ng-template>
    </p-overlayPanel>
  `,
  styles: [
    `
      .non-header {
        -webkit-user-select: none;
        -webkit-app-region: unset !important;
      }

      ::ng-deep {
        .p-timeline-event-opposite {
          flex: 0 !important;
          padding: 0 !important;
          width: 0 !important;
        }

        .p-timeline-event {
          min-height: 36px !important;
        }

        .history-panel {
          width: min(90vw, 72rem) !important;
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          margin: 0 auto;
        }
      }
    `,
  ],
})
export class HistoryComponent {
  @ViewChild('historyPanel') historyPanel!: OverlayPanel;
  @ViewChild('historyScroll') historyScroll!: ScrollPanel;
  backDisabled = true;
  forwardDisabled = true;
  historyDisabled = true;
  history: HistoryEntry[] = [];
  active?: HistoryEntry;
  private __history: HistoryEvent[] = [];
  private __target = -1;

  constructor(
    private activated: ActivatedRoute,
    private notifications: NotificationsService,
    private projects: ProjectService,
    private router: Router
  ) {
    router.events.subscribe((event) => {
      if (event && event instanceof NavigationEnd) {
        // Ignore URLs that occur when navigating the settings menu
        if (event.url.includes('settings:')) {
          return;
        }

        // Ignore navigating to the same URL
        if (
          this.__history.length > 0 &&
          this.__target >= 0 &&
          event.url === this.__history[this.__target].url
        ) {
          return;
        }

        const segments = event.url.split('/').filter((s) => s.length);
        if (segments.length <= 2) {
          this.router.navigate([
            'app',
            'inbox',
            this.projects.getCurrentProjectId()?.value,
          ]);
          return;
        }

        // We are somewhere in the middle of the nav stack, new nav should take elements 0 through target and remove the rest
        if (this.__target < this.__history.length - 1) {
          this.__history = this.__history.slice(0, this.__target + 1);
        }

        this.__history.push({
          url: event.url,
          timestamp: new Date().toLocaleString(),
        });
        this.__target = this.__history.length - 1;
        this.update();
        this.setProject();
      }
    });

    projects.currentProject.subscribe((project) => {
      if (!project || !this.__history || this.__history.length === 0) {
        return;
      }
      /* Project changed but base URL stays the same. Emplace new project ID into active URL and navigate accordingly */
      const current = this.__history[this.__target].url
        .split('/')
        .filter((s) => s.length);
      if (current.length === 3) {
        current[2] = project.id.value;
        this.router.navigate(current);
      }
    });
  }

  @HostListener('document:keydown.Control.g', ['$event'])
  @HostListener('document:keydown.meta.g', ['$event'])
  showHistory() {
    const historyButton = document.getElementById('historyButton');
    if (!historyButton) {
      return;
    }

    historyButton.click();
    if (this.historyPanel) {
      this.historyPanel.focus();
    }
  }

  onBack() {
    if (this.__target > 0) {
      const prev = this.__history[this.__target - 1];

      if (prev && prev.url.length > 0) {
        this.__target -= 1;
        this.router.navigateByUrl(prev.url);
      }
    }
    this.update();
    this.setProject();
  }

  onForward() {
    if (this.__target < this.__history.length - 1) {
      const next = this.__history[this.__target + 1];
      if (next && next.url.length > 0) {
        this.__target += 1;
        this.router.navigateByUrl(next.url);
      }
    }
    this.update();
    this.setProject();
  }

  onHistoryEntryClick(entry: HistoryEntry) {
    if (this.historyPanel) {
      this.historyPanel.hide();
    }

    if (
      entry.index < 0 ||
      entry.index > this.__history.length - 1 ||
      this.__target === entry.index
    ) {
      return;
    }

    this.__target = entry.index;

    const next = this.__history[this.__target];
    if (next && next.url.length > 0) {
      this.router.navigateByUrl(next.url);
    }
    this.update();
    this.setProject();
  }

  private update() {
    this.updateButtons();
    this.updateHistoryEntries();
  }

  private updateHistoryEntries() {
    this.history = [];
    const history: HistoryEntry[] = [];
    for (let i = this.__history.length - 1; i >= 0; i--) {
      const url = this.__history[i].url;
      const segments = this.segmentsFromUrl(url);
      if (!segments) {
        this.notifications.warn(
          'History',
          'Invalid URL Segments',
          `Unable to decode ${url}`
        );
        continue;
      }
      history.push({
        viewLabel: segments[1],
        projectId: segments[2],
        index: i,
        timestamp: this.__history[i].timestamp,
      });
    }
    this.history = history;
    this.active = this.history[this.history.length - this.__target - 1];
  }

  private updateButtons() {
    this.backDisabled = this.__target <= 0;
    this.forwardDisabled = this.__target >= this.__history.length - 1;
    this.historyDisabled = this.__history.length === 0;
  }

  private segmentsFromUrl(url: string) {
    return url.split('/').filter((s) => s.length);
  }

  private projectIdFromUrl(url: string) {
    const segments = this.segmentsFromUrl(url);
    const project = segments[2];

    if (project && project.length === 36) {
      return project;
    } else {
      return undefined;
    }
  }

  private setProject() {
    if (this.__target < 0 || this.__target > this.__history.length - 1) {
      return;
    }
    /** Get the project ID from active URL and set it in project service.
     * Project service ignores the update if the current project already matches the new ID */
    const project = this.projectIdFromUrl(this.__history[this.__target].url);
    if (
      project &&
      project !== this.projects.getCurrentProjectId()?.value &&
      project.length === SIZE_OF_UUID
    ) {
      this.projects.setCurrentProject(project);
    }
  }
}
