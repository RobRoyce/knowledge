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
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { ChatService } from '@services/chat-services/chat.service';
import { BehaviorSubject, combineLatest, Observable, tap } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  ChatCommand,
  ChatCommandService,
} from '@services/chat-services/commands.service';
import { Message } from 'primeng/api';
import { KnowledgeSource } from '@app/models/knowledge.source.model';

@Component({
  selector: 'chat-input',
  template: `
    <div class="w-full flex flex-column flex-grow-0" id="chat-bar">
      <div class="flex flex-row gap-4 px-4 justify-content-between">
        <div
          *ngFor="let question of questions"
          (click)="ask(question)"
          class="next-question-suggestion cursor-pointer opacity-70 fadein text-center select-none surface-overlay border-round-top-2xl px-3 pt-2 shadow-1 mb-1 min-h-2rem"
          disabled="loading"
          style="min-height: 2rem;"
          [pTooltip]="question"
          tooltipStyleClass="w-30rem max-w-30rem"
          tooltipPosition="top"
          proTip
          tipHeader="Out of Questions? We've Got Your Back!"
          tipMessage="Explore our suggested follow-up questions, carefully created by our AI experts. Designed to spark your curiosity and continue your learning journey."
          [tipGroups]="['chat']"
          tipIcon="pi pi-question"
        >
          {{ question | truncate : [84] }}
        </div>
      </div>
      <div class="px-4" [hidden]="bannerMessages.length === 0">
        <p-messages
          [value]="bannerMessages"
          [enableService]="false"
          [closable]="true"
          styleClass="chat-command-banner"
        ></p-messages>
      </div>
      <div
        class="chat-command-box surface-overlay border-1 border-primary border-bottom-none"
        [hidden]="(chatCommands | async)!.length === 0"
        [style.bottom]="commandBottom"
        [style.width]="commandWidth"
        [style.left]="commandLeft"
      >
        <div
          *ngFor="let command of chatCommands | async; let i = index"
          class="flex-row-center-start cursor-pointer h-3rem hover:bg-primary-reverse hover:text-primary text-800 px-3 py-1"
          [class.bg-primary]="i === commandIndex"
          [class.active-command]="i === commandIndex"
          (click)="
            clickSelect(command, chatInput.value, $event); chatInput.focus()
          "
        >
          <span class="font-bold">{{ command.command }} </span>
          <span *ngIf="command.args?.length" class="font-bold">
            <span *ngFor="let arg of command.args">
              &nbsp;<code>{{ arg.label }}</code>
            </span>
          </span>
          :&nbsp;
          <span>{{ command.description }}</span>
        </div>
      </div>
      <div class="px-4">
        <p-progressBar
          *ngIf="loading$ | async"
          [style]="{ height: '2px' }"
          class="w-full flex-col-between"
          mode="indeterminate"
        ></p-progressBar>
        <div class="w-full">
          <textarea
            #chatInput
            pInputTextarea
            pAutoFocus
            [autofocus]="true"
            (focus)="focus()"
            (input)="input(chatInput.value)"
            (keydown.escape)="reset()"
            (keydown.enter)="enter(chatInput.value, $event)"
            (keydown.arrowUp)="arrowSelectCommand(commandIndex - 1, $event)"
            (keydown.arrowDown)="arrowSelectCommand(commandIndex + 1, $event)"
            (keydown.tab)="tabSelectCommand($event)"
            [autoResize]="!chatInput.value.startsWith('/')"
            [disabled]="loading$ | async"
            [rows]="2"
            class="chat-input w-full flex-row shadow-2 max-h-12rem overflow-y-auto bg-primary-reverse text-color"
            id="chat-input"
            placeholder="Ask your questions here, or type / to see a list of commands"
          ></textarea>
        </div>
        <div class="w-full relative px-3 h-2rem select-none">
          <div *ngIf="!(loading$ | async)" class="pl-2 text-500">
            <div
              [class.text-red-500]="
                (tokenCount$ | async)! > (tokenLimit$ | async)!
              "
            >
              {{ tokenCount$ | async }} / {{ tokenLimit$ | async }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .chat-command-box {
        max-height: 24rem;
        overflow-y: auto;
        border-radius: 1.5rem 1.5rem 0 0;
        position: fixed;
      }

      .chat-input {
        width: 100%;
        border-bottom-left-radius: 1.5rem !important;
        border-bottom-right-radius: 1.5rem !important;
        border-top-right-radius: 0 !important;
        border-top-left-radius: 0 !important;
      }
    `,
  ],
})
export class ChatInputComponent {
  @ViewChild('chatInput', { static: false }) chatInput!: ElementRef;

  @ViewChild('commandBox', { static: false }) commandBox!: ElementRef;

  @Input() questions: string[] = [];

  @Input() source: KnowledgeSource | undefined;

  @Output() showCommands = new EventEmitter<boolean>();

  @Output() focusEvent = new EventEmitter<void>();

  @HostListener('document:click', ['$event'])
  // Listen for click events and close the command palette if the user clicks outside of it
  clickout() {
    this.commands.reset();
  }

  tokenCount$: Observable<number>;

  tokenLimit$: Observable<number>;

  chatCommands: Observable<ChatCommand[]>;

  commandWidth = '0';

  commandBottom = '0';

  commandLeft = '0';

  commandIndex = 0;

  commandCount = 0;

  loading$: Observable<boolean>;

  private userInput = new BehaviorSubject<string>('');

  private tokensWithinLimit = true;
  bannerMessages: Message[] = [];

  constructor(private chat: ChatService, private commands: ChatCommandService) {
    this.tokenCount$ = chat.tokenCount$;
    this.tokenLimit$ = chat.tokenLimit$;
    this.chatCommands = commands.commands$;
    this.loading$ = chat.loading$;

    /* When either count or limit change, set flag accordingly */
    combineLatest([this.tokenCount$, this.tokenLimit$]).subscribe(
      ([count, limit]) => {
        this.tokensWithinLimit = count <= limit;
      }
    );

    /* When the user input changes, trigger a token count update */
    this.userInput
      .asObservable()
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe((value) => {
        this.chat.processInput(value);
      });

    /* Handle changes to available commands based on user input */
    this.chatCommands
      .pipe(
        tap((commands) => {
          this.commandCount = commands.length;

          // If the index is out of bounds, reset it
          if (this.commandIndex >= this.commandCount) {
            this.commandIndex = 0;
          }

          // If there are commands to display, show the command box
          if (commands.length > 0) {
            this.bannerMessages = [];
            this.showCommands.emit(true);
            this.scroll(0);
          } else {
            this.showCommands.emit(false);
          }
        })
      )
      .subscribe();

    this.commands.questions$.subscribe((questions) => {
      this.questions = questions;
      setTimeout(() => {
        this.commands.scrollView$.next(true);
      });
    });

    this.chat.messages$
      .pipe(distinctUntilChanged((a, b) => a[0]?.id === b[0]?.id))
      .subscribe(() => {
        this.questions = [];
      });
  }

  ask(question: string) {
    this.chat.submit(question);
    this.questions = this.questions.filter((q) => q !== question);
  }

  input(value: string) {
    // Set the command box position whenever input changes (required for responsive behavior)
    this.setCommandBox();

    // Required to get rid of command palette when user erases the chat
    if (value.trim() === '') {
      this.reset();
    }

    // If the input starts with a slash, trigger command palette update
    if (value.startsWith('/')) {
      this.commands.filter(value);
    } else {
      // Otherwise, ensure the command palette is hidden
      this.commands.reset();
    }

    this.userInput.next(value);
  }

  enter(value: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    // Handle commands
    if (value.startsWith('/')) {
      const cmd = this.commands.lookup(value.split(' ')[0]);

      if (cmd) {
        // If the full command is entered, and it exists, execute it
        this.execute(cmd, value);
      } else {
        // Otherwise, assume the user wants to execute the indexed command
        const indexed = this.commands.indexed(this.commandIndex);

        if (indexed) {
          this.execute(indexed, value);
        } else {
          this.bannerMessage({
            severity: 'warn',
            summary: 'Invalid Command',
            life: 5000,
            detail: `The command ${value} is not valid. Type / to see a list of available commands.`,
          });

          this.reset();
        }
      }
      return;
    }

    if (this.tokensWithinLimit) {
      this.chat.submit(value);
      this.reset();
    } else {
      this.bannerMessage({
        severity: 'warn',
        summary: 'Woah there!',
        life: 5000,
        detail: `The current Chat model has reached its token limit. Please shorten your message and try again.`,
      });
    }
  }

  clickSelect(command: ChatCommand, input: string, $event: Event) {
    // If the command requires arguments, set the input to the command and filter the commands list
    $event.preventDefault();
    $event.stopPropagation();

    this.setInputText(command.command + ' ');

    if (command.args?.length && command.args?.length > 0) {
      this.chatInput.nativeElement.value = command.command + ' ';
      this.commands.filter(this.chatInput.nativeElement.value);
    } else {
      this.execute(command, input);
    }
  }

  execute(command: ChatCommand, input: string) {
    // For any non-optional args, make sure their values are not undefined
    const parsedArgs = command.argParse ? command.argParse(input) : [];
    const requiredArgsAreValid = parsedArgs.every(
      (arg) => arg.optional || (!arg.optional && arg.value !== undefined)
    );

    if (!requiredArgsAreValid) {
      // Display a warning if required args are missing
      this.bannerMessage({
        severity: 'warn',
        summary: 'Forget something?',
        life: 5000,
        detail: `The ${command.command} command requires additional arguments. Please try again.`,
      });
    } else {
      // Otherwise execute the command
      command.execute(parsedArgs);
    }
    this.reset();
  }

  arrowSelectCommand(newIndex: number, event: Event) {
    /* Handle arrow key navigation of command palette */

    if (this.commandCount === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (newIndex < 0) {
      // If the index is out of bounds, wrap around
      newIndex = this.commandCount - 1;
    } else if (newIndex >= this.commandCount) {
      newIndex = 0;
    }

    this.commandIndex = newIndex;
    this.scroll(0);
  }

  tabSelectCommand($event: Event) {
    /* Handle when the user presses tab in the chat input */
    $event.preventDefault();
    $event.stopPropagation();
    const command = this.commands.indexed(this.commandIndex);
    if (!command) {
      return;
    }
    this.setInputText(command.command + ' ');
  }

  reset() {
    /* Convenience function for procedurally clearing the chat input */
    this.setInputText('');
  }

  private bannerMessage(message: Message) {
    /* Convenience function for procedurally setting the banner message */
    this.bannerMessages = [message];
    setTimeout(() => {
      this.bannerMessages = [];
    }, message.life ?? 5000);
  }

  private scroll(timeoutms = 100) {
    /* Make sure the currently selected command is in view */
    setTimeout(() => {
      const classElement = document.getElementsByClassName('active-command');
      if (classElement.length > 0) {
        classElement[0].scrollIntoView({ behavior: 'smooth' });
      }
    }, timeoutms);
  }

  private setInputText(text: string) {
    /* Handle the procedural tasks that need to happen when the input changes */
    this.chatInput.nativeElement.value = text;
    this.commands.filter(text);
    setTimeout(() => {
      this.userInput.next(text);
    });
  }

  private setCommandBox() {
    /* Ensures visual consistency between the command palette and the chat input element */
    const bodyRect = document.body.getBoundingClientRect();
    const inputRect = this.chatInput.nativeElement.getBoundingClientRect();
    const commandHeight = this.chatInput.nativeElement.offsetHeight;
    const commandBottom = bodyRect.height - inputRect.top;

    // If the command box would extend beyond the bottom of the window, move it up
    if (commandBottom + commandHeight > bodyRect.height) {
      this.commandBottom = `${bodyRect.height - commandHeight}px`;
    } else {
      this.commandBottom = `${commandBottom}px`;
    }

    // The command box should be the same width as the input element
    const chatBar = document.getElementById('chat-bar');
    this.commandWidth = `calc(${chatBar?.offsetWidth}px - 3rem)`;

    // Center the command box above the chat input element
    this.commandLeft = `${inputRect.left}px`;
  }

  focus() {
    this.focusEvent.emit();
  }
}
