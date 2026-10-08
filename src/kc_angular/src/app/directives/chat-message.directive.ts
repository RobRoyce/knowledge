/*
 * Copyright (c) 2024 Rob Royce
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
  Directive,
  Input,
  OnChanges,
  SimpleChanges,
  ViewContainerRef,
} from '@angular/core';
import { AgentType, ChatMessage } from '@app/models/chat.model';
import { QuizMessage } from '@components/chat-components/message-templates/quiz.message';
import { TopicMessage } from '@components/chat-components/message-templates/topic.message';
import { ChatMessageComponent } from '@components/chat-components/chat.message.component';
import { CategorizeMessage } from '@components/chat-components/message-templates/categorize.message';

@Directive({
  selector: '[chatMessage]',
})
export class ChatMessageDirective implements OnChanges {
  @Input() message!: ChatMessage;

  constructor(public viewContainerRef: ViewContainerRef) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.message) {
      this.createComponent(this.message);
    }
  }

  private createComponent(message: ChatMessage) {
    // Create a component based on the message type
    // Use the viewContainerRef to create the component
    let componentRef;
    const parentDiv = this.viewContainerRef.element.nativeElement.parentElement;

    switch (message.sender) {
      case AgentType.Category:
        componentRef = this.viewContainerRef.createComponent(CategorizeMessage);
        componentRef.location.nativeElement.classList.add('p-4', 'text-color');
        parentDiv.classList.add(
          'bg-primary-reverse',
          'border-1',
          'border-round-3xl',
          'flex-row-center-center',
          'hover:shadow-3',
          'm-4',
          'shadow-1',
          'surface-border',
          'w-full',
          'overflow-hidden'
        );
        break;
      case AgentType.Quiz:
        componentRef = this.viewContainerRef.createComponent(QuizMessage);
        parentDiv.classList.add(
          'bg-primary-reverse',
          'border-1',
          'border-round-3xl',
          'flex-row-center-center',
          'hover:shadow-3',
          'm-4',
          'shadow-1',
          'surface-border',
          'w-full',
          'overflow-hidden',
          'h-26rem'
        );
        break;
      case AgentType.Topic:
        componentRef = this.viewContainerRef.createComponent(TopicMessage);
        parentDiv.classList.add(
          'bg-primary-reverse',
          'border-1',
          'border-round-3xl',
          'flex-row-center-center',
          'hover:shadow-3',
          'm-4',
          'shadow-1',
          'surface-border',
          'w-full',
          'overflow-hidden'
        );
        break;
      case AgentType.User:
        componentRef =
          this.viewContainerRef.createComponent(ChatMessageComponent);
        componentRef.location.nativeElement.classList.add(
          'shadow-1',
          'hover:shadow-3',
          'p-4',
          'border-round-3xl'
        );
        parentDiv.classList.add('flex-row-center-end', 'px-3');
        break;
      default:
        componentRef =
          this.viewContainerRef.createComponent(ChatMessageComponent);
        componentRef.location.nativeElement.classList.add(
          'shadow-1',
          'hover:shadow-3',
          'p-4',
          'border-round-3xl'
        );
    }
    componentRef.setInput('message', message);

    return componentRef;
  }
}
