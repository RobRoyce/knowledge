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
  HostListener,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { MenuItem, SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { ProjectService } from '@services/factory-services/project.service';
import { OverlayPanel } from 'primeng/overlaypanel';
import { KsContextMenuService } from '@services/factory-services/ks-context-menu.service';
import { TopicService } from '@services/user-services/topic.service';
import { DragAndDropService } from '@services/ingest-services/drag-and-drop.service';

@Component({
  selector: 'ks-table',
  template: `
    <div class="w-full h-full flex-col-center-start">
      <div
        class="p-card w-full h-full"
        style="border: 1px solid var(--surface-100)"
      >
        <p-table
          #dataTable
          *ngIf="ksTableShouldExist"
          [(selection)]="ksSelected"
          [value]="ksList"
          [rowsPerPageOptions]="[10, 20, 30, 40, 50]"
          [(rows)]="rows"
          (rowsChange)="onRowChange($event)"
          [(first)]="first"
          [columns]="selectedColumns"
          [scrollable]="true"
          scrollHeight="calc(100vh - 350px)"
          [(contextMenuSelection)]="ksTableContextMenuSelectedKs"
          [selectionPageOnly]="true"
          [contextMenu]="cm"
          [resizableColumns]="false"
          columnResizeMode="expand"
          [globalFilterFields]="ksTableGlobalFilterFields"
          [customSort]="true"
          (sortFunction)="tableSort($event)"
          [paginator]="true"
          [showJumpToPageInput]="true"
          [showCurrentPageReport]="true"
          [showPageLinks]="true"
          selectionMode="checkbox"
          dataKey="id.value"
        >
          <ng-template pTemplate="caption">
            <div class="flex-row-center-between">
              <p-multiSelect
                [options]="KS_TABLE_SUPPORTED_COLUMNS"
                [(ngModel)]="selectedColumns"
                (onChange)="onSelectedColumnChange($event)"
                optionLabel="header"
                selectedItemsLabel="{0} columns selected"
                [style]="{ minWidth: '200px' }"
                placeholder="Choose Columns"
              >
              </p-multiSelect>

              <span>
                <div class="p-inputgroup">
                  <span class="p-inputgroup-addon"
                    ><i class="pi pi-filter"></i
                  ></span>
                  <input
                    #tableFilter
                    pInputText
                    type="text"
                    (input)="
                      dataTable.filterGlobal(tableFilter.value, 'contains')
                    "
                    placeholder="Filter by title, type, date, etc."
                    proTip
                    tipHeader="Filtering 101"
                    tipMessage="Want to find something specific? Type in the search box to filter your table. You can filter by title, type, date, etc."
                    tipIcon="pi pi-search"
                    [tipGroups]="['table']"
                  />
                  <span
                    class="p-inputgroup-addon"
                    (click)="clearFilter(dataTable, tableFilter)"
                    [style.cursor]="
                      tableFilter.value.length ? 'pointer' : 'unset'
                    "
                  >
                    <i class="pi pi-times"></i>
                  </span>
                </div>
              </span>

              <div class="p-d-flex">
                <button
                  type="button"
                  pButton
                  class="p-button-danger"
                  icon="pi pi-trash"
                  [disabled]="ksSelected.length === 0"
                  style="margin-right: 10px"
                  (click)="removeMultiple(ksSelected)"
                ></button>
                <app-ks-export
                  proTip
                  tipHeader="Data on the Go! 💼"
                  tipMessage="Want your data handy? Hit the 'Export' button to save your table to a CSV file. It's like packing your data suitcase for a journey outside the app!"
                  tipIcon="pi pi-download"
                  [tipGroups]="['table']"
                  [data]="ksList"
                ></app-ks-export>
              </div>
            </div>
          </ng-template>

          <!--Declare Table Headers-->
          <ng-template pTemplate="header" let-columns>
            <!--        Checkbox Row-->
            <tr>
              <th style="max-width: 40px">
                <p-tableHeaderCheckbox
                  proTip
                  tipHeader="Chechmate!"
                  tipMessage="Want to select all your table entries at once? Click the checkbox in the table header. It's your one-click wonder for bulk actions!"
                  tipIcon="pi pi-check-square"
                  [tipGroups]="['table']"
                ></p-tableHeaderCheckbox>
              </th>
              <th
                *ngFor="let col of columns"
                [pSortableColumn]="col.field === 'icon' ? '' : col.field"
                [style.max-width]="getColWidth(col)"
                style="width: auto"
                pResizableColumn
              >
                {{ col.header }}
              </th>
            </tr>
          </ng-template>
          <!--End Declare Table Headers-->

          <!--Declare Table Rows-->
          <ng-template
            pTemplate="body"
            let-rowData
            let-columns="columns"
            let-expanded="expanded"
          >
            <tr
              [pContextMenuRow]="rowData"
              (dblclick)="detail(rowData)"
              class="source-drag-handle"
              pDraggable="sources"
              (onDragStart)="dragStart($event, rowData)"
              (onDragEnd)="dragEnd($event, rowData)"
            >
              <td style="max-width: 40px">
                <p-tableCheckbox
                  [value]="rowData"
                  style="margin-right: 10px"
                ></p-tableCheckbox>
              </td>

              <td
                *ngFor="let col of columns"
                [style.max-width]="getColWidth(col)"
                style="width: auto"
              >
                <div *ngIf="col.field === 'icon'">
                  <app-ks-icon [ks]="rowData"></app-ks-icon>
                </div>

                <div
                  *ngIf="col.field === 'title'"
                  class="overflow-hidden"
                  pTooltip="{{ rowData.title }}"
                >
                  {{ rowData.title | truncate : [64] }}
                </div>

                <div
                  *ngIf="col.field === 'associatedProject'"
                  pTooltip="{{ rowData[col.field] | projectName }}"
                >
                  {{ rowData[col.field] | projectName }}
                </div>

                <div *ngIf="col.field === 'dateCreated'">
                  <div *ngIf="ksTableShowCountdownInsteadOfDates">
                    {{ rowData[col.field] | countdown }}
                  </div>
                  <div *ngIf="!ksTableShowCountdownInsteadOfDates">
                    {{ rowData[col.field] | date : 'mediumDate' }}
                  </div>
                </div>
                <div
                  *ngIf="
                    col.field === 'dateModified' || col.field === 'dateAccessed'
                  "
                >
                  <div *ngIf="rowData[col.field].length > 0">
                    <div *ngIf="ksTableShowCountdownInsteadOfDates">
                      {{
                        rowData[col.field][rowData[col.field].length - 1]
                          | countdown
                      }}
                    </div>
                    <div *ngIf="!ksTableShowCountdownInsteadOfDates">
                      {{
                        rowData[col.field][rowData[col.field].length - 1]
                          | date : 'mediumDate'
                      }}
                    </div>
                  </div>
                  <div *ngIf="rowData[col.field].length === 0">-</div>
                </div>

                <div
                  *ngIf="col.field === 'ingestType'"
                  class="flex-col-center-start"
                  style="width: 100%"
                >
                  <i
                    class="pi pi-{{ rowData.ingestType | ksIngestTypeIcon }}"
                  ></i>
                </div>

                <div
                  *ngIf="col.field === 'flagged'"
                  class="flex-col-center-start"
                  style="width: 100%"
                >
                  <button
                    pButton
                    [icon]="rowData.flagged ? 'pi pi-flag-fill' : 'pi pi-flag'"
                    class="m-1 p-button-text"
                    (click)="ksFlagUpdate(rowData)"
                  ></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <!--End Declare Table Rows-->

          <!--Declare Table Summary Row-->
          <ng-template pTemplate="summary">
            <div
              *ngIf="ksList.length && ksTopics.length"
              proTip
              tipHeader="Topic Treasure Trove 🏷️"
              tipMessage="Underneath your Source table, you'll find a sorted list of all topics from your Sources. It's like a popularity contest for your data, with the most frequent topics taking the top spots!"
              tipIcon="pi pi-tags"
              [tipGroups]="['table']"
            >
              Topics
              <div
                style="max-height: 5rem; overflow-x: hidden; overflow-y: auto"
              >
                <p-chip
                  *ngFor="let topic of ksTopics"
                  class="cursor-pointer"
                  label="{{ topic }}"
                  styleClass="search-chip m-1"
                  (click)="onChipClick(topic)"
                >
                </p-chip>
              </div>
            </div>
          </ng-template>
          <!--End Declare Table Summary Row-->
        </p-table>
      </div>
    </div>

    <p-contextMenu
      #cm
      [model]="ksMenuItems"
      styleClass="shadow-7 bg-primary-reverse"
      (onShow)="onKsContextMenu()"
      appendTo="body"
    >
    </p-contextMenu>
  `,
  styles: [],
})
export class KsTableComponent implements OnInit, OnChanges {
  @Input() ksList: KnowledgeSource[] = [];

  @ViewChild('dataTable') dataTable!: Table;

  @ViewChild('op') overlayPanel!: OverlayPanel;

  @ViewChild('tableFilter') tableFilter!: ElementRef;

  readonly KS_TABLE_ROWS = 'ks-table-rows';

  readonly KS_TABLE_SELECTED_COLUMNS_STATE_KEY = 'ks-table-selected-columns';

  readonly KS_TABLE_SUPPORTED_COLUMNS: { field: string; header: string }[] = [
    { field: 'icon', header: '' },
    { field: 'title', header: 'Title' },
    { field: 'associatedProject', header: 'Project' },
    { field: 'dateCreated', header: 'Created' },
    { field: 'dateAccessed', header: 'Accessed' },
    { field: 'dateModified', header: 'Modified' },
    { field: 'ingestType', header: 'Type' },
    { field: 'flagged', header: 'Important' },
  ];

  ksTableAllowSubprojectExpansion = true;

  filter = '';

  ksSelected: KnowledgeSource[] = [];

  ksTableShouldExist = true;

  ksTableContextMenuSelectedKs?: KnowledgeSource;

  ksMenuItems: MenuItem[] = [];

  ksTableShowCountdownInsteadOfDates = true;

  ksTableGlobalFilterFields: string[] = [
    'title',
    'ingestType',
    'description',
    'associatedProject',
    'rawText',
    'icon',
    'accessLink',
    'topics',
    'authors',
  ];

  ksTopics: string[] = [];

  rows = 10;

  first = 0;

  constructor(
    private command: KsCommandService,
    private dnd: DragAndDropService,
    private projects: ProjectService,
    private topics: TopicService,
    private context: KsContextMenuService
  ) {}

  private _selectedColumns: any[] = this.KS_TABLE_SUPPORTED_COLUMNS;

  get selectedColumns(): any[] {
    return this._selectedColumns;
  }

  set selectedColumns(val: any[]) {
    this._selectedColumns = this.KS_TABLE_SUPPORTED_COLUMNS.filter((col) =>
      val.includes(col)
    );
  }

  ngOnInit(): void {
    const sel = localStorage.getItem(this.KS_TABLE_SELECTED_COLUMNS_STATE_KEY);
    if (sel) {
      this._selectedColumns = JSON.parse(sel);
    }

    const rows = localStorage.getItem(`${this.KS_TABLE_ROWS}`);
    if (rows) {
      this.rows = parseInt(rows);
    } else {
      localStorage.setItem(this.KS_TABLE_ROWS, `${this.rows}`);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.ksList) {
      this.ksSelected = [];
      this.ksTopics = [];
      this.ksList.forEach((ks) => {
        ks.topics?.forEach((topic) => {
          if (!this.ksTopics.includes(topic)) {
            this.ksTopics.push(topic);
          }
        });

        this.ksTopics.sort((a, b) => {
          const nA = this.ksList.filter((k) => k.topics?.includes(a)).length;
          const nB = this.ksList.filter((k) => k.topics?.includes(b)).length;
          return nA < nB ? 1 : nA > nB ? -1 : 0;
        });
      });

      // Set pagination to first page
      this.first = 0;
    }
  }

  @HostListener('document:keydown.Control.]')
  @HostListener('document:keydown.meta.]')
  keyPressNext() {
    const next = this.first + this.rows;
    if (next < this.ksList.length) {
      this.first = this.first + this.rows;
    }
    this.dataTable.resetScrollTop();
  }

  @HostListener('document:keydown.Control.[')
  @HostListener('document:keydown.meta.[')
  keyPressPrevious() {
    this.first = Math.max(0, this.first - this.rows);
    this.dataTable.resetScrollTop();
  }

  tableSort(event: SortEvent) {
    if (!event.data) {
      return;
    }

    switch (event.field) {
      case 'associatedProject':
        event.data.sort((d1, d2) => {
          if (!event.field || !event.order) {
            return 0;
          }
          const p1 = this.projects.getProject(d1[event.field].value)?.name;
          const p2 = this.projects.getProject(d2[event.field].value)?.name;
          return this.ksSortText(p1 ?? '', p2 ?? '', event.order);
        });
        break;
      case 'dateCreated':
        event.data.sort((d1, d2) => {
          if (!event.field || !event.order) {
            return 0;
          }
          return this.ksSortDate(d1[event.field], d2[event.field], event.order);
        });
        break;
      case 'dateAccessed':
      case 'dateModified':
        // Sort date data
        event.data.sort((d1, d2) => {
          if (!event.field || !event.order) {
            return 0;
          }
          return this.ksSortDate(
            d1[event.field][d1[event.field].length - 1],
            d2[event.field][d2[event.field].length - 1],
            event.order
          );
        });
        break;
      default:
        // Sort text data
        event.data.sort((d1, d2) => {
          if (!event.field || !event.order) {
            return 0;
          }
          return this.ksSortText(d1[event.field], d2[event.field], event.order);
        });
    }
  }

  ksSortText(s1: string, s2: string, order: number) {
    return order * (s1 > s2 ? 1 : s1 < s2 ? -1 : 0);
  }

  ksSortDate(d1: Date, d2: Date, order: number) {
    let result: number;
    if (!d1 && !d2) {
      result = 0;
    } else if (!d1) {
      result = order;
    } else if (!d2) {
      result = -order;
    } else {
      result = d1 > d2 ? 1 : d1 < d2 ? -1 : 0;
    }
    return order * result;
  }

  removeMultiple(selectedCheckboxKs: KnowledgeSource[]) {
    this.command.remove(selectedCheckboxKs);
    this.ksSelected = [];
  }

  getColWidth(col: any): string {
    if (col.field.includes('date')) {
      if (this.ksTableShowCountdownInsteadOfDates) {
        return '7rem';
      } else {
        return '8rem';
      }
    }
    if (col.field === 'ingestType') {
      return '4rem';
    }
    if (col.field === 'flagged') {
      return '7rem';
    }
    if (col.field === 'associatedProject') {
      return '12rem';
    }
    if (col.field === 'topics') {
      return '48rem';
    }
    if (col.field === 'icon') {
      return '40px';
    }
    return 'auto';
  }

  clearFilter(table: Table, filter: HTMLInputElement) {
    table.clear();
    filter.value = '';
  }

  onKsContextMenu() {
    if (this.ksTableContextMenuSelectedKs) {
      this.ksMenuItems = this.context.generate(
        this.ksTableContextMenuSelectedKs,
        this.ksSelected
      );
    }
  }

  detail(rowData: KnowledgeSource) {
    this.command.detail(rowData);
  }

  resetLayout() {
    this.ksTableShouldExist = false;

    // Clear table state
    this.dataTable.clearState();

    setTimeout(() => {
      this.ksTableShouldExist = true;
    });
    this.overlayPanel.hide();
  }

  pastDue(date: Date) {
    return new Date() > date;
  }

  onSelectedColumnChange($event: any) {
    localStorage.setItem(
      this.KS_TABLE_SELECTED_COLUMNS_STATE_KEY,
      JSON.stringify($event.value)
    );
    this._selectedColumns = $event.value;
    this.dataTable.clearState();
  }

  /**
   * Opens a new search dialog using the topic as its search term.
   * Compatible with PrimeNG `p-chip` and `p-chips`.
   * @param topic A string representing the topic to be searched,
   * or EventEmitter event such that event.value contains a topic string
   */
  onChipClick(topic: any | string) {
    let searchValue: string;
    if (typeof topic === 'string') {
      searchValue = topic.trim();
    } else {
      topic.preventDefault();
      topic.stopPropagation();
      if (!topic.value || typeof topic.value !== 'string') {
        return;
      }
      searchValue = topic.value.trim();
    }
    if (!topic.length) {
      console.warn('Topic appears to have no content.');
      return;
    }

    this.topics.search(searchValue);
  }

  ksFlagUpdate(ks: KnowledgeSource) {
    ks.flagged = !ks.flagged;
    this.command.update([ks]);
  }

  onRowChange($event: number) {
    localStorage.setItem(this.KS_TABLE_ROWS, `${$event}`);
  }

  dragStart($event: DragEvent, source: KnowledgeSource) {
    // If source is in the selected list, drag all selected
    const found = this.ksSelected.find((ks) => ks.id === source.id);
    if (found) {
      this.dnd.dragSources($event, this.ksSelected);
      return;
    } else {
      this.dnd.dragSource($event, source);
    }
  }

  dragEnd($event: any, rowData: any) {
    this.dnd.dragSourceEnd($event, rowData);
  }
}
