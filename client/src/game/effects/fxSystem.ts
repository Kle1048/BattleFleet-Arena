import * as THREE from "three";
import { VisualColorTokens } from "../runtime/materialLibrary";
import { worldToRenderX } from "../runtime/renderCoords";

type FxPreset = "water" | "hit" | "island";

export type FxSystem = ReturnType<typeof createFxSystem>;

function normalizeImpactKind(kind: string): FxPreset {
  if (kind === "hit") return "hit";
  if (kind === "island") return "island";
  return "water";
}

type Particle = {
  sprite: THREE.Sprite;
  active: boolean;
  ageMs: number;
  maxAgeMs: number;
  vx: number;
  vy: number;
  vz: number;
  dragPerSec: number;
  sizeStart: number;
  sizeEnd: number;
  alphaStart: number;
  alphaEnd: number;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
  baseRotation: number;
  spinPerSec: number;
  /** >1 hält die Opazität zu Beginn länger hoch (weicher Ausblend für Schweife). */
  alphaLerpPow: number;
};

const MAX_ACTIVE_PARTICLES = 960;

function makeRadialTexture(stops: readonly [number, string][]): THREE.CanvasTexture {
  const size = 96;
  const cvs = document.createElement("canvas");
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for FX texture");
  const cx = size * 0.5;
  const cy = size * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cvs);
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Donut / Shockwave — helle Kante, wezentrum und Außen transparent. */
function makeRingTexture(): THREE.CanvasTexture {
  return makeRadialTexture([
    [0, "rgba(255,255,255,0)"],
    [0.38, "rgba(255,255,255,0.08)"],
    [0.52, "rgba(255,255,255,0.88)"],
    [0.66, "rgba(255,255,255,0.42)"],
    [1, "rgba(255,255,255,0)"],
  ]);
}

function createSpriteMaterial(
  texture: THREE.Texture,
  opts: { blending: THREE.Blending; depthTest: boolean },
): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: opts.depthTest,
    fog: false,
    blending: opts.blending,
    opacity: 1,
    color: 0xffffff,
  });
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function createFxSystem(scene: THREE.Scene): {
  update: (dtMs: number) => void;
  dispose: () => void;
  /** Artillerie-Einschlag; `worldX`/`worldZ` in Seekartenkoordinaten. */
  spawnArtilleryImpact: (preset: FxPreset, worldX: number, worldZ: number, intensity?: number) => void;
  spawnMissileImpact: (worldX: number, worldZ: number, kind: string) => void;
  /** ASuM-Start: kleiner Rauchschwall + kurze Glut (Seekarten-heading). */
  spawnMissileLaunchSmoke: (worldX: number, worldZ: number, headingRad: number) => void;
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
  spawnTorpedoImpact: (worldX: number, worldZ: number, kind: string) => void;
  /** Schiff zerstört: mehrere große Hit-Bursts (Seekarten-XZ). */
  spawnShipDestroyedExplosion: (worldX: number, worldZ: number) => void;
  getStats: () => { activeParticles: number; pooledParticles: number };
} {
  const texSoft = makeRadialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.45, "rgba(255,255,255,0.66)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const texSmoke = makeRadialTexture([
    [0, "rgba(255,255,255,0.95)"],
    [0.35, "rgba(215,215,215,0.52)"],
    [1, "rgba(90,90,90,0)"],
  ]);
  const texRing = makeRingTexture();

  const matSoft = createSpriteMaterial(texSoft, { blending: THREE.NormalBlending, depthTest: true });
  const matSmoke = createSpriteMaterial(texSmoke, { blending: THREE.NormalBlending, depthTest: true });
  const matRing = createSpriteMaterial(texRing, { blending: THREE.NormalBlending, depthTest: false });
  const matFlashAdd = createSpriteMaterial(texSoft, { blending: THREE.AdditiveBlending, depthTest: false });

  const materials = [matSoft, matSmoke, matRing, matFlashAdd] as const;

  const particles: Particle[] = [];
  const tmpColor = new THREE.Color();

  /** Zeitversetzte Spawns (ohne setTimeout), Abwicklung in `update`. */
  type PendingFx = { runAtMs: number; fn: () => void };
  const pendingFx: PendingFx[] = [];

  function scheduleFx(runAtMs: number, fn: () => void): void {
    pendingFx.push({ runAtMs, fn });
  }

  function flushPendingFx(): void {
    const t = performance.now();
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

  function takeParticle(material: THREE.SpriteMaterial): Particle {
    for (const p of particles) {
      if (!p.active && p.sprite.material === material) return p;
    }
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 11;
    scene.add(sprite);
    const p: Particle = {
      sprite,
      active: false,
      ageMs: 0,
      maxAgeMs: 1000,
      vx: 0,
      vy: 0,
      vz: 0,
      dragPerSec: 0,
      sizeStart: 1,
      sizeEnd: 1,
      alphaStart: 1,
      alphaEnd: 0,
      colorStart: new THREE.Color(0xffffff),
      colorEnd: new THREE.Color(0xffffff),
      baseRotation: 0,
      spinPerSec: 0,
      alphaLerpPow: 1,
    };
    particles.push(p);
    return p;
  }

  function activeCount(): number {
    let n = 0;
    for (const p of particles) if (p.active) n++;
    return n;
  }

  function cullOneOldest(): void {
    let idx = -1;
    let maxAge = -1;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      if (!p.active) continue;
      if (p.ageMs > maxAge) {
        maxAge = p.ageMs;
        idx = i;
      }
    }
    if (idx < 0) return;
    const p = particles[idx]!;
    p.active = false;
    p.sprite.visible = false;
  }

  type TextureKey = "soft" | "smoke" | "ring" | "flashAdd";

  function matFor(key: TextureKey): THREE.SpriteMaterial {
    switch (key) {
      case "smoke":
        return matSmoke;
      case "ring":
        return matRing;
      case "flashAdd":
        return matFlashAdd;
      default:
        return matSoft;
    }
  }

  function emit(options: {
    texture: TextureKey;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    dragPerSec: number;
    maxAgeMs: number;
    sizeStart: number;
    sizeEnd: number;
    alphaStart: number;
    alphaEnd: number;
    colorStart: number;
    colorEnd: number;
    spinPerSec: number;
    alphaLerpPow?: number;
  }): void {
    if (activeCount() >= MAX_ACTIVE_PARTICLES) cullOneOldest();
    const mat = matFor(options.texture);
    const p = takeParticle(mat);
    p.active = true;
    p.ageMs = 0;
    p.maxAgeMs = options.maxAgeMs;
    p.vx = options.vx;
    p.vy = options.vy;
    p.vz = options.vz;
    p.dragPerSec = options.dragPerSec;
    p.sizeStart = options.sizeStart;
    p.sizeEnd = options.sizeEnd;
    p.alphaStart = options.alphaStart;
    p.alphaEnd = options.alphaEnd;
    p.colorStart.setHex(options.colorStart);
    p.colorEnd.setHex(options.colorEnd);
    p.baseRotation = randRange(0, Math.PI * 2);
    p.spinPerSec = options.spinPerSec;
    p.alphaLerpPow = options.alphaLerpPow ?? 1;
    p.sprite.position.set(options.x, options.y, options.z);
    p.sprite.scale.setScalar(options.sizeStart);
    p.sprite.visible = true;
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
    const s = weapon === "missile" ? 0.64 : 0.72;
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

    const nFlash = preset === "hit" ? 8 : 4;
    const nSmoke = preset === "hit" ? 13 : 8;
    const nAdd = preset === "hit" ? 5 : 0;

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

  function spawnMissileLaunchSmoke(worldX: number, worldZ: number, headingRad: number): void {
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
          y: randRange(2.0, 4.6),
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
            y: randRange(2.4, 4.2),
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
    scheduleFx(performance.now() + 55, () => puff(false));
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

  function spawnTorpedoImpact(worldX: number, worldZ: number, kind: string): void {
    spawnWeaponImpact("torpedo", normalizeImpactKind(kind), worldToRenderX(worldX), worldZ);
  }

  function spawnShipDestroyedExplosion(worldX: number, worldZ: number): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return;
    const w = worldX;
    const z0 = worldZ;
    const t0 = performance.now();

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

  function update(dtMs: number): void {
    flushPendingFx();
    const dt = Math.max(0, dtMs) * 0.001;
    for (const p of particles) {
      if (!p.active) continue;
      p.ageMs += dtMs;
      const u = p.maxAgeMs > 1 ? Math.min(1, p.ageMs / p.maxAgeMs) : 1;
      if (u >= 1) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const damping = Math.max(0, 1 - p.dragPerSec * dt);
      p.vx *= damping;
      p.vy *= damping;
      p.vz *= damping;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const size = p.sizeStart + (p.sizeEnd - p.sizeStart) * u;
      p.sprite.scale.setScalar(size);
      const ua = Math.pow(u, p.alphaLerpPow);
      const alpha = p.alphaStart + (p.alphaEnd - p.alphaStart) * ua;
      const mat = p.sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(0, alpha);
      tmpColor.copy(p.colorStart).lerp(p.colorEnd, ua);
      mat.color.copy(tmpColor);
      mat.rotation = p.baseRotation + p.spinPerSec * (p.ageMs * 0.001);
    }
  }

  function dispose(): void {
    pendingFx.length = 0;
    for (const p of particles) {
      scene.remove(p.sprite);
    }
    particles.length = 0;
    for (const m of materials) m.dispose();
    texSoft.dispose();
    texSmoke.dispose();
    texRing.dispose();
  }

  return {
    update,
    dispose,
    spawnArtilleryImpact,
    spawnMissileImpact,
    spawnMissileLaunchSmoke,
    spawnMissileTrailStreamTick,
    spawnTorpedoImpact,
    spawnShipDestroyedExplosion,
    getStats() {
      const active = activeCount();
      return { activeParticles: active, pooledParticles: particles.length - active };
    },
  };
}
