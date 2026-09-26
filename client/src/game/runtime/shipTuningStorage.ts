import type { ShipDebugTuning } from "./shipDebugTuning";

const SHIP_STORAGE_KEY = "bfa.shipDebugTuning.v2";

export function loadPersistedShipTuning(): Partial<ShipDebugTuning> {
  try {
    const raw = localStorage.getItem(SHIP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<ShipDebugTuning>;
    if (!parsed || typeof parsed !== "object") return {};
    // Old absolute wake positions are not offsets relative to the stern.
    if (typeof parsed.wakeSpawnLocalZ === "number" && parsed.wakeSpawnLocalZ < -35) {
      const { wakeSpawnLocalZ: _drop, ...rest } = parsed;
      return rest;
    }
    return parsed;
  } catch { return {}; }
}

export function savePersistedShipTuning(value: Partial<ShipDebugTuning>): void {
  try { localStorage.setItem(SHIP_STORAGE_KEY, JSON.stringify(value)); } catch { /* Storage unavailable. */ }
}
