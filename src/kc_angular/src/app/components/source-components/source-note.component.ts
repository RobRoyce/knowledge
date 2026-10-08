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

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SourceNote } from '@app/models/knowledge.source.model';

@Component({
  selector: 'source-note',
  template: `
    <div
      class="flex-col-center-center text-color bg-primary-reverse shadow-1 border-round"
    >
      <div *ngIf="note">
        <div class="w-full h-full flex-col-center-center">
          {{ note.title }}
        </div>
        <div>
          {{ note.content }}
        </div>
      </div>
      <div *ngIf="!note">
        <div
          class="w-full h-full flex-col-center-center text-5xl cursor-pointer"
          (click)="addNote.emit()"
        >
          +
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
      }
    `,
  ],
})
export class SourceNoteComponent {
  @Input() note?: SourceNote;

  @Output() addNote = new EventEmitter<void>();

  constructor() {}
}
