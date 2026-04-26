/**
 * Alle bekannten `localStorage`-Schlüssel dieses Clients (Debug, Kamera, Schiffs-Patches).
 * Bei neuen persistierten Keys hier ergänzen — sonst bleiben alte Werte beim „Reset“ stehen.
 */
export const BATTLEFLEET_LOCAL_STORAGE_KEYS: readonly string[] = [
  "bfa.waterShaderTuning.v2",
  "bfa.shipDebugTuning.v2",
  "bfa.environmentTuning.v1",
  "bfa.followCameraTuning.v1",
  "bfa.wakeRuntimeTuning.v1",
  "battlefleet_ship_profile_patch_v1",
  "battlefleet_show_ship_hitbox",
  "battlefleet_show_wreck_collision",
  "bfa.soundMix.v1",
];

/** Entfernt alle oben genannten Einträge (nur dieser Ursprung / Browser). */
export function clearPersistedClientSettings(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of BATTLEFLEET_LOCAL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Quota / private mode */
    }
  }
}
