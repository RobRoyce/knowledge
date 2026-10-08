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

export type ChatModelName = "gpt-3.5-turbo" | "gpt-4" | "gpt-4o";

/**
 * Used for user settings and for the back-end chat controller.
 */
export interface ChatModel {
  /* The name of the model to use for the API call (see OpenAI API) */
  name: ChatModelName;

  /* The name of the model to display to the user */
  label: string;

  /* A description of the model to display to the user */
  description: string;

  /* A hard limit based on the given model */
  token_limit: number;

  /* The cost per 1000 tokens for input to the API */
  input_kilo_cost: number;

  /* The cost per 1000 tokens for output from the API */
  output_kilo_cost: number;

  /* See OpenAI API Documentation */
  temperature: number;

  /* See OpenAI API Documentation */
  top_p: number;

  /* See OpenAI API Documentation */
  max_tokens: number;

  /* See OpenAI API Documentation */
  presence_penalty: number;

  /* See OpenAI API Documentation */
  frequency_penalty: number;

  /* The upper bound on output tokens (used for UI slider) */
  max_tokens_upper_bound: number;
}

const OpenAIDefaults = {
  temperature: 0.5,
  top_p: 1,
  presence_penalty: 0,
  frequency_penalty: 0,
};

const GPT3p5Turbo: ChatModel = {
  name: "gpt-3.5-turbo",
  label: "GPT-3.5 Turbo",
  description: "GPT-3.5 Turbo is optimized for dialogue.",
  token_limit: 16384,
  input_kilo_cost: 0.0005,
  output_kilo_cost: 0.0015,
  max_tokens_upper_bound: 2048,
  max_tokens: 256, // Default
  ...OpenAIDefaults,
};

const GPT4: ChatModel = {
  name: "gpt-4",
  label: "GPT-4",
  description:
    "GPT-4 can follow complex instructions in natural language and solve difficult problems with accuracy.",
  token_limit: 8192,
  input_kilo_cost: 0.03,
  output_kilo_cost: 0.06,
  max_tokens_upper_bound: 4096,
  max_tokens: 512,
  ...OpenAIDefaults,
};

const GPT4o: ChatModel = {
  name: "gpt-4o",
  label: "GPT-4o",
  description:
    "OpenAI's most advanced, multimodal flagship model that’s cheaper and faster than GPT-4 Turbo.",
  token_limit: 128000,
  input_kilo_cost: 0.005,
  output_kilo_cost: 0.015,
  max_tokens_upper_bound: 8192,
  max_tokens: 1024,
  ...OpenAIDefaults,
};

export const SupportedChatModels: ChatModel[] = [GPT3p5Turbo, GPT4, GPT4o];
