import type { StorageErrorCode } from "../../kc_contracts/storage.ts";

/** An error with an HTTP status and a message that callers may see. */
export class StorageError extends Error {
  readonly status: number;
  readonly code: StorageErrorCode;

  constructor(status: number, code: StorageErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string) =>
  new StorageError(400, "bad_request", message);
export const unauthorized = (message: string) =>
  new StorageError(401, "unauthorized", message);
export const forbidden = (message: string) =>
  new StorageError(403, "forbidden", message);
export const notFound = (message: string) =>
  new StorageError(404, "not_found", message);
export const conflict = (message: string) =>
  new StorageError(409, "conflict", message);
export const tooLarge = (message: string) =>
  new StorageError(413, "payload_too_large", message);
