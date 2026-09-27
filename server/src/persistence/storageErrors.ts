/** Codes are safe for diagnostics/HTTP; filesystem paths and native errors are not. */
export class StorageError extends Error {
  constructor(readonly code: "unavailable" | "corrupt" | "version" | "capacity" | "closed" | "conflict" | "timeout", message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export function storageErrorCode(error: unknown): string {
  return error instanceof StorageError ? error.code : "unavailable";
}
