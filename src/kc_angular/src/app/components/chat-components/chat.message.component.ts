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
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { AgentType, ChatMessage } from '@app/models/chat.model';
import { ChatService } from '@services/chat-services/chat.service';

@Component({
  selector: 'chat-message',
  template: `
    <div class="flex flex-column">
      <div
        class="message-header"
        [style.flex-direction]="
          message.sender === 'user' ? 'row-reverse' : 'row'
        "
      >
        <div
          class="flex w-full align-items-center sm:flex-wrap justify-content-between"
          [style.flex-direction]="
            message.sender === 'user' ? 'row-reverse' : 'row'
          "
        >
          <app-ks-message
            *ngIf="message.source && message.sender !== 'user'"
            [ks]="message.source"
            class="cursor-pointer"
            (click)="onSourceClicked(message.source)"
            [showFooter]="false"
          >
          </app-ks-message>
          <span
            *ngIf="!message.source && message.sender !== 'user'"
            class="font-bold"
          >
            {{ message.sender | titlecase }}
            {{ message.project ? '(' + message.project.name + ')' : '' }}
          </span>
          <span *ngIf="message.sender === 'user'" class="font-bold py-3"
            >You</span
          >
          <div
            class="message-actions"
            [style.flex-direction]="
              message.sender === 'user' ? 'row-reverse' : 'row'
            "
          >
            <button
              pButton
              class="agent-action p-button-rounded p-button-text p-button-plain"
              *ngIf="message.sender !== 'user'"
              [icon]="
                message.rating === 'thumbs-up'
                  ? 'pi pi-thumbs-up-fill'
                  : 'pi pi-thumbs-up'
              "
              (click)="setRating(message, 'thumbs-up')"
            ></button>
            <button
              pButton
              class="agent-action p-button-rounded p-button-text p-button-plain"
              *ngIf="message.sender !== 'user'"
              [icon]="
                message.rating === 'thumbs-down'
                  ? 'pi pi-thumbs-down-fill'
                  : 'pi pi-thumbs-down'
              "
              (click)="setRating(message, 'thumbs-down')"
            ></button>
          </div>
        </div>
      </div>

      <div class="message-body overflow-x-auto">
        <div *ngIf="editing" style="min-width: 32rem;">
          <textarea
            pInputTextarea
            class="w-full p-fluid message-text"
            [rows]="10"
            [class.text-color]="message.sender !== 'user'"
            [(ngModel)]="editText"
          ></textarea>
        </div>
        <div
          [hidden]="editing"
          class="message-text"
          [class.text-color]="message.sender !== 'user'"
          [innerHTML]="
            message.text
              | markdown
                : message.source?.topics ?? message.project?.topics ?? []
          "
        ></div>
      </div>

      <div
        class="message-footer flex justify-content-between align-items-center pb-1"
        [style.flex-direction]="
          message.sender === 'user' ? 'row' : 'row-reverse'
        "
      >
        <div>
          <button
            pButton
            *ngIf="editing"
            class="p-button-rounded p-button-text p-button-plain"
            [ngClass]="{
              'user-action': message.sender === 'user',
              'agent-action': message.sender !== 'user'
            }"
            icon="pi pi-check"
            (click)="edit(true)"
          ></button>
          <button
            pButton
            *ngIf="editing"
            class="p-button-rounded p-button-text p-button-plain"
            [ngClass]="{
              'user-action': message.sender === 'user',
              'agent-action': message.sender !== 'user'
            }"
            icon="pi pi-times"
            (click)="edit(false)"
          ></button>
        </div>
        <span class="message-timestamp">{{
          message.timestamp | date : 'short'
        }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 5rem;
        border: 1px solid var(--surface-border);
      }

      .message-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .message-actions {
        display: flex;
        align-items: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      :host:hover .message-actions {
        opacity: 1;
      }

      .message-timestamp {
        min-width: 8rem;
        opacity: 0;
      }

      :host:hover .message-timestamp {
        opacity: 0.7;
      }

      .message-text {
        text-rendering: geometricPrecision;
      }

      .user-action {
        color: var(--primary-text-color) !important;
      }

      .user-message {
        background-color: var(--primary-color) !important;
        color: var(--primary-color-text) !important;
        display: flex;
        border-radius: 10px;
        padding: 0 10px 0 10px;
        margin: 0.5rem;
        text-align: right;
      }

      .agent-action {
        color: var(--primary-color) !important;
      }
    `,
  ],
})
export class ChatMessageComponent implements OnChanges {
  /* The message to display in this component. */
  @Input() message!: ChatMessage;

  /* Whether the message is being edited. */
  @Input() editing = false;

  /* Event emitted when the user finishes editing the message. */
  @Output() onEditMessage = new EventEmitter();

  /* Event emitted when the message is edited. */
  @Output() onMessageEdited = new EventEmitter<string>();

  /* The text of the message being edited. */
  editText = '';

  constructor(private command: KsCommandService, private chat: ChatService) {}

  @HostBinding('class.user-message') get isUserMessage() {
    return this.message && this.message.sender === AgentType.User;
  }

  @HostBinding('class.agent-message') get isAgentMessage() {
    return this.message && this.message.sender !== AgentType.User;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.editing) {
      if (changes.editing.currentValue === true) {
        this.editText = this.message.text;
      }
    }
  }

  /**
   * Opens the Source details dialog when the user clicks on a Source.
   * @param ks
   */
  onSourceClicked(ks: KnowledgeSource) {
    this.command.detail(ks);
  }

  /**
   * Toggles the editing state of the message.
   * @param save Whether to save the changes or not.
   */
  edit(save: boolean) {
    this.onMessageEdited.emit(save ? this.editText : this.message.text);
  }

  /**
   * Sets the rating of the message to either thumbs-up or thumbs-down.
   * @description Giving a thumbs-down will prevent the message from being sent to future OpenAI requests.
   */
  setRating(
    message: ChatMessage,
    rating: 'thumbs-up' | 'thumbs-down' | 'none'
  ) {
    rating = message.rating === rating ? 'none' : rating;
    message.rating = rating;
    this.chat.rateMessage(message, rating);
  }
}
