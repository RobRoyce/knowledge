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

import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { TreeNode } from 'primeng/api';
import { Subscription } from 'rxjs';
import { UUID } from '@shared/models/uuid.model';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { DragAndDropService } from '@services/ingest-services/drag-and-drop.service';

@Component({
  selector: 'app-ks-card',
  template: `
    <div
      [pDraggable]="allowDrag ? 'sources' : ''"
      (onDragStart)="dragStart($event, ks)"
      (onDragEnd)="dragEnd($event, ks)"
      *ngIf="ks"
      (dblclick)="onEdit.emit(ks)"
      proTip
      tipHeader="Say Hello to Source Cards!"
      tipMessage="A perfect blend of style and substance, Source Cards are all about visual appeal! With thumbnails, icons, action buttons, and topics all in one place, you can see the type of Source and its Project at a glance. Your data never looked so good!"
      [tipGroups]="['source']"
      tipIcon="pi pi-id-card"
      class="hover:shadow-1 border-round-2xl border-1 surface-border border-400 h-full flex flex-column overflow-hidden justify-content-between surface-card"
      [class.source-drag-handle]="allowDrag"
    >
      <div class="flex flex-grow-1">
        <app-ks-thumbnail
          *ngIf="showThumbnail"
          [ks]="ks"
          class="w-full"
        ></app-ks-thumbnail>
      </div>
      <div class="flex flex-column justify-content-end p-3">
        <div class="flex-row-center-between pb-1">
          <span
            class="font-bold text-xl cursor-pointer"
            (click)="onEdit.emit(this.ks)"
            [pTooltip]="ks.title"
            tooltipPosition="top"
          >
            {{ ks.title | truncate : [truncate ? 28 : 64] }}
          </span>
          <i
            *ngIf="showContentType"
            class="pi pi-{{ ks.ingestType | ksIngestTypeIcon }}"
            [pTooltip]="ks.ingestType | titlecase"
          >
          </i>
        </div>

        <div *ngIf="showProjectBreadcrumbs" class="text-500 font-bold pb-1">
          {{ ks.associatedProject | projectName }}
        </div>

        <div *ngIf="showDescription" class="pb-1">
          <div
            *ngIf="description; else noDescription"
            class="text-500"
            style="height: 4rem"
          >
            {{ description | truncate : [truncate ? 64 : 128] }}
          </div>
          <ng-template #noDescription>
            <div class="text-500" style="height: 4rem">
              {{ descriptionPlaceholder }}
            </div>
          </ng-template>
        </div>

        <div
          class="col-12 pb-1"
          *ngIf="showProjectSelection && projectTreeNodes.length"
        >
          <p-treeSelect
            [(ngModel)]="selectedProject"
            [options]="projectTreeNodes"
            selectionMode="single"
            class="p-fluid w-full"
            (onNodeSelect)="onProjectSelected($event)"
            appendTo="body"
            placeholder="Choose a Project"
          >
          </p-treeSelect>
        </div>

        <div
          *ngIf="showTopics"
          class="overflow-y-auto overflow-x-hidden"
          [style]="{ height: '5rem' }"
        >
          <p-chips
            [allowDuplicate]="false"
            [addOnBlur]="true"
            [addOnTab]="true"
            (onChipClick)="onTopicClick.emit({ ks: ks, topic: $event.value })"
            (onAdd)="onTopicAdd()"
            (onRemove)="onTopicRemove()"
            [(ngModel)]="keywords"
            class="p-fluid w-full"
            placeholder="Start typing to add a topic..."
          >
          </p-chips>
        </div>

        <div
          *ngIf="
            showIcon ||
            showRemove ||
            showOpen ||
            showEdit ||
            showPreview ||
            showSavePdf ||
            showFlag
          "
          class="flex-row-center-between"
        >
          <div class="col text-left">
            <app-ks-icon [ks]="ks" *ngIf="showIcon"></app-ks-icon>
          </div>
          <div
            *ngIf="
              showRemove ||
              showOpen ||
              showEdit ||
              showPreview ||
              showSavePdf ||
              showFlag
            "
          >
            <app-action-bar
              [ks]="ks"
              [showEdit]="showEdit"
              [showPreview]="showPreview"
              [showOpen]="showOpen"
              [showRemove]="showRemove"
              [showFlag]="showFlag"
              [showChat]="showChat"
              [showSavePdf]="showSavePdf"
              (edit)="editSource()"
              (preview)="previewSource()"
              (open)="openSource()"
              (remove)="removeSource()"
              (chat)="chatSource()"
              (flag)="flagSource($event.checked)"
            >
            </app-action-bar>
          </div>
        </div>

        <div *ngIf="label" class="w-full text-center text-500 pt-2">
          {{ label }}
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      ::ng-deep {
        .p-chips-token {
          cursor: pointer;
        }
      }

      app-action-bar {
        opacity: 0.35;
      }

      :host:hover app-action-bar {
        opacity: 1;
      }
    `,
  ],
})
export class KsCardComponent implements OnDestroy, OnChanges {
  /* The Knowledge Source to be displayed on this card */
  @Input() ks!: KnowledgeSource;

  /* The project tree to display in the Project selector (if enabled) */
  @Input() projectTreeNodes: TreeNode[] = [];

  /**
   * The currently selected project, which determines the default
   * project shown in Project selector (if enabled)
   */
  @Input() selectedProject?: TreeNode;

  /* The ID of the current project */
  @Input() currentProject?: UUID | null;

  /* Determines whether to display KS thumbnail in header (default: true) */
  @Input() showThumbnail = true;

  /* Determines whether to display KS description (default: true) */
  @Input() showDescription = true;

  /* Determines whether to display Project selector (default: false) */
  @Input() showProjectSelection = false;

  /* Determines whether to display list of KS Tags as a Tooltip (default: true) */
  @Input() showTopics = true;

  /* Determines whether to display the "Remove" button (default: true) */
  @Input() showRemove = true;

  /* Determines whether to display the "Preview" button (default: true) */
  @Input() showPreview = true;

  /* Determines whether to display the "Save PDF" button (default: true) */
  @Input() showSavePdf = true;

  /* Determines whether to display the "Edit" button (default: true) */
  @Input() showEdit = true;

  /* Determines whether to display the "Open" button (default: true) */
  @Input() showOpen = true;

  /* Determines whether to display the "Important" button (default: true) */
  @Input() showFlag = true;

  /* Determines whether to display the "Chat" button (default: true) */
  @Input() showChat = false;

  /* Determines whether to show Content Type property (default: true) */
  @Input() showContentType = true;

  /* Determines whether to show KS icon (default: true) */
  @Input() showIcon = true;

  /* Determines whether to truncate certain fields to avoid spilling text, etc (default: true) */
  @Input() truncate = true;

  /* Determines whether to show name of the Associated Project (default: false) */
  @Input() showProjectBreadcrumbs = false;

  /* Set the description placeholder if description is blank. */
  @Input() descriptionPlaceholder = 'Double-click to add a description';

  /* Set an optional label */
  @Input() label?: string;

  /* Determines whether to allow dragging of the card (default: true) */
  @Input() allowDrag = true;

  /* EventEmitter that is triggered when the "Remove" button is pressed */
  @Output() onRemove = new EventEmitter<KnowledgeSource>();

  /* EventEmitter that is triggered when the "Preview" button is pressed */
  @Output() onPreview = new EventEmitter<KnowledgeSource>();

  /* EventEmitter that is triggered when the "Open" button is pressed */
  @Output() onOpen = new EventEmitter<KnowledgeSource>();

  /* EventEmitter that is triggered when the "Chat" button is pressed */
  @Output() onChat = new EventEmitter<KnowledgeSource>();

  /* EventEmitter that is triggered when the "Edit" button is pressed */
  @Output() onEdit = new EventEmitter<KnowledgeSource>();

  /* EventEmitter that is triggered when the KS has been reassigned to a new Project */
  @Output() onProjectChange = new EventEmitter<{
    ks: KnowledgeSource;
    old: string;
    new: string;
  }>();

  /* EventEmitter that is triggered when a topic is clicked */
  @Output() onTopicClick = new EventEmitter<{
    ks: KnowledgeSource;
    topic: string;
  }>();

  hovering = false;

  contentType?: string;

  keywords?: string[];

  description?: string;

  actionButtonTooltipOptions = {
    showDelay: 750,
    tooltipPosition: 'top',
  };

  private _subProjectTree?: Subscription;

  constructor(
    private command: KsCommandService,
    private dnd: DragAndDropService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.ks?.currentValue) {
      this.getContentType().then((result) => {
        this.contentType = result;
      });

      this.getKeywords().then((result) => {
        this.keywords = result;
      });

      this.getDescription().then((result) => {
        this.description = result;
      });
    }
  }

  ngOnDestroy() {
    if (this._subProjectTree) {
      this._subProjectTree.unsubscribe();
    }
  }

  @HostListener('mouseover')
  onCardHover() {
    if (!this.hovering) this.hovering = true;
  }

  @HostListener('mouseleave')
  onCardHoverExit() {
    if (this.hovering) this.hovering = false;
  }

  async getContentType() {
    if (this.ks.ingestType === 'file') {
      return `File (${this.ks.reference.source.file?.type || 'unknown'})`;
    } else {
      const meta = this.ks.reference.source.website?.metadata?.meta;
      if (meta) {
        const ogType = meta.find((m) => m.key === 'og:type');
        if (ogType && ogType.value) {
          return ogType.value;
        }
      }
      return 'Website';
    }
  }

  async getKeywords() {
    if (this.ks.ingestType === 'file') {
      return this.ks.topics;
    }

    const tags: string[] = [];

    if (this.ks.topics) {
      for (const topic of this.ks.topics) {
        tags.push(topic);
      }
    }

    const meta = this.ks.reference.source.website?.metadata?.meta;
    if (meta) {
      const keywords = meta.find((m) => m.key === 'keywords');
      if (keywords && keywords.value) {
        const kwds = keywords.value
          .trim()
          .split(',')
          .filter((k) => k.trim() !== '');
        if (kwds && kwds.length) {
          for (const kwd of kwds) {
            tags.push(kwd);
          }
        }
      }
    }

    return tags;
  }

  async getDescription() {
    if (this.ks.ingestType === 'file') {
      return undefined;
    }

    const meta = this.ks.reference.source.website?.metadata?.meta;
    if (meta) {
      const description = meta.find((m) => m.key?.includes('description'));
      if (description && description.value) {
        return description.value;
      }
    }

    return this.ks.description;
  }

  onProjectSelected($event: any) {
    if (!$event.node.key) {
      return;
    }

    this.onProjectChange.emit({
      ks: this.ks,
      old: this.ks.associatedProject.value,
      new: $event.node.key,
    });
  }

  onTopicRemove() {
    this.ks.topics = this.keywords;
    this.command.update([this.ks]);
  }

  onTopicAdd() {
    this.ks.topics = this.keywords;
    this.command.update([this.ks]);
  }

  onFlagged(ks: KnowledgeSource, flagged: boolean) {
    this.ks.flagged = flagged;
    this.command.update([ks]);
  }

  dragStart($event: DragEvent, ks: KnowledgeSource) {
    if (this.allowDrag) {
      this.dnd.dragSource($event, ks);
    }
  }

  dragEnd($event: any, rowData: any) {
    if (this.allowDrag) {
      this.dnd.dragSourceEnd($event, rowData);
    }
  }

  openSource() {
    if (this.onOpen.observed) {
      this.onOpen.emit(this.ks);
    } else {
      this.command.open(this.ks);
    }
  }

  removeSource() {
    if (this.onRemove.observed) {
      this.onRemove.emit(this.ks);
    } else {
      this.command.remove([this.ks]);
    }
  }

  previewSource() {
    if (this.onPreview.observed) {
      this.onPreview.emit(this.ks);
    } else {
      this.command.preview(this.ks);
    }
  }

  editSource() {
    if (this.onEdit.observed) {
      this.onEdit.emit(this.ks);
    } else {
      this.command.detail(this.ks);
    }
  }

  chatSource() {
    if (this.onChat.observed) {
      this.onChat.emit(this.ks);
    } else {
      this.command.chat(this.ks);
    }
  }

  flagSource(checked: boolean) {
    this.ks.flagged = checked;
    this.command.update([this.ks]);
  }
}
