import { normalizeConfig, type AdminConfig, type AdminConfigPatch } from "../application/configValues.js";
import { AtomicJsonFile, type JsonFileIO, type JsonCodec } from "./atomicJsonFile.js";
import type { ConfigRepository, ConfigSnapshot } from "./ports.js";
import { WriteQueue } from "./WriteQueue.js";
import { StorageError } from "./storageErrors.js";
import { integer, object } from "./jsonValidation.js";

type ConfigDocument = ConfigSnapshot & { version: 1 };
export function configCodec(defaults: AdminConfig): JsonCodec<ConfigDocument> {
  return {
    empty: () => ({ version: 1, revision: 0, config: Object.freeze({ ...defaults }) }),
    decode(raw) {
      const source = object(raw);
      const migrated = source.version === undefined;
      if (!migrated && source.version !== 1) throw new StorageError("version", "Unsupported config version");
      const values = migrated ? source : object(source.config);
      if (!Object.keys(defaults).some(key => key in values)) throw new StorageError("corrupt", "Config has no recognized fields");
      for (const key of Object.keys(defaults)) {
        const value = values[key];
        if (value === undefined && migrated) continue; // Legacy files may contain a subset.
        if (key === "maintenanceMode" ? typeof value !== "boolean" : typeof value !== "number" || !Number.isFinite(value)) {
          throw new StorageError("corrupt", `Invalid config field: ${key}`);
        }
      }
      return { migrated, value: { version: 1, revision: migrated ? 0 : integer(source.revision),
        config: Object.freeze(normalizeConfig(values, defaults)) } };
    },
  };
}

export class JsonConfigRepository implements ConfigRepository {
  readonly queue = new WriteQueue();
  readonly file: AtomicJsonFile<ConfigDocument>;
  private current!: ConfigDocument;
  constructor(filePath: string, defaults: AdminConfig, io?: JsonFileIO) {
    this.file = new AtomicJsonFile(filePath, configCodec(defaults), io);
  }
  async load(): Promise<ConfigSnapshot> { this.current = await this.file.load(); return this.current; }
  patch(patch: AdminConfigPatch, expectedRevision?: number): Promise<ConfigSnapshot> {
    const owned = { ...patch };
    return this.queue.run(async () => {
      if (expectedRevision !== undefined && expectedRevision !== this.current.revision) {
        throw new StorageError("conflict", "Configuration revision changed; reload before retrying");
      }
      const next: ConfigDocument = { version: 1, revision: integer(this.current.revision + 1),
        config: Object.freeze(normalizeConfig(owned, this.current.config)) };
      await this.file.save(next);
      this.current = next;
      return next;
    });
  }
}
