import { StorageError } from "./storageErrors.js";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StorageError("corrupt", "Expected JSON object");
  return value as Record<string, unknown>;
}
export function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new StorageError("corrupt", "Expected nonnegative safe integer");
  return value;
}
export function string(value: unknown, maxLength = 256): string {
  if (typeof value !== "string" || !value.length || value.length > maxLength) throw new StorageError("corrupt", "Expected bounded string");
  return value;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new StorageError("corrupt", "Expected array");
  return value;
}
