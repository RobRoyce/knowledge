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

import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ChatMessage } from '@app/models/chat.model';
import {
  ProjectIdentifiers,
  ProjectService,
} from '@services/factory-services/project.service';
import { take } from 'rxjs/operators';
import { ProjectTreeNode } from '@app/models/project.tree.model';
import { KcProject, ProjectCreationRequest } from '@app/models/project.model';
import { ChatService } from '@services/chat-services/chat.service';
import { IngestService } from '@services/ingest-services/ingest.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { select } from 'async';

interface ProjectSuggestion {
  project: KcProject | null | undefined;
  lineage: string[];
  details: string;
  ancestors: ProjectIdentifiers[];
}

@Component({
  template: `
    <div>
      <div class="text-2xl font-bold mb-3 text-center">Suggested Projects</div>
      <div class="text-sm mb-3">
        The following projects were suggested for this source:
      </div>
    </div>
    <div class="flex-col-between gap-3 w-full">
      <div
        *ngFor="let p of projects"
        class="flex-row-center-start surface-card hover:surface-hover py-2 px-4 border-round-2xl hover:shadow-1"
        [class.border-primary]="selectedSuggestion === p.lineage.join(' > ')"
        [class.border-1]="selectedSuggestion === p.lineage.join(' > ')"
      >
        <p-radioButton
          [(ngModel)]="selectedSuggestion"
          (ngModelChange)="setLabel(p)"
          [inputId]="p.details"
          [value]="p.lineage.join(' > ')"
          class="cursor-pointer"
        >
        </p-radioButton>
        <label [for]="p.details" class="mx-5 cursor-pointer w-full">
          <div class="flex">
            <div *ngFor="let ancestor of p.lineage; let i = index" class="flex">
              <div class="flex-row-center-center">
                <div *ngIf="i > 0 && i < p.lineage.length" class="text-lg">
                  &nbsp;>&nbsp;
                </div>

                <div class="text-lg">{{ ancestor }}</div>
              </div>

              <!-- If the ancestor is not in the list of ancestors, add a div that says NEW-->
              <div
                *ngIf="i >= p.ancestors.length"
                class="text-primary text-xs font-bold"
                pTooltip="This project does not exist yet."
                tooltipPosition="top"
              >
                NEW
              </div>
            </div>
          </div>
          <div class="text-500">
            {{ p.details }}
          </div>
        </label>
      </div>
    </div>
    <div class="mt-3 flex-row-center-center">
      <button
        [disabled]="!selectedSuggestion"
        pButton
        [label]="buttonLabel | truncate : [18]"
        class="w-full max-w-20rem"
        (click)="addProject()"
      ></button>
    </div>
  `,
  selector: 'chat-categorize',
  styles: [
    `
      :host {
        justify-content: center;
        align-content: center;
      }
    `,
  ],
})
export class CategorizeMessage implements OnInit {
  @Input() message!: ChatMessage;

  @Output() add = new EventEmitter<KcProject>();

  @Output() create = new EventEmitter<string>();

  projects: ProjectSuggestion[] = [];

  lines: string[] = [];

  selectedSuggestion = undefined;

  buttonLabel = 'Add';

  constructor(
    private service: ProjectService,
    private chat: ChatService,
    private ingest: IngestService,
    private notify: NotificationsService
  ) {}

  ngOnInit() {
    this.parseMessage(this.message);
  }

  parseMessage(message: ChatMessage) {
    // Suggested projects are formatted as follows:
    // - Root Project > Subproject > ... > Final Project
    // The message will contain at least one project suggestion

    // Get all lines that start with a dash
    const lines = message.text
      .split('\n')
      .filter((line) => line.startsWith('-'))
      .map((line) => line.replace('-', '').trim());

    this.lines = lines;

    // Find the project by searching for the root project
    this.service.projectTree.pipe(take(1)).subscribe((tree) => {
      for (const line of lines) {
        const parts = line.split(':');
        const lineage = parts[0]
          .trim()
          .split('>')
          .map((project) => project.trim());

        let details = parts[1]?.trim() ?? null;
        details = details?.charAt(0).toUpperCase() + details?.slice(1);

        const project = this.find(tree, lineage);
        const ancestors = this.service.getAncestors(project?.id.value ?? '');

        this.projects.push({
          project:
            project?.name === lineage[lineage.length - 1] ? project : null,
          lineage,
          details: details,
          ancestors: ancestors ?? [],
        });
      }

      if (this.projects.length === 0) {
        this.notify.error(
          'Categorize Message',
          'Error parsing categories.',
          'The suggested proejcts message could not be parsed (see console for details).',
          'toast'
        );
        console.log('Error parsing message', message);
      }
    });
  }

  private find(
    root: ProjectTreeNode[],
    lineage: string[],
    last?: ProjectTreeNode
  ): KcProject | null | undefined {
    // Recursively search for the projects in the lineage until we find the final project
    const project = lineage[0];
    const subprojects = lineage.slice(1);

    // Find the node, ignoring case
    const node = root.find(
      (node) => node.name.toLowerCase() === project.toLowerCase()
    );

    if (!node) {
      if (last) {
        return this.service.getProject(last.id);
      } else {
        return null;
      }
    } else {
      if (subprojects.length === 0) {
        return this.service.getProject(node.id);
      } else {
        return this.find(node.subprojects, subprojects, node);
      }
    }
  }

  addProject() {
    // Find the project suggestion that matches the selected suggestion
    const suggestion = this.projects.find(
      (s) => s.lineage.join(' > ') === this.selectedSuggestion
    );

    if (!suggestion) {
      console.warn('No suggestion selected');
      return;
    }

    // If the project does not exist, create it
    if (!suggestion.project) {
      this.createProjects(suggestion.lineage, suggestion.ancestors).then(
        (parent) => {
          this.addSource(parent);
        }
      );
    } else {
      // Otherwise, add the source to the project
      this.addSource({
        id: suggestion.project.id.value,
        title: suggestion.project.name,
      });
    }
  }

  setLabel(project: ProjectSuggestion) {
    this.buttonLabel = project.project
      ? `Add to ${project.project.name}`
      : 'Create and Add';
  }

  private async addSource(project: ProjectIdentifiers) {
    this.chat.target$.pipe(take(1)).subscribe((target) => {
      if (!target.source) {
        console.warn('No source selected');
        return;
      }

      const source = target.source;

      if (source.associatedProject.value.trim().length > 0) {
        // If the Source is already in a project, we need to move it
        this.service.updateProjects([
          {
            id: source.associatedProject,
            moveKnowledgeSource: {
              ks: source,
              new: { value: project.id },
            },
          },
        ]);
      } else {
        // Otherwise it must be in the inbox
        this.service
          .updateProjects([
            {
              id: { value: project.id },
              addKnowledgeSource: [source],
            },
          ])
          .then(() => {
            setTimeout(() => {
              this.ingest.add(source);
              this.service.setCurrentProject(project.id);
            }, 500);
          });
      }
    });
  }

  private async createProjects(
    lineage: string[],
    ancestors: ProjectIdentifiers[]
  ) {
    /**
     * Create the projects in the lineage that do not exist
     * @param lineage The lineage of the project to create, starting with the root project
     * @param ancestors The ancestors of the project that already exist
     */
    let parent = ancestors[ancestors.length - 1] ?? null;

    for (let i = ancestors.length; i < lineage.length; i++) {
      const name = lineage[i];

      const request: ProjectCreationRequest = {
        authors: [],
        calendar: { events: [], start: null, end: null },
        description: '',
        knowledgeSource: [],
        name: name,
        parentId: { value: parent?.id ?? '' },
        sources: [],
        subProjects: [],
        topics: [],
        type: 'default',
      };
      const newProject = await this.service.newProject(request);
      parent = { id: newProject.id.value, title: newProject.name };

      // Wait for 250 ms to allow the project to be created
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return parent;
  }

  protected readonly select = select;
}
