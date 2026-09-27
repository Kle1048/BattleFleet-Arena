import * as THREE from "three";
import {
  DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD,
  PlayerLifeState,
  isWithinHorizontalDistanceSq,
  normalizeShipClassId,
  spineTangentXZ,
  wakeRibbonBaseHalfWidthFromHitboxHalfBeamX,
  xzPerpendicularFromTangent,
} from "@battlefleet/shared";
import { getAuthoritativeHullProfile } from "../runtime/shipProfileRuntime";
import type { ShipVisual } from "./shipVisual";

const WAKE_Y = 0.06;
const DEFAULT_MIN_SAMPLE_DIST = 2.15;
const DEFAULT_MAX_SAMPLES = 96;
const DEFAULT_MIN_SPEED = 1.2;
const DEFAULT_OPACITY = 0.46;

/** Kielwasser-Breite aus Hitbox-Querschnitt (gleiche X-Halbachse wie Gameplay-OBB). */
export function wakeRibbonBaseHalfWidthWorld(shipClass: string | undefined): number {
  const hull = getAuthoritativeHullProfile(normalizeShipClassId(shipClass));
  const hx = hull?.collisionHitbox?.halfExtents.x;
  return wakeRibbonBaseHalfWidthFromHitboxHalfBeamX(typeof hx === "number" ? hx : NaN);
}

/** Re-Export für Aufrufer, die nur das Client-Modul importieren. */
export { DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD };

function createWakeRibbonShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      diffuse: { value: new THREE.Color(0xc8e2f8) },
      opacity: { value: DEFAULT_OPACITY },
    },
    vertexShader: `
      attribute vec2 ribbonUv;
      varying vec2 vRibbonUv;
      varying vec2 vWorldXZ;
      void main() {
        vRibbonUv = ribbonUv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorldXZ = w.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 diffuse;
      uniform float opacity;
      varying vec2 vRibbonUv;
      varying vec2 vWorldXZ;

      void main() {
        float u = vRibbonUv.x;
        float vw = vRibbonUv.y;

        float fadeTail = smoothstep(0.0, 0.26, u);
        float fadeStern = 1.0 - smoothstep(0.74, 1.0, u) * 0.16;
        float fadeU = fadeTail * fadeStern;

        float edge = smoothstep(0.0, 0.22, vw) * smoothstep(0.0, 0.22, 1.0 - vw);

        vec2 w = vWorldXZ * 0.085;
        float n = sin(w.x * 1.9 + w.y * 1.45 + time * 0.82);
        n += 0.52 * sin(w.x * -3.1 + w.y * 2.55 - time * 0.58);
        n += 0.38 * sin(w.x * 0.42 + w.y * -0.48 + time * 0.38);
        n += 0.32 * sin(w.x * 4.8 + w.y * 3.9 + time * 1.05);
        vec2 w2 = vWorldXZ * 0.21;
        n += 0.26 * sin(w2.x * 5.2 + w2.y * 4.1 - time * 0.95);
        n += 0.18 * sin(w2.x * -7.0 + w2.y * 3.4 + time * 1.15);
        vec2 w3 = vWorldXZ * 0.38;
        n += 0.14 * sin(w3.x * 3.3 + w3.y * -5.1 - time * 0.72);

        float nNorm = 0.54 + 0.46 * (0.5 + 0.5 * clamp(n * 0.21, -1.0, 1.0));

        float rippleLong = 0.5 + 0.5 * sin(u * 36.0 - time * 1.45);
        rippleLong = 0.78 + 0.22 * rippleLong;
        rippleLong *= 0.94 + 0.06 * sin(u * 74.0 + time * 0.85);
        rippleLong *= 0.97 + 0.03 * sin(u * 118.0 - time * 1.1);

        float crossW = sin(vw * 6.2831853 * 4.5 + dot(w, vec2(2.4, -1.85)) + time * 0.55);
        crossW += 0.35 * sin(vw * 6.2831853 * 9.0 - dot(w2, vec2(1.1, 2.0)) - time * 0.4);
        float crossPat = 0.86 + 0.14 * (0.5 + 0.5 * crossW);

        float chop = sin(w.x * 2.7 - w.y * 2.2 + time * 1.25) * sin(w.y * 3.1 + w.x * 1.4 - time * 0.95);
        float chopMix = 0.9 + 0.1 * (0.5 + 0.5 * chop);

        float pat = nNorm * rippleLong * crossPat * chopMix;
        pat = pow(max(pat, 0.001), 0.92);

        float a = opacity * fadeU * edge * pat;
        gl_FragColor = vec4(diffuse, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -0.8,
    polygonOffsetUnits: -0.8,
    toneMapped: false,
  });
}

type WakePlayerLike = {
  id: string;
  /** Simulations-Welt XZ (gleiche Basis wie LOD-Abstand). */
  x: number;
  z: number;
  speed: number;
  lifeState: string;
  shipClass?: string;
};

type SingleWake = {
  update: (opts: {
    vis: ShipVisual;
    speed: number;
    lifeState: string | undefined;
    /** Halbe Bandbreite in Welt-XZ zur Tangente (aus Hitbox-Skalierung). */
    baseHalfWidthWorld: number;
    /** false: außerhalb LOD — Spur leeren, kein Sampling. */
    lodVisible: boolean;
  }) => void;
  dispose: () => void;
};

function createSingleShipWakeRibbon(
  scene: THREE.Scene,
  sharedMaterial: THREE.ShaderMaterial,
  sessionId: string,
): SingleWake {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(DEFAULT_MAX_SAMPLES * 6);
  const uv = new Float32Array(DEFAULT_MAX_SAMPLES * 4);
  const indices = new Uint16Array((DEFAULT_MAX_SAMPLES - 1) * 6);
  for (let i = 0; i < DEFAULT_MAX_SAMPLES - 1; i++) {
    const a = i * 2, j = i * 6;
    indices[j] = a; indices[j + 1] = a + 1; indices[j + 2] = a + 2;
    indices[j + 3] = a + 1; indices[j + 4] = a + 3; indices[j + 5] = a + 2;
  }
  const position = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const ribbonUv = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute("position", position);
  geom.setAttribute("ribbonUv", ribbonUv);
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.setDrawRange(0, 0);
  // Three uses the sphere center for transparent sorting even without frustum culling.
  // Maintain it from the active vertices, not the unused tail of the fixed-capacity buffer.
  const bounds = new THREE.Sphere();
  geom.boundingSphere = bounds;
  const mesh = new THREE.Mesh(geom, sharedMaterial);
  mesh.name = `shipWakeRibbon_${sessionId}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  scene.add(mesh);

  const ring = Array.from({ length: DEFAULT_MAX_SAMPLES }, () => ({ x: 0, z: 0 }));
  // Reused ordered references let the shared tangent helper consume the circular history.
  const samples = ring.slice();
  let start = 0, count = 0, uvCount = 0;
  let renderedWidth = NaN;
  const widthScales = new Float64Array(DEFAULT_MAX_SAMPLES);
  const tangent = { x: 0, z: 1 }, perpendicular = { x: 0, z: 1 };
  const sternLocal = new THREE.Vector3();
  const sternWorld = new THREE.Vector3();

  function clearTrail(): void {
    count = 0;
    start = 0;
    geom.setDrawRange(0, 0);
    mesh.visible = false;
  }

  function rebuildGeometry(baseHalfWidthWorld: number): void {
    const n = count;
    if (n < 2) {
      return;
    }

    samples.length = n;
    for (let i = 0; i < n; i++) samples[i] = ring[(start + i) % DEFAULT_MAX_SAMPLES]!;
    if (uvCount !== n) {
      for (let i = 0; i < n; i++) {
        const uAlong = i / (n - 1);
        widthScales[i] = 0.16 + 0.84 * Math.pow(uAlong, 0.52);
        uv[i * 4] = uv[i * 4 + 2] = uAlong;
        uv[i * 4 + 1] = 0;
        uv[i * 4 + 3] = 1;
      }
      ribbonUv.clearUpdateRanges();
      ribbonUv.addUpdateRange(0, n * 4);
      ribbonUv.needsUpdate = true;
      uvCount = n;
    }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < n; i += 1) {
      const sp = samples[i]!;
      const t = spineTangentXZ(samples, i, tangent);
      const p = xzPerpendicularFromTangent(t.x, t.z, perpendicular);
      const half = baseHalfWidthWorld * widthScales[i]!;
      const { x: sx, z: sz } = sp;
      const pi = i * 2;
      pos[pi * 3 + 0] = sx + p.x * half;
      pos[pi * 3 + 1] = WAKE_Y;
      pos[pi * 3 + 2] = sz + p.z * half;
      pos[(pi + 1) * 3 + 0] = sx - p.x * half;
      pos[(pi + 1) * 3 + 1] = WAKE_Y;
      pos[(pi + 1) * 3 + 2] = sz - p.z * half;
      minX = Math.min(minX, pos[pi * 3]!, pos[(pi + 1) * 3]!);
      maxX = Math.max(maxX, pos[pi * 3]!, pos[(pi + 1) * 3]!);
      minZ = Math.min(minZ, pos[pi * 3 + 2]!, pos[(pi + 1) * 3 + 2]!);
      maxZ = Math.max(maxZ, pos[pi * 3 + 2]!, pos[(pi + 1) * 3 + 2]!);
    }

    bounds.center.set((minX + maxX) / 2, pos[1]!, (minZ + maxZ) / 2);
    bounds.radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;
    position.clearUpdateRanges();
    position.addUpdateRange(0, n * 6);
    position.needsUpdate = true;
    geom.setDrawRange(0, (n - 1) * 6);
    renderedWidth = baseHalfWidthWorld;
    mesh.visible = true;
  }

  return {
    update(opts) {
      const { vis, speed, lifeState, baseHalfWidthWorld, lodVisible } = opts;
      if (!lodVisible) {
        clearTrail();
        return;
      }
      if (lifeState === PlayerLifeState.AwaitingRespawn) {
        clearTrail();
        return;
      }
      if (speed < DEFAULT_MIN_SPEED) {
        clearTrail();
        return;
      }

      vis.group.updateMatrixWorld(true);
      const wake = vis.profile?.modelEffects?.wake;
      if (!wake) { clearTrail(); return; }
      sternLocal.set(wake.position.x, wake.position.y, wake.position.z);
      sternWorld.copy(sternLocal).applyMatrix4(vis.group.matrixWorld);

      const nx = sternWorld.x;
      const nz = sternWorld.z;

      const last = count > 0 ? ring[(start + count - 1) % DEFAULT_MAX_SAMPLES]! : null;
      const dist = last ? Math.hypot(nx - last.x, nz - last.z) : Infinity;
      let changed = false;
      if (dist >= DEFAULT_MIN_SAMPLE_DIST || !last) {
        const sample = ring[(start + count) % DEFAULT_MAX_SAMPLES]!;
        sample.x = nx;
        sample.z = nz;
        if (count < DEFAULT_MAX_SAMPLES) count++;
        else start = (start + 1) % DEFAULT_MAX_SAMPLES;
        changed = true;
      }

      if (changed || renderedWidth !== baseHalfWidthWorld) rebuildGeometry(baseHalfWidthWorld);
    },
    dispose() {
      clearTrail();
      scene.remove(mesh);
      geom.dispose();
    },
  };
}

export type ShipWakeRibbonSystem = {
  /**
   * Pro Spieler mit `ShipVisual` eine Spur; entfernte Spieler werden aufgeräumt.
   * Sollte **nach** `runFrameRuntimeStep` laufen, damit `group.matrixWorld` zur Pose passt.
   *
   * **LOD:** Mit `lodAnchorWorld` (z. B. Position des lokalen Spielers) wird die Wake für Schiffe
   * jenseits `maxLodDistanceWorld` nicht mehr berechnet. Ohne Anker entfällt die Distanz-Kappung.
   */
  updateFromPlayers: (opts: {
    players: Iterable<WakePlayerLike>;
    visuals: Map<string, ShipVisual>;
    lodAnchorWorld?: { x: number; z: number };
    maxLodDistanceWorld?: number;
    /** Sekunden — für langsames Rauschen/„Leben“ im Shader. */
    nowSeconds?: number;
  }) => void;
  dispose: () => void;
};

/**
 * Kielwasser (Band-Mesh) für **alle** Spieler mit sichtbarem `ShipVisual`.
 */
export function createShipWakeRibbonSystem(scene: THREE.Scene): ShipWakeRibbonSystem {
  const sharedMaterial = createWakeRibbonShaderMaterial();

  const ribbons = new Map<string, SingleWake>();
  const activeIds = new Set<string>();
  let disposed = false;

  return {
    updateFromPlayers({ players, visuals, lodAnchorWorld, maxLodDistanceWorld, nowSeconds }) {
      if (disposed) return;
      const u = sharedMaterial.uniforms;
      if (u.time && nowSeconds !== undefined) {
        u.time.value = nowSeconds;
      }
      const maxD = maxLodDistanceWorld ?? DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD;
      const anchor = lodAnchorWorld;

      activeIds.clear();
      for (const p of players) {
        const vis = visuals.get(p.id);
        if (!vis) continue;
        activeIds.add(p.id);

        let ribbon = ribbons.get(p.id);
        if (!ribbon) {
          ribbon = createSingleShipWakeRibbon(scene, sharedMaterial, p.id);
          ribbons.set(p.id, ribbon);
        }

        const lodVisible = anchor
          ? isWithinHorizontalDistanceSq(anchor.x, anchor.z, p.x, p.z, maxD)
          : true;

        ribbon.update({
          vis,
          speed: p.speed,
          lifeState: p.lifeState,
          baseHalfWidthWorld: wakeRibbonBaseHalfWidthWorld(p.shipClass),
          lodVisible,
        });
      }

      for (const [id, ribbon] of ribbons) {
        if (!activeIds.has(id)) {
          ribbon.dispose();
          ribbons.delete(id);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const ribbon of ribbons.values()) {
        ribbon.dispose();
      }
      ribbons.clear();
      activeIds.clear();
      sharedMaterial.dispose();
    },
  };
}
