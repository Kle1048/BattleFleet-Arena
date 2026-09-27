import type { AirDefenseNotice, MatchPresentationEvent } from "../presentation/MatchPresentationEvent";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
/** Air-defense messages historically also accepted numeric strings; do not coerce objects. */
function compatibleNumber(value: unknown): number | null {
  if (finite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function airDefense(payload: Record<string, unknown>): AirDefenseNotice | null {
  const x = compatibleNumber(payload.x), z = compatibleNumber(payload.z);
  const layer = typeof payload.layer === "string" ? payload.layer.toLowerCase() : "";
  if (x === null || z === null || payload.weapon !== "aswm" ||
    (layer !== "sam" && layer !== "pd" && layer !== "ciws")) return null;
  const hasMount = [payload.slotId, payload.fromX, payload.fromY, payload.fromZ].some(v => v !== undefined);
  if (hasMount && (typeof payload.slotId !== "string" || !payload.slotId || !finite(payload.fromX) ||
    !finite(payload.fromY) || !finite(payload.fromZ))) return null;
  return {
    x, z, layer,
    ...(hasMount ? { slotId: payload.slotId as string, fromX: payload.fromX as number,
      fromY: payload.fromY as number, fromZ: payload.fromZ as number } : {}),
    defenderX: compatibleNumber(payload.defenderX), defenderZ: compatibleNumber(payload.defenderZ),
    defenderId: typeof payload.defenderId === "string" ? payload.defenderId : null,
    missileId: compatibleNumber(payload.id) ?? compatibleNumber(payload.missileId),
  };
}

/** Decode only presentation events. Unknown/control messages never become effects by accident. */
export function decodeMatchEvent(type: unknown, raw: unknown): MatchPresentationEvent | null {
  if (type === "missileLockOn" || type === "aswmMagazineReloaded") return { type };
  const payload = record(raw);
  // The old wire contract treats anything other than `true` as a failed softkill attempt.
  if (type === "softkillResult") return { type, payload: { success: payload?.success === true } };
  if (!payload) return null;
  switch (type) {
    case "collisionContact":
      return payload.kind === "ship" || payload.kind === "island"
        ? { type, payload: { kind: payload.kind } } : null;
    case "artyFired": {
      const { shellId, ownerId, fromX, fromZ, toX, toZ, flightMs } = payload;
      if (!finite(shellId) || typeof ownerId !== "string" || !finite(fromX) || !finite(fromZ) ||
        !finite(toX) || !finite(toZ) || !finite(flightMs)) return null;
      const hasMount = payload.slotId !== undefined || payload.fromY !== undefined;
      if (hasMount && (typeof payload.slotId !== "string" || !payload.slotId || !finite(payload.fromY))) return null;
      return { type, payload: { shellId, ownerId, fromX, fromZ, toX, toZ, flightMs,
        ...(hasMount ? { slotId: payload.slotId as string, fromY: payload.fromY as number } : {}) } };
    }
    case "artyImpact": {
      const { shellId, x, z } = payload;
      if (!finite(shellId) || !finite(x) || !finite(z)) return null;
      const kind = payload.kind === "water" || payload.kind === "hit" || payload.kind === "island" ? payload.kind : undefined;
      return { type, payload: { shellId, x, z, kind } };
    }
    case "aswmFired": {
      if (typeof payload.ownerId !== "string") return null;
      const keys = ["missileId", "launcherId", "fromX", "fromY", "fromZ", "headingRad"] as const;
      if (!keys.some(key => payload[key] !== undefined)) return { type, payload: { ownerId: payload.ownerId } };
      const { missileId, launcherId, fromX, fromY, fromZ, headingRad } = payload;
      if (typeof launcherId !== "string" || !launcherId || !finite(missileId) || !finite(fromX) ||
        !finite(fromY) || !finite(fromZ) || !finite(headingRad)) return null;
      return { type, payload: { ownerId: payload.ownerId, missileId, launcherId, fromX, fromY, fromZ, headingRad } };
    }
    case "torpedoFired":
      return typeof payload.ownerId === "string" ? { type, payload: { ownerId: payload.ownerId } } : null;
    case "aswmImpact":
    case "torpedoImpact": {
      const { x, z } = payload;
      if (!finite(x) || !finite(z)) return null;
      return { type, payload: { x, z, kind: typeof payload.kind === "string" ? payload.kind : "hit" } };
    }
    case "airDefenseFire":
    case "airDefenseIntercept": {
      const notice = airDefense(payload);
      return notice ? { type, payload: notice } : null;
    }
    default: return null;
  }
}

export function decodePong(raw: unknown): number | null {
  const value = record(raw)?.clientTime;
  // Preserve primitive legacy coercion (including booleans/null), but never execute conversion hooks.
  if (value !== null && !["string", "number", "boolean"].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
