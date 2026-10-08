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

import { Injectable } from '@angular/core';
import { BehaviorSubject, forkJoin, mergeMap, tap } from 'rxjs';
import { ChatService } from '@services/chat-services/chat.service';
import { SettingsService } from '@services/ipc-services/settings.service';
import { ProjectTreeFactoryService } from '@services/factory-services/project-tree-factory.service';
import { filter, map, take } from 'rxjs/operators';
import { ChatFactoryService } from '@services/chat-services/chat.factory.service';
import { AgentType, ChatMessage } from '@app/models/chat.model';

export interface CommandArgs {
  label: string;
  optional: boolean;
  value?: string;
}

export interface ChatCommand {
  command: string;
  targets: 'Source' | 'Project' | 'Both';
  description: string;
  args?: CommandArgs[];
  argParse?: (args: string) => CommandArgs[];
  execute: (args: CommandArgs[]) => void;
}

@Injectable({
  providedIn: 'root',
})
export class ChatCommandService {
  private commands: ChatCommand[] = [
    {
      command: '/categorize',
      description: 'Get a list of Projects that this Source would fit into',
      targets: 'Source',
      execute: () => this.categorize(),
    },
    // {
    //   command: '/note',
    //   description: 'Add a note to this Source',
    //   targets: 'Source',
    //   args: [
    //     {
    //       label: '<note>',
    //       optional: false,
    //     },
    //   ],
    //   argParse(args: string) {
    //     const tokens = args.trim().split(' ');
    //     const note = tokens.slice(1).join(' ').trim();
    //     console.log('note args: ', note);
    //     return [
    //       {
    //         label: '<note>',
    //         optional: false,
    //         value: note === '' ? undefined : note,
    //       },
    //     ];
    //   },
    //   execute: (args: CommandArgs[]) => {
    //     console.log('Adding note to Source: ', args);
    //   },
    // },
    // {
    //   command: '/organize',
    //   description:
    //     'Get suggestions on how to organize the Sources in this Project based on Topics, keywords, and other attributes',
    //   targets: 'Project',
    //   args: [],
    //   execute: () => {},
    // },
    // {
    //   command: '/review',
    //   description:
    //     'Get a high-level overview of your Chat history with this Source or Project',
    //   targets: 'Both',
    //   args: [],
    //   execute: (args: CommandArgs[]) => {},
    // },
    // {
    //   command: '/search',
    //   description:
    //     'Search a Source or Project using Retrieval-augmented Generation (RAG)',
    //   targets: 'Both',
    //   argParse: (args: string) => {
    //     const tokens = args.trim().split(' ');
    //     const query = tokens.slice(1).join(' ').trim();
    //     return [
    //       {
    //         label: '<query>',
    //         optional: false,
    //         value: query === '' ? undefined : query,
    //       },
    //     ];
    //   },
    //   args: [
    //     {
    //       label: '<query>',
    //       optional: false,
    //     },
    //   ],
    //   execute: (args: CommandArgs[]) => {},
    // },
    // {
    //   command: '/similar',
    //   description: 'Find similar Sources to the one you are currently viewing',
    //   targets: 'Source',
    //   args: [],
    //   execute: (args: CommandArgs[]) => {},
    // },
    // {
    //   command: '/structure',
    //   description:
    //     'Get suggestions on how to restructure your Project to make it more organized and easier to navigate',
    //   targets: 'Project',
    //   args: [],
    //   execute: (args: CommandArgs[]) => {},
    // },
    {
      command: '/questions',
      description:
        'Get a list of frequently asked questions based on your Chat history',
      targets: 'Both',
      args: [],
      execute: () => this.questions(),
    },
    {
      command: '/summarize',
      description:
        'Summarize the contents of this Source based on content and Chat history',
      targets: 'Source',
      execute: () => this.summarize(),
    },
    {
      command: '/topics',
      description:
        'Get a list of the most common Topics in a Source or Project',
      targets: 'Source',
      execute: () => this.topics(),
    },
    {
      command: '/tutor',
      description:
        'Decide what to learn next based on your Chat history and goals',
      targets: 'Source',
      args: [],
      execute: () => this.tutor(),
    },
    {
      command: '/model',
      description: 'Get information about the current Chat model',
      targets: 'Both',
      args: [],
      execute: () => this.model(),
    },
    {
      command: '/quiz',
      description:
        'Take a quiz to test your understanding of a Source or Project',
      targets: 'Both',
      execute: () => this.quiz(),
    },
    {
      command: '/tree',
      description: 'Display the current Project in tree form',
      targets: 'Project',
      execute: () => this.showTree(),
    },
  ];

  private _commands$ = new BehaviorSubject<ChatCommand[]>([]);

  commands$ = this._commands$.asObservable();

  private _questions$ = new BehaviorSubject<string[]>([]);

  questions$ = this._questions$.asObservable();

  scrollView$ = new BehaviorSubject<boolean>(false);

  target: 'Source' | 'Project' = 'Source';

  constructor(
    private chat: ChatService,
    private settings: SettingsService,
    private tree: ProjectTreeFactoryService,
    private factory: ChatFactoryService
  ) {
    this.commands.sort((a, b) => a.command.localeCompare(b.command));
    chat.target$
      .pipe(
        tap((target) => {
          if (target.source) {
            this.target = 'Source';
          } else if (target.project) {
            this.target = 'Project';
          }
        })
      )
      .subscribe();
  }

  isValid(command: string) {
    return this.commands.some((c) => c.command === command);
  }

  lookup(command: string) {
    return this.commands.find((c) => c.command === command);
  }

  /**
   * Filter the commands list based on the input. Sets the commands$ observable to the filtered list.
   * @param command text to filter commands by
   */
  filter(command: string) {
    if (command.trim() === '') {
      this._commands$.next([]);
      return;
    } else {
      const next = this.commands.filter(
        (c) =>
          c.command.startsWith(command.trim().split(' ')[0].trim()) &&
          (c.targets === this.target || c.targets === 'Both')
      );
      this._commands$.next(next);
    }
  }

  /* Reset the commands list to an empty array */
  reset() {
    this._commands$.next([]);
  }

  indexed(commandIndex: number) {
    const commands = this._commands$.value;
    if (commands.length === 0) {
      return undefined;
    }
    return commands[commandIndex];
  }

  private categorize() {
    forkJoin({
      messages: this.chat.messages$.pipe(take(1)),
      target: this.chat.target$.pipe(take(1)),
      tree: this.tree.treeNodes.pipe(take(1)),
    })
      .pipe(
        map(({ messages, target, tree }) => {
          const treeList = [];
          for (const treeNode of tree) {
            const treeYaml = this.tree.generateJSON(treeNode);
            treeList.push(treeYaml);
          }
          const treeStr = JSON.stringify(treeList);
          // Map messages to OpenAI format
          return {
            messages: this.chat.convertToOpenAI(messages),
            source: target.source,
            tree: treeStr,
          };
        }),
        mergeMap(({ messages, source, tree }) => {
          // Send messages and source as body to tutor endpoint
          return this.chat.post('/sources/categorize', {
            messages: messages,
            source: source,
            tree: tree,
          });
        })
      )
      .subscribe((response) => {
        this.chat.displayText(response, AgentType.Category);
      });
  }

  private questions() {
    this.chat.messages$
      .pipe(
        take(1),
        map((messages) => {
          return this.chat.convertToOpenAI(messages);
        }),
        map((messages) => {
          return messages.concat([
            {
              role: 'user',
              content: `Given our conversation history, what are some questions I might ask about any related concepts or topics? Please list 3 questions.`,
            },
            {
              role: 'system',
              content: `The questions should be relevant to the Project or the Sources discussed in the conversation history.`,
            },
            {
              role: 'system',
              content: `Take time to think about the questions that the user would ask of an expert.`,
            },
            {
              role: 'system',
              content: `Do not respond with anything other than the questions themselves.`,
            },
            {
              role: 'system',
              content: `Separate each question with a newline character.`,
            },
          ]);
        }),
        tap((messages) => {
          this.chat
            .sendChat(messages)
            .pipe(take(1))
            .subscribe((response) => {
              if (response.content) {
                const questions = response.content.split('\n');
                this._questions$.next(questions);
              } else {
                this._questions$.next([]);
              }
            });
        })
      )
      .subscribe();
  }

  private summarize() {
    this.chat.target$
      .pipe(
        take(1),
        filter(({ source }) => source !== undefined),
        mergeMap(({ source }) => {
          return this.chat
            .post('/sources/summarize', {
              source: source,
            })
            .pipe(
              map((response) => {
                return {
                  response: response,
                  source: source,
                };
              })
            );
        })
      )
      .subscribe(({ response, source }) => {
        if (source) {
          const message = this.factory.sourceMessage(
            response,
            source,
            AgentType.Source
          );
          this.chat.addMessage(message);
        }
      });
  }

  private quiz() {
    forkJoin({
      target: this.chat.target$.pipe(take(1)),
      messages: this.chat.messages$.pipe(take(1)),
    })
      .pipe(
        map(({ target, messages }) => {
          // Remove any previous quizzes so they don't interfere with the new quiz
          const pruned = messages.filter((message) => {
            return message.sender !== AgentType.Quiz;
          });
          const openAI = this.chat.convertToOpenAI(pruned);
          return {
            target: target,
            messages: openAI,
          };
        }),
        mergeMap(({ target, messages }) => {
          if (target.source) {
            return this.chat.post('/sources/quiz', {
              source: target.source,
              messages: messages,
            });
          } else {
            return this.chat.post('/projects/quiz', {
              project: target.project,
              messages: messages,
            });
          }
        })
      )
      .subscribe((response) => {
        this.chat.displayText(response, AgentType.Quiz);
      });
  }

  private tutor() {
    // Get Messages and Source
    forkJoin({
      messages: this.chat.messages$.pipe(take(1)),
      target: this.chat.target$.pipe(take(1)),
    })
      .pipe(
        map(({ messages, target }) => {
          // Map messages to OpenAI format
          const openAI = this.chat.convertToOpenAI(messages);
          return {
            messages: openAI,
            target: target,
          };
        }),
        mergeMap(({ messages, target }) => {
          // Send messages and source as body to tutor endpoint
          const endpoint = target.source ? '/sources/tutor' : '/projects/tutor';
          return this.chat
            .post(endpoint, {
              messages: messages,
              source: target.source,
              project: target.project,
            })
            .pipe(
              map((response) => {
                return {
                  response: response,
                  source: target.source,
                  project: target.project,
                };
              })
            );
        })
      )
      .subscribe(({ response, source, project }) => {
        let message: ChatMessage;

        if (source) {
          message = this.factory.sourceMessage(
            response,
            source,
            AgentType.Source
          );
        } else if (project) {
          message = this.factory.projectMessage(
            response,
            project,
            AgentType.Project
          );
        } else {
          message = this.factory.message(
            AgentType.Tutor,
            AgentType.User,
            response
          );
        }

        this.chat.addMessage(message);
      });
  }

  private model() {
    const model = this.settings.get().app.chat.model;
    this.chat.displayText(
      `${model.label}\n---\n` +
        `Description: ${model.description}\n` +
        '| Property | Value |\n' +
        `| -------- | ------- |\n` +
        `| Token Limit | ${model.token_limit} |\n` +
        `| Input Cost (1k tokens) | $${model.input_kilo_cost} |\n` +
        `| Output Cost (1k tokens) | $${model.output_kilo_cost} |\n` +
        `| Max Tokens Upper Bound | ${model.max_tokens_upper_bound} |\n` +
        `\n\nThe following parameters are configurable (see Chat settings):\n` +
        `| Parameter | Value |\n` +
        `| -------- | ------- |\n` +
        `| Temperature | ${model.temperature} |\n` +
        `| Top P | ${model.top_p} |\n` +
        `| Max Output Tokens | ${model.max_tokens} |\n` +
        `| Presence Penalty | ${model.presence_penalty} |\n` +
        `| Frequency Penalty | ${model.frequency_penalty} |`,
      AgentType.System
    );
  }

  private topics() {
    this.chat.target$
      .pipe(
        take(1),
        filter(
          ({ source, project }) => source !== undefined || project !== undefined
        ),
        mergeMap(({ source, project }) => {
          if (source) {
            return this.chat
              .post('/sources/topics', {
                source: source,
              })
              .pipe(
                map((response) => ({
                  text: response,
                  source: source,
                  project: undefined,
                }))
              );
          } else {
            return this.chat
              .post('/projects/topics', {
                project: project,
              })
              .pipe(
                map((response) => ({
                  text: response,
                  source: undefined,
                  project: project,
                }))
              );
          }
        })
      )
      .subscribe(({ text, source, project }) => {
        const message = this.factory.topicMessage(text, source, project);
        this.chat.addMessage(message);
      });
  }

  private showTree() {
    forkJoin({
      tree: this.tree.treeNodes.pipe(take(1)),
      target: this.chat.target$.pipe(take(1)),
    })
      .pipe(
        tap(({ tree, target }) => {
          if (target.project) {
            const projectTree = this.tree.findTreeNode(
              target.project.id.value,
              tree
            );
            if (projectTree) {
              const treeText = this.tree.generateTree(projectTree, 0, false);
              this.chat.displayText(treeText, AgentType.Project);
            }
          }
        })
      )
      .subscribe();
  }
}
