import { DEFAULT_SHIP_DEBUG_TUNING, type ShipDebugTuning } from "./shipDebugTuning";

const SHIP_STORAGE_KEY = "bfa.shipDebugTuning.v2";

export function loadPersistedShipTuning(): Partial<ShipDebugTuning> {
  try {
    const raw = localStorage.getItem(SHIP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<ShipDebugTuning>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => {
      if (!Object.hasOwn(DEFAULT_SHIP_DEBUG_TUNING, key)) return false;
      const expected = DEFAULT_SHIP_DEBUG_TUNING[key as keyof ShipDebugTuning];
      return typeof value === typeof expected && (typeof value !== "number" || Number.isFinite(value));
    }));
  } catch { return {}; }
}

export function savePersistedShipTuning(value: Partial<ShipDebugTuning>): void {
  try { localStorage.setItem(SHIP_STORAGE_KEY, JSON.stringify(value)); } catch { /* Storage unavailable. */ }
}
