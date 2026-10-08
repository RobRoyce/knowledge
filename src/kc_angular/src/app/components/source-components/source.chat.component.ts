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

import { Component, OnInit, ViewChild } from '@angular/core';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { ChatService } from '@services/chat-services/chat.service';
import { ChatViewComponent } from '@components/chat-components/chat.view.component';

@Component({
  selector: 'source-chat',
  template: `
    <div class="h-full w-full flex flex-column">
      <app-chat-view #chatView style="height: 100% !important;"></app-chat-view>
    </div>
    <p-dialog [(visible)]="showQuestion" [modal]="true" header="Source Q&A">
      <div *ngIf="context">
        <h3>Context:</h3>
        <div
          style="max-width: 64rem; max-height: 16rem;"
          class="text-500 overflow-y-auto"
        >
          {{ context }}
        </div>
      </div>
      <h3>Ask a question:</h3>
      <div>
        <input
          #question
          pInputText
          class="w-full p-fluid"
          placeholder="Type your question here, then press enter..."
        />
      </div>
    </p-dialog>
  `,
  styleUrls: ['./source.styles.scss'],
})
export class SourceChatComponent implements OnInit {
  @ViewChild('chatView') chatView!: ChatViewComponent;

  source!: KnowledgeSource; // Must be passed in during dynamic component creation

  showQuestion = false;

  context?: string;

  constructor(private chat: ChatService) {}

  ngOnInit() {
    this.chat.setTarget({ source: this.source });
  }

  showQuestionDialog(context?: string) {
    this.context = context;
    this.showQuestion = true;
  }
}
