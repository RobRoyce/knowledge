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
import { ElectronIpcService } from '@services/ipc-services/electron-ipc.service';
import { ExtractorService } from '@services/ingest-services/extractor.service';
import { FaviconService } from '@services/ingest-services/favicon.service';
import { FileSourceModel } from '@shared/models/file.source.model';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  IngestType,
  KnowledgeSource,
  KnowledgeSourceReference,
  SourceModel,
} from '@app/models/knowledge.source.model';
import { Injectable } from '@angular/core';
import { concatMap, Observable, of } from 'rxjs';
import { SettingsService } from '@services/ipc-services/settings.service';
import { UUID } from '@shared/models/uuid.model';
import { UuidService } from '@services/ipc-services/uuid.service';
import { map } from 'rxjs/operators';

export interface KnowledgeSourceFactoryRequest {
  ingestType: IngestType;
  links?: (URL | string)[];
  files?: File[];
  originals?: KnowledgeSource[] | ExampleSource[];
}

export type ExampleSource = {
  title: string;
  accessLink: string;
  topics: string[];
};

@Injectable({
  providedIn: 'root',
})
export class KsFactoryService {
  private provider = 'google';

  constructor(
    private favicon: FaviconService,
    private extractor: ExtractorService,
    private http: HttpClient,
    private settings: SettingsService,
    private ipc: ElectronIpcService,
    private uuid: UuidService
  ) {
    this.settings.search.subscribe((searchSettings) => {
      if (searchSettings.provider) {
        this.provider = searchSettings.provider;
      }
    });
  }

  examples(): Observable<KnowledgeSource[]> {
    return this.http
      .get('https://knowledge-app.s3.us-west-1.amazonaws.com/examples.json', {
        responseType: 'json',
        headers: new HttpHeaders({
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Expires: 'Sat, 01 Jan 2000 00:00:00 GMT',
        }),
      })
      .pipe(
        map((example: any) => {
          let examples: ExampleSource[] = example;
          this.shuffleArray(examples);
          examples = examples.slice(0, 6);
          const requests: KnowledgeSourceFactoryRequest = {
            ingestType: 'website',
            links: examples.map((example) => example.accessLink),
            originals: examples,
          };
          return requests;
        })
      )
      .pipe(
        concatMap((examples: KnowledgeSourceFactoryRequest) => {
          return of(this.many(examples));
        })
      )
      .pipe(concatMap(async (sources) => await sources))
      .pipe(
        map((sources) => {
          sources.map((source) => {
            source.importMethod = 'example';
            return source;
          });
          return sources;
        })
      );
  }

  make(
    type: IngestType,
    link?: URL | string,
    file?: File
  ): Promise<KnowledgeSource> {
    return new Promise<KnowledgeSource>((resolve, reject) => {
      if (type === 'file' && file) {
        if (typeof link === 'string') {
          this.extractFileResource(link, file)
            .then(this.getFileIcon)
            .then((result) => {
              resolve(result);
            });
        }
      }

      if (link) {
        this.extractWebResource(typeof link === 'string' ? new URL(link) : link)
          .then((result) => {
            resolve(result);
          })
          .catch((reason) => {
            reject(reason);
            console.warn('Could not create KS from link because: ', reason);
          });
      }
    });
  }

  async many(
    requests: KnowledgeSourceFactoryRequest
  ): Promise<KnowledgeSource[]> {
    return new Promise<KnowledgeSource[]>((resolve) => {
      const actions: Promise<KnowledgeSource>[] = [];

      if (requests.ingestType === 'file' && requests.files?.length) {
        for (const file of requests.files)
          actions.push(this.extractFileResource((file as any).path, file));

        Promise.all(actions).then((results) => {
          this.getFileIcons(results).then((finalList: KnowledgeSource[]) => {
            if (this.settings.get().ingest.manager.target === 'all') {
              // TODO: move file to managed location...
            }
            if (requests.originals) {
              for (let i = 0; i < requests.originals.length; i++) {
                finalList[i].title = requests.originals[i].title;
                finalList[i].topics = requests.originals[i].topics;
              }
            }
            resolve(finalList);
          });
        });
      }

      if (requests.ingestType !== 'file' && requests.links?.length) {
        for (const link of requests.links) {
          actions.push(this.extractWebResource(new URL(link)));
        }
        Promise.all(actions).then((results) => {
          if (requests.originals) {
            for (let i = 0; i < requests.originals.length; i++) {
              results[i].title = requests.originals[i].title;
              results[i].topics = requests.originals[i].topics;
            }
          }
          resolve(results);
        });
      }
    });
  }

  search(searchTerm?: string): KnowledgeSource {
    let accessLink: string;
    switch (this.provider) {
      case 'google':
        accessLink = searchTerm
          ? `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`
          : `https://www.google.com/`;
        break;
      case 'bing':
        accessLink = searchTerm
          ? `https://www.bing.com/search?q=${encodeURIComponent(searchTerm)}`
          : `https://www.bing.com/`;
        break;
      case 'duck':
        accessLink = searchTerm
          ? `https://duckduckgo.com/?q=${encodeURIComponent(searchTerm)}`
          : `https://duckduckgo.com/`;
        break;
      default:
        accessLink = searchTerm
          ? `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`
          : `https://www.google.com/`;
    }

    return {
      authors: [],
      description: '',
      title: 'Knowledge Search',
      id: { value: 'kc-search-ks' },
      reference: {
        ingestType: 'website',
        source: {
          file: undefined,
          website: {
            accessLink: '',
            metadata: {
              title: 'Knowledge Search',
              icon: '',
            },
          },
        },
        link: '',
      },
      meta: [],
      notes: [],
      ingestType: 'website',
      associatedProject: { value: '' },
      // TODO: remove these to align with new model...
      dateAccessed: [new Date()],
      dateModified: [new Date()],
      dateCreated: new Date(),
      accessLink: accessLink,
      iconUrl: '',
      icon: '',
    };
  }

  private async extractFileResource(
    link: string,
    file: File
  ): Promise<KnowledgeSource> {
    const uuid: UUID = this.uuid.generate(1)[0];
    const fileModel: FileSourceModel = {
      id: uuid,
      filename: file.name.trim(),
      path: (file as any).path,
      size: file.size,
      type: file.type,
      creationTime: Date(),
      modificationTime: Date(),
      accessTime: Date(),
    };
    const source = new SourceModel(fileModel, undefined);
    const ref = new KnowledgeSourceReference('file', source, link);
    return new KnowledgeSource(file.name.trim(), uuid, 'file', ref);
  }

  private getFileMetadata(
    ks: KnowledgeSource,
    file: File
  ): Promise<KnowledgeSource> {
    return new Promise<KnowledgeSource>((resolve) => {
      this.extractor
        .textFromFile(file)
        .then((results) => {
          ks.rawText = results;
        })
        .catch((reason) => {
          console.warn('Could not extract text from file: ', reason);
        })
        .finally(() => {
          resolve(ks);
        });
    });
  }

  private getFileIcon(ks: KnowledgeSource): Promise<KnowledgeSource> {
    return new Promise<KnowledgeSource>((resolve) => {
      this.favicon
        .extractFromKsList([ks])
        .then((ksList) => {
          resolve(ksList[0]);
        })
        .catch(() => {
          console.warn('Could not extract icon from file KS...');
        });
    });
  }

  private getFileIcons(ksList: KnowledgeSource[]): Promise<KnowledgeSource[]> {
    return new Promise<KnowledgeSource[]>((resolve) => {
      this.favicon
        .extractFromKsList(ksList)
        .then((results) => {
          resolve(results);
        })
        .catch(() => {
          console.warn('Could not extract icons from file KS list...');
        });
    });
  }

  private extractWebResource(link: URL): Promise<KnowledgeSource> {
    const uuid: UUID = this.uuid.generate(1)[0];
    const source = new SourceModel(undefined, { accessLink: link.href });
    const ref = new KnowledgeSourceReference('website', source, link);
    const ks = new KnowledgeSource('', uuid, 'website', ref);
    return this.getWebsiteMetadata(ks).then((metaKs) => {
      return this.getWebsiteIcon(metaKs);
    });
  }

  private getLink(link: URL): string {
    // If the link is a PDF file from arxiv.org, set the link to `https://arxiv.org/abs/${arxivId}` instead of the PDF link
    if (
      link.hostname === 'arxiv.org' &&
      link.pathname.split('/')[1] === 'pdf'
    ) {
      const arxivId = link.pathname.split('/')[2];
      if (arxivId) {
        return `https://arxiv.org/abs/${arxivId}`;
      }
    }

    // Otherwise, return the original link
    return link.href;
  }

  private getWebsiteMetadata(ks: KnowledgeSource): Promise<KnowledgeSource> {
    return new Promise<KnowledgeSource>((resolve) => {
      const link = this.getLink(new URL(ks.accessLink));
      this.extractor
        .extractWebsiteMetadata(link)
        .then((metadata) => {
          if (metadata.title) ks.title = metadata.title.trim();

          if (metadata.meta && metadata.meta.length > 0) {
            const meta = metadata.meta;

            const description = meta.find(
              (m) =>
                m.key === 'og:description' ||
                m.key === 'twitter:description' ||
                m.key === 'description'
            );
            if (description) {
              ks.description = description.value ?? description.property ?? '';
            }

            const topics = meta.find(
              (m) =>
                m.key === 'keywords' || m.key === 'tags' || m.key === 'topics'
            );
            if (topics) {
              ks.topics =
                topics.value?.trim().replace(' ', '').split(',') ?? [];
            }
          }

          if (ks.reference.source.website)
            ks.reference.source.website.metadata = metadata;

          ks.meta = [];
          if (metadata.meta) {
            for (const meta of metadata.meta) {
              if (meta.key && meta.value) {
                ks.meta.push({ key: meta.key, value: meta.value });
              }
            }
          }
        })
        .catch((reason) => {
          console.warn('Unable to extract website metadata because: ', reason);
        })
        .finally(() => {
          resolve(ks);
        });
    });
  }

  private getWebsiteIcon(ks: KnowledgeSource): Promise<KnowledgeSource> {
    return new Promise<KnowledgeSource>((resolve) => {
      if (ks.icon) {
        resolve(ks);
      }

      if (typeof ks.accessLink === 'string') {
        ks.iconUrl = ks.accessLink;
      } else {
        if (ks.accessLink.hostname.includes(ks.accessLink.protocol)) {
          ks.iconUrl = ks.accessLink.hostname;
        } else {
          ks.iconUrl = ks.accessLink.origin;
        }
      }

      ks.icon = this.favicon.generic();

      this.favicon
        .extract([ks.iconUrl])
        .then((icons) => {
          ks.icon = icons[0];
        })
        .catch((reason) => {
          console.warn('Unable to extract website icon because: ', reason);
        })
        .finally(() => {
          resolve(ks);
        });
    });
  }

  private shuffleArray(array: any[], slice?: number) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    if (slice) {
      array = array.slice(0, slice);
    }
  }
}
