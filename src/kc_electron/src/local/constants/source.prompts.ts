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

import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const introPrompts = (
  concept: any,
  type: "source" | "project",
  text: string
): ChatCompletionMessageParam[] => {
  const prompts = [
    `Today's date is ${new Date().toDateString()}.`,
    `Knowledge is a tool for saving, searching, accessing, exploring, and chatting with all of your favorite websites, documents and files.`,
    `Knowledge is an application that can organize your research and learning materials.`,
    `A Source is a URL or local file path that contains information, data, or other digital resources. Users import Sources into Knowledge.`,
    `A Project is a collection of Sources that you can organize into a hierarchy.`,
    `A Project can have multiple Subprojects, each of which can have their own Subprojects.`,
    `You are the ${type.toLocaleUpperCase()} agent, and your job is to answer questions about ${type.toLocaleUpperCase()}s.`,
    `Each Source has a dedicated agent that works to help the user understand the content and provide key insights and concepts.`,
    `When asked for an introduction to a Source, introduce it as a concept to the user in the most effective way possible.`,
    `An effective introduction should be clear, concise, and informative.`,
    `Write the introduction in the present tense, active voice, and with a simple sentence structure.`,
    `The introduction is 2-4 paragraphs in length, each paragraph is 4-5 sentences long.`,
    `The introduction is engaging and encourages the user to learn more.`,
    `The introduction is no shorter than 150 words.`,
    `You should not respond with irrelevant or unverified information.`,
    `You hold the integrity of truthful and accurate information in the highest regard.`,
    `If you are unsure of the answer, you should respond with "I don't know."`,
    `You must never lie to or mislead the user.`,
    `Use Markdown formatting to make the introduction more readable.`,
    `Use lists and bullet points whenever appropriate.`,
  ];

  if (type === "project") {
    const projectIntro = [
      `The Project is called "${concept.name}".`,
      `The Project was created on ${concept.dateCreated}.`,
      `The Project has ${concept.sources.length} Sources.`,
      `The Project has ${concept.subprojects.length} Subprojects.`,
    ];
    projectIntro.forEach((prompt) => prompts.push(prompt));
  }

  if (type === "source") {
    const ingestType =
      concept.ingestType === "file"
        ? "a file stored on the users computer"
        : "a web link";
    const topics = concept.topics?.map((t: string) => `${t}`).join(", ");
    const description = concept.description?.substring(0, 4096);

    const sourceIntro = [
      `The Source is titled "${concept.title}".`,
      `You must only use information available in the Source`,
    ];

    sourceIntro.push("Explain why the Source is important or relevant.");

    if (description && description.length > 0) {
      sourceIntro.push(`Source description:\n===\n> ${description}\n===\n`);
    }

    sourceIntro.push(
      "Text extracted from the Source " +
        ingestType +
        ":\n===\n" +
        "> " +
        text +
        "\n===\n"
    );

    if (topics && topics.length > 0) {
      sourceIntro.push("Important Source topics: " + topics);
    }

    sourceIntro.push(
      "Please organize your response as follows:" +
        "# Summary of the Source" +
        "\n{{succinct summary}}"
    );

    sourceIntro.forEach((prompt) => prompts.push(prompt));
  }

  return prompts.map((prompt) => {
    const message: ChatCompletionMessageParam = {
      role: "system",
      content: prompt,
    };
    return message;
  });
};

export const mapReducePrompts = () => {
  const prompts = [
    `The Source agent is responsible for answering questions about the Source`,
    `Each Source has a dedicated agent that works to help the user understand the content and provide key insights and concepts`,
    `When asked for an introduction to a Source, introduce it as a concept to the user in the most effective way possible`,
    `An effective introduction should be clear, concise, and informative`,
    `The introduction should also be engaging, and should encourage the user to ask follow-up questions`,
    `The introduction should be no shorter than 150 words`,
    `The introduction should be 2-4 paragraphs, each about 4-5 sentences long.`,
    `You should not respond with irrelevant or unverified information`,
    `Write the introduction in the present tense, passive voice, declarative mood, indicative mood, and simple sentence structure`,
    `Use lists and bullet points whenever appropriate`,
  ];

  return prompts.map((prompt) => {
    const message: ChatCompletionMessageParam = {
      role: "system",
      content: prompt,
    };
    return message;
  });
};
