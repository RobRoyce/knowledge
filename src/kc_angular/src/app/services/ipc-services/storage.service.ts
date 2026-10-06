/*
 * Copyright (c) 2023 Rob Royce
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
import { Injectable } from '@angular/core';
import { KcProject } from '@app/models/project.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { AutoscanService } from '@services/ingest-services/autoscan.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { createBackup, restoreBackup, RestoreResult } from './backup';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  readonly KC_CURRENT_PROJECT = 'current-project';
  private KC_ALL_PROJECT_IDS = 'kc-projects';
  private db = window.localStorage;
  private projectList: KcProject[] | null = null;

  constructor(
    private autoscan: AutoscanService,
    private notifications: NotificationsService
  ) {}

  get projects(): KcProject[] {
    const projects: KcProject[] = [];

    // Get and parse Project list from local storage
    const projectsStr: string | null = this.db.getItem(this.KC_ALL_PROJECT_IDS);
    if (!projectsStr) {
      this.notifications.warn(
        'Storage Service',
        'Project List Unavailable',
        'Project list does not exist in storage system, creating...'
      );
      this.db.setItem(this.KC_ALL_PROJECT_IDS, JSON.stringify([]));
      return projects;
    }

    const projectIds: string[] = JSON.parse(projectsStr);
    if (!projectIds) {
      this.notifications.warn(
        'Storage Service',
        'Invalid Project List',
        'Could not deserialize Project list JSON template... '
      );
      return projects;
    }

    if (projectIds.length === 0) {
      this.notifications.warn('Storage Service', 'No Projects Available', '');
      return projects;
    }

    let pStr: string | null = null;
    let project: KcProject | null = null;

    // Deserialize projects from list of Project IDs
    for (const pId of projectIds) {
      pStr = this.db.getItem(pId);
      if (!pStr) {
        this.notifications.warn('Storage Service', 'Invalid Project Id', pId);
        pStr = null;
        continue;
      }

      project = JSON.parse(pStr);
      if (!project) {
        this.notifications.warn(
          'Storage Service',
          'Invalid Project Object',
          'Could not deserialize Project JSON template...'
        );
        project = null;
        continue;
      }

      // TODO: a fix for refactoring project source list and calendar

      // Pre-populate list of Knowledge Sources for later consumption
      if (project.knowledgeSource && project.knowledgeSource.length > 0) {
        for (const ks of project.knowledgeSource) {
          // TODO : this is a temporary fix after refactoring ks timelines, should be removed eventually...
          if (!ks.dateAccessed) {
            ks.dateAccessed = [];
          }
          if (!ks.dateModified) {
            ks.dateModified = [];
          }
          if (!ks.dateCreated) {
            ks.dateCreated = new Date();
          }

          ks.dateCreated = new Date(ks.dateCreated);

          const accessed = [];
          for (const d of ks.dateAccessed) {
            accessed.push(new Date(d));
          }
          ks.dateAccessed = accessed;

          const modified = [];
          for (const d of ks.dateModified) {
            modified.push(new Date(d));
          }
          ks.dateModified = modified;
          ks.dateDue = ks.dateDue ? new Date(ks.dateDue) : ks.dateDue;
          ks.associatedProject = project.id;
          ks.icon = undefined;
        }
      }
      projects.push(project);
    }

    if (projects.length > 0) {
      this.projectList = projects;
    } else {
      this.projectList = null;
    }

    return projects;
  }

  set projects(projectModels: KcProject[]) {
    let pStr: string;
    const pids = [];
    for (const project of projectModels) {
      pStr = JSON.stringify(project);
      this.db.setItem(project.id.value, pStr);
      pids.push(project.id.value);
    }
    this.db.setItem(this.KC_ALL_PROJECT_IDS, JSON.stringify(pids));
  }

  get kcCurrentProject(): string | null {
    return this.db.getItem(this.KC_CURRENT_PROJECT);
  }

  set kcCurrentProject(id: string | null) {
    if (id === null) {
      this.db.setItem(this.KC_CURRENT_PROJECT, '');
      return;
    }
    this.db.setItem(this.KC_CURRENT_PROJECT, id);
  }

  /**
   * Returns a list of all Knowledge Sources stored in the application
   */
  async ksList() {
    const projectIdsStr: string | null = this.db.getItem(
      this.KC_ALL_PROJECT_IDS
    );

    if (projectIdsStr === null) {
      this.notifications.warn(
        'Storage Service',
        'Project List Unavailable',
        'Project list does not exist in storage system when retrieving source list...'
      );
      return [];
    }

    const projectIds = JSON.parse(projectIdsStr);
    if (!projectIds) {
      this.notifications.warn(
        'Storage Service',
        'Invalid Project List',
        'Could not deserialize Project list JSON template when retrieving source list...'
      );
      return [];
    }

    const ksList: KnowledgeSource[] = [];
    for (const projectId of projectIds) {
      const projectStr = this.db.getItem(projectId);
      if (!projectStr) break;
      const project: KcProject = JSON.parse(projectStr);
      if (project.knowledgeSource)
        for (const ks of project.knowledgeSource) ksList.push(ks);
    }

    return ksList;
  }

  async getProjects() {
    if (this.projectList) return this.projectList;
    return this.projects;
  }

  async saveProject(project: KcProject) {
    // Update project in local cache
    const idx = this.projectList?.findIndex(
      (p) => p.id.value === project.id.value
    );

    if (idx === -1) {
      // If project does not exist in memory, add it
      if (this.projectList) this.projectList.push(project);
      else this.projectList = [project];
    } else {
      // Otherwise update the project in-place
      if (this.projectList && idx && idx) {
        this.projectList[idx] = project;
      }
    }

    // Update the project in database
    await this.updateProject(project);

    // Get list of all project IDs from local storage
    let projectList: string[] = [];
    let projectListString = this.db.getItem(this.KC_ALL_PROJECT_IDS);
    if (projectListString) {
      projectList = JSON.parse(projectListString);
    }

    if (projectList.length > 0) {
      const id = projectList.find((item) => item === project.id.value);
      // Check if project ID is in the list. If it's not, add it, otherwise continue
      if (!id) {
        projectList.push(project.id.value);
        projectListString = JSON.stringify(projectList);
        this.db.setItem(this.KC_ALL_PROJECT_IDS, projectListString);
      }
    } else {
      // If there is no project list, create one and add project to it
      projectList.push(project.id.value);
      projectListString = JSON.stringify(projectList);
      this.db.setItem(this.KC_ALL_PROJECT_IDS, projectListString);
    }
  }

  async saveProjectList(projects: KcProject[]) {
    for (const project of projects) {
      this.saveProject(project);
    }
  }

  async updateProject(project: KcProject) {
    const projectString = JSON.stringify(project);
    this.db.setItem(project.id.value, projectString);
  }

  deleteProject(id: string) {
    if (!this.projectList) {
      this.notifications.warn(
        'Storage Service',
        'Invalid Project',
        'Attempting to delete a project that does not exist in memory...'
      );
      return;
    }

    // Remove project from list
    this.projectList = this.projectList.filter((p) => p.id.value !== id);

    // Remove project saved under this string.
    this.db.removeItem(id);
    this.db.removeItem(`chat-${id}`);

    // Persist changes
    const projectIds: string[] = [];
    for (const project of this.projectList) {
      projectIds.push(project.id.value);
    }
    const projectListStr = JSON.stringify(projectIds);
    this.db.setItem(this.KC_ALL_PROJECT_IDS, projectListStr);
  }

  /**
   * Download a backup of all renderer storage as a JSON file.
   */
  export(appVersion?: string) {
    const backup = createBackup(this.db, appVersion);
    const date = backup.exportedAt.slice(0, 10);
    const blob = new Blob([JSON.stringify(backup)], {
      type: 'application/json;charset=utf-8;',
    });

    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = URL.createObjectURL(blob);
    link.download = `knowledge-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Chromium reads the blob after click() returns
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);

    return Object.keys(backup.data).length;
  }

  /**
   * Restore a backup file. The caller must reload the app afterwards.
   * Throws an Error with a user-facing message if the file is invalid.
   */
  restore(fileText: string): RestoreResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileText);
    } catch {
      throw new Error('The file is not valid JSON.');
    }
    const result = restoreBackup(this.db, parsed);
    this.projectList = null;
    return result;
  }

  deleteKnowledgeSource(ks: KnowledgeSource) {
    this.db.removeItem(`icon-${ks.id.value}`);
    this.db.removeItem(`chat-${ks.id.value}`);

    if (!ks.importMethod) {
      return;
    } else {
      // TODO: autoscan service is only used in this one place here.. should consider moving elsewhere...
      if (ks.importMethod === 'autoscan' && typeof ks.accessLink === 'string') {
        this.autoscan.delete(ks.accessLink);
      }
    }
  }
}
