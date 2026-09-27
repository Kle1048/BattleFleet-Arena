import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { StorageError } from "./storageErrors.js";

/** Injectable filesystem operations permit actual write/sync/rename failure tests. */
export type JsonFileIO = Pick<typeof fs, "mkdir" | "open" | "rename" | "unlink" | "readdir" | "stat" | "readFile">;
export type JsonCodec<T> = {
  decode(value: unknown): { value: T; migrated: boolean };
  empty(): T;
};

/** Atomic visibility after file sync + same-directory rename; directory sync is best effort. */
export class AtomicJsonFile<T> {
  private previousText: string | null = null;
  private bytes = 0;
  private serializationMs = 0;
  private commitMs = 0;
  private directorySync: "not-attempted" | "supported" | "unavailable" = "not-attempted";
  private orphanCount = 0;
  private loaded = false;

  constructor(readonly filePath: string, private readonly codec: JsonCodec<T>,
    private readonly io: JsonFileIO = fs, private readonly maxBytes = 16 * 1024 * 1024) {}

  async load(): Promise<T> {
    const directory = path.dirname(this.filePath);
    await this.io.mkdir(directory, { recursive: true });
    const names = await this.io.readdir(directory);
    const basename = path.basename(this.filePath);
    this.orphanCount = names.filter(name => name.startsWith(basename + ".") && name.endsWith(".tmp")).length;
    const raw = await this.readOptional(this.filePath);
    if (raw === null) {
      // A missing primary next to recovery material is not an empty installation.
      if (this.orphanCount || names.includes(basename + ".bak") || names.includes(basename + ".migration.bak")) {
        throw new StorageError("corrupt", "Primary data missing; explicit recovery required");
      }
      this.loaded = true;
      return this.codec.empty();
    }
    let decoded: ReturnType<JsonCodec<T>["decode"]>;
    try { decoded = this.codec.decode(JSON.parse(raw)); }
    catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError("corrupt", "Invalid stored JSON; original preserved", { cause: error });
    }
    this.previousText = raw;
    this.bytes = Buffer.byteLength(raw);
    this.loaded = true;
    if (decoded.migrated) {
      // Never replace the original migration backup on a later restart/retry.
      const backup = this.filePath + ".migration.bak";
      const existing = await this.readOptional(backup);
      if (existing !== null && existing !== raw) throw new StorageError("conflict", "Migration backup differs from primary");
      if (existing === null) await this.replace(backup, raw);
      await this.save(decoded.value);
    }
    return decoded.value;
  }

  async save(value: T): Promise<void> {
    if (!this.loaded) throw new StorageError("unavailable", "Storage not loaded");
    const started = performance.now();
    const text = JSON.stringify(value);
    this.serializationMs = performance.now() - started;
    const bytes = Buffer.byteLength(text);
    if (bytes > this.maxBytes) throw new StorageError("capacity", "JSON data size limit reached");
    // The rollback copy is the last acknowledged primary, not partially written data.
    if (this.previousText !== null) await this.replace(this.filePath + ".bak", this.previousText);
    await this.replace(this.filePath, text);
    this.previousText = text;
    this.bytes = bytes;
    this.commitMs = performance.now() - started;
  }

  snapshot() {
    return { bytes: this.bytes, maxBytes: this.maxBytes, serializationMs: this.serializationMs,
      commitMs: this.commitMs, directorySync: this.directorySync, orphanCount: this.orphanCount };
  }

  /** Offline operation only: stop every writer first. Never auto-promote an orphan temp file. */
  async restore(backup: "previous" | "migration"): Promise<string | null> {
    const source = this.filePath + (backup === "previous" ? ".bak" : ".migration.bak");
    const raw = await this.readOptional(source);
    if (raw === null) throw new StorageError("unavailable", "Backup not found");
    try { this.codec.decode(JSON.parse(raw)); }
    catch (error) { throw new StorageError("corrupt", "Backup failed validation; primary untouched", { cause: error }); }
    const previous = await this.readOptional(this.filePath);
    const preserved = previous === null ? null : `${this.filePath}.before-restore.${randomUUID()}.bak`;
    if (preserved !== null) await this.replace(preserved, previous!);
    await this.replace(this.filePath, raw);
    this.loaded = false; // A live repository must be reconstructed, not silently switched underneath callers.
    return preserved;
  }

  private async readOptional(file: string): Promise<string | null> {
    try {
      if ((await this.io.stat(file)).size > this.maxBytes) throw new StorageError("capacity", "Stored JSON exceeds size limit");
      return await this.io.readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async replace(destination: string, text: string): Promise<void> {
    const temporary = `${destination}.${randomUUID()}.tmp`;
    let created = false;
    try {
      const handle = await this.io.open(temporary, "wx", 0o600);
      created = true;
      try { await handle.writeFile(text, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      await this.io.rename(temporary, destination);
      created = false;
    } finally {
      if (created) await this.io.unlink(temporary).catch(() => { /* Preserve failed cleanup for startup diagnostics. */ });
    }
    // Windows commonly rejects directory handles. This is reported, not advertised
    // as power-loss durability. Rename already committed: never pretend it rolled back.
    try {
      const directory = await this.io.open(path.dirname(destination), "r");
      try { await directory.sync(); this.directorySync = "supported"; }
      finally { await directory.close(); }
    } catch { this.directorySync = "unavailable"; }
  }
}
