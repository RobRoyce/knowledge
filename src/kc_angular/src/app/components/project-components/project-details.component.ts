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

import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { KcProject, ProjectUpdateRequest } from '@app/models/project.model';
import { FormBuilder, FormGroup } from '@angular/forms';
import { skip, Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { EventModel } from '@shared/models/event.model';
import { EventService } from '@services/user-services/event.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { ProjectService } from '@services/factory-services/project.service';
import { PrimeIcons } from 'primeng/api';

@Component({
  selector: 'app-project-details',
  template: `
    <div class="w-full flex-row-center-between pb-3 pt-3 sticky">
      <div class="flex-row-center-start w-full"></div>
      <div class="flex-row-center-end">
        <div *ngIf="saved" class="flex-row-center-start text-primary">
          <div class="pi pi-check"></div>
          <div class="px-3">Saved</div>
        </div>
        <div>
          <button
            pButton
            class="p-button-text p-button-rounded"
            icon="pi pi-times"
            (click)="onClose()"
          ></button>
        </div>
      </div>
    </div>
    <div style="height: calc(100% - 65px); overflow-y: auto">
      <div class="h-full w-full" *ngIf="project">
        <p-scrollPanel
          class="h-full w-full"
          [style]="{ 'max-height': '100%', 'max-width': '80rem' }"
        >
          <div class="h-2rem"></div>
          <form [formGroup]="form">
            <div class="p-fluid grid">
              <div class="col-12 mb-5 flex flex-row">
                <app-icon
                  [icon]="project.icon"
                  (changed)="iconChange($event)"
                ></app-icon>
                <div class="field p-float-label w-full p-fluid ml-4">
                  <input
                    id="title"
                    type="text"
                    pInputText
                    required
                    minlength="3"
                    maxlength="64"
                    formControlName="name"
                  />
                  <label for="title">Title</label>
                  <div
                    *ngIf="
                      form.controls['name'].invalid &&
                      (form.controls['name'].dirty ||
                        form.controls['name'].touched)
                    "
                    class="p-error"
                  >
                    <div *ngIf="form.controls['name'].value.length < 3">
                      Must be between 3 and 64 characters
                    </div>
                    <div *ngIf="form.controls['name'].value.length > 64">
                      Must be 64 or fewer characters
                    </div>
                  </div>
                </div>
              </div>

              <div class="field p-float-label col-12 mb-3">
                <textarea
                  pInputTextarea
                  id="_ksDescription"
                  formControlName="description"
                  [autoResize]="true"
                  [rows]="4"
                  [cols]="30"
                >
                </textarea>
                <label for="_ksDescription">Description</label>
              </div>
            </div>
          </form>

          <div class="p-fluid grid mt-4">
            <div
              *ngIf="project.id"
              class="field p-float-label sm:col-6 md:col-6 lg:col-6 mb-5"
            >
              <input
                id="projectId"
                type="text"
                pInputText
                disabled
                ngModel="{{ project.id.value }}"
              />
              <label for="projectId">Project ID</label>
            </div>

            <div class="field p-float-label sm:col-6 md:col-6 lg:col-6 mb-5">
              <input
                id="parentId"
                type="text"
                pInputText
                disabled
                ngModel="{{ project.parentId | projectName }}"
              />
              <label for="parentId">Parent Project</label>
            </div>
          </div>
          <!--        TODO: Add project timeline-->
          <!--        TODO: Add list of sources-->
          <!--        TODO: Add charts with statistics-->
        </p-scrollPanel>
      </div>
    </div>
    <app-project-breadcrumb
      [projectId]="project.id.value"
      class="w-full p-fluid"
    >
    </app-project-breadcrumb>
  `,
  styles: [],
})
export class ProjectDetailsComponent implements OnInit, OnDestroy {
  @Input() project!: KcProject;

  saved = false;

  form: FormGroup;

  projectEvents: any[] = [];

  private cleanUp: Subject<any> = new Subject<any>();

  constructor(
    private config: DynamicDialogConfig,
    private events: EventService,
    private formBuilder: FormBuilder,
    private notifications: NotificationsService,
    private projects: ProjectService,
    private ref: DynamicDialogRef
  ) {
    this.form = formBuilder.group({
      id: '',
      name: [''],
      description: [''],
    });

    this.form.valueChanges
      .pipe(
        skip(1),
        takeUntil(this.cleanUp),
        debounceTime(1000),
        distinctUntilChanged((prev, curr) => {
          if (curr.name.length < 3) {
            return true;
          }

          return (
            prev.name === curr.name && prev.description === curr.description
          );
        }),
        tap((formValue) => {
          if (this.project) {
            if (!this.project.events) {
              this.project.events = [];
            }

            this.project.name = formValue.name;
            this.project.description = formValue.description;

            const event: EventModel = {
              description: '',
              timestamp: Date(),
              type: 'update',
            };
            this.project.events.push(event);

            this.projects
              .updateProjects([
                {
                  id: this.project.id,
                },
              ])
              .then(() => {
                this.notifications.success(
                  'Project Info',
                  'Project Updated',
                  this.project?.name ?? ''
                );
              });
          }
        })
      )
      .subscribe();
  }

  ngOnInit() {
    if (this.config?.data?.project) {
      this.project = this.config.data.project;
      this.updateForm(this.project);
    }

    if (!this.project.icon) {
      this.project.icon = PrimeIcons.FOLDER;
    }
  }

  ngOnDestroy() {
    this.cleanUp.next({});
    this.cleanUp.complete();
  }

  onClose() {
    this.ref.close();
  }

  updateForm(project: KcProject) {
    this.form.patchValue({
      id: project.id.value,
      name: project.name,
      description: project.description,
    });

    this.projectEvents = this.events.fromProject(project);
  }

  iconChange($event: any) {
    this.project.icon = $event;
    const update: ProjectUpdateRequest = {
      id: this.project.id,
    };
    this.projects.updateProjects([update]);
  }
}
