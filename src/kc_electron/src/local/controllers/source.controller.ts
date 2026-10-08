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

import { Request, Response } from "express";
import { GlobalWorkerOptions } from "pdfjs-dist";
import ChatController from "./chat.controller";
import TokenizerUtils from "../utils/tokenizer.utils";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

export default class SourceChatController {
  constructor(
    private tokenizerUtils: TokenizerUtils,
    private chatController: ChatController
  ) {}

  getChatController() {
    return this.chatController;
  }

  async chat(req: Request, res: Response): Promise<Response> {
    // Insert the summary into the messages array
    if (req.body.summary) {
      req.body.messages = req.body.messages.concat([
        {
          role: "system",
          content: `Summary: ${req.body.summary}`,
        },
      ]);
    }
    return this.chatController.chat(req, res);
  }

  async summarize(req: Request, res: Response): Promise<Response> {
    // If the summary already exists, simply return it as a ChatCompletion
    if (req.body.summary) {
      return res.json({
        choices: [
          {
            message: {
              content: req.body.summary,
              role: "assistant",
            },
          },
        ],
      });
    } else {
      return res.status(500).json({
        error: "Could not generate a summary. Please try again later.",
      });
    }
  }

  async categorize(req: Request, res: Response) {
    // The request body should contain a source title and the entire project tree in YAML format
    const sourceTitle = req.body.source.title;
    const projectTree = JSON.parse(req.body.tree);
    const projectNodes = projectTree.map((nodeText: string) => {
      return JSON.parse(nodeText);
    });
    let choices = projectNodes.map((node: any) => {
      return node.name;
    });

    const messages: ChatCompletionMessageParam[] = this.subcategories(
      choices,
      req.body.text
    );

    const response = await this.chatController.send(messages);
    if (!response) {
      return res.status(500);
    }

    const roots = response.choices[0].message.content?.split("\n");

    // Get the items that correspond to the selected roots
    choices = projectNodes.filter((node: any) => {
      return roots?.includes(node.name);
    });

    // Recursively check all projects and subprojects. Remove the subprojects field if it is empty.
    const removeEmptySubprojects = (node: any) => {
      if (node.subprojects) {
        node.subprojects = node.subprojects.filter(removeEmptySubprojects);
        if (node.subprojects.length === 0) {
          delete node.subprojects;
        }
      }
      return node;
    };
    choices = choices.map(removeEmptySubprojects);

    // Convert the choices to YAML
    choices = JSON.stringify(choices, null, 2);
    choices = choices.replace(/"name":/g, "-");
    choices = choices.replace(/"subprojects":/g, "  subprojects:");

    // Remove all brackets, quotes, commas, and visible newlines
    choices = choices.replace(/[[\]{}"']/g, "");
    choices = choices.replace(/,/g, "");
    choices = choices.replace(/\n\s*\n/g, "\n");
    choices = choices.replace(/\n/g, "\n-");

    req.body.messages = [
      {
        role: "system",
        content:
          "You are a librarian who is adept at making ontologies and categorizing Sources.",
      },
      {
        role: "system",
        content:
          "You will be provided with information about the source and a list of available Projects.",
      },
      {
        role: "system",
        content:
          "Your goal is to recommend 3 to 5 projects that the source should be categorized under.",
      },
      {
        role: "system",
        content:
          "You should always prefer to use existing projects. You may only recommend new Projects if none of the existing Projects are appropriate.",
      },
      {
        role: "system",
        content:
          "If you suggest new Projects, you may not suggest any that are already in the list.",
      },
      {
        role: "system",
        content:
          "Projects are hierarchical, where higher levels of the hierarchy or more general. Projects can have subprojects that get increasingly specific.",
      },
      {
        role: "system",
        content:
          "Analyze the key themes and concepts before providing your recommendation. Identify any specific methodologies, geographic locations, historical periods, technologies, or theoretical frameworks mentioned or implied.",
      },
      {
        role: "system",
        content:
          "Ask yourself what a proper ontology or taxonomy would look like for the source.",
      },
      {
        role: "system",
        content:
          "Ultimately, the Project hierarchy represents the users mind-map of knowledge. The goal is to create a hierarchy that is intuitive and easy to navigate, but you should not try to change the way they structure their knowledge.",
      },
      {
        role: "system",
        content:
          "In your response, each project should be on its own line and must start with a dash (-).",
      },
      {
        role: "system",
        content:
          'Example:\n===Source: "Bogleheads investing start-up kit"\n' +
          "Source Topics: #investing #startups #investmentplan #diversification" +
          "Suggested Projects:\n" +
          '- Finance > Personal Finance > Investing : The document\'s focus on "investing" as a start-up kit implies a fundamental approach to managing personal assets and financial resources for growth or income.\n' +
          '- Finance > Personal Finance > Investing > Strategies : The inclusion of "Bogleheads" in the title suggests a specific approach or philosophy toward investing, which aligns with the concept of distinct investment strategies.\n' +
          "- Finance > Retirement Planning > Tax-Advantaged Accounts : The emphasis on investment planning and diversification within the topics implies considerations for long-term financial goals, such as retirement, where tax-advantaged accounts play a crucial role.\n" +
          "===\n",
      },
      {
        role: "system",
        content:
          'Example:\n===Source: "The Open Graph Protocol"\n' +
          "Source Topics: #web3, #socialgraphs, #metadata, #rdfs" +
          "Suggested Projects:\n" +
          "- Internet and Web > Protocols and Standards > The Open Graph Protocol : The title indicates a specific protocol used for integrating web content with social media platforms, fitting under the broader category of internet protocols and standards.\n" +
          "- Data and Information > Semantic Technologies > RDFs : RDFs are mentioned, which are a foundational technology of the Semantic Web, emphasizing structured data and metadata to enable machines to understand and interpret web content.\n" +
          '- Social Media and Networking > Content Optimization and Sharing > Social Graphs : The focus on "Social Graphs" within the context of the Open Graph Protocol highlights techniques for mapping and analyzing relationships and interactions on social media platforms, pertinent to content sharing and optimization strategies.\n' +
          "===\n",
      },
      {
        role: "system",
        content:
          "You should include at least one existing Project. Existing projects are listed below and use dashes to indicate hierarchy.",
      },
      {
        role: "system",
        content: `Existing Projects:
===
${choices}
===`,
      },
      {
        role: "user",
        content:
          `Source: "${sourceTitle}"\n` +
          `Summary:\n===\n${this.tokenizerUtils.limitText(
            req.body.summary,
            500
          )}\n===\n`,
      },
    ];

    return this.chatController.passthrough(req, res);
  }

  private subcategories(
    choices: string[],
    input: string
  ): ChatCompletionMessageParam[] {
    return [
      {
        role: "system",
        content:
          "You are a librarian who is adept at making ontologies and categorizing Sources.",
      },
      {
        role: "system",
        content:
          "You will be provided with information about a Source, and a list of possible categories.",
      },
      {
        role: "system",
        content:
          "Your goal is to select the most appropriate categories for the Source.",
      },
      {
        role: "system",
        content:
          "IF AND ONLY IF none of the categories are appropriate, you may suggest 2 to 3 new categories.",
      },
      {
        role: "system",
        content:
          "If you suggest new categories, you may not suggest any that are already in the list.",
      },
      {
        role: "system",
        content:
          "You must separate each category with a new line character (\\n).",
      },
      {
        role: "system",
        content: `Source:\n===\n${this.tokenizerUtils.limitText(
          input,
          500
        )}\n===`,
      },
      {
        role: "system",
        content: `Categories:\n===\n${choices.join("\n")}\n===`,
      },
      {
        role: "user",
        content:
          "Please select the most appropriate categories for this Source.",
      },
    ];
  }

  async tutor(req: Request, res: Response) {
    const prompts = [
      {
        role: "system",
        content: "You are a tutor teaching a student about a Source.",
      },
      {
        role: "system",
        content:
          "Your goal is to help fill in the gaps in the student's understanding.",
      },
      {
        role: "system",
        content:
          "You will be provided with your chat history with the student.",
      },
      {
        role: "system",
        content:
          "Your explanations should be clear and in simple terms when possible",
      },
      {
        role: "system",
        content:
          "If you think the student would benefit from additional resources, suggest that they start by researching particular topics or concepts.",
      },
      {
        role: "system",
        content: `You may also consider asking what the students goals are, and what they hope to learn from the Source.`,
      },
      {
        role: "system",
        content: `It is especially important to make sure the student has an understanding of any prerequisites required to understand the Source.`,
      },
      {
        role: "system",
        content: "Give the student a list of prerequisite topics to research.",
      },
      {
        role: "system",
        content: `The Source is titled "${req.body.source.title}".`,
      },
    ];

    prompts.push({
      role: "system",
      content: `The following is a brief summary of the Source: ${req.body.summary}.`,
    });

    for (const message of req.body.messages) {
      prompts.push(message);
    }

    prompts.push({
      role: "user",
      content: "Please tutor me about this Source.",
    });

    req.body.messages = prompts;

    return this.chatController.passthrough(req, res);
  }

  quiz(req: Request, res: Response) {
    const source = req.body.source;

    const prompts = [
      ...req.body.messages,
      {
        role: "system",
        content: "You are a teacher giving a quiz about a Source.",
      },
      {
        role: "system",
        content:
          "Your goal is to test the students understanding of the Source.",
      },
      {
        role: "system",
        content:
          "You will be provided with your chat history with the student.",
      },
      {
        role: "system",
        content:
          "You may use any questions from the Source as part of the quiz.",
      },
      {
        role: "system",
        content:
          "You may also use any questions that you think would be appropriate.",
      },
      {
        role: "system",
        content: "Questions must be in multiple choice format.",
      },
      {
        role: "system",
        content:
          "Provide the student with 5 questions that have not been asked before.",
      },
      {
        role: "system",
        content: "Do not ask the same question twice in the same quiz.",
      },
      {
        role: "system",
        content:
          "You are not allowed to ask more than 2 questions where the answer is 'all of the above'",
      },
      {
        role: "system",
        content: "The Source is titled " + source.title + ".",
      },
    ];

    if (req.body.summary) {
      prompts.push({
        role: "system",
        content: `The following is a summary of the Source: ${req.body.summary}.`,
      });
    }

    prompts.push({
      role: "system",
      content:
        "Please use the following format for each question." +
        "Q1. {{Question}}\n" +
        "A) {{Choice}}\n" +
        "B) {{Choice}}\n" +
        "C) {{Choice}}\n" +
        "D) {{Choice}}\n" +
        "Answer: {{letter of the answer}}\n\n\n" +
        "Q2. {{Question}}\n" +
        "A) {{Choice}}\n" +
        "B) {{Choice}}\n" +
        "C) {{Choice}}\n" +
        "D) {{Choice}}\n" +
        "Answer: {{letter of the answer}}\n\n\n" +
        "...",
    });

    prompts.push({
      role: "user",
      content: "Please give me a quiz about this Source.",
    });

    req.body.messages = prompts;

    return this.chatController.passthrough(req, res);
  }

  topics(req: Request, res: Response) {
    const text = this.tokenizerUtils.limitText(req.body.text, 500);

    const prompts = [
      ...(req.body.messages || []),
      {
        role: "system",
        content: "You are analyzing a Source to identify its topics.",
      },
      {
        role: "system",
        content:
          "Identify the most relevant words or phrases in the text that represent key concepts.",
      },
      {
        role: "system",
        content:
          "Calculate the importance of words in the text based on how frequently they appear and how unique they are across the entire corpus.",
      },
      {
        role: "system",
        content:
          "Assume the text is a mixture of a small number of topics and that each word's presence is attributable to one of the document's topics.",
      },
      {
        role: "system",
        content:
          "Describe the topics as they relate to the text and the main concepts.",
      },
      {
        role: "system",
        content: "Return the top 5 topics and their associated descriptions.",
      },
      {
        role: "system",
        content:
          "You MUST use the following format for each topic: - {{Topic}}: {{Description}}",
      },
      {
        role: "system",
        content:
          "You MUST separate the title and the description with a colon (:).",
      },
      {
        role: "system",
        content:
          "Do not respond with anything other than the topics and descriptions. Do not explain yourself. Do not attempt to number the topics. Do not include any other information.",
      },
      {
        role: "system",
        content: `Topics may be no more than 2 to 3 words long. Descriptions may be no more than 10 words long.`,
      },
      {
        role: "system",
        content: `If the text contains minor errors, like inappropriate whitespace, please correct it before analyzing.`,
      },
    ];

    prompts.push({
      role: "user",
      content: `Please identify the topics in the following passage:\n===\n${text}\n===`,
    });

    req.body.messages = prompts;

    return this.chatController.passthrough(req, res);
  }
}
