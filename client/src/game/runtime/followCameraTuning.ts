const STORAGE_KEY = "bfa.followCameraTuning.v1";

export type FollowCameraTuning = {
  mode: "map" | "thirdPerson";
  orbitDistance: number;
  orbitPitchDeg: number;
  /** Neigung zur XZ-Ebene: 90° = senkrecht nach unten, kleinere Werte = flacher (mehr Horizont). */
  pitchDeg: number;
  /** `true`: Norden bleibt Bildschirm-oben. `false`: Bug zeigt nach oben (mitdrehend). */
  northUp: boolean;
  /**
   * Senkrechter Abstand Kamera ↔ Blickpunkt (Deck-Höhe), gleiche Rolle wie früher `FOLLOW_CAM_TOP_DOWN_HEIGHT`.
   * Größer = weiter weg / mehr Überblick.
   */
  heightAbovePivot: number;
  /**
   * Nur **Head-up**: Zeitkonstante τ (Sekunden) für die gedämpfte Kamera-Gier (`1 - exp(-dt/τ)`).
   * `0` = keine Verzögerung (sofortige Mitdrehung wie bisher).
   */
  headUpYawLagSec: number;
};

export const DEFAULT_FOLLOW_CAMERA_TUNING: Readonly<FollowCameraTuning> = {
  mode: "map",
  orbitDistance: 240,
  orbitPitchDeg: 18,
  pitchDeg: 70,
  northUp: true,
  heightAbovePivot: 900,
  headUpYawLagSec: 0.2,
};

let current: FollowCameraTuning = { ...DEFAULT_FOLLOW_CAMERA_TUNING };
const listeners = new Set<(value: Readonly<FollowCameraTuning>) => void>();
export function subscribeFollowCameraTuning(listener: (value: Readonly<FollowCameraTuning>) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function clampPitch(v: number): number {
  return Math.max(15, Math.min(90, v));
}

function clampHeight(v: number): number {
  return Math.max(80, Math.min(5000, v));
}

function clampHeadUpYawLagSec(v: number): number {
  return Math.max(0, Math.min(0.75, v));
}

/**
 * Kürzester Winkelweg: `current` → `target` mit exponentieller Annäherung.
 * `tauSec <= 0` springt sofort auf `target`.
 */
export function stepAngleTowardLag(
  current: number,
  target: number,
  dtSec: number,
  tauSec: number,
): number {
  if (!(tauSec > 0)) return target;
  const dt = Math.min(Math.max(dtSec, 0), 0.25);
  let diff = target - current;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const alpha = 1 - Math.exp(-dt / tauSec);
  return current + diff * alpha;
}

/**
 * Abstand Pivot → Kamera entlang −Z (North-up) bzw. entlang −Vorwärts (Head-up) in der XZ-Ebene.
 * Bei 90° Kippwinkel direkt über dem Ziel (back = 0).
 */
export function computeFollowCamBackOffset(height: number, pitchDeg: number): number {
  const p = clampPitch(pitchDeg);
  if (p >= 89.5) return 0;
  const pitchRad = (p * Math.PI) / 180;
  const tanPitch = Math.tan(pitchRad);
  if (Math.abs(tanPitch) < 1e-6) return 0;
  return height / tanPitch;
}

export function getFollowCameraTuning(): Readonly<FollowCameraTuning> {
  return current;
}

export function applyFollowCameraTuning(patch: Partial<FollowCameraTuning>): Readonly<FollowCameraTuning> {
  const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
  current = {
    mode: patch.mode === "map" || patch.mode === "thirdPerson" ? patch.mode : current.mode,
    orbitDistance: Math.max(80, Math.min(2000, finite(patch.orbitDistance, current.orbitDistance))),
    orbitPitchDeg: Math.max(8, Math.min(80, finite(patch.orbitPitchDeg, current.orbitPitchDeg))),
    pitchDeg: clampPitch(finite(patch.pitchDeg, current.pitchDeg)),
    northUp: typeof patch.northUp === "boolean" ? patch.northUp : current.northUp,
    heightAbovePivot: clampHeight(finite(patch.heightAbovePivot, current.heightAbovePivot)),
    headUpYawLagSec: clampHeadUpYawLagSec(
      finite(patch.headUpYawLagSec, current.headUpYawLagSec),
    ),
  };
  for (const listener of listeners) listener(current);
  return current;
}

export function resetFollowCameraTuning(): void {
  current = { ...DEFAULT_FOLLOW_CAMERA_TUNING };
  for (const listener of listeners) listener(current);
}

export function loadPersistedFollowCameraTuning(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<FollowCameraTuning>;
    if (!parsed || typeof parsed !== "object") return;
    applyFollowCameraTuning({
      mode: parsed.mode,
      orbitDistance: parsed.orbitDistance,
      orbitPitchDeg: parsed.orbitPitchDeg,
      pitchDeg: typeof parsed.pitchDeg === "number" ? parsed.pitchDeg : undefined,
      northUp: typeof parsed.northUp === "boolean" ? parsed.northUp : undefined,
      heightAbovePivot:
        typeof parsed.heightAbovePivot === "number" ? parsed.heightAbovePivot : undefined,
      headUpYawLagSec:
        typeof parsed.headUpYawLagSec === "number" ? parsed.headUpYawLagSec : undefined,
    });
  } catch {
    // ignore
  }
}

export function savePersistedFollowCameraTuning(value: FollowCameraTuning): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}
