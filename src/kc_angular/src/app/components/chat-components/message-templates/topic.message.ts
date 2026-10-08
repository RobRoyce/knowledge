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

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { fadeIn } from '@app/animations';
import { ChatMessage } from '@app/models/chat.model';
import { ChatService } from '@services/chat-services/chat.service';
import { KcProject } from '@app/models/project.model';

export interface TopicDetails {
  topic: string;
  description?: string;
  added?: boolean;
  keywords?: string[];
  passages?: string[];
  projects?: KcProject[];
}

@Component({
  selector: 'chat-topic',
  template: `
    <div class="p-4 shadow-1 hover:shadow-3 text-color">
      <div class="flex-col-center-between">
        <div>
          <div class="text-2xl font-bold mb-3 text-center">Topics</div>
          <div class="flex-row-center-center grid">
            <div *ngFor="let topic of topics" class="m-2 p-2">
              <div
                class="border-round-3xl shadow-4 hover:shadow-6"
                [class.shadow-6]="description === topic.description"
              >
                <p-chip
                  class="cursor-pointer"
                  [styleClass]="
                    topic.added
                      ? 'p-button p-button-info hover:text-primary hover:surface-hover'
                      : topic.description === description
                      ? 'p-button hover:surface-hover'
                      : 'hover:surface-hover'
                  "
                >
                  <div class="flex-row-center-between">
                    <div
                      class="flex-row-center-center"
                      (click)="onClick(topic)"
                    >
                      <div class="pi pi-tag"></div>
                      <div class="p-2 select-none font-bold">
                        {{ topic.topic }}
                      </div>
                    </div>

                    <div
                      class="pi pi-plus-circle"
                      pTooltip="Add to Source topics"
                      tooltipPosition="top"
                      [tooltipOptions]="{
                        showDelay: 1000
                      }"
                      (click)="addTopic(topic)"
                    ></div>
                  </div>
                </p-chip>
              </div>
            </div>
          </div>
        </div>
        <div
          *ngIf="description; else noDescription"
          class="text-center text-lg flex-col-center-center h-4rem"
        >
          {{ description }}
        </div>
        <ng-template #noDescription>
          <div class="text-600 h-4rem flex-col-center-center">
            Click on a topic to learn more
          </div>
        </ng-template>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        width: 100%;
      }
    `,
  ],
  animations: [fadeIn],
})
export class TopicMessage implements OnChanges {
  @Input() message!: ChatMessage;

  topics: TopicDetails[] = [];

  description?: string = '';

  constructor(private chat: ChatService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.message) {
      this.topics = this.parseTopics(this.message.text);

      for (const topic of this.topics) {
        topic.added =
          this.message.source?.topics?.includes(topic.topic) ||
          this.message.project?.topics?.includes(topic.topic);
      }

      setTimeout(() => {
        this.onClick(this.topics[0]);
      });
    }
  }

  private parseTopics(text: string): TopicDetails[] {
    const details: TopicDetails[] = [];
    let topics: string[] = text.split('\n');

    // Filter out empty strings
    topics = topics.filter(
      (topic) => topic.trim() !== '' && topic.startsWith('-')
    );

    for (const topic of topics) {
      const split = topic.split(':');
      const topicName = split[0].trim().substring(1).trim();
      const description = split[1]?.trim() ?? '';
      details.push({ topic: topicName, description });
    }

    return details;
  }

  addTopic(topic: TopicDetails) {
    topic.added = true;
    this.chat.addTopic(topic.topic);
  }

  onClick(topic: TopicDetails) {
    this.description =
      this.description === topic?.description ? '' : topic?.description;
  }
}
