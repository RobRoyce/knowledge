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

import { NextFunction, Request, Response } from "express";
import axios from "axios";
import { getDocument } from "pdfjs-dist";
import { htmlToText, HtmlToTextOptions } from "html-to-text";
import fs from "fs";
import TextUtils from "../utils/text.utils";
import { codeMarkdownMap } from "../../../../kc_shared/constants/supported.file.types";

export class SourceParser {
  static async isPdf(url: string) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      const contentType = response.headers.get("Content-Type");
      return contentType === "application/pdf";
    } catch (error) {
      console.error("Error fetching the URL:", error);
      return false;
    }
  }

  static async getText(req: Request, res: Response, next: NextFunction) {
    if (req.body.text) {
      // If the request already contains text, skip this middleware
      return next();
    }

    const ingestType = req.body.ingestType;
    const accessLink = req.body.accessLink;

    if (ingestType === "file") {
      req.body.text = await SourceParser.fromFile(accessLink);
    } else {
      req.body.text = await SourceParser.fromWeb(new URL(accessLink));
    }

    if (
      req.body.text &&
      typeof req.body.text === "string" &&
      req.body.text.trim().length > 0
    ) {
      // Clean the text
      req.body.text = TextUtils.clean(req.body.text);

      // Absolute limit of text length is 100,000 characters, truncate anything above
      // TODO: make this a more meaningful value
      req.body.text = TextUtils.limit(req.body.text, 100000);
    } else {
      req.body.text = "";
    }

    next();
  }

  static async fromFile(filePath: string) {
    // Check if the file is a PDF
    if (filePath.endsWith(".pdf")) {
      return SourceParser.fromPdf(filePath);
    }

    try {
      // Read the file and check if it is a plain text file
      const fileExtension = "." + filePath.split(".").pop();
      const supportedFileTypes = [".txt", ".rst"].concat(
        Object.keys(codeMarkdownMap)
      );

      // If the file is not a supported file type, return an empty string
      if (!fileExtension || !supportedFileTypes.includes(fileExtension)) {
        console.debug("SourceParser: unsupported file type: ", fileExtension);
        return "";
      }

      // Otherwise, read the file and return the contents
      const dataBuffer = fs.readFileSync(filePath);
      const text = dataBuffer.toString();

      const isCode = Object.keys(codeMarkdownMap).some((type) =>
        filePath.endsWith(type)
      );

      if (isCode) {
        // Iterate over all key-value pairs to get fileType
        Object.entries(codeMarkdownMap).forEach(([key, fileType]) => {
          if (filePath.endsWith(key)) {
            return "```" + fileType + "\n" + text + "\n```";
          }
        });

        return "```\n" + text + "\n```";
      }

      return text;
    } catch (err) {
      return "";
    }
  }

  static async fromPdf(filePath: string) {
    const dataBuffer = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(dataBuffer.buffer);

    try {
      // Load the PDF file using PDF.js
      const loadingTask = getDocument({
        data: uint8Array,
      });
      const pdf = await loadingTask.promise;

      let finalText = " ";

      // Loop over each page in the PDF (1-indexed)
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent({
          includeMarkedContent: false,
        });

        // Concatenate content items to assemble final text
        // @ts-ignore -- required because the compiler thinks item.str does not exist
        const strings = content.items.map((item) => item.str);
        finalText += strings.join(" ") + "\n";
      }

      return finalText;
    } catch (err) {
      return "";
    }
  }

  static async fromWeb(url: URL) {
    const reqUrl = url.toString();

    const isPDF = await SourceParser.isPdf(reqUrl);
    if (url.href.endsWith(".pdf") || isPDF) {
      // Use http to get the PDF, then use pdfjs to extract the text
      const response = await axios.get(reqUrl, { responseType: "arraybuffer" });
      const data = new Uint8Array(response.data);
      const doc = await getDocument(data).promise;

      // Extract text from PDF
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent({
          includeMarkedContent: false,
        });

        // @ts-ignore -- required because the compiler thinks item.str does not exist
        const pageText = content.items.map((item) => item.str).join(" ");
        text += pageText;
      }

      return text;
    } else {
      const response = await axios.get(reqUrl);
      const h2tOptions: HtmlToTextOptions = {
        wordwrap: false,
        baseElements: {
          selectors: [
            "article",
            "p",
            "code",
            "blockquote",
            "textarea",
            "ol",
            "ul",
            "h1",
            "h2",
            "mark",
            "table",
            "h3",
            "h4",
            "h5",
            "h6",
          ],
          orderBy: "selectors",
        },
      };
      return htmlToText(response.data, h2tOptions);
    }
  }
}
