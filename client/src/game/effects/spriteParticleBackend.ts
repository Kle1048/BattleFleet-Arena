import * as THREE from "three";
import { ParticlePool } from "./ParticlePool";
import { createParticleBillboards, type ParticleVisual } from "./particleBillboards";

type Particle = {
  sprite: ParticleVisual;
  textureKey: TextureKey;
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

/** Donut / Shockwave — helle Kante, Zentrum und Außenbereich transparent. */
function makeRingTexture(): THREE.CanvasTexture {
  return makeRadialTexture([
    [0, "rgba(255,255,255,0)"],
    [0.38, "rgba(255,255,255,0.08)"],
    [0.52, "rgba(255,255,255,0.88)"],
    [0.66, "rgba(255,255,255,0.42)"],
    [1, "rgba(255,255,255,0)"],
  ]);
}

type TextureKey = "soft" | "smoke" | "ring" | "flashAdd";

/** Sprite rendering/kinematics only; recipes and scheduling stay in fxSystem. */
export function createSpriteParticleBackend(scene: THREE.Scene, random: () => number) {
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

  const visuals: ParticleVisual[] = [];
  const billboards = createParticleBillboards(scene, MAX_ACTIVE_PARTICLES, [texSoft, texSmoke, texRing], visuals);

  let disposed = false;
  const tmpColor = new THREE.Color();
  const pool = new ParticlePool(MAX_ACTIVE_PARTICLES, ["soft", "smoke", "ring", "flashAdd"],
    key => createParticle(key as TextureKey), particle => { particle.sprite.visible = false; },
    () => {});

  function createParticle(textureKey: TextureKey): Particle {
    // Preserve pooled visual state without allocating Sprite matrices/materials.
    const sprite: ParticleVisual = {
      visible: false, renderOrder: 11, position: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1),
      material: { map: textureKey === "smoke" ? texSmoke : textureKey === "ring" ? texRing : texSoft,
        color: new THREE.Color(0xffffff), opacity: 1, rotation: 0,
        blending: textureKey === "flashAdd" ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthTest: textureKey === "soft" || textureKey === "smoke" },
    };
    visuals.push(sprite);
    const p: Particle = {
      sprite,
      textureKey,
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
    return p;
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
    if (disposed) return;
    const p = pool.acquire(options.texture);
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
    p.baseRotation = (Math.PI * 2) * random();
    p.spinPerSec = options.spinPerSec;
    p.alphaLerpPow = options.alphaLerpPow ?? 1;
    p.sprite.position.set(options.x, options.y, options.z);
    p.sprite.scale.setScalar(options.sizeStart);
    p.sprite.visible = true;
  }

  function update(dtMs: number): void {
    if (disposed) return;
    /** Tab-Hintergrund: verhindert Partikel-Sprünge bei großen `dt`. */
    const dt = Math.max(0, Math.min(100, dtMs)) * 0.001;
    pool.update(dtMs, p => {
      const u = p.maxAgeMs > 1 ? Math.min(1, p.ageMs / p.maxAgeMs) : 1;
      if (u >= 1) {
        return false;
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
      const mat = p.sprite.material;
      mat.opacity = Math.max(0, alpha);
      tmpColor.copy(p.colorStart).lerp(p.colorEnd, ua);
      mat.color.copy(tmpColor);
      mat.rotation = p.baseRotation + p.spinPerSec * (p.ageMs * 0.001);
      return true;
    });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pool.dispose();
    billboards.dispose(); visuals.length = 0;
    texSoft.dispose(); texSmoke.dispose(); texRing.dispose();
  }
  return { emit, update, dispose, getStats: () => pool.stats() };
}
