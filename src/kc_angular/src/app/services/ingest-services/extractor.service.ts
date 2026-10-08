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
import {
  ArticleModel,
  CodeModel,
  WebsiteMetadataModel,
  WebsiteMetaTagsModel,
} from '@shared/models/web.source.model';
import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { NotificationsService } from '@services/user-services/notifications.service';
import { DialogService } from 'primeng/dynamicdialog';
import { LoadingComponent } from '@components/shared/loading.component';

@Injectable({
  providedIn: 'root',
})
export class ExtractorService {
  private MIN_CODE_LENGTH = 64;

  constructor(
    private httpClient: HttpClient,
    private notifications: NotificationsService,
    private dialog: DialogService,
    private zone: NgZone
  ) {}

  websiteToPdf(url: string, outFileName?: string) {
    const dialogRef = this.dialog.open(LoadingComponent, {
      width: '300px',
      height: '150px',
      data: {
        message: 'Creating PDF',
        subMessage: 'Please wait...',
        progressBar: true,
      },
      closable: false,
      modal: true,
      dismissableMask: false,
    });

    const timer = setTimeout(() => {
      dialogRef.close();
      this.notifications.error(
        'Extractor Service',
        'Failed',
        'Failed to save PDF'
      );
    }, 20000);

    window.api.receive('E2A:Extraction:Website', (result: any) => {
      this.zone.run(() => {
        if (result) {
          console.log('Saved to: ', result);
          this.notifications.success(
            'Extractor Service',
            'PDF Saved Successfully',
            result
          );
        } else {
          this.notifications.error(
            'Extractor Service',
            'Failed',
            'Failed to save PDF'
          );
        }
        clearTimeout(timer);
        dialogRef.close();
      });
    });

    // Send message to Electron ipcMain
    const args: object = {
      url: url,
      filename: outFileName,
    };

    window.api.send('A2E:Extraction:Website', args);
  }

  async extractWebsiteArticle(url: string) {
    this.httpClient
      .get(url, { responseType: 'text' })
      .subscribe((htmlString) => {
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(htmlString, 'text/html');
        const articles = htmlDoc.getElementsByTagName('article');

        if (!articles) {
          return null;
        }

        if (articles.length > 1) {
          this.notifications.debug(
            'ExtractorService',
            'Multiple Articles Detected',
            'Returning first instance only.'
          );
        }

        const article = articles[0];
        let title = '';

        if (article.title) {
          title = article.title;
        } else {
          article.childNodes.forEach((value) => {
            if (value.nodeName === 'H1' || value.nodeName === 'h1') {
              if (value.textContent) {
                title = value.textContent;
                return;
              }
            }
          });
        }

        const articleModel: ArticleModel = {
          title: title,
          type:
            article.attributes.getNamedItem('itemtype')?.nodeValue ?? undefined,
          text: article.textContent ?? undefined,
          html: article.innerHTML,
        };

        return articleModel;
      });
  }

  async extractWebsiteCode(url: string) {
    this.httpClient
      .get(url, { responseType: 'text' })
      .subscribe((htmlString) => {
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(htmlString, 'text/html');

        // Code tags
        const code = htmlDoc.getElementsByTagName('code');
        if (!code || code.length === 0) {
          return null;
        }

        const codeHtml: CodeModel[] = [];
        for (let i = 0; i < code.length; i++) {
          if (
            code[i].textContent?.length &&
            (code[i].textContent?.length ?? 0) > this.MIN_CODE_LENGTH
          ) {
            const c: CodeModel = {
              html: code[i].outerHTML,
            };
            codeHtml.push(c);
          }
        }
        return codeHtml;
      });
  }

  async extractWebsiteAnswers(url: string) {
    this.httpClient
      .get(url, { responseType: 'text' })
      .subscribe((htmlString) => {
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(htmlString, 'text/html');

        // Answers (StackOverflow)
        const answers = htmlDoc.getElementById('answers');
        if (answers) {
          this.notifications.debug(
            'ExtractorService',
            '"Answers" Detected',
            'Not implemented yet.'
          );
        }
      });
  }

  extractWebsiteMetadata(url: string): Promise<WebsiteMetadataModel> {
    return new Promise<WebsiteMetadataModel>((resolve) => {
      const metadata: WebsiteMetadataModel = {};
      this.httpClient.get(url, { responseType: 'text' }).subscribe(
        (htmlString) => {
          const parser = new DOMParser();
          const htmlDoc = parser.parseFromString(htmlString, 'text/html');

          const extractMetaTags = (doc: any) => {
            const metatags: WebsiteMetaTagsModel[] = [];
            const meta = doc.getElementsByTagName('meta');

            for (let i = 0; i < meta.length; i++) {
              const names = [
                meta[i].name,
                meta[i].attributes.getNamedItem('property')?.textContent,
              ].filter((n) => n);

              const isTarget = names.some(
                (n) =>
                  n &&
                  (n.startsWith('og:') /* OpenGraph */ ||
                    n.startsWith('dc:') /* Dublin Core */ ||
                    (n.startsWith('twitter:') &&
                      !n.startsWith(
                        'twitter:app:'
                      )) /* Twitter (but not app) */ ||
                    n.startsWith('description') /* Description */ ||
                    n.startsWith('article:') /* Articles */ ||
                    n.startsWith('citation') /* Citation */ ||
                    n.startsWith('keywords')) /* Keywords */
              );

              if (isTarget) {
                const contents = [meta[i].content].filter((c) => c);

                for (const name of names) {
                  for (const content of contents) {
                    metatags.push({
                      key: name,
                      value: content,
                      property: '',
                    });
                  }
                }
              }
            }
            return metatags;
          };

          // Title Tag
          const title = htmlDoc.getElementsByTagName('title');
          if (title && title.length > 0) {
            metadata.title = title[0].innerText;
          } else {
            metadata.title = url;
          }

          // Meta Tags
          metadata.meta = extractMetaTags(htmlDoc);

          resolve(metadata);
        },
        () => {
          this.notifications.error(
            'ExtractorService',
            'extractWebsiteMetadata',
            'Error retrieving website.'
          );
          metadata.title = url;
          resolve(metadata);
        }
      );
    });
  }

  async textFromFile(file: File): Promise<any> {
    return new Promise<string>((resolve, reject) => {
      const headers = new Headers();
      headers.append('Content-Type', file.type);
      headers.append('Accept', 'text/html');
      headers.append('X-Tika-OCRLanguage', 'eng');

      const requestOptions: RequestInit = {
        method: 'PUT',
        headers: headers,
        body: file,
        redirect: 'follow',
      };

      fetch('http://localhost:9998/tika', requestOptions)
        .then((response) => {
          response.text().then((raw) => {
            resolve(raw);
          });
        })
        .catch((error) => {
          this.notifications.error('ExtractorService', 'Tika Error', error);
          reject(error);
        });
    });
  }
}
