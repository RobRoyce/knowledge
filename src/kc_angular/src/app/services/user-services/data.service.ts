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
import { BehaviorSubject, Subject, tap } from 'rxjs';
import { FaviconService } from '@services/ingest-services/favicon.service';
import { Injectable, OnDestroy } from '@angular/core';
import { KcProject } from '@app/models/project.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { ProjectService } from '@services/factory-services/project.service';
import { SettingsService } from '@services/ipc-services/settings.service';
import { StorageService } from '@services/ipc-services/storage.service';
import { UUID } from '@shared/models/uuid.model';
import { map, takeUntil } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class DataService implements OnDestroy {
  private __allKs = new BehaviorSubject<KnowledgeSource[]>([]);
  allKs = this.__allKs.asObservable();

  private __ksList = new BehaviorSubject<KnowledgeSource[]>([]);
  ksList = this.__ksList.asObservable();

  private __projectList = new BehaviorSubject<KcProject[]>([]);
  projectList = this.__projectList.asObservable();

  private __currentProject = new BehaviorSubject<KcProject | undefined>(
    undefined
  );
  currentProject = this.__currentProject.asObservable();

  private __selectedKs = new BehaviorSubject<KnowledgeSource[]>([]);
  selectKs = this.__selectedKs.asObservable();

  private projectInheritance = true;

  private cleanUp: Subject<any> = new Subject<any>();

  sources = {
    create: async (ksList: KnowledgeSource[]) => {
      return this.sources.update(ksList);
    },

    get: async (uuids: UUID[]): Promise<KnowledgeSource[]> => {
      const ids = new Set(uuids.map((id) => id.value));
      return (await this.storage.ksList()).filter((ks) => ids.has(ks.id.value));
    },

    /**
     * Sources live inside their project. The storage service persists both.
     * Resolves true when every source is saved.
     */
    update: async (ksList: KnowledgeSource[]): Promise<boolean> => {
      let saved = true;
      for (const ks of ksList) {
        const ok = await this._projects.updateProjects([
          {
            id: ks.associatedProject,
            updateKnowledgeSource: [ks],
          },
        ]);
        saved = saved && ok;
      }
      return saved;
    },

    count: this.__ksList.asObservable().pipe(map((sources) => sources.length)),

    typeCount: this.__ksList.asObservable().pipe(
      map((sources) => {
        const counts = {
          websites: 0,
          files: 0,
        };

        sources
          .map((s) => s.ingestType)
          .forEach((ingestType) => {
            if (ingestType === 'website') {
              counts.websites += 1;
            } else if (ingestType === 'file') {
              counts.files += 1;
            }
          });

        return counts;
      })
    ),
  };

  projects = {
    subprojectCount: this.__projectList
      .asObservable()
      .pipe(map((projects) => projects.length)),
  };

  constructor(
    private storage: StorageService,
    private settings: SettingsService,
    private favicon: FaviconService,
    private _projects: ProjectService
  ) {
    settings.app
      .pipe(
        takeUntil(this.cleanUp),
        tap((app) => {
          try {
            this.projectInheritance = app.projects.ksInherit;
          } catch (e) {
            this.projectInheritance = true;
            this.settings.set({ app: { projects: { ksInherit: true } } });
          }
        })
      )
      .subscribe();

    _projects.newSources
      .pipe(
        takeUntil(this.cleanUp),
        tap((sources) => {
          this.__allKs.next(this.__allKs.value.concat(sources));
        })
      )
      .subscribe();

    storage.ksList().then((ksList) => {
      this.favicon.extractFromKsList(ksList).then((ready) => {
        this.__allKs.next(ready);
      });
    });

    this.projectList = _projects.projects;

    _projects.currentProject
      .pipe(
        takeUntil(this.cleanUp),
        tap((project) => {
          if (!project) {
            return;
          }
          let ksList: KnowledgeSource[] = [];
          const projectList: KcProject[] = [project];
          const queue: KcProject[] = [project];

          while (queue.length > 0) {
            const p = queue.shift();
            if (p && p.knowledgeSource) {
              ksList = ksList.concat(p.knowledgeSource);
            }

            if (p && this.projectInheritance) {
              for (const sub of p.subprojects) {
                const s = this._projects.getProject(sub);
                if (s) {
                  queue.push(s);
                  projectList.push(s);
                }
              }
            }
          }

          this.__projectList.next(projectList);

          this.favicon.extractFromKsList(ksList).then((ready) => {
            this.__ksList.next(ready);
          });
        })
      )
      .subscribe();
  }

  ngOnDestroy() {
    this.cleanUp.next({});
    this.cleanUp.complete();
  }
}
