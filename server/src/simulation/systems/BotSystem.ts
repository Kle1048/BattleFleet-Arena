import { createBotController, type BotVisiblePlayer, type BotVisibleMissile, type BotVisibleTorpedo } from "@battlefleet/shared/rules";
import type { InputCommand } from "@battlefleet/shared/protocol";
import type { SimulationEnvironment } from "../SimulationEnvironment.js";
import { desiredServerBotCount } from "./botPopulation.js";
import type { BotDecisionStrategy } from "@battlefleet/shared/rules";

const SPAWN_STAGGER_MS = 450;
const REMOVE_STAGGER_MS = 1600;
// Historical inspiration, not personality diagnoses; sources: docs/BOT-NAMES.md.
const PROFILE_NAMES = {
  standard: ["Nimitz", "Togo", "Yi Sun-sin", "Makarov", "Hipper"],
  aggressive: ["Nelson", "Collingwood"],
  cautious: ["Jellicoe"],
  objective: ["Spruance"],
} as const;

type BotPorts = {
  environment: SimulationEnvironment;
  diagnosticNowMs: () => number;
  joinParticipant: (id: string, name: string) => void;
  removeParticipant: (id: string) => void;
  applyInput: (id: string, input: InputCommand) => void;
  createStrategy?: () => BotDecisionStrategy;
};

/** Owns only bot membership, brains and cadence; never connections, schema or persistence. */
export class BotSystem {
  private readonly members = new Set<string>();
  readonly ids: ReadonlySet<string> = this.members;
  private readonly brains = new Map<string, ReturnType<typeof createBotController>>();
  private nextSerial = 1;
  private readonly nameCounters = new Map<string, number>();
  private lastSpawnAtMs: number;
  private lastRemovalAtMs: number;

  constructor(private readonly ports: BotPorts) {
    // Keep the original construction-time clock reads and immediate initial spawn eligibility.
    this.lastSpawnAtMs = ports.environment.nowMs() - SPAWN_STAGGER_MS;
    this.lastRemovalAtMs = ports.environment.nowMs();
  }

  reconcile(nowMs: number, minimumParticipants: number, humanCount: number): void {
    const target = desiredServerBotCount(minimumParticipants, humanCount);
    if (this.members.size === target) return;
    if (this.members.size < target) {
      if (nowMs - this.lastSpawnAtMs >= SPAWN_STAGGER_MS) {
        this.spawn();
        this.lastSpawnAtMs = nowMs;
      }
    } else if (nowMs - this.lastRemovalAtMs >= REMOVE_STAGGER_MS) {
      const first = this.members.values().next().value;
      if (first) this.remove(first);
      this.lastRemovalAtMs = nowMs;
    }
  }

  spawn(): void {
    const serial = this.nextSerial++;
    const id = `bfa_bot_${serial}_${this.ports.environment.random().toString(36).slice(2, 8)}`;
    const strategy = this.ports.createStrategy?.();
    const profile = strategy?.profile ?? "standard";
    const names = PROFILE_NAMES[profile];
    const count = this.nameCounters.get(profile) ?? 0;
    this.nameCounters.set(profile, count + 1);
    const hero = names[count % names.length];
    const occurrence = Math.floor(count / names.length) + 1;
    this.ports.joinParticipant(id, occurrence === 1 ? hero : `${hero} ${occurrence}`);
    this.members.add(id);
    const brain = createBotController({ wallNow: this.ports.environment.nowMs, monotonicNow: this.ports.diagnosticNowMs }, strategy);
    brain.enable();
    this.brains.set(id, brain);
  }

  remove(id: string): void {
    if (!this.members.delete(id)) return;
    this.brains.get(id)?.disable();
    this.brains.delete(id);
    this.ports.removeParticipant(id);
  }

  tick(nowMs: number, players: readonly BotVisiblePlayer[], missiles: readonly BotVisibleMissile[],
    torpedoes: readonly BotVisibleTorpedo[], operationalHalfExtent: number, islandsEnabled = true): void {
    // Every brain sees the same pre-movement projection, even if an earlier bot fires.
    for (const id of this.members) {
      const input = this.brains.get(id)?.update(nowMs, players, id, missiles, torpedoes, operationalHalfExtent, islandsEnabled);
      if (!input) continue;
      this.ports.applyInput(id, {
        throttle: input.throttle, rudderInput: input.rudderInput,
        aimX: input.aimWorldX, aimZ: input.aimWorldZ,
        primaryFire: input.primaryFire, secondaryFire: input.secondaryFire,
        torpedoFire: input.torpedoFire, radarActive: input.radarActive,
      });
    }
  }

  dispose(): void {
    // The simulation owner disposes participant state; this releases only brain resources.
    for (const brain of this.brains.values()) brain.disable();
    this.brains.clear();
    this.members.clear();
  }
}
