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

import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ChatSettingsModel } from '@shared/models/settings.model';
import { SettingsService } from '@services/ipc-services/settings.service';
import { debounceTime, distinctUntilChanged, tap } from 'rxjs/operators';
import { NotificationsService } from '@services/user-services/notifications.service';
import { ChatService } from '@services/chat-services/chat.service';
import { ConfirmationService, PrimeIcons } from 'primeng/api';
import { ChatModel, SupportedChatModels } from '@shared/models/chat.model';

@Component({
  selector: 'app-chat-settings',
  template: `
    <div class="p-fluid grid">
      <form [formGroup]="form" class="w-full h-full">
        <div class="col-12">
          <p-panel>
            <ng-template pTemplate="header">
              <div class="flex-row-center-between w-full">
                <div class="text-2xl">Model</div>
              </div>
            </ng-template>
            <ng-template pTemplate="content">
              <div class="w-full h-full flex flex-column">
                <app-setting-template
                  class="w-full"
                  label="Model"
                  labelHelp="Choose the OpenAI model to use for chat."
                  labelHelpLink="https://platform.openai.com/docs/models"
                >
                  <p-dropdown
                    class="settings-input w-12rem"
                    formControlName="modelName"
                    [options]="SupportedChatModels"
                    optionLabel="label"
                    optionValue="name"
                  ></p-dropdown>
                </app-setting-template>

                <app-setting-template
                  class="w-full"
                  label="Token Limit"
                  labelHelp="The maximum number of tokens that can be processed by the selected model. Includes both input and output tokens."
                  labelHelpLink="https://platform.openai.com/docs/models"
                >
                  <div class="settings-input h-2rem">
                    {{ chatSettings.model.token_limit | number : '1.0' }}
                  </div>
                </app-setting-template>

                <app-setting-template
                  class="w-full"
                  label="Estimated Cost Per Message"
                  labelHelp="An estimate based on the model's token limit, max response tokens, and the cost per 1000 tokens."
                  labelHelpLink="https://openai.com/pricing"
                >
                  <div class="settings-input h-2rem flex-row">
                    {{
                      minCostPerMessage | currency : 'USD' : 'symbol' : '1.4'
                    }}
                    -
                    {{
                      maxCostPerMessage | currency : 'USD' : 'symbol' : '1.4'
                    }}
                  </div>
                </app-setting-template>

                <app-setting-template
                  label="Temperature"
                  labelHelp="What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic."
                  labelHelpLink="https://platform.openai.com/docs/api-reference/completions/create#completions/create-temperature"
                  labelSubtext="{{
                    form.controls.temperature.value | number : '1.1'
                  }}"
                >
                  <p-slider
                    class="w-16rem settings-input"
                    [min]="0"
                    [max]="2"
                    [step]="0.1"
                    formControlName="temperature"
                  ></p-slider>
                  <div class="settings-input-subtext-left">Concise</div>
                  <div class="settings-input-subtext-right">Creative</div>
                </app-setting-template>

                <app-setting-template
                  label="Top Probability"
                  labelHelp="An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered."
                  labelHelpLink="https://platform.openai.com/docs/api-reference/completions/create#completions/create-top_p"
                  labelSubtext="{{
                    form.controls.top_p.value | number : '1.1'
                  }}"
                >
                  <p-slider
                    class="w-16rem settings-input"
                    [min]="0.05"
                    [max]="1"
                    [step]="0.05"
                    formControlName="top_p"
                  ></p-slider>
                </app-setting-template>

                <app-setting-template
                  label="Max Response Tokens"
                  labelHelp="The maximum number of tokens to generate in the completion. The token count of your prompt plus max_tokens cannot exceed the model's context length."
                  labelHelpLink="https://platform.openai.com/docs/api-reference/completions/create#completions/create-max_tokens"
                  labelSubtext="{{
                    form.controls.max_tokens.value | number : '1.0'
                  }}"
                >
                  <p-slider
                    class="w-16rem settings-input"
                    [min]="32"
                    [max]="chatSettings.model.max_tokens_upper_bound"
                    [step]="32"
                    formControlName="max_tokens"
                  ></p-slider>
                </app-setting-template>

                <app-setting-template
                  label="Presence Penalty"
                  labelHelp="Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics."
                  labelHelpLink="https://platform.openai.com/docs/api-reference/completions/create#completions/create-presence_penalty"
                  labelSubtext="{{
                    form.controls.presence_penalty.value | number : '1.0'
                  }}"
                >
                  <p-slider
                    class="w-16rem settings-input"
                    [min]="-2"
                    [max]="2"
                    [step]="0.1"
                    formControlName="presence_penalty"
                  ></p-slider>
                </app-setting-template>

                <app-setting-template
                  label="Frequency Penalty"
                  labelHelp="Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim."
                  labelHelpLink="https://platform.openai.com/docs/api-reference/completions/create#completions/create-frequency_penalty"
                  labelSubtext="{{
                    form.controls.frequency_penalty.value | number : '1.0'
                  }}"
                >
                  <p-slider
                    class="w-16rem settings-input"
                    [min]="-2"
                    [max]="2"
                    [step]="0.1"
                    formControlName="frequency_penalty"
                  ></p-slider>
                </app-setting-template>

                <app-setting-template
                  label="Delete API Key"
                  labelHelp="Delete your API key. You will need to re-enter it to use the chat."
                >
                  <button
                    pButton
                    [disabled]="!canChat"
                    (click)="deleteApiKey()"
                    type="button"
                    class="settings-input p-button-danger"
                    icon="pi pi-trash"
                  ></button>
                </app-setting-template>
              </div>
            </ng-template>
          </p-panel>
        </div>
      </form>
    </div>
  `,
  styles: [],
})
export class ChatSettingsComponent {
  chatSettings: ChatSettingsModel = new ChatSettingsModel();
  form: FormGroup;
  canChat = false;
  minCostPerMessage = -1;
  maxCostPerMessage = -1;

  constructor(
    private notify: NotificationsService,
    private chat: ChatService,
    private confirm: ConfirmationService,
    private settings: SettingsService,
    private formBuilder: FormBuilder
  ) {
    const chatSettings = this.settings.get().app.chat;
    if (!chatSettings) {
      this.set();
    } else {
      this.chatSettings = {
        ...this.chatSettings,
        ...chatSettings,
      };
    }
    this.updateCost();

    this.canChat = this.chat.canChat();

    this.form = this.formBuilder.group({
      modelName: [this.chatSettings.model.name],
      temperature: [this.chatSettings.model.temperature],
      top_p: [this.chatSettings.model.top_p],
      max_tokens: [this.chatSettings.model.max_tokens],
      presence_penalty: [this.chatSettings.model.presence_penalty],
      frequency_penalty: [this.chatSettings.model.frequency_penalty],
    });

    this.form.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(this.checkChanges),
        tap((formValue) => {
          let model: ChatModel;

          // If the model has changed, update the local copy with static values from the SupportedChatModels array.
          if (formValue.modelName !== this.chatSettings.model.name) {
            model =
              SupportedChatModels.find((m) => m.name === formValue.modelName) ??
              this.chatSettings.model;

            model.max_tokens = Math.min(
              model.max_tokens_upper_bound,
              formValue.max_tokens
            );

            setTimeout(() => {
              this.form
                .get('max_tokens')
                ?.setValue(this.chatSettings.model.max_tokens);
            });
          } else {
            model = this.chatSettings.model;
            model.max_tokens = formValue.max_tokens;
          }

          model.temperature = formValue.temperature;
          model.top_p = formValue.top_p;
          model.presence_penalty = formValue.presence_penalty;
          model.frequency_penalty = formValue.frequency_penalty;

          const chatSettings: ChatSettingsModel = {
            suggestions: { enabled: false, onInput: false },
            model: model,
          };

          if (!this.validate(chatSettings)) {
            this.explain();
          }

          this.chatSettings = chatSettings;
          this.set();

          setTimeout(() => {
            this.updateCost();
          });
        })
      )
      .subscribe();

    this.notify.debug('Chat Settings', 'Initialized', this.chatSettings);
  }

  changeModel(nextModel: string) {
    const model: ChatModel | undefined = SupportedChatModels.find(
      (m) => m.name === nextModel
    );

    if (model) {
      // Static values should only come from the SupportedChatModels array.
      this.chatSettings.model = model;

      this.chatSettings.model.max_tokens = Math.min(
        this.chatSettings.model.token_limit -
          this.chatSettings.model.max_tokens_upper_bound,
        this.form.get('max_tokens')?.value
      );

      setTimeout(() => {
        this.form
          .get('max_tokens')
          ?.setValue(this.chatSettings.model.max_tokens);
      });
    }
    this.updateCost();
  }

  updateCost() {
    const model = this.chatSettings.model;

    this.minCostPerMessage = (model.max_tokens / 1000) * model.output_kilo_cost;
    const maxOutputCost = (model.max_tokens / 1000) * model.output_kilo_cost;
    const maxInputCost =
      ((model.token_limit - model.max_tokens) / 1000) * model.input_kilo_cost;
    this.maxCostPerMessage = maxInputCost + maxOutputCost;
  }

  deleteApiKey() {
    this.confirm.confirm({
      message: 'Are you sure you want to delete your API key?',
      header: 'Delete API Key',
      icon: PrimeIcons.EXCLAMATION_CIRCLE,
      acceptIcon: PrimeIcons.TRASH,
      accept: () => {
        this.chat.deleteApiKey().subscribe(() => {
          this.canChat = false;
          this.notify.success('Chat Settings', 'API Key Deleted', '');
        });
      },
    });
  }

  private explain() {
    this.notify.warn(
      'Chat Settings',
      'Not Recommended',
      'The OpenAI API suggests that you do not attempt to set custom values for both temperature and top_p.',
      'toast',
      10000
    );
  }

  private checkChanges(prev: any, curr: any) {
    return JSON.stringify(prev) === JSON.stringify(curr);
  }

  private set() {
    this.settings.set({
      app: {
        chat: this.chatSettings,
      },
    });
  }

  private validate(chatSettings: ChatSettingsModel): boolean {
    return !(
      chatSettings.model.temperature !== 1 && chatSettings.model.top_p !== 1
    );
  }

  protected readonly SupportedChatModels = SupportedChatModels;
}
