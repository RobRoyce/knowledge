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

import { BehaviorSubject, Observable } from 'rxjs';
import { EventModel } from '@shared/models/event.model';
import { Injectable } from '@angular/core';
import {
  KcProject,
  ProjectCreationRequest,
  ProjectUpdateRequest,
} from '@app/models/project.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { NotificationsService } from '@services/user-services/notifications.service';
import { ProjectTree, ProjectTreeNode } from '@app/models/project.tree.model';
import { StorageService } from '@services/ipc-services/storage.service';
import { UUID } from '@shared/models/uuid.model';
import { UuidService } from '@services/ipc-services/uuid.service';

export interface ProjectIdentifiers {
  id: string;
  title: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private allProjects: BehaviorSubject<ProjectTreeNode[]> = new BehaviorSubject<
    ProjectTreeNode[]
  >([]);
  projectTree: Observable<ProjectTreeNode[]> = this.allProjects.asObservable();

  private selectedSource = new BehaviorSubject<KcProject | null>(null);
  currentProject = this.selectedSource.asObservable();

  private allProjectModels: BehaviorSubject<KcProject[]> = new BehaviorSubject<
    KcProject[]
  >([]);
  projects = this.allProjectModels.asObservable();

  private addedSources = new BehaviorSubject<KnowledgeSource[]>([]);
  newSources = this.addedSources.asObservable();

  private tree: ProjectTree;
  private projectSource: KcProject[] = [];

  constructor(
    private storageService: StorageService,
    private uuidService: UuidService,
    private notifications: NotificationsService
  ) {
    this.allProjects = new BehaviorSubject<ProjectTreeNode[]>([]);
    this.projectTree = this.allProjects.asObservable();
    this.tree = new ProjectTree();
    this.projectSource = [];
    this.refreshTree();
  }

  get ProjectIdentifiers(): ProjectIdentifiers[] {
    const ids: ProjectIdentifiers[] = [];
    for (const project of this.projectSource) {
      const id: ProjectIdentifiers = {
        id: project.id.value,
        title: project.name,
      };
      ids.push(id);
    }
    return ids;
  }

  async refreshTree() {
    this.tree = new ProjectTree();

    this.getAllProjects().then(
      (projects: KcProject[]) => {
        this.projectSource = [];
        for (const project of projects) {
          if (!project.parentId?.value) {
            this.projectSource.unshift(project);
          } else {
            this.projectSource.push(project);
          }
        }
        this.allProjectModels.next(this.projectSource);
        this.buildTree(this.projectSource);
        this.initialize();
      },
      (error) => {
        console.error('ProjectService: Unable to get projects from source...');
        console.error(error);
      }
    );
  }

  deleteProject(id: UUID | string) {
    if (typeof id !== 'string') {
      id = id.value;
    }
    this.recursiveDelete(id);

    // If we are deleting the active project
    if (this.storageService.kcCurrentProject === id) {
      // If there are other projects available, choose the first one as active
      if (this.projectSource.length > 0) {
        this.storageService.kcCurrentProject = this.projectSource[0].id.value;
      }

      // Otherwise there are no other projects so set current to null
      else {
        this.storageService.kcCurrentProject = null;
      }
    }

    // Set default project if no projects left
    if (this.projectSource.length === 0) {
      this.selectedSource.next(null);
    }

    // Refresh tree with new data
    this.refreshTree();
  }

  async getAllProjects(): Promise<KcProject[]> {
    return new Promise((resolve) => {
      resolve(this.storageService.getProjects());
    });
  }

  async newProject(project: ProjectCreationRequest) {
    // Generate UUID
    let uuid: UUID[] = this.uuidService.generate(1);
    const projectId: UUID = uuid[0];

    const newProject: KcProject = {
      calendar: project.calendar
        ? project.calendar
        : { events: [], start: null, end: null },
      dateCreated: new Date(),
      dateAccessed: new Date(),
      dateModified: new Date(),
      authors: project.authors,
      description: project.description,
      events: [],
      expanded: true,
      id: projectId,

      // TODO: this should be removed
      knowledgeSource: project.knowledgeSource,

      sources: [],
      name: project.name,
      parentId: project.parentId,
      subprojects: [],
      topics: project.topics,
      type: project.type,
      icon: project.icon,
    };

    const subProjects: KcProject[] = [];

    if (project.subProjects && project.subProjects.length > 0) {
      uuid = this.uuidService.generate(project.subProjects.length);

      for (let i = 0; i < project.subProjects.length; i++) {
        const subRequest = project.subProjects[i];
        const newSubProject = {
          authors: [],
          calendar: { events: [], start: null, end: null },
          dateAccessed: new Date(),
          dateCreated: new Date(),
          dateModified: new Date(),
          description: subRequest.description,
          events: [],
          expanded: true,
          id: uuid[i],

          // TODO: this should be removed
          knowledgeSource: subRequest.knowledgeSource,

          sources: [],
          name: subRequest.name,
          parentId: subRequest.parentId,
          subprojects: [],
          topics: subRequest.topics,
          type: subRequest.type,
        };

        subProjects.push(newSubProject);
        newProject.subprojects.push(newSubProject.id.value);
      }
    }

    this.projectSource.push(newProject);
    await this.storageService.saveProject(newProject);

    for (const subProject of subProjects) {
      this.projectSource.push(subProject);
      await this.storageService.saveProject(subProject);
    }

    if (project.parentId?.value) {
      const parent = this.getProject(project.parentId.value);

      if (parent && parent.subprojects && parent.subprojects.length > 0) {
        parent.subprojects.push(newProject.id.value);
      } else if (parent) {
        parent.subprojects = [newProject.id.value];
      } else {
        console.error(
          'Parent project not found <newProject>: ',
          project.parentId
        );
      }
      if (parent) {
        parent.expanded = true;
        await this.storageService.saveProject(parent);
      }
    }
    this.storageService.kcCurrentProject = newProject.id.value;
    this.refreshTree();
    return newProject;
  }

  /**
   * To update a project that was already modified, submit an update with only the ID.
   *
   * Otherwise, include any of the valid ProjectUpdateRequest fields.
   * e.g. create an update with ID (required) and an array removeKnowledgeSource[], etc.
   * @param updates An array of ProjectUpdateRequest objects
   */
  async updateProjects(updates: ProjectUpdateRequest[]) {
    for (const update of updates) {
      // Make sure the target project exists
      let target = this.projectSource.find(
        (p) => p.id.value === update.id.value
      );
      if (!target) {
        console.error(
          `Attempting to update non-existant project with ID:`,
          update.id.value
        );
        return;
      }

      // Description accumulator, used by each operation to describe what actions occured in a meaningful way.
      // TODO: make sure all operations are accounted for before commiting this...
      let description = '';
      const setDescription = (operation: string, summary: string) => {
        this.notifications.debug(
          'ProjectService',
          `Update Operation: ${operation}`,
          summary
        );
        description += `${operation}: ${summary}, `;
      };

      if (update.name && update.name !== target.name) {
        setDescription('Name', `from ${target.name} to ${update.name}`);
        target.name = update.name;
      }

      // Handle parentId update
      if (update.parentId) {
        const next = this.projectSource.find(
          (p) => p.id.value === update.parentId
        );
        const current = target?.parentId
          ? this.projectSource.find(
              (p) => p.id.value === target!.parentId.value
            )
          : undefined;
        if (next) {
          if (!current) {
            // Parent
            // TODO: finish this after working on getting the app to work properly again
          }
          setDescription('Move', `from ${current?.name ?? ''} to ${next.name}`);
          target.parentId = { value: update.parentId };
        }
      }

      // Handle add subproject update
      if (update.addSubprojects && update.addSubprojects.length) {
        if (target.subprojects) {
          for (const subp of update.addSubprojects) {
            target.subprojects.push(subp);
          }
          setDescription(
            'Add Subprojects',
            `${update.addSubprojects.length} subprojects added`
          );
        }
      }

      // Handle remove subproject update
      if (update.removeSubprojects && update.removeSubprojects.length) {
        for (const subp of update.removeSubprojects) {
          if (target.subprojects) {
            target.subprojects = target.subprojects.filter((s) => s !== subp);
          }
        }
        setDescription(
          'Remove Subprojects',
          `${update.removeSubprojects.length} subprojects removed`
        );
      }

      // Handle knowledge source removal
      if (update.removeKnowledgeSource && update.removeKnowledgeSource.length) {
        target = this.removeKnowledgeSource(
          target,
          update.removeKnowledgeSource
        );
      }

      // Handle moving knowledge source from project to project
      if (update.moveKnowledgeSource) {
        target = this.moveKnowledgeSource(target, update.moveKnowledgeSource);
      }

      // Handle knowledge source insertion
      if (update.addKnowledgeSource && update.addKnowledgeSource.length) {
        target = this.addKnowledgeSource(target, update.addKnowledgeSource);
      }

      // Handle knowledge source update
      if (
        update.updateKnowledgeSource &&
        update.updateKnowledgeSource.length > 0
      ) {
        target = this.updateKnowledgeSource(
          target,
          update.updateKnowledgeSource
        );
      }

      // Handle topic insertion
      if (update.addTopic && update.addTopic.length > 0) {
        if (!target.topics) target.topics = [];
        for (const topic of update.addTopic) target.topics.push(topic);
      }

      // Handle topic removal
      if (update.removeTopic && update.removeTopic.length > 0) {
        if (target.topics) {
          const removeTopics: string[] = update.removeTopic;
          for (const topic of removeTopics) {
            target.topics = target.topics.filter((t) => t !== topic);
          }
        }
      }

      if (update.overWriteTopics && update.overWriteTopics.length > 0) {
        target.topics = update.overWriteTopics;
      }

      const event: EventModel = {
        description: description,
        type: 'update',
        timestamp: Date(),
      };
      target.calendar.events.push(event);
      target.dateModified = new Date();

      if (target.knowledgeSource) {
        for (const ks of target.knowledgeSource) {
          ks.associatedProject = target.id;
        }
      }

      // Persist project to storage system
      await this.storageService.updateProject(target);

      this.projectSource = this.projectSource.filter(
        (p) => p.id.value !== update.id.value
      );
      this.projectSource.push(target);
    }

    this.refreshTree();
  }

  setCurrentProject(id: string | null): void {
    if (!id) {
      this.setDefaultProject();
      return;
    }

    const project = this.projectSource.find((p) => p.id.value === id);

    if (project) {
      // Update access date any time a project is viewed
      project.dateAccessed = new Date();

      // Set current project and notify subscribers
      this.selectedSource.next(project);

      // Persist project to storage system
      this.storageService.updateProject(project);

      // Persist active project ID to storage system
      this.storageService.kcCurrentProject = project.id.value;
    } else {
      this.setDefaultProject();
      console.error(
        'ProjectService failed to find ID in setCurrentProject: ',
        id
      );
    }

    this.scrollToActive(1000);
  }

  getCurrentProjectId(): UUID | null {
    return this.selectedSource.value?.id ?? null;
  }

  getProject(id: UUID | string): KcProject | undefined {
    if (typeof id !== 'string') {
      id = id.value;
    }

    for (const project of this.projectSource) {
      if (project.id.value === id) return project;
    }
    return undefined;
  }

  getAncestors(id: string): ProjectIdentifiers[] {
    const project = this.projectSource.find((k) => k.id.value === id);
    let ret: ProjectIdentifiers[] = [];
    if (!project) {
      console.error(
        "Attempting to find project that doesn't exist with ID: ",
        id
      );
      return ret;
    }

    ret.push({ id: project.id.value, title: project.name });
    if (project.parentId && project.parentId.value !== '') {
      ret = [...this.getAncestors(project.parentId.value), ...ret];
    }
    return ret;
  }

  scrollToActive(timeout = 0) {
    setTimeout(() => {
      const classElement = document.getElementsByClassName(
        'p-treenode-content p-treenode-selectable p-highlight'
      );
      if (classElement.length > 0) {
        classElement[0].scrollIntoView({ behavior: 'smooth' });
      }
    }, timeout);
  }

  private setDefaultProject() {
    if (this.projectSource.length > 0) {
      this.selectedSource.next(this.projectSource[0]);
      this.storageService.kcCurrentProject = this.projectSource[0].id.value;
    } else {
      this.selectedSource.next(null);
      this.storageService.kcCurrentProject = null;
    }
  }

  private recursiveDelete(id: string) {
    const project = this.projectSource.find((p) => p.id.value === id);

    if (!project) {
      console.error('Project not found <recursive delete>: ', id);
      return;
    }

    for (const ks of project.knowledgeSource) {
      this.storageService.deleteKnowledgeSource(ks);
    }

    if (project.parentId) {
      const parent = this.projectSource.find(
        (p) => p.id.value === project?.parentId?.value
      );
      if (parent && parent.subprojects) {
        parent.subprojects = parent.subprojects.filter((p) => p !== id);
        this.storageService.updateProject(parent);
      }
    }

    if (project.subprojects && project.subprojects.length > 0) {
      for (const subProject of project.subprojects) {
        this.recursiveDelete(subProject);
      }
    }

    this.projectSource = this.projectSource.filter(
      (item) => item.id.value !== id
    );
    this.notifications.warn(
      'Project Service',
      'Deleting Project',
      project.name
    );
    this.storageService.deleteProject(id);
  }

  private initialize(): void {
    const data = this.buildFileTree(this.tree.asArray(), 0);
    this.allProjects.next(data);
    const currentProject = this.storageService.kcCurrentProject;

    if (currentProject) {
      const found = this.projectSource.find(
        (p) => p.id.value === currentProject
      );
      if (found) this.setCurrentProject(currentProject);
      else this.setCurrentProject(null);
    }
  }

  private buildFileTree(
    source: ProjectTreeNode[],
    level: number
  ): ProjectTreeNode[] {
    const tree: ProjectTreeNode[] = [];

    for (const node of source) {
      if (node.subprojects.length > 0) {
        this.buildFileTree(node.subprojects, level + 1);
      }
      tree.push(node);
    }
    return tree;
  }

  /**
   * This function takes a flat list of Projects and builds a tree structure
   * using the subprojects field.
   */
  private buildTree(input: KcProject[]): void {
    const tree = new ProjectTree();
    const roots = input.filter((p) => !p.parentId.value);
    let nodes = input.map((p) => this.modelToNode(p));

    // Remove any nodes that are not in the root list
    nodes = nodes.filter((n) => roots.find((r) => r.id.value === n.id));

    for (const node of nodes) {
      tree.add(node, node.parentId);
    }
    this.tree = tree;
  }

  private modelToNode(model: KcProject): ProjectTreeNode {
    const node = new ProjectTreeNode(
      model.name,
      model.id.value,
      'project',
      [],
      model.expanded,
      model.icon || 'pi pi-folder'
    );

    if (model.subprojects && model.subprojects.length > 0) {
      const subprojectModels: ProjectTreeNode[] = [];
      for (const s of model.subprojects) {
        const sub = this.getProject(s);
        if (sub) {
          const subprojectModel = this.modelToNode(sub);
          subprojectModel.parentId = model.id.value;
          subprojectModels.push(subprojectModel);
        }
      }
      node.subprojects = subprojectModels;
    }

    return node;
  }

  private addKnowledgeSource(
    project: KcProject,
    add: KnowledgeSource[]
  ): KcProject {
    // Assume knowledge source icons have not been persisted to local memory yet...
    // TODO: this would be better suited for StorageService
    for (const ks of add) {
      if (ks.ingestType === 'file') {
        localStorage.setItem(`icon-${ks.id.value}`, ks.icon);

        if (
          ks.importMethod === 'autoscan' &&
          typeof ks.accessLink === 'string'
        ) {
          ks.accessLink = ks.accessLink.replace('pending-', '');
        }
      }
    }

    if (!project.knowledgeSource || project.knowledgeSource.length === 0) {
      project.knowledgeSource = add;
    } else {
      const ksList: KnowledgeSource[] = [];
      for (const addKs of add) {
        const found = project.knowledgeSource.find(
          (k) => k.id.value === addKs.id.value
        );
        if (!found) {
          addKs.associatedProject = project.id;
          ksList.push(addKs);
        } else
          console.warn(
            'ProjectService: Invalid request to add duplicate knowledge source to project ',
            project.name
          );
      }
      project.knowledgeSource = [...project.knowledgeSource, ...ksList];
    }

    this.addedSources.next(add);

    return project;
  }

  private removeKnowledgeSource(
    project: KcProject,
    remove: KnowledgeSource[]
  ): KcProject {
    if (project.knowledgeSource && project.knowledgeSource.length > 0) {
      for (const toRemove of remove) {
        this.storageService.deleteKnowledgeSource(toRemove);
        project.knowledgeSource = project.knowledgeSource.filter(
          (ks) => ks.id.value !== toRemove.id.value
        );
      }
    } else {
      console.error(
        `Attempting to remove ${remove.length} knowledge source(s) from project with no knowledge sources...`
      );
    }
    return project;
  }

  private moveKnowledgeSource(
    project: KcProject,
    move: { ks: KnowledgeSource; new: UUID }
  ): KcProject {
    const newProject = this.projectSource.find(
      (p) => p.id.value === move.new.value
    );
    if (!newProject) {
      return project;
    }
    move.ks.associatedProject = newProject.id;
    if (!move.ks.events) {
      move.ks.events = [];
    }
    move.ks.events.push({
      date: new Date(),
      label: `Moved`,
    });
    newProject.knowledgeSource.push(move.ks);
    this.storageService.updateProject(newProject);

    // Remove ks from old project and return
    project.knowledgeSource = project.knowledgeSource.filter(
      (k) => k.id.value !== move.ks.id.value
    );
    return project;
  }

  private updateKnowledgeSource(
    project: KcProject,
    update: KnowledgeSource[]
  ): KcProject {
    if (project.knowledgeSource && project.knowledgeSource.length > 0) {
      for (const ks of update) {
        // Make sure the item does not already exist in the project
        const idx = project.knowledgeSource.findIndex(
          (p) => p.id.value === ks.id.value
        );
        if (idx >= 0) {
          project.knowledgeSource[idx] = ks;
        } else {
          console.error(
            'Error attempting to update Knowledge Source with no matching ID...'
          );
        }
      }
    }
    return project;
  }
}
