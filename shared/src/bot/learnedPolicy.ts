import { botProfile, profileControllerVersion, type BotProfile } from "./profiles";
import type { BotDecisionStrategy } from "./decisionEngine";
import type { BotIntent, DecisionInput } from "./types";

/** This ordered contract is shared by training, export and production inference. */
export const POLICY_VERSION = "bfa-tactics-v2-sensors";
export const POLICY_ACTIONS: readonly BotIntent[] = [
  "ATTACK", "CHASE", "REPOSITION", "HOLD_ARC", "TAKE_COVER", "RETREAT",
  "EVADE_MISSILES", "FINISH_TARGET", "SEEK_SEA_CONTROL",
];
export const POLICY_FEATURES = [
  "hp", "x/half", "z/half", "heading.sin", "heading.cos",
  "gunCooldown/30", "missileCooldown/30", "mineCooldown/30", "incoming/8",
  "target.present", "target.dx/2000", "target.dz/2000", "target.hp",
  "target.heading.sin", "target.heading.cos", "target.distance/2000",
  "target.gunArc", "target.missileArc", "danger", "seaControl", "enemies/8",
  "nearestMissile.dx/1000", "nearestMissile.dz/1000", "nearestMissile.present",
  "ownRadar.active", "esm.count/8", "esm.bearing.sin", "esm.bearing.cos",
  ...POLICY_ACTIONS.map(a => `previous.${a}`),
] as const;

export function encodePolicyObservation({ snapshot: s, context: c, memory }: DecisionInput): number[] {
  const p = s.self;
  const target = s.enemies.find(e => e.id === c.bestTargetId);
  let missile = s.missiles[0];
  for (const m of s.missiles) {
    if (!missile || Math.hypot(m.x - p.x, m.z - p.z) < Math.hypot(missile.x - p.x, missile.z - p.z)) missile = m;
  }
  const half = Math.max(1, s.operationalHalfExtent);
  const values = [p.hp / Math.max(1, p.maxHp), p.x / half, p.z / half,
    Math.sin(p.headingRad), Math.cos(p.headingRad), p.primaryCooldownSec / 30,
    p.secondaryCooldownSec / 30, p.torpedoCooldownSec / 30, p.adHudIncomingAswm / 8,
    Number(!!target), target ? (target.x - p.x) / 2000 : 0, target ? (target.z - p.z) / 2000 : 0,
    target ? target.hp / Math.max(1, target.maxHp) : 0,
    target ? Math.sin(target.headingRad) : 0, target ? Math.cos(target.headingRad) : 0,
    target ? Math.hypot(target.x - p.x, target.z - p.z) / 2000 : 0,
    Number(c.targetInGunArc), Number(c.targetInMissileArc), c.dangerScore,
    Number(c.selfInSeaControlZone), s.enemies.length / 8,
    missile ? (missile.x - p.x) / 1000 : 0, missile ? (missile.z - p.z) / 1000 : 0, Number(!!missile),
    Number(p.radarActive !== false), (s.esmBearings?.length ?? 0) / 8,
    c.esmBearingRad != null ? Math.sin(c.esmBearingRad) : 0,
    c.esmBearingRad != null ? Math.cos(c.esmBearingRad) : 0,
    ...POLICY_ACTIONS.map(a => Number(memory.lastIntent === a))];
  return values.map(v => Number.isFinite(v) ? Math.fround(Math.max(-1, Math.min(1, v))) : 0);
}

type Layer = { weight: number[][]; bias: number[] };
export type PolicyArtifact = {
  version: string; features: string[]; actions: string[]; activation: "tanh";
  layers: Layer[]; metadata?: Record<string, unknown>;
};

/** Data only: no pickle, executable model loader, arbitrary shapes or custom operators. */
export function validatePolicyArtifact(raw: unknown): PolicyArtifact {
  if (!raw || typeof raw !== "object") throw new Error("Invalid policy object");
  const a = raw as PolicyArtifact;
  if (a.version !== POLICY_VERSION || a.activation !== "tanh" ||
      JSON.stringify(a.features) !== JSON.stringify(POLICY_FEATURES) ||
      JSON.stringify(a.actions) !== JSON.stringify(POLICY_ACTIONS)) throw new Error("Incompatible policy contract");
  if (botProfile(a.metadata?.profile) !== "standard" && a.metadata?.profileControllerVersion !== profileControllerVersion(botProfile(a.metadata?.profile)))
    throw new Error("Incompatible personality controller version; retrain/export the model");
  const sizes = [POLICY_FEATURES.length, 64, 64, POLICY_ACTIONS.length];
  if (!Array.isArray(a.layers) || a.layers.length !== 3) throw new Error("Expected three policy layers");
  for (let i = 0; i < 3; i++) {
    const layer = a.layers[i];
    if (!layer || !Array.isArray(layer.bias) || !Array.isArray(layer.weight) ||
        layer.bias.length !== sizes[i + 1] || layer.weight.length !== sizes[i + 1] ||
        !layer.bias.every(v => Number.isFinite(v) && Math.abs(v) <= 1000) ||
        !layer.weight.every(row => Array.isArray(row) && row.length === sizes[i] &&
          row.every(v => Number.isFinite(v) && Math.abs(v) <= 1000))) throw new Error(`Invalid policy layer ${i}`);
  }
  return a;
}

export function policyLogits(artifact: PolicyArtifact, observation: readonly number[]): number[] {
  if (observation.length !== POLICY_FEATURES.length || !observation.every(Number.isFinite)) throw new Error("Invalid observation");
  let values = [...observation];
  artifact.layers.forEach((layer, index) => {
    values = layer.weight.map((row, j) => {
      let sum = layer.bias[j]!;
      for (let k = 0; k < row.length; k++) sum += row[k]! * values[k]!;
      return index < 2 ? Math.tanh(sum) : sum;
    });
  });
  return values;
}

export class LearnedPolicyStrategy implements BotDecisionStrategy {
  private readonly artifact: PolicyArtifact;
  readonly profile: BotProfile;
  constructor(raw: unknown) {
    this.artifact = validatePolicyArtifact(raw);
    this.profile = botProfile(this.artifact.metadata?.profile);
  }
  decide(input: DecisionInput): BotIntent {
    const logits = policyLogits(this.artifact, encodePolicyObservation(input));
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i]! > logits[best]!) best = i;
    return POLICY_ACTIONS[best]!;
  }
}
