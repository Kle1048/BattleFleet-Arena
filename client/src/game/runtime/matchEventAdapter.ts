export type ParsedArtyFired = {
  shellId: number;
  ownerId: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  flightMs: number;
};

export type ParsedArtyImpact = {
  shellId: number;
  x: number;
  z: number;
  kind?: "water" | "hit" | "island";
};

export type ParsedOwnerEvent = { ownerId: string };

export type ParsedSimpleImpact = { x: number; z: number; kind: string };

export type ParsedAirDefenseEvent = {
  type: "airDefenseFire" | "airDefenseIntercept";
  x: number;
  z: number;
  layer: "sam" | "ciws";
  defenderX: number | null;
  defenderZ: number | null;
  defenderId: string | null;
};

function readFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readRecord(msg: unknown): Record<string, unknown> | null {
  if (msg != null && typeof msg === "object" && !Array.isArray(msg)) {
    return msg as Record<string, unknown>;
  }
  return null;
}

export function parseArtyFiredEvent(msg: unknown): ParsedArtyFired | null {
  const m = msg as Partial<ParsedArtyFired>;
  if (
    typeof m?.shellId === "number" &&
    typeof m?.ownerId === "string" &&
    typeof m?.fromX === "number" &&
    typeof m?.fromZ === "number" &&
    typeof m?.toX === "number" &&
    typeof m?.toZ === "number" &&
    typeof m?.flightMs === "number"
  ) {
    return {
      shellId: m.shellId,
      ownerId: m.ownerId,
      fromX: m.fromX,
      fromZ: m.fromZ,
      toX: m.toX,
      toZ: m.toZ,
      flightMs: m.flightMs,
    };
  }
  return null;
}

export function parseArtyImpactEvent(msg: unknown): ParsedArtyImpact | null {
  const m = msg as { shellId?: number; x?: number; z?: number; kind?: string };
  if (typeof m?.shellId !== "number" || typeof m?.x !== "number" || typeof m?.z !== "number") {
    return null;
  }
  const kind = m.kind === "water" || m.kind === "hit" || m.kind === "island" ? m.kind : undefined;
  return { shellId: m.shellId, x: m.x, z: m.z, kind };
}

export function parseOwnerEvent(msg: unknown): ParsedOwnerEvent | null {
  const m = msg as { ownerId?: string };
  return typeof m?.ownerId === "string" ? { ownerId: m.ownerId } : null;
}

export function parseSimpleImpactEvent(msg: unknown): ParsedSimpleImpact | null {
  const m = msg as { x?: number; z?: number; kind?: string };
  if (typeof m?.x !== "number" || typeof m?.z !== "number") return null;
  return { x: m.x, z: m.z, kind: typeof m.kind === "string" ? m.kind : "hit" };
}

export function parseAirDefenseEvent(type: unknown, msg: unknown): ParsedAirDefenseEvent | null {
  const t = String(type);
  if (t !== "airDefenseFire" && t !== "airDefenseIntercept") return null;
  const rec = readRecord(msg);
  if (!rec) return null;
  const x = readFiniteNumber(rec.x);
  const z = readFiniteNumber(rec.z);
  if (x == null || z == null) return null;
  if (String(rec.weapon) !== "aswm") return null;
  const layerRaw = String(rec.layer ?? "").toLowerCase();
  if (layerRaw !== "sam" && layerRaw !== "ciws") return null;
  const defenderX = readFiniteNumber(rec.defenderX);
  const defenderZ = readFiniteNumber(rec.defenderZ);
  const defenderId = typeof rec.defenderId === "string" ? rec.defenderId : null;
  return {
    type: t,
    x,
    z,
    layer: layerRaw as "sam" | "ciws",
    defenderX,
    defenderZ,
    defenderId,
  };
}
