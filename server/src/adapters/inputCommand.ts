import type { InputCommand } from "@battlefleet/shared/protocol";

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Preserve legacy primitive control coercion without executing object conversion hooks. */
function controlNumber(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Transport boundary: accept only intentions, never identity or authoritative results.
 * Invalid optional numbers are omitted so the last valid aim/tuning remains in effect.
 * Range limits are domain rules and are applied by GameSimulation, not duplicated here.
 */
export function decodeInputCommand(payload: unknown): InputCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  return {
    throttle: controlNumber(raw.throttle),
    rudderInput: controlNumber(raw.rudderInput),
    aimX: finiteNumber(raw.aimX),
    aimZ: finiteNumber(raw.aimZ),
    mineSpawnLocalZ: finiteNumber(raw.mineSpawnLocalZ),
    primaryFire: raw.primaryFire === true,
    secondaryFire: raw.secondaryFire === true,
    torpedoFire: raw.torpedoFire === true,
    aswmFireSide: raw.aswmFireSide === "port" || raw.aswmFireSide === "starboard" ? raw.aswmFireSide : undefined,
    radarActive: typeof raw.radarActive === "boolean" ? raw.radarActive : undefined,
  };
}
