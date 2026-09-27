import type { ConfigRepository, ConfigSnapshot } from "../persistence/ports.js";
import type { AdminConfigPatch } from "./configValues.js";

/** Rules read this committed immutable cache, never a pending HTTP write or the filesystem. */
export class ConfigService {
  private current!: ConfigSnapshot;
  constructor(private readonly repository: ConfigRepository) {}
  async initialize(): Promise<void> { this.current = this.own(await this.repository.load()); }
  snapshot(): ConfigSnapshot { return this.current; }
  async patch(patch: AdminConfigPatch, expectedRevision?: number): Promise<ConfigSnapshot> {
    const committed = await this.repository.patch(patch, expectedRevision);
    // Promise continuations normally preserve FIFO; the revision guard also protects other adapters.
    const owned = this.own(committed);
    if (owned.revision > this.current.revision) this.current = owned;
    return owned;
  }
  private own(value: ConfigSnapshot): ConfigSnapshot {
    return Object.freeze({ revision: value.revision, config: Object.freeze({ ...value.config }) });
  }
}
