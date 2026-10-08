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

import { AgentType, ChatMessage, MessageRating } from '@app/models/chat.model';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { KcProject } from '@app/models/project.model';
import { KnowledgeSource } from '@app/models/knowledge.source.model';
import { NotificationsService } from '@services/user-services/notifications.service';
import {
  BehaviorSubject,
  catchError,
  forkJoin,
  mergeMap,
  Observable,
  tap,
  timeout,
} from 'rxjs';
import { UUID } from '@shared/models/uuid.model';
import { DialogService } from 'primeng/dynamicdialog';
import { debounceTime, distinctUntilChanged, map, take } from 'rxjs/operators';
import { SettingsService } from '@services/ipc-services/settings.service';
import { ChatSettingsModel } from '@shared/models/settings.model';
import { ChatApiComponent } from '@components/chat-components/api.component';
import {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { ChatFactoryService } from '@services/chat-services/chat.factory.service';

export interface ChatTarget {
  source?: KnowledgeSource;
  project?: KcProject | null;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  // TODO: Make this a configurable setting when backend becomes available as standalone
  private backendUrl = 'http://localhost:21003';

  private canConnect = new BehaviorSubject<boolean>(false);

  canConnect$ = this.canConnect.asObservable();

  private _settings: ChatSettingsModel = new ChatSettingsModel();

  private tokenCount = new BehaviorSubject<number>(0);

  tokenCount$ = this.tokenCount.asObservable();

  private tokenLimit = new BehaviorSubject<number>(4096);

  tokenLimit$ = this.tokenLimit.asObservable();

  private _messages$ = new BehaviorSubject<ChatMessage[]>([]);

  messages$ = this._messages$.asObservable();

  private _loading$ = new BehaviorSubject<boolean>(false);

  loading$ = this._loading$.asObservable();

  private _target$ = new BehaviorSubject<ChatTarget>({});

  target$ = this._target$.asObservable();

  constructor(
    private dialog: DialogService,
    private factory: ChatFactoryService,
    private http: HttpClient,
    private notify: NotificationsService,
    private settings: SettingsService
  ) {
    this.checkConnection();

    this.settings.all
      .pipe(map((settings) => settings?.app?.chat ?? new ChatSettingsModel()))
      .subscribe((settings) => {
        this._settings = settings;
        this.tokenLimit.next(
          settings.model.token_limit - settings.model.max_tokens
        );
      });

    this.target$
      .pipe(
        debounceTime(100),
        distinctUntilChanged((a, b) => {
          if (a.source && b.source) {
            return a.source.id.value === b.source.id.value;
          } else if (a.project && b.project) {
            return a.project.id.value === b.project.id.value;
          } else {
            return false;
          }
        })
      )
      .subscribe((target) => {
        this._loading$.next(true);
        let history: ChatMessage[] = [];

        if (target.source) {
          history = this.factory.loadSourceMessages(
            target.source.id,
            target.source
          );
        } else if (target.project) {
          history = this.factory.loadProjectMessages(target.project);

          for (const source of target.project.knowledgeSource) {
            const sourceHistory = this.factory.loadSourceMessages(
              source.id,
              source
            );

            for (const msg of sourceHistory) {
              if (
                msg.sender !== AgentType.Quiz &&
                msg.sender !== AgentType.Category
              ) {
                history.push(msg);
              }
            }
          }

          // Sort the history by timestamp
          history.sort((a: ChatMessage, b: ChatMessage) => {
            return a.timestamp > b.timestamp ? 1 : -1;
          });
        }

        // Remove all duplicates
        history = history.filter((msg, index, self) => {
          return index === self.findIndex((m) => m.id === msg.id);
        });

        this._messages$.next(history);
        this._loading$.next(false);
      });

    this.messages$
      .pipe(
        distinctUntilChanged((a, b) => {
          // Determine if the messages are the same
          if (a.length !== b.length) {
            return false;
          }
          for (let i = 0; i < a.length; i++) {
            if (a[i].id !== b[i].id) {
              return false;
            } else if (a[i].rating !== b[i].rating) {
              return false;
            }
          }
          return true;
        })
      )
      .subscribe((messages) => {
        // Save the chat history
        if (this._target$.value.source) {
          this.saveChat(messages, this._target$.value.source.id);
        } else if (this._target$.value.project) {
          this.saveChat(messages, this._target$.value.project.id);
        }
      });
  }

  get serverUrl() {
    return this.backendUrl;
  }

  canChat() {
    return this.canConnect.value;
  }

  addMessage(message: ChatMessage) {
    this.messages$.pipe(take(1)).subscribe((messages) => {
      this._messages$.next([...messages, message]);
    });
  }

  deleteMessage(message: ChatMessage) {
    // Remove the message from the chat history using the message ID
    this.messages$.pipe(take(1)).subscribe((messages) => {
      this._messages$.next(messages.filter((msg) => msg.id !== message.id));
    });
  }

  persistChatHistory() {
    this.messages$.pipe(take(1)).subscribe((messages) => {
      this.saveChat(messages);
    });
  }

  displayText(text: string, sender: AgentType = AgentType.Assistant) {
    const message = this.factory.message(sender, AgentType.User, text);
    this.addMessage(message);
  }

  post(endpoint: string, body: any): Observable<string> {
    this._loading$.next(true);
    return this.http.post(this.backendUrl + endpoint, body).pipe(
      take(1),
      catchError((err) => {
        console.error('Error: ', err);
        this._loading$.next(false);
        return [];
      }),
      map((response: any) => {
        return response.choices[0].message.content;
      }),
      tap(() => {
        this._loading$.next(false);
      })
    );
  }

  get(endpoint: string, body?: any): Observable<string> {
    this._loading$.next(true);
    return this.http.get(this.backendUrl + endpoint, body).pipe(
      map((response: any) => {
        return response.choices[0].message.content;
      }),
      tap(() => {
        this._loading$.next(false);
      })
    );
  }

  /**
   * Submit a message to the chat service. This will send the message to the backend for inference.
   * @param text The text of the message
   */
  submit(text: string) {
    const observable = forkJoin([
      this.messages$.pipe(take(1)),
      this.target$.pipe(take(1)),
    ]).pipe(
      map((value) => {
        const messages = value[0];
        const target = value[1];
        let message: ChatMessage;

        // Add the user message to the chat history
        // TODO: Change this to /projects once the backend is updated
        let endpoint = '/chat';
        if (target.source) {
          message = this.factory.sourceMessage(
            text,
            target.source,
            AgentType.User
          );
          endpoint = '/sources';
        } else if (target.project) {
          message = this.factory.projectMessage(
            text,
            target.project,
            AgentType.User
          );
        } else {
          throw new Error('Target not found');
        }
        this.addMessage(message);
        messages.push(message);
        return { messages, target, endpoint };
      }),
      mergeMap(({ messages, target, endpoint }) => {
        // Send the messages to the backend for inference
        return this.post(endpoint, {
          messages: this.convertToOpenAI(messages),
          source: target.source,
          project: target.project,
        }).pipe(
          take(1),
          map((response) => {
            return { response, messages, target };
          })
        );
      })
    );

    observable.subscribe(({ response, target }) => {
      // Add the response to the chat history
      let message: ChatMessage;
      if (target.source) {
        message = this.factory.sourceMessage(
          response,
          target.source,
          AgentType.Assistant
        );
      } else if (target.project) {
        message = this.factory.projectMessage(
          response,
          target.project,
          AgentType.Assistant
        );
      } else {
        throw new Error('Target not found');
      }
      this.addMessage(message);
    });
  }

  /**
   * Set the target for the chat service. This will load the chat history for the target.
   * @param target a ChatTarget object containing either a source or a project
   *
   * Side effects:
   * - Updates the target$ Observable.
   */
  setTarget(target: ChatTarget) {
    this._target$.next(target);
  }

  /**
   * Delete the OpenAI API key from the backend.
   *
   * Side effects:
   * - Updates the canConnect$ Observable.
   */
  deleteApiKey() {
    return this.http.delete(this.backendUrl + '/api/key').pipe(
      tap((result: any) => {
        if (result) {
          this.canConnect.next(false);
        }
      })
    );
  }

  /**
   * Open a dialog to get the OpenAI API key from the user.
   *
   * Side effects:
   * - Shows a dialog to the user to get the API key.
   * - Shows a success or error notification to the user.
   * - API key is persisted by the backend.
   *
   * @returns {Observable<boolean>} An observable that emits true if the API key was saved successfully, or false if it was not.
   */
  getApiKeyDialog(): Observable<boolean> {
    const dialogRef = this.dialog.open(ChatApiComponent, {
      header: 'OpenAI API Key Required',
    });

    return dialogRef.onClose.pipe(
      tap((result) => {
        if (result) {
          this.notify.success(
            'Chat Service',
            'Success',
            'API Key saved and encrypted.'
          );
        } else {
          this.notify.error(
            'Chat Service',
            'API Key Not Saved',
            'The API Key was either invalid or not entered properly.',
            'toast'
          );
        }
      })
    );
  }

  /**
   * Set the OpenAI API key for the chat service, which is used to authenticate with the backend.
   *
   * Side effects:
   *  - Updates the canConnect$ Observable.
   *
   * @param apiKey
   */
  setApiKey(apiKey: string) {
    return this.http
      .post(this.backendUrl + '/api/key', { apiKey: apiKey })
      .pipe(
        tap((result: any) => {
          if (result) {
            this.canConnect.next(result.success);
          } else {
            this.canConnect.next(false);
          }
        })
      );
  }

  /**
   * Convert the chat messages to completion request messages. If a message has a 'thumbs-down' rating, omit it from the request
   * @param messages
   */
  convertToOpenAI(messages: ChatMessage[]): ChatCompletionMessageParam[] {
    // Convert the chat messages to completion request messages. If a message has a 'thumbs-down' rating, omit it from the request
    const completions: ChatCompletionMessageParam[] = [];

    messages.forEach((message) => {
      if (message.rating !== 'thumbs-down') {
        const role =
          message.sender === AgentType.User
            ? 'user'
            : message.sender === AgentType.System
            ? 'system'
            : 'assistant';
        completions.push({
          role: role,
          content: message.text,
          name: message.sender,
        });
      }

      // TODO: Need to implement thumbs-up prioritization, but that will require a change to the
      //  request body (i.e. we will need to send the rating info to the backend).
    });

    return completions;
  }

  /**
   * Submit message history to the server for inference. Assumes that the messages are already
   * formatted as completion request messages (OpenAI API format).
   * @param messages
   * @param endpoint
   */
  sendChat(
    messages: ChatCompletionMessageParam[],
    endpoint = '/chat'
  ): Observable<ChatCompletionMessage> {
    const body = { messages: messages };

    // Remove any empty messages
    body.messages = body.messages.filter(
      (message) =>
        typeof message.content === 'string' && message.content?.trim() !== ''
    );

    this._loading$.next(true);
    return this.http.post(this.backendUrl + endpoint, body).pipe(
      timeout(60000),
      tap(() => {
        this._loading$.next(false);
      }),
      map((response: any) => {
        return response.choices[0].message;
      })
    );
  }

  /**
   * Process the input message to count the number of tokens it contains.
   *
   * Side effects:
   *   - Updates the tokenCount$ Observable.
   * @param message The string to count tokens for
   */
  processInput(message: string) {
    if (!message.trim()) {
      this.tokenCount.next(0);
      return;
    }
    this.http
      .post(this.backendUrl + '/chat/tokens', { text: message })
      .pipe(map((response: any) => response.tokens))
      .subscribe((count: number) => {
        this.tokenCount.next(count);
      });
  }

  /**
   * Check for a valid connection to the server, which requires a valid API key
   * and a successful response from the backend.
   */
  private checkConnection() {
    this.http.get(this.backendUrl + '/api/key').subscribe((result: any) => {
      if (result) {
        this.canConnect.next(result.apiKeySet);
      }
    });
  }

  /**
   * Save chat history to local storage
   *
   * If an ID is provided, save entire chat history using the ID as the key.
   * Otherwise, save individual history for all sources and projects found in the history.
   * Messages that are marked as "ephemeral" are not persisted.
   *
   * @param history The chat history to save
   * @param id The ID of the source or project to save the history for
   * @returns {ChatMessage[]} The chat history that was saved
   */
  private saveChat(history: ChatMessage[], id?: UUID) {
    this.notify.debug(
      'Chat Service',
      'Saving Chat',
      'Saving chat history to local storage'
    );

    /* If an ID is provided, save entire chat history using the ID as the key */
    if (id) {
      const newHistory: ChatMessage[] = [];
      for (const msg of history) {
        if (!msg.ephemeral) {
          newHistory.push({
            id: msg.id,
            sender: msg.sender,
            recipient: msg.recipient,
            text: msg.text,
            timestamp: msg.timestamp,
            project: undefined,
            source: undefined,
            rating: msg.rating,
          });
        }
      }
      this.factory.saveChat(newHistory, id);
    } else {
      // Get a list of all unique sources and projects in the history
      const sources: KnowledgeSource[] = [];
      const projects: KcProject[] = [];

      for (const msg of history) {
        if (
          msg.source &&
          !sources.find((s) => s.id.value === msg.source?.id.value)
        ) {
          sources.push(msg.source);
        }

        if (
          msg.project &&
          !projects.find((p) => p.id.value === msg.project?.id.value)
        ) {
          projects.push(msg.project);
        }
      }

      // Save history for all Sources
      for (const source of sources) {
        // Get history for this source
        const sourceHistory = history.filter(
          (m) => m.source?.id.value === source.id.value && !m.ephemeral
        );
        this.factory.saveChat(sourceHistory, source.id);
      }

      // Save history for all Projects
      for (const project of projects) {
        const projectHistory = history.filter(
          (m) => m.project?.id.value === project.id.value && !m.ephemeral
        );
        this.factory.saveChat(projectHistory, project.id);
      }
    }
  }

  /**
   * Rate a message using a thumbs-up. thumbs-down or none rating.
   * Sets the message rating and updates the chat history.
   * @param message
   * @param rating
   */
  rateMessage(message: ChatMessage, rating: MessageRating) {
    this.messages$.pipe(take(1)).subscribe((messages) => {
      // Find the message using ID
      const index = messages.findIndex((msg) => msg.id === message.id);
      if (index < 0) {
        this.notify.error(
          'Chat Service',
          'Message Not Found',
          'Knowledge encountered an error while trying to rate a message that was not found.',
          'toast'
        );
        return;
      } else {
        // Update the message rating
        messages[index].rating = rating;
        this._messages$.next(messages);

        if (this._target$.value.source) {
          this.saveChat(messages, this._target$.value.source.id);
        } else if (this._target$.value.project) {
          this.saveChat(messages, this._target$.value.project.id);
        }
      }
    });
  }

  addTopic(topic: string) {
    if (this._target$.value.source) {
      if (this._target$.value.source.topics) {
        this._target$.value.source.topics.push(topic);
      } else {
        this._target$.value.source.topics = [topic];
      }
      this.setTarget(this._target$.value);
    } else if (this._target$.value.project) {
      if (this._target$.value.project.topics) {
        this._target$.value.project.topics.push(topic);
      } else {
        this._target$.value.project.topics = [topic];
      }
      this.setTarget(this._target$.value);
    }
  }
}
