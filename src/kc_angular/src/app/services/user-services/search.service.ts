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
import Fuse from 'fuse.js';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataService } from '@services/user-services/data.service';
import { Injectable } from '@angular/core';
import { KcProject } from '@app/models/project.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { SettingsService } from '@services/ipc-services/settings.service';
import { map, take, tap } from 'rxjs/operators';

export type SearchProvider = {
  id: string;
  title: string;
  iconUrl: string;
};

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  fuzzy = true;
  private providers: SearchProvider[] = [
    {
      id: 'google',
      title: 'Google',
      iconUrl: 'https://www.google.com/favicon.ico',
    },
    {
      id: 'bing',
      title: 'Bing',
      iconUrl: 'https://www.bing.com/sa/simg/favicon-trans-bg-blue-mg.ico',
    },
    {
      id: 'duck',
      title: 'DuckDuckGo',
      iconUrl: 'https://duckduckgo.com/favicon.ico',
    },
  ];

  provider: SearchProvider = this.providers[0];

  private __query = new BehaviorSubject<string>('');
  query = this.__query.asObservable();

  private searchOptions = {
    includeScore: true,
    minMatchCharLength: 3,
    threshold: 0.2,
    ignoreLocation: true,
    findAllMatches: true,
    shouldSort: true,
    useExtendedSearch: true,
    keys: [
      {
        name: 'title',
        weight: 4,
      },
      {
        name: 'topics',
        weight: 2,
      },
      {
        name: 'ingestType',
        weight: 8,
      },
      {
        name: 'description',
        weight: 4,
      },
      {
        name: 'rawText',
        weight: 0.5,
      },
    ],
  };

  constructor(private data: DataService, private settings: SettingsService) {
    settings.search
      .pipe(
        tap((searchSettings) => {
          const provider = this.providers.find(
            (s) => s.id === searchSettings.provider
          );
          if (provider) {
            this.provider = provider;
          }

          if (searchSettings.fuzzy !== undefined) {
            this.fuzzy = searchSettings.fuzzy;
          }

          if (
            searchSettings.threshold !== undefined &&
            searchSettings.threshold >= 0 &&
            searchSettings.threshold <= 100
          ) {
            this.searchOptions.threshold = searchSettings.threshold / 100;
          }
        })
      )
      .subscribe();
  }

  executeSearch(term: string) {
    if (term && term.trim() != '') {
      this.__query.next(term);
    }
  }

  forTerm(
    term: string
  ): Observable<Partial<KnowledgeSource & KcProject & any>[]> {
    return this.data.allKs.pipe(
      take(1),
      map((ks) => {
        return new Fuse(ks, this.searchOptions).search(term);
      })
    );
  }

  show() {
    this.settings.show('search');
  }

  graph(data: any[], term: string) {
    const options = {
      ...this.searchOptions,
      keys: [
        {
          name: 'title',
          weight: 10,
        },
        {
          name: 'name',
          weight: 10,
        },
        {
          name: 'topics',
          weight: 5,
        },
        {
          name: 'description',
          weight: 4,
        },
        {
          name: 'accessLink',
          weight: 4,
        },
      ],
    };
    const fuse = new Fuse(data, options);
    return fuse.search(term);
  }
}
