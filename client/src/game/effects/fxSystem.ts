import type * as THREE from "three";
import { createSpriteParticleBackend } from "./spriteParticleBackend";
import { VisualColorTokens } from "../runtime/materialLibrary";
import { worldToRenderX } from "../runtime/renderCoords";

type FxPreset = "water" | "hit" | "island";

export type FxSystem = ReturnType<typeof createFxSystem>;

function normalizeImpactKind(kind: string): FxPreset {
  if (kind === "hit") return "hit";
  if (kind === "island") return "island";
  return "water";
}

export function createFxSystem(scene: THREE.Scene, environment: {
  /** Independent recipe randomness for deterministic replay; not coupled to Three.js UUIDs. */
  random?: () => number;
  now?: () => number;
} = {}): {
  update: (dtMs: number) => void;
  dispose: () => void;
  /** Artillerie-Einschlag; `worldX`/`worldZ` in Seekartenkoordinaten. */
  spawnArtilleryImpact: (preset: FxPreset, worldX: number, worldZ: number, intensity?: number) => void;
  spawnMissileImpact: (worldX: number, worldZ: number, kind: string) => void;
  /** ASuM-Start: kleiner Rauchschwall + kurze Glut (Seekarten-heading). */
  spawnMissileLaunchSmoke: (worldX: number, worldZ: number, headingRad: number, launchY?: number) => void;
  /**
   * Artillerie: Muzzleflash + kleine Rauchwolke am Rohr; `headingRad` = Schussrichtung atan2(Δx,Δz).
   * Optional `baseWorldY`: Mündungshöhe (Three.js-Y); sonst feste Deck-Höhe wie zuvor.
   */
  spawnArtilleryMuzzle: (
    worldX: number,
    worldZ: number,
    headingRad: number,
    baseWorldY?: number,
  ) => void;
  /**
   * ASuM-Flug: Rauch-Tick in Seekarten-XZ; `particleCount` ~2–12 (wird gekappt).
   * Partikel entlang der Tiefe gestaffelt, damit die Spur geschlossen wirkt.
   */
  spawnMissileTrailStreamTick: (
    worldX: number,
    worldZ: number,
    headingRad: number,
    particleCount?: number,
  ) => void;
  /** Schadensrauch hinter Schiff: `severity` = `damaged` | `heavily_damaged`. */
  spawnShipDamageSmokeTick: (
    worldX: number,
    worldZ: number,
    headingRad: number,
    severity: "damaged" | "heavily_damaged",
  ) => void;
  spawnTorpedoImpact: (worldX: number, worldZ: number, kind: string) => void;
  /** Schiff zerstört: mehrere große Hit-Bursts (Seekarten-XZ). */
  spawnShipDestroyedExplosion: (worldX: number, worldZ: number) => void;
  /**
   * Softkill / Düppel: große Rauchwolken Backbord & Steuerbord achtern, ~`altitudeM` über Wasser;
   * halten sich ~1 s am Ort, dann weiches Ausfaden (`alphaLerpPow`).
   * Optional `onPuff`: wird einmal pro Rauch-Puff aufgerufen (gleicher Zeitpunkt wie das Partikel), z. B. für SFX.
   */
  spawnSoftkillChaffCloud: (
    worldX: number,
    worldZ: number,
    headingRad: number,
    altitudeM?: number,
    onPuff?: (puffIndex: number) => void,
  ) => void;
  getStats: () => { activeParticles: number; pooledParticles: number };
} {
  const random = environment.random ?? Math.random;
  const now = environment.now ?? (() => performance.now());
  function randRange(min: number, max: number): number {
    return min + random() * (max - min);
  }
  const backend = createSpriteParticleBackend(scene, random);
  const emit = backend.emit;
  let disposed = false;

  /** Zeitversetzte Spawns (ohne setTimeout), Abwicklung in `update`. */
  type PendingFx = { runAtMs: number; fn: () => void };
  const pendingFx: PendingFx[] = [];

  function scheduleFx(runAtMs: number, fn: () => void): void {
    if (!disposed) pendingFx.push({ runAtMs, fn });
  }

  function flushPendingFx(): void {
    const t = now();
    let i = 0;
    while (i < pendingFx.length) {
      const job = pendingFx[i]!;
      if (t >= job.runAtMs) {
        job.fn();
        pendingFx.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  function spawnArtilleryImpact(preset: FxPreset, worldX: number, worldZ: number, intensity = 1): void {
    const x = worldToRenderX(worldX);
    const z = worldZ;
    const s = Math.max(0.65, Math.min(2.05, intensity));
    const warm = preset === "hit";
    const earthy = preset === "island";

    const ringLayers = preset === "water" ? 4 : preset === "island" ? 3 : 3;
    const ringColors =
      preset === "water"
        ? [
            VisualColorTokens.artilleryImpactWaterLight,
            VisualColorTokens.artilleryImpactWaterMid,
            VisualColorTokens.artilleryImpactWaterDark,
            VisualColorTokens.artilleryImpactWaterMid,
          ]
        : preset === "island"
          ? [
              VisualColorTokens.artilleryImpactIslandMid,
              VisualColorTokens.artilleryImpactIslandDark,
              VisualColorTokens.artilleryImpactIslandMid,
            ]
          : [
              VisualColorTokens.artilleryImpactHitInner,
              VisualColorTokens.artilleryImpactHitOuter,
              VisualColorTokens.artilleryImpactHitBurst,
            ];

    for (let i = 0; i < ringLayers; i++) {
      const col = ringColors[Math.min(i, ringColors.length - 1)]!;
      const delayScale = 1 + i * 0.2;
      emit({
        texture: "ring",
        x,
        y: preset === "hit" ? randRange(0.85, 1.8) : randRange(0.45, 0.95),
        z,
        vx: 0,
        vy: preset === "hit" ? 1.2 * s : 0.45 * s,
        vz: 0,
        dragPerSec: 0.35,
        maxAgeMs: (preset === "hit" ? randRange(340, 480) : randRange(380, 520)) * delayScale * 0.85,
        sizeStart: (preset === "hit" ? randRange(10, 16) : randRange(8, 14)) * s * (1 + i * 0.12),
        sizeEnd: (preset === "hit" ? randRange(55, 78) : randRange(48, 72)) * s * delayScale,
        alphaStart: preset === "water" ? 0.55 : preset === "island" ? 0.48 : 0.62,
        alphaEnd: 0,
        colorStart: col,
        colorEnd: preset === "water" ? VisualColorTokens.artilleryImpactWaterDark : earthy ? 0x4a4036 : 0x553422,
        spinPerSec: randRange(-0.15, 0.15),
      });
    }

    const nFlash = preset === "hit" ? 12 : 5;
    const nSmoke = preset === "hit" ? 20 : preset === "island" ? 14 : 12;
    const nAdd = preset === "hit" ? 6 : 0;

    for (let i = 0; i < nFlash; i++) {
      const ang = randRange(0, Math.PI * 2);
      const sp = randRange(8, 22) * s;
      emit({
        texture: "soft",
        x: x + Math.cos(ang) * randRange(0, 3),
        y: randRange(1.2, 4.2),
        z: z + Math.sin(ang) * randRange(0, 3),
        vx: Math.cos(ang) * sp * 0.05,
        vy: randRange(9, 14) * s,
        vz: Math.sin(ang) * sp * 0.05,
        dragPerSec: 1.35,
        maxAgeMs: randRange(180, 360),
        sizeStart: randRange(6, 12) * s,
        sizeEnd: randRange(16, 28) * s,
        alphaStart: 0.68,
        alphaEnd: 0,
        colorStart: warm ? 0xfff6d4 : earthy ? 0xd7c29a : 0xf2fbff,
        colorEnd: warm ? 0xff8d3e : earthy ? 0x967355 : 0x7acdf0,
        spinPerSec: randRange(-0.8, 0.8),
      });
    }

    for (let i = 0; i < nAdd; i++) {
      const ang = randRange(0, Math.PI * 2);
      emit({
        texture: "flashAdd",
        x: x + Math.cos(ang) * randRange(0, 4),
        y: randRange(1.5, 5),
        z: z + Math.sin(ang) * randRange(0, 4),
        vx: Math.cos(ang) * randRange(4, 14) * 0.4,
        vy: randRange(6, 16) * s,
        vz: Math.sin(ang) * randRange(4, 14) * 0.4,
        dragPerSec: 1.8,
        maxAgeMs: randRange(120, 240),
        sizeStart: randRange(8, 16) * s,
        sizeEnd: randRange(3, 8) * s,
        alphaStart: 0.85,
        alphaEnd: 0,
        colorStart: VisualColorTokens.artilleryImpactHitBurst,
        colorEnd: VisualColorTokens.artilleryImpactHitOuter,
        spinPerSec: randRange(-1.2, 1.2),
      });
    }

    for (let i = 0; i < nSmoke; i++) {
      const ang = randRange(0, Math.PI * 2);
      const drift = randRange(2, 10) * s;
      emit({
        texture: "smoke",
        x: x + Math.cos(ang) * randRange(0, 5),
        y: randRange(2.0, 5.8),
        z: z + Math.sin(ang) * randRange(0, 5),
        vx: Math.cos(ang) * drift * 0.12,
        vy: randRange(2.5, 6.2) * s,
        vz: Math.sin(ang) * drift * 0.12,
        dragPerSec: 0.72,
        maxAgeMs: randRange(1200, 2600),
        sizeStart: randRange(7, 12) * s,
        sizeEnd: randRange(28, 46) * s,
        alphaStart: warm ? 0.56 : earthy ? 0.5 : 0.42,
        alphaEnd: 0,
        colorStart: warm ? 0x6c6460 : earthy ? 0x7b6a58 : 0x6e7c88,
        colorEnd: warm ? 0x222224 : earthy ? 0x342c26 : 0x2b3842,
        spinPerSec: randRange(-0.3, 0.3),
      });
    }
  }

  function spawnWeaponImpact(weapon: "missile" | "torpedo", preset: FxPreset, x: number, z: number): void {
    const s = weapon === "missile" ? 0.64 : 1.35;
    const warm = preset === "hit";
    const earthy = preset === "island";
    const waterCol =
      weapon === "missile" ? VisualColorTokens.missileImpactWater : VisualColorTokens.torpedoImpactWater;
    const hitCol =
      weapon === "missile" ? VisualColorTokens.missileImpactHit : VisualColorTokens.torpedoImpactHit;

    const ringLayers = 2;
    const ringColors =
      preset === "hit"
        ? [hitCol, hitCol]
        : preset === "island"
          ? [VisualColorTokens.artilleryImpactIslandMid, VisualColorTokens.artilleryImpactIslandDark]
          : [waterCol, waterCol];

    for (let i = 0; i < ringLayers; i++) {
      const col = ringColors[Math.min(i, ringColors.length - 1)]!;
      const delayScale = 1 + i * 0.22;
      emit({
        texture: "ring",
        x,
        y: preset === "hit" ? randRange(0.75, 1.55) : randRange(0.42, 0.88),
        z,
        vx: 0,
        vy: preset === "hit" ? s : 0.38 * s,
        vz: 0,
        dragPerSec: 0.38,
        maxAgeMs: (preset === "hit" ? randRange(300, 440) : randRange(340, 480)) * delayScale * 0.88,
        sizeStart: (preset === "hit" ? randRange(8, 13) : randRange(7, 11)) * s * (1 + i * 0.1),
        sizeEnd: (preset === "hit" ? randRange(42, 62) : randRange(38, 56)) * s * delayScale,
        alphaStart: preset === "water" ? 0.5 : preset === "island" ? 0.46 : 0.58,
        alphaEnd: 0,
        colorStart: col,
        colorEnd:
          preset === "water"
            ? waterCol === VisualColorTokens.missileImpactWater
              ? 0x5a7a9a
              : 0x3a8aa8
            : earthy
              ? 0x4a4036
              : weapon === "missile"
                ? 0x662218
                : 0x5c3818,
        spinPerSec: randRange(-0.12, 0.12),
      });
    }

    const nFlash = weapon === "torpedo" ? (preset === "hit" ? 16 : 9) : preset === "hit" ? 8 : 4;
    const nSmoke = weapon === "torpedo" ? (preset === "hit" ? 24 : 14) : preset === "hit" ? 13 : 8;
    const nAdd = weapon === "torpedo" ? (preset === "hit" ? 8 : 2) : preset === "hit" ? 5 : 0;

    for (let i = 0; i < nFlash; i++) {
      const ang = randRange(0, Math.PI * 2);
      const sp = randRange(7, 18) * s;
      emit({
        texture: "soft",
        x: x + Math.cos(ang) * randRange(0, 2.5),
        y: randRange(1.0, 3.6),
        z: z + Math.sin(ang) * randRange(0, 2.5),
        vx: Math.cos(ang) * sp * 0.045,
        vy: randRange(7, 12) * s,
        vz: Math.sin(ang) * sp * 0.045,
        dragPerSec: 1.28,
        maxAgeMs: randRange(160, 320),
        sizeStart: randRange(5, 10) * s,
        sizeEnd: randRange(14, 24) * s,
        alphaStart: 0.64,
        alphaEnd: 0,
        colorStart: warm ? (weapon === "missile" ? 0xffdde8 : 0xffe8d8) : earthy ? 0xd7c29a : waterCol,
        colorEnd: warm ? hitCol : earthy ? 0x967355 : weapon === "missile" ? 0xaaccff : 0x8ee8ff,
        spinPerSec: randRange(-0.65, 0.65),
      });
    }

    for (let i = 0; i < nAdd; i++) {
      const ang = randRange(0, Math.PI * 2);
      emit({
        texture: "flashAdd",
        x: x + Math.cos(ang) * randRange(0, 3),
        y: randRange(1.2, 4.2),
        z: z + Math.sin(ang) * randRange(0, 3),
        vx: Math.cos(ang) * randRange(3, 11) * 0.38,
        vy: randRange(5, 14) * s,
        vz: Math.sin(ang) * randRange(3, 11) * 0.38,
        dragPerSec: 1.75,
        maxAgeMs: randRange(110, 220),
        sizeStart: randRange(6, 13) * s,
        sizeEnd: randRange(2.5, 7) * s,
        alphaStart: 0.8,
        alphaEnd: 0,
        colorStart: hitCol,
        colorEnd: weapon === "missile" ? 0xff3318 : 0xffaa66,
        spinPerSec: randRange(-1.1, 1.1),
      });
    }

    for (let i = 0; i < nSmoke; i++) {
      const ang = randRange(0, Math.PI * 2);
      const drift = randRange(2, 8) * s;
      emit({
        texture: "smoke",
        x: x + Math.cos(ang) * randRange(0, 4),
        y: randRange(1.8, 5.0),
        z: z + Math.sin(ang) * randRange(0, 4),
        vx: Math.cos(ang) * drift * 0.1,
        vy: randRange(2.2, 5.5) * s,
        vz: Math.sin(ang) * drift * 0.1,
        dragPerSec: 0.7,
        maxAgeMs: randRange(1000, 2200),
        sizeStart: randRange(6, 10) * s,
        sizeEnd: randRange(24, 38) * s,
        alphaStart: warm ? 0.52 : earthy ? 0.46 : 0.38,
        alphaEnd: 0,
        colorStart: warm ? 0x5c5855 : earthy ? 0x73655a : 0x5c6a78,
        colorEnd: warm ? 0x1e1e20 : earthy ? 0x2e2820 : 0x263038,
        spinPerSec: randRange(-0.28, 0.28),
      });
    }
  }

  function spawnMissileImpact(worldX: number, worldZ: number, kind: string): void {
    spawnWeaponImpact("missile", normalizeImpactKind(kind), worldToRenderX(worldX), worldZ);
  }

  function spawnMissileLaunchSmoke(worldX: number, worldZ: number, headingRad: number, launchY = 3.3): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ) || !Number.isFinite(headingRad)) return;
    const sinH = Math.sin(headingRad);
    const cosH = Math.cos(headingRad);
    const rxW = -cosH;
    const rzW = sinH;

    function puff(strong: boolean): void {
      const n = strong ? 9 : 5;
      for (let i = 0; i < n; i++) {
        const back = randRange(2, strong ? 10 : 7);
        const side = randRange(-4.5, 4.5);
        const ox = worldX - sinH * back + rxW * side;
        const oz = worldZ - cosH * back + rzW * side;
        const px = worldToRenderX(ox);
        const baseMag = randRange(14, 32);
        const vx = sinH * baseMag * 0.038 + randRange(-5, 5) * 0.07;
        const vz = -cosH * baseMag * 0.038 + randRange(-5, 5) * 0.07;
        emit({
          texture: "smoke",
          x: px,
          y: launchY + randRange(-1.3, 1.3),
          z: oz,
          vx,
          vy: randRange(4, 10),
          vz,
          dragPerSec: 0.85,
          maxAgeMs: randRange(strong ? 520 : 400, strong ? 980 : 720),
          sizeStart: randRange(3.5, 6),
          sizeEnd: randRange(14, 24),
          alphaStart: strong ? 0.42 : 0.32,
          alphaEnd: 0,
          colorStart: VisualColorTokens.missileBody,
          colorEnd: VisualColorTokens.missileEmissive,
          spinPerSec: randRange(-0.45, 0.45),
        });
      }
      if (strong) {
        for (let j = 0; j < 3; j++) {
          const back = randRange(0.8, 4);
          const ox = worldX - sinH * back;
          const oz = worldZ - cosH * back;
          emit({
            texture: "flashAdd",
            x: worldToRenderX(ox),
            y: launchY + randRange(-0.9, 0.9),
            z: oz,
            vx: sinH * randRange(6, 14) * 0.25,
            vy: randRange(5, 12),
            vz: -cosH * randRange(6, 14) * 0.25,
            dragPerSec: 2.1,
            maxAgeMs: randRange(90, 180),
            sizeStart: randRange(3, 6),
            sizeEnd: randRange(1.2, 3),
            alphaStart: 0.55,
            alphaEnd: 0,
            colorStart: VisualColorTokens.missileEmissive,
            colorEnd: VisualColorTokens.missileImpactHit,
            spinPerSec: randRange(-0.8, 0.8),
          });
        }
      }
    }

    puff(true);
    scheduleFx(now() + 55, () => puff(false));
  }

  function spawnArtilleryMuzzle(
    worldX: number,
    worldZ: number,
    headingRad: number,
    baseWorldY?: number,
  ): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ) || !Number.isFinite(headingRad)) return;
    const sinH = Math.sin(headingRad);
    const cosH = Math.cos(headingRad);
    const rxW = -cosH;
    const rzW = sinH;
    const px0 = worldToRenderX(worldX);
    const z0 = worldZ;
    const useMuzzleY = Number.isFinite(baseWorldY);
    const yBurst = (lo: number, hi: number) =>
      useMuzzleY ? (baseWorldY as number) + randRange(-1.2, 1.2) : randRange(lo, hi);

    for (let i = 0; i < 4; i++) {
      const ang = randRange(0, Math.PI * 2);
      emit({
        texture: "flashAdd",
        x: px0 + Math.cos(ang) * randRange(0, 2),
        y: yBurst(9.5, 13.5),
        z: z0 + Math.sin(ang) * randRange(0, 2),
        vx: sinH * randRange(8, 18) * 0.12,
        vy: randRange(4, 10),
        vz: cosH * randRange(8, 18) * 0.12,
        dragPerSec: 2.4,
        maxAgeMs: randRange(70, 140),
        sizeStart: randRange(4, 8),
        sizeEnd: randRange(1.5, 3.5),
        alphaStart: 0.72,
        alphaEnd: 0,
        colorStart: VisualColorTokens.artilleryImpactHitInner,
        colorEnd: VisualColorTokens.artilleryImpactHitBurst,
        spinPerSec: randRange(-1, 1),
      });
    }
    for (let i = 0; i < 3; i++) {
      const ang = randRange(0, Math.PI * 2);
      emit({
        texture: "soft",
        x: px0 + Math.cos(ang) * randRange(0, 1.5),
        y: yBurst(10, 13),
        z: z0 + Math.sin(ang) * randRange(0, 1.5),
        vx: sinH * randRange(4, 12) * 0.1,
        vy: randRange(5, 11),
        vz: cosH * randRange(4, 12) * 0.1,
        dragPerSec: 1.6,
        maxAgeMs: randRange(100, 200),
        sizeStart: randRange(3, 6),
        sizeEnd: randRange(10, 18),
        alphaStart: 0.55,
        alphaEnd: 0,
        colorStart: 0xffe8a8,
        colorEnd: VisualColorTokens.artilleryImpactHitOuter,
        spinPerSec: randRange(-0.6, 0.6),
      });
    }

    for (let i = 0; i < 7; i++) {
      const back = randRange(1, 6);
      const side = randRange(-3, 3);
      const ox = worldX - sinH * back + rxW * side;
      const oz = worldZ - cosH * back + rzW * side;
      const px = worldToRenderX(ox);
      const baseMag = randRange(10, 22);
      emit({
        texture: "smoke",
        x: px,
        y: yBurst(9.5, 13),
        z: oz,
        vx: sinH * baseMag * 0.032 + randRange(-4, 4) * 0.06,
        vy: randRange(3, 8),
        vz: -cosH * baseMag * 0.032 + randRange(-4, 4) * 0.06,
        dragPerSec: 0.78,
        maxAgeMs: randRange(450, 900),
        sizeStart: randRange(3, 6),
        sizeEnd: randRange(14, 24),
        alphaStart: randRange(0.32, 0.45),
        alphaEnd: 0,
        colorStart: 0x9a9ea4,
        colorEnd: 0x3a3e44,
        spinPerSec: randRange(-0.35, 0.35),
      });
    }
  }

  /** Neutrales Grau-Rauch, bewusst ohne Raketen-Rottöne (nur Schweif). */
  const MISSILE_TRAIL_SMOKE_A = 0xa8aeb6;
  const MISSILE_TRAIL_SMOKE_B = 0x4a525a;

  function spawnMissileTrailStreamTick(
    worldX: number,
    worldZ: number,
    headingRad: number,
    particleCount = 3,
  ): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ) || !Number.isFinite(headingRad)) return;
    const sinH = Math.sin(headingRad);
    const cosH = Math.cos(headingRad);
    const rxW = -cosH;
    const rzW = sinH;
    const n = Math.max(2, Math.min(12, Math.round(particleCount)));
    for (let i = 0; i < n; i++) {
      const along = n > 1 ? i / (n - 1) : 0;
      const back = randRange(1.4, 3.2) + along * randRange(4.5, 10);
      const side = randRange(-3.4, 3.4);
      const ox = worldX - sinH * back + rxW * side;
      const oz = worldZ - cosH * back + rzW * side;
      const px = worldToRenderX(ox);
      const baseMag = randRange(6, 14);
      const vx = sinH * baseMag * 0.022 + randRange(-2.2, 2.2) * 0.05;
      const vz = -cosH * baseMag * 0.022 + randRange(-2.2, 2.2) * 0.05;
      emit({
        texture: "smoke",
        x: px,
        y: randRange(2.3, 3.9),
        z: oz,
        vx,
        vy: randRange(2.0, 5.2),
        vz,
        dragPerSec: 0.92,
        maxAgeMs: randRange(480, 780),
        sizeStart: randRange(2.6, 4.5),
        sizeEnd: randRange(12, 21),
        alphaStart: randRange(0.22, 0.34),
        alphaEnd: 0,
        colorStart: MISSILE_TRAIL_SMOKE_A,
        colorEnd: MISSILE_TRAIL_SMOKE_B,
        spinPerSec: randRange(-0.28, 0.28),
        alphaLerpPow: 1.55,
      });
    }
  }

  function spawnShipDamageSmokeTick(
    worldX: number,
    worldZ: number,
    headingRad: number,
    severity: "damaged" | "heavily_damaged",
  ): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ) || !Number.isFinite(headingRad)) return;
    const sinH = Math.sin(headingRad);
    const cosH = Math.cos(headingRad);
    const rxW = -cosH;
    const rzW = sinH;
    const particles = severity === "heavily_damaged" ? 5 : 2;
    const start = severity === "heavily_damaged" ? 5.5 : 3.6;
    const grow = severity === "heavily_damaged" ? 38 : 24;
    const colorStart = severity === "heavily_damaged" ? 0x6d6d6d : 0xc8c8c8;
    const colorEnd = severity === "heavily_damaged" ? 0x1e1e1e : 0x5a5a5a;
    const alphaStart = severity === "heavily_damaged" ? 0.48 : 0.35;
    const lifeMin = severity === "heavily_damaged" ? 1500 : 1100;
    const lifeMax = severity === "heavily_damaged" ? 2800 : 1900;
    for (let i = 0; i < particles; i++) {
      const back = randRange(16, 30);
      const side = randRange(-5.5, 5.5);
      const ox = worldX - sinH * back + rxW * side;
      const oz = worldZ - cosH * back + rzW * side;
      emit({
        texture: "smoke",
        x: worldToRenderX(ox),
        y: randRange(1.8, 3.8),
        z: oz,
        vx: randRange(-2.2, 2.2) * 0.07,
        vy: randRange(2.4, 4.8),
        vz: randRange(-2.2, 2.2) * 0.07,
        dragPerSec: 0.6,
        maxAgeMs: randRange(lifeMin, lifeMax),
        sizeStart: randRange(start, start + 2),
        sizeEnd: randRange(grow - 4, grow),
        alphaStart,
        alphaEnd: 0,
        colorStart,
        colorEnd,
        spinPerSec: randRange(-0.32, 0.32),
        alphaLerpPow: 1.35,
      });
    }
  }

  function spawnTorpedoImpact(worldX: number, worldZ: number, kind: string): void {
    spawnWeaponImpact("torpedo", normalizeImpactKind(kind), worldToRenderX(worldX), worldZ);
  }

  function spawnShipDestroyedExplosion(worldX: number, worldZ: number): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return;
    const w = worldX;
    const z0 = worldZ;
    const t0 = now();

    /** Kleine Kreise um den Todpunkt (enger als zuvor). */
    function burstRing(count: number, rMin: number, rMax: number, intLo: number, intHi: number): void {
      for (let i = 0; i < count; i++) {
        const ang = randRange(0, Math.PI * 2);
        const dist = randRange(rMin, rMax);
        spawnArtilleryImpact(
          "hit",
          w + Math.cos(ang) * dist,
          z0 + Math.sin(ang) * dist,
          randRange(intLo, intHi),
        );
      }
    }

    // Welle 0 — kernnah
    spawnArtilleryImpact("hit", w, z0, 1.48);
    burstRing(3, 3, 10, 0.98, 1.2);

    // Welle 1 — nach ~65 ms, etwas weiter, immer noch dicht
    scheduleFx(t0 + 65, () => {
      spawnArtilleryImpact("hit", w, z0, 1.08);
      burstRing(4, 5, 14, 0.88, 1.12);
    });

    // Welle 2 — ~140 ms
    scheduleFx(t0 + 140, () => {
      burstRing(5, 6, 18, 0.75, 1.0);
    });

    // Welle 3 — ~220 ms, nachhall / kleinere Blitze
    scheduleFx(t0 + 220, () => {
      burstRing(4, 4, 12, 0.62, 0.86);
    });

    // Welle 4 — ~300 ms, absorbierender Abschluss
    scheduleFx(t0 + 300, () => {
      burstRing(3, 2, 8, 0.52, 0.72);
    });
  }

  const SOFTKILL_CHAFF_DEFAULT_ALT_M = 20;

  function spawnSoftkillChaffCloud(
    worldX: number,
    worldZ: number,
    headingRad: number,
    altitudeM = SOFTKILL_CHAFF_DEFAULT_ALT_M,
    onPuff?: (puffIndex: number) => void,
  ): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ) || !Number.isFinite(headingRad)) return;
    const h = altitudeM;
    if (!Number.isFinite(h) || h < 2) return;

    const sinH = Math.sin(headingRad);
    const cosH = Math.cos(headingRad);
    /** Bug (+Z) in Seekarten-XZ. */
    const fwdX = sinH;
    const fwdZ = cosH;
    const aftX = -fwdX;
    const aftZ = -fwdZ;
    /** Steuerbord (+X relativ zum Bug). */
    const stbdX = cosH;
    const stbdZ = -sinH;

    const CHAFF_SMOKE_A = 0xd0d8e0;
    const CHAFF_SMOKE_B = 0x7a8490;
    const t0 = now();

    function puffAt(wx: number, wy: number, wz: number, delayMs: number, spreadIdx: number): void {
      scheduleFx(t0 + delayMs, () => {
        onPuff?.(spreadIdx);
        const px = worldToRenderX(wx);
        const jitterY = randRange(-1.2, 1.6);
        const drift = 0.15 + spreadIdx * 0.06;
        emit({
          texture: "smoke",
          x: px + randRange(-1.8, 1.8),
          y: wy + jitterY,
          z: wz + randRange(-1.8, 1.8),
          vx: randRange(-drift, drift),
          vy: randRange(-0.12, 0.18),
          vz: randRange(-drift, drift),
          dragPerSec: 0.45,
          maxAgeMs: randRange(1550, 1850),
          sizeStart: randRange(12, 18),
          sizeEnd: randRange(32, 48),
          alphaStart: randRange(0.4, 0.52),
          alphaEnd: 0,
          colorStart: CHAFF_SMOKE_A,
          colorEnd: CHAFF_SMOKE_B,
          spinPerSec: randRange(-0.22, 0.22),
          alphaLerpPow: randRange(6.5, 8.5),
        });
      });
    }

    /** Weiter achtern als früher (~Bug-Pivot); nacheinander mit festem Abstand (ms). */
    const CHAFF_PUFF_COUNT = 8;
    const CHAFF_STAGGER_MS = 58;
    const CHAFF_AFT_MIN = 30;
    const CHAFF_AFT_MAX = 52;
    const CHAFF_BEAM_MIN = 8;
    const CHAFF_BEAM_MAX = 14;

    for (let i = 0; i < CHAFF_PUFF_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const aftAlong = randRange(CHAFF_AFT_MIN, CHAFF_AFT_MAX);
      const beam = side * randRange(CHAFF_BEAM_MIN, CHAFF_BEAM_MAX);
      const wx = worldX + aftX * aftAlong + stbdX * beam;
      const wz = worldZ + aftZ * aftAlong + stbdZ * beam;
      puffAt(wx, h, wz, i * CHAFF_STAGGER_MS, i);
    }
  }

  function update(dtMs: number): void {
    if (disposed) return;
    flushPendingFx();
    backend.update(dtMs);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pendingFx.length = 0;
    backend.dispose();
  }

  return {
    update,
    dispose,
    spawnArtilleryImpact,
    spawnMissileImpact,
    spawnMissileLaunchSmoke,
    spawnArtilleryMuzzle,
    spawnMissileTrailStreamTick,
    spawnShipDamageSmokeTick,
    spawnTorpedoImpact,
    spawnShipDestroyedExplosion,
    spawnSoftkillChaffCloud,
    getStats: backend.getStats,
  };
}
