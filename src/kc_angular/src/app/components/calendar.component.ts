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
import { Component, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectService } from '@services/factory-services/project.service';
import { Observable, Subscription } from 'rxjs';
import { KcProject } from '../models/project.model';
import { KnowledgeSource } from '../models/knowledge.source.model';
import { KcCardRequest } from './project-components/project-calendar.component';
import { DataService } from '@services/user-services/data.service';
import { OverlayPanel } from 'primeng/overlaypanel';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { TopicService } from '@services/user-services/topic.service';
import { take, tap } from 'rxjs/operators';

@Component({
  selector: 'app-calendar',
  template: `
    <div class="h-full w-full flex-col-center-center">
      <div
        class="width-constrained w-full h-full flex-col-center-between surface-section p-4"
      >
        <app-project-calendar
          [kcProject]="project | async"
          [ksList]="ksList | async"
          (onKsClick)="onKsClick($event)"
          (onProjectClick)="onProjectClick()"
          class="w-full h-full"
        >
        </app-project-calendar>
      </div>
    </div>

    <p-overlayPanel #calendarOverlay>
      <div class="max-w-30rem">
        <app-ks-card
          *ngIf="selectedKs"
          (onRemove)="onRemove($event)"
          (onEdit)="onEdit($event)"
          (onOpen)="onOpen($event)"
          (onChat)="onChat($event)"
          (onPreview)="onPreview($event)"
          (onTopicClick)="onTopicClick($event)"
          [ks]="selectedKs"
          [showChat]="true"
        >
        </app-ks-card>
      </div>
    </p-overlayPanel>
  `,
  styles: [],
})
export class CalendarComponent implements OnDestroy {
  @ViewChild('calendarOverlay') calendarOverlay!: OverlayPanel;

  projectId = '';

  ksList: Observable<KnowledgeSource[]>;

  project: Observable<KcProject | null>;

  selectedKs?: KnowledgeSource;

  selectedProject?: KcProject;

  subscription: Subscription;

  constructor(
    private command: KsCommandService,
    private data: DataService,
    private projects: ProjectService,
    private route: ActivatedRoute,
    private topics: TopicService
  ) {
    this.ksList = this.data.ksList;
    this.subscription = this.route.paramMap.subscribe((params) => {
      this.projectId = params.get('projectId') ?? '';
    });
    this.project = this.projects.currentProject;
    this.projectId = this.route.snapshot.params.projectId ?? '';
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  onKsClick($event: KcCardRequest) {
    if (!$event.ksId) {
      return;
    }

    this.calendarOverlay.hide();
    this.selectedKs = undefined;

    this.ksList
      .pipe(
        take(1),
        tap((ks) => {
          const selected = ks.find((k) => k.id.value === $event.ksId?.value);
          if (selected) this.selectedKs = selected;

          setTimeout(() => {
            this.calendarOverlay.show($event.event, $event.element);
          });
        })
      )
      .subscribe();
  }

  onProjectClick() {
    if (this.calendarOverlay?.overlayVisible) {
      this.calendarOverlay.hide();
    }

    this.selectedKs = undefined;
  }

  onRemove(ks: KnowledgeSource) {
    this.command.remove([ks]);
  }

  onEdit(ks: KnowledgeSource) {
    this.command.detail(ks);
  }

  onOpen(ks: KnowledgeSource) {
    this.command.open(ks);
  }

  onChat(ks: KnowledgeSource) {
    this.command.chat(ks);
  }

  onPreview(ks: KnowledgeSource) {
    this.command.preview(ks);
  }

  onTopicClick($event: { ks: KnowledgeSource; topic: string }) {
    this.topics.search($event.topic);
  }
}
