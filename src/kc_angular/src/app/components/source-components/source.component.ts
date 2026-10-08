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
  ComponentRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  Type,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { SourceChatComponent } from '@components/source-components/source.chat.component';
import { SourceDetailsComponent } from '@components/source-components/source.details.component';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { PrimeIcons } from 'primeng/api';
import { SourceDocumentComponent } from '@components/source-components/source.document.component';
import { SourceVideoComponent } from '@components/source-components/source.video.component';
import { SourceTimelineComponent } from './source.timeline.component';
import { ChatService } from '@services/chat-services/chat.service';
import { SourceBrowserComponent } from '@components/source-components/source.browser.component';

interface TabDescriptor {
  label: string;
  icon: string;
  hidden: boolean;
  disabled: boolean;
  loading: boolean;
  component: Type<any>;
  tipHeader: string;
  tipMessage: string;
}

@Component({
  selector: 'app-source',
  template: `
    <div class="tabs">
      <div
        proTip
        *ngFor="let tab of tabs; index as i"
        [tipHeader]="tab.tipHeader"
        [tipMessage]="tab.tipMessage"
        [tipGroups]="['source', 'intro']"
        [tipHidden]="tab.hidden"
        [tipIcon]="tab.icon"
        [tipShowOnHover]="true"
        class="tab text-center flex-row-center-center border-round-top-2xl font-bold"
        [ngClass]="{
          active: selectedTabIndex === i,
          disabled: tab.disabled,
          hidden: tab.hidden,
          loading: tab.loading
        }"
        (click)="setSelectedTab(i)"
      >
        <i *ngIf="!tab.loading; else loading" class="{{ tab.icon }} pr-2"></i>
        <ng-template #loading>
          <i class="pi pi-spin pi-spinner font-bold mr-2 text-red-600"></i>
        </ng-template>
        <span *ngIf="!tab.hidden">{{ tab.label }}</span>
      </div>
    </div>

    <ng-container #tabContainer></ng-container>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
      }

      .tabs {
        display: flex;
        width: 100%;
      }

      .tab {
        flex: 1;
        padding: 1rem !important;
        cursor: pointer;
        background-color: var(--surface-ground);
      }

      .tab:not(.active) {
        background-color: var(--primary-color-text);
      }

      .tab.active {
        color: var(--primary-color);
        border-bottom: 1px solid var(--primary-color);
        background-color: var(--surface-card) !important;
      }

      .tab.loading {
        cursor: wait;
      }

      .tab.disabled {
        cursor: not-allowed;
        opacity: 0.5;

        @media (max-width: 1000px) {
          display: none;
        }
      }
    `,
  ],
})
export class SourceComponent implements OnInit, OnChanges {
  @ViewChild('tabContainer', { read: ViewContainerRef, static: true })
  tabContainer!: ViewContainerRef;

  detailsTab: TabDescriptor = {
    label: 'Source',
    icon: PrimeIcons.INFO_CIRCLE,
    hidden: false,
    disabled: false,
    loading: false,
    component: SourceDetailsComponent,
    tipHeader: 'Source Details',
    tipMessage: `This tab shows you all the details about the Source. It's like the Source's personal ID card, with all the important information you need to know.`,
  };

  chatTab: TabDescriptor = {
    label: 'Chat',
    icon: PrimeIcons.COMMENTS,
    hidden: false,
    disabled: false,
    loading: false,
    component: SourceChatComponent,
    tipHeader: 'Ready for a Chat with Your Source?',
    tipMessage: `Get chatty with the chat tab! Throw in any questions about the Source, and watch as the Source agent turns the extracted Source text into answers. It's like your personal knowledge buddy!`,
  };

  timelineTab: TabDescriptor = {
    label: 'Timeline',
    icon: PrimeIcons.CALENDAR,
    hidden: true,
    disabled: true,
    loading: false,
    component: SourceTimelineComponent,
    tipHeader: 'Step into the Source Time Machine!',
    tipMessage: `The timeline tab is your gateway to the history of the Source. Generated from the source metadata and events, it's like your own personal 'Back to the Future' ride. Buckle up!`,
  };

  browserTab: TabDescriptor = {
    label: 'Browser',
    icon: PrimeIcons.GLOBE,
    hidden: false,
    disabled: false,
    loading: false,
    component: SourceBrowserComponent,
    tipHeader: 'Web Browsing, Right Here, Right Now!',
    tipMessage: `Say hello to the browser tab! With our built-in Chromium browser (yes, the same one used by Google Chrome and Microsoft Edge), you can view your Sources without leaving the comfort of the app. Make sure you try highlighting text and right-clicking for more options!`,
  };

  documentTab: TabDescriptor = {
    label: 'Document',
    icon: PrimeIcons.FILE,
    hidden: false,
    disabled: true,
    loading: false,
    component: SourceDocumentComponent,
    tipHeader: 'Ready for a Doc Dive?',
    tipMessage: `Check out the document tab! It's your window to the Source document, straight from the specified local file path. Let's explore the document universe!`,
  };

  videoTab: TabDescriptor = {
    label: 'Video',
    icon: PrimeIcons.YOUTUBE,
    hidden: false,
    disabled: true,
    loading: false,
    component: SourceVideoComponent,
    tipHeader: `Grab your popcorn, it's showtime!`,
    tipMessage: `Meet the video tab! Your personal movie theater, playing Source videos straight from YouTube using the video ID in the Source link. Sit back, relax, and enjoy the show!`,
  };

  tabs: TabDescriptor[] = [
    this.detailsTab,
    this.chatTab,
    this.timelineTab,
    this.browserTab,
    this.documentTab,
    this.videoTab,
  ];

  selectedTabIndex = 0;

  @Input() source!: KnowledgeSource & { view?: string };

  @Input() dialog = false;

  @Input() reset = false;

  @Output() remove = new EventEmitter<KnowledgeSource>();

  @Output() update = new EventEmitter<KnowledgeSource>();

  private componentRef?: ComponentRef<any>;

  constructor(private chat: ChatService) {
    this.chat.loading$.subscribe((loading: boolean) => {
      this.chatTab.loading = loading;
    });
  }

  ngOnInit() {
    this.loadSelectedTab();

    if (this.source.view === 'chat') {
      this.setSelectedTab(1);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.source) {
      this.views(changes.source.currentValue);
      this.loadSelectedTab();
      this.chat.setTarget({ source: this.source });
    }

    if (changes.reset && changes.reset.currentValue) {
      if (this.selectedTabIndex !== 0) {
        this.setSelectedTab(0);
      }
    }
  }

  views(source: KnowledgeSource) {
    // If video, enable video tab and disable document tab
    if (source.ingestType === 'website') {
      source.accessLink = new URL(source.accessLink);
      this.documentTab.disabled = this.documentTab.hidden = true;

      if (
        source.accessLink.hostname === 'www.youtube.com' &&
        source.accessLink.searchParams.get('v')
      ) {
        this.browserTab.disabled = this.browserTab.hidden = false;
        this.videoTab.disabled = this.videoTab.hidden = false;
        return;
      } else {
        this.browserTab.disabled = this.browserTab.hidden = false;
        this.videoTab.disabled = this.videoTab.hidden = true;
        return;
      }
    } else if (source.ingestType === 'file') {
      this.browserTab.disabled = this.browserTab.hidden = true;
      this.videoTab.disabled = this.videoTab.hidden = true;
      this.documentTab.disabled = this.documentTab.hidden = true;

      // If document, enable document table and disable video tab
      if (
        `${source.accessLink}`.endsWith('pdf') ||
        `${source.accessLink}`.endsWith('gif') ||
        `${source.accessLink}`.endsWith('jpg')
      ) {
        this.documentTab.disabled = this.documentTab.hidden = false;
        return;
      }
    }
  }

  setSelectedTab(index: number) {
    // If the Chat tab is selected, make sure the API key has been setup. If not, prompt the user for API key.
    const handle = () => {
      if (!this.tabs[index].disabled) {
        this.selectedTabIndex = index;
        this.loadSelectedTab();
      }
    };

    if (this.tabs[index].label === 'Chat' && !this.chat.canChat()) {
      this.chat.getApiKeyDialog().subscribe((result: boolean) => {
        if (result) {
          handle();
        }
      });
    } else {
      handle();
    }
  }

  loadSelectedTab() {
    // Unload the existing view
    this.tabContainer.clear();

    // If the user is in a tab that has become disabled, switch to the first enabled tab
    if (this.tabs[this.selectedTabIndex].disabled) {
      this.selectedTabIndex = 0;
    }

    this.loadComponent(this.tabs[this.selectedTabIndex].component);
  }

  private loadComponent(component: Type<any>) {
    this.componentRef = this.tabContainer.createComponent(component);

    this.componentRef.instance.source = this.source;

    // Special handling for components with outputs and other special cases
    switch (component) {
      case SourceChatComponent:
        break;
      case SourceDetailsComponent:
        this.loadDetails(this.componentRef);
        break;
      case SourceBrowserComponent:
        this.loadBrowser(this.componentRef);
        break;
    }
  }

  private loadDetails(componentRef: ComponentRef<SourceDetailsComponent>) {
    componentRef.instance.remove.subscribe(() => {
      this.remove.emit(this.source);
    });
    componentRef.instance.update.subscribe((source: KnowledgeSource) => {
      this.source = source;
      this.update.emit(source);
    });
  }

  private loadBrowser(componentRef: ComponentRef<SourceBrowserComponent>) {
    componentRef.instance.update.subscribe((source: KnowledgeSource) => {
      this.source = source;
      this.update.emit(source);
    });

    componentRef.instance.chat.subscribe(
      (input: { method: string; message: string }) => {
        const chatTabIndex = this.tabs.findIndex(
          (tab: TabDescriptor) => tab.label === 'Chat'
        );
        this.setSelectedTab(chatTabIndex);

        setTimeout(() => {
          if (input.method === 'ask') {
            this.componentRef?.instance.showQuestionDialog(
              input.message.substring(0, 8192)
            );
          } else {
            this.chat.submit(input.message);
          }
        }, 1000);
      }
    );
  }
}
