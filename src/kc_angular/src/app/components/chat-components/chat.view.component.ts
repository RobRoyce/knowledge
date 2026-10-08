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

import { Component, Input, ViewChild } from '@angular/core';
import { ChatService } from '@app/services/chat-services/chat.service';
import { MenuItem } from 'primeng/api';
import { ContextMenu } from 'primeng/contextmenu';
import { AgentType, ChatMessage } from '@app/models/chat.model';
import { Observable } from 'rxjs';
import { ChatContextMenuService } from '@services/factory-services/chat-context-menu.service';
import { ChatCommandService } from '@services/chat-services/commands.service';
import { distinctUntilChanged, tap } from 'rxjs/operators';

@Component({
  selector: 'app-chat-view',
  template: `
    <div
      [style.max-height]="heightRestricted ? '64rem' : 'unset'"
      class="width-constrained flex flex-column h-full select-text w-full"
      id="chat-container"
    >
      <chat-toolbar class="shadow-3 z-1"></chat-toolbar>

      <div
        class="chat-history flex flex-column overflow-y-auto flex-grow-1 w-full z-0"
        id="chat-history"
      >
        <div
          *ngFor="let message of messages$ | async"
          (contextmenu)="showContextMenu($event, message)"
          class="w-full flex flex-column"
        >
          <div
            [style.justify-content]="
              message.sender === 'user' ? 'right' : 'left'
            "
            class="w-full flex flex-row"
          >
            <div id="message-container">
              <ng-template chatMessage [message]="message"></ng-template>
            </div>
          </div>
        </div>
        <div
          *ngIf="(messages$ | async)?.length === 0"
          class="flex-col-center-center h-full text-2xl text-color-secondary w-full"
        >
          No Messages
        </div>
        <div class="chat-history-scroll-target"></div>
      </div>

      <chat-input
        class="w-full"
        (showCommands)="blurHistory($event)"
      ></chat-input>
    </div>

    <p-contextMenu
      #cm
      [autoZIndex]="true"
      [baseZIndex]="999999"
      [model]="messageMenu"
      appendTo="body"
      styleClass="shadow-7 bg-primary-reverse"
    >
    </p-contextMenu>
  `,
  styles: [
    `
      #chat-toolbar {
        height: 2rem;
        background-color: var(--surface-ground);
      }
    `,
  ],
})
export class ChatViewComponent {
  /* The context menu for chat messages */
  @ViewChild('cm', { static: true }) cm!: ContextMenu;

  /* Whether to apply a height restriction to the chat history */
  @Input() heightRestricted = false;

  messageMenu: MenuItem[] = [];

  messages$: Observable<ChatMessage[]>;

  constructor(
    private chat: ChatService,
    private context: ChatContextMenuService,
    private command: ChatCommandService
  ) {
    this.messages$ = this.chat.messages$.pipe(
      distinctUntilChanged((a, b) => {
        // If the messages are the same length, check if they are the same messages
        if (a.length === b.length) {
          for (let i = 0; i < a.length; i++) {
            if (a[i].id !== b[i].id) {
              return false;
            }
          }
          return true;
        }
        return false;
      }),
      tap(() => {
        this.scroll();
      })
    );

    this.command.scrollView$.asObservable().subscribe(() => {
      this.scroll();
    });
  }

  /* Scroll to the end of the #chat-history element */
  scroll() {
    const classElement = document.getElementsByClassName(
      'chat-history-scroll-target'
    );
    if (classElement.length > 0) {
      setTimeout(() => {
        classElement[0].scrollIntoView({ behavior: 'smooth' });
      }, 250);
    }
  }

  blurHistory($event: boolean) {
    // If the command bar is active, make the chat history slightly opaque and transparent
    if ($event) {
      document
        .getElementsByClassName('chat-history')[0]
        .classList.add('chat-history-active');
    } else {
      document
        .getElementsByClassName('chat-history')[0]
        .classList.remove('chat-history-active');
    }
  }

  /**
   * Show the context menu for the given message at the given event location
   * @param $event The event to show the context menu at
   * @param message The message to show the context menu for
   */
  showContextMenu($event: MouseEvent, message: ChatMessage) {
    // Set the menu items based on the type of message and its contents
    this.messageMenu = [];

    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      // If the selection is 1-3 words, add the option to save as a topic
      const text = selection.toString().trim();
      const tokens = text.split(' ');
      if (text.length > 0 && tokens.length > 0 && tokens.length <= 5) {
        this.messageMenu.push(this.context.topics(message, text, () => {}));
      }

      // Add the search option
      this.messageMenu.push(this.context.search(message, selection, () => {}));
    }

    // If the user has highlighted text, add a highlight option
    const highlight = this.context.highlight(message, $event, () => {
      this.chat.persistChatHistory();
    });

    if (highlight) {
      this.messageMenu.push(highlight);
    }

    // If the user has selected text or highlighted text, add a separator
    if (this.messageMenu.length > 0) {
      this.messageMenu.push(this.context.separator());
    }

    // If the message is not a user message, and has a source or project, add a save option
    if (
      message.sender !== AgentType.User &&
      (message.source || message.project)
    ) {
      this.messageMenu.push(this.context.save(message));
    }

    if (this.messageMenu.length > 0) {
      this.messageMenu.push(this.context.separator());
    }

    this.messageMenu.push(
      this.context.copy(message),
      this.context.delete(() => {
        this.chat.deleteMessage(message);
      })
    );

    this.cm.show($event);
  }
}
