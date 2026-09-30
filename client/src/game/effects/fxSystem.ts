import type * as THREE from "three";
import { createImpactLights } from "./impactLights";
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
  camera?: THREE.Camera;
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
  const backend = createSpriteParticleBackend(scene, random, environment.camera);
  const emit = backend.emit;
  const lights = createImpactLights(scene, environment.camera);
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

  /** Small, distinct phases replace overlapping radial impact clouds. */
  function impact(preset: FxPreset, x: number, z: number, scale: number): void {
    if (disposed || !Number.isFinite(x + z + scale)) return;
    const water = preset === "water", hit = preset === "hit";
    if (hit) lights.flash(x, z, scale);
    const particle = (options: Partial<Parameters<typeof emit>[0]>) => emit({
      texture: "soft", x, y: 3, z, vx: 0, vy: 0, vz: 0, dragPerSec: .6,
      maxAgeMs: 800, sizeStart: 5 * scale, sizeEnd: 14 * scale,
      alphaStart: .7, alphaEnd: 0, colorStart: 0xffd483, colorEnd: 0xa13312,
      spinPerSec: 0, ...options,
    });
    if (water) {
      // Ripples live on the sea plane; spray and droplets follow ballistic arcs.
      for (let i = 0; i < 2; i++) particle({ texture: "ring", ground: true,
        y: .35 + i * .08, sizeStart: (5 + i * 3) * scale, sizeEnd: (48 + i * 17) * scale,
        maxAgeMs: 1000 + i * 220, alphaStart: .36, colorStart: 0xd2f5ff, colorEnd: 0x5d99ac });
      for (let i = 0; i < 9; i++) {
        const a = randRange(0, Math.PI * 2), speed = randRange(3, 10) * scale;
        particle({ x: x + Math.cos(a) * 2, z: z + Math.sin(a) * 2, y: 2,
          vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: randRange(24, 42) * scale,
          gravity: 32, dragPerSec: .15, stretch: 2.6, maxAgeMs: 1600,
          sizeStart: randRange(2, 4) * scale, sizeEnd: 6 * scale,
          colorStart: 0xf1fcff, colorEnd: 0x93bac8, alphaStart: .62 });
      }
      for (let i = 0; i < 8; i++) {
        const a = randRange(0, Math.PI * 2), speed = randRange(10, 22) * scale;
        particle({ vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: randRange(14, 32) * scale,
          gravity: 38, dragPerSec: .12, sizeStart: 1.5 * scale, sizeEnd: .6 * scale,
          stretch: 1.7, maxAgeMs: 1900, colorStart: 0xe9fbff, colorEnd: 0xa6ccd7 });
      }
      return;
    }
    if (hit) particle({ texture: "flashAdd", y: 6, maxAgeMs: 105,
      sizeStart: 22 * scale, sizeEnd: 7 * scale, colorStart: 0xfff4d8, colorEnd: 0xffaa43, alphaStart: .95 });
    // Fire lobes become smoke. The atlas gives them shape without additional draws.
    for (let i = 0; i < (hit ? 7 : 4); i++) {
      const a = randRange(0, Math.PI * 2), speed = randRange(4, 12) * scale;
      particle({ texture: "smoke", x: x + Math.cos(a) * 4 * scale, z: z + Math.sin(a) * 4 * scale,
        y: randRange(3, 8), vx: Math.cos(a) * speed, vz: Math.sin(a) * speed,
        vy: randRange(7, 15) * scale, dragPerSec: 1.3, maxAgeMs: randRange(380, 620),
        sizeStart: randRange(8, 12) * scale, sizeEnd: randRange(18, 25) * scale,
        fadeInMs: 25, glow: hit, alphaStart: .95, colorStart: hit ? 0xffac31 : 0xbba284,
        colorEnd: hit ? 0xe44308 : 0x655849, spinPerSec: randRange(-.7, .7) });
    }
    for (let i = 0; i < (hit ? 11 : 8); i++) {
      const a = randRange(0, Math.PI * 2), speed = randRange(2, 7) * scale;
      particle({ texture: "smoke", x: x + Math.cos(a) * 5, z: z + Math.sin(a) * 5,
        y: randRange(3, 7), vx: Math.cos(a) * speed, vz: Math.sin(a) * speed,
        vy: randRange(5, 10) * scale, maxAgeMs: randRange(1600, 2600), fadeInMs: hit ? 350 : 80,
        sizeStart: randRange(6, 10) * scale, sizeEnd: randRange(22, 34) * scale,
        alphaStart: .65, colorStart: hit ? 0x6b6661 : 0x94816b, colorEnd: hit ? 0x555760 : 0x73695c,
        spinPerSec: randRange(-.22, .22) });
    }
    for (let i = 0; i < (hit ? 6 : 3); i++) {
      const a = randRange(0, Math.PI * 2), speed = randRange(15, 32) * scale;
      particle({ texture: hit ? "flashAdd" : "soft", vx: Math.cos(a) * speed, vz: Math.sin(a) * speed,
        vy: randRange(10, 24) * scale, gravity: 28, dragPerSec: .4, maxAgeMs: randRange(350, 650),
        sizeStart: 1.9 * scale, sizeEnd: .5 * scale, colorStart: hit ? 0xffe4a3 : 0x86765c,
        colorEnd: hit ? 0xd84a12 : 0x443c31 });
    }
  }

  function spawnArtilleryImpact(preset: FxPreset, worldX: number, worldZ: number, intensity = 1): void {
    impact(preset, worldToRenderX(worldX), worldZ, Math.max(.65, Math.min(2.05, intensity)));
  }

  function spawnWeaponImpact(weapon: "missile" | "torpedo", preset: FxPreset, x: number, z: number): void {
    impact(preset, x, z, weapon === "missile" ? .85 : 1.35);
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
    burstRing(1, 3, 10, 0.98, 1.2);

    // Welle 1 — nach ~65 ms, etwas weiter, immer noch dicht
    scheduleFx(t0 + 65, () => {
      spawnArtilleryImpact("hit", w, z0, 1.08);
      burstRing(1, 5, 14, 0.88, 1.12);
    });

    // Welle 2 — ~140 ms
    scheduleFx(t0 + 140, () => {
      burstRing(2, 6, 18, 0.75, 1.0);
    });

    // Welle 3 — ~220 ms, nachhall / kleinere Blitze
    scheduleFx(t0 + 220, () => {
      burstRing(1, 4, 12, 0.62, 0.86);
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
    lights.update(dtMs);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pendingFx.length = 0;
    backend.dispose();
    lights.dispose();
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
