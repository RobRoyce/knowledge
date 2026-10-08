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

export default class TextUtils {
  constructor() {
    throw new Error("TextUtils is a static class and cannot be instantiated");
  }

  static isPlainText(str: string) {
    // Verify that the string is plain text (i.e. ASCII characters only)
    return /^[\x00-\x7F]*$/.test(str);
  }

  static isNullOrWhitespace(text: string): boolean {
    return text === null || text.match(/^ *$/) !== null;
  }

  static isNullOrEmpty(text: string): boolean {
    return text === null || text === "";
  }

  static isNullOrWhitespaceOrEmpty(text: string): boolean {
    return TextUtils.isNullOrWhitespace(text) || TextUtils.isNullOrEmpty(text);
  }

  static convertToAscii(text: string): string {
    return text.replace(/[^\x00-\x7F]/g, "");
  }

  static convertToBase64(text: string): string {
    return Buffer.from(text).toString("base64");
  }

  static convertFromBase64(text: string): string {
    return Buffer.from(text, "base64").toString();
  }

  static convertToBase64Url(text: string): string {
    return TextUtils.convertToBase64(text)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  static chunk(text: string, size: number): string[] {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.substring(i, i + size - 1));
    }
    return chunks;
  }

  static limit(text: string, limit: number): string {
    if (text.length > limit) {
      text = text.substring(0, limit);
    }
    return text;
  }

  static clean(text: string): string {
    text = text.replace(/(https?:\/\/[^\s]+)/g, ""); // Remove URLs
    text = text.replace(/(\r\n|\n|\r)/gm, ""); // Remove newlines
    text = text.replace(/(\t)/gm, ""); // Remove tabs
    text = text.replace(/(\s{2,})/g, " "); // Remove any double spaces

    // Remove any non-whitespace substrings longer than 32 characters
    // (this is to prevent the API from returning an error)
    text = text.replace(/(\S{32,})/g, " ");
    text = text.trim();

    return text;
  }
}
