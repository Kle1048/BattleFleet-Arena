const STORAGE_KEY = "bfa.followCameraTuning.v1";

export type FollowCameraTuning = {
  /** Neigung zur XZ-Ebene: 90° = senkrecht nach unten, kleinere Werte = flacher (mehr Horizont). */
  pitchDeg: number;
  /** `true`: Norden bleibt Bildschirm-oben. `false`: Bug zeigt nach oben (mitdrehend). */
  northUp: boolean;
  /**
   * Senkrechter Abstand Kamera ↔ Blickpunkt (Deck-Höhe), gleiche Rolle wie früher `FOLLOW_CAM_TOP_DOWN_HEIGHT`.
   * Größer = weiter weg / mehr Überblick.
   */
  heightAbovePivot: number;
};

export const DEFAULT_FOLLOW_CAMERA_TUNING: Readonly<FollowCameraTuning> = {
  pitchDeg: 90,
  northUp: true,
  heightAbovePivot: 800,
};

let current: FollowCameraTuning = { ...DEFAULT_FOLLOW_CAMERA_TUNING };

function clampPitch(v: number): number {
  return Math.max(15, Math.min(90, v));
}

function clampHeight(v: number): number {
  return Math.max(80, Math.min(5000, v));
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
  current = {
    pitchDeg: clampPitch(patch.pitchDeg ?? current.pitchDeg),
    northUp: typeof patch.northUp === "boolean" ? patch.northUp : current.northUp,
    heightAbovePivot: clampHeight(patch.heightAbovePivot ?? current.heightAbovePivot),
  };
  return current;
}

export function resetFollowCameraTuning(): void {
  current = { ...DEFAULT_FOLLOW_CAMERA_TUNING };
}

export function loadPersistedFollowCameraTuning(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<FollowCameraTuning>;
    if (!parsed || typeof parsed !== "object") return;
    applyFollowCameraTuning({
      pitchDeg: typeof parsed.pitchDeg === "number" ? parsed.pitchDeg : undefined,
      northUp: typeof parsed.northUp === "boolean" ? parsed.northUp : undefined,
      heightAbovePivot:
        typeof parsed.heightAbovePivot === "number" ? parsed.heightAbovePivot : undefined,
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
