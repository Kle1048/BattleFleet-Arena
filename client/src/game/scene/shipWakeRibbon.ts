import * as THREE from "three";
import { PlayerLifeState } from "@battlefleet/shared";
import {
  DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD,
  isWithinHorizontalDistanceSq,
  spineTangentXZ,
  xzPerpendicularFromTangent,
} from "@battlefleet/shared";
import { getShipDebugTuningForVisualClass } from "../runtime/shipDebugTuning";
import { SHIP_STERN_Z } from "./createGameScene";
import type { ShipVisual } from "./shipVisual";

const WAKE_Y = 0.06;
/** Lokales Y am Heck (Wasserlinie), Emission unter dem Transom. */
const WAKE_SPAWN_LOCAL_Y = 0.03;
const DEFAULT_MIN_SAMPLE_DIST = 2.15;
const DEFAULT_MAX_SAMPLES = 96;
const DEFAULT_MIN_SPEED = 1.2;
const DEFAULT_BASE_HALF_WIDTH = 4.6;
const DEFAULT_OPACITY = 0.46;

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
    /** Offset in lokalem +Z zu `SHIP_STERN_Z` (negativ = weiter achtern). */
    wakeSpawnLocalZ: number;
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
  const mesh = new THREE.Mesh(geom, sharedMaterial);
  mesh.name = `shipWakeRibbon_${sessionId}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  const samples: { x: number; z: number }[] = [];
  const sternLocal = new THREE.Vector3();
  const sternWorld = new THREE.Vector3();

  function clearTrail(): void {
    samples.length = 0;
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
    geom.setAttribute("ribbonUv", new THREE.BufferAttribute(new Float32Array(0), 2));
    geom.setIndex(null);
    geom.computeBoundingSphere();
    mesh.visible = false;
  }

  function hideRibbonKeepSamples(): void {
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
    geom.setAttribute("ribbonUv", new THREE.BufferAttribute(new Float32Array(0), 2));
    geom.setIndex(null);
    mesh.visible = false;
  }

  function rebuildGeometry(): void {
    const n = samples.length;
    if (n < 2) {
      hideRibbonKeepSamples();
      return;
    }

    const vCount = n * 2;
    const pos = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const idx: number[] = [];

    for (let i = 0; i < n; i += 1) {
      const sp = samples[i]!;
      const t = spineTangentXZ(samples, i);
      const p = xzPerpendicularFromTangent(t.x, t.z);
      const uAlong = i / (n - 1);
      const widthScale = 0.16 + 0.84 * Math.pow(uAlong, 0.52);
      const half = DEFAULT_BASE_HALF_WIDTH * widthScale;
      const { x: sx, z: sz } = sp;
      const pi = i * 2;
      pos[pi * 3 + 0] = sx + p.x * half;
      pos[pi * 3 + 1] = WAKE_Y;
      pos[pi * 3 + 2] = sz + p.z * half;
      pos[(pi + 1) * 3 + 0] = sx - p.x * half;
      pos[(pi + 1) * 3 + 1] = WAKE_Y;
      pos[(pi + 1) * 3 + 2] = sz - p.z * half;
      uv[pi * 2 + 0] = uAlong;
      uv[pi * 2 + 1] = 0.0;
      uv[(pi + 1) * 2 + 0] = uAlong;
      uv[(pi + 1) * 2 + 1] = 1.0;
    }

    for (let i = 0; i < n - 1; i += 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      idx.push(a, b, c, b, d, c);
    }

    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("ribbonUv", new THREE.BufferAttribute(uv, 2));
    geom.setIndex(idx);
    geom.computeBoundingSphere();
    mesh.visible = true;
  }

  return {
    update(opts) {
      const { vis, speed, lifeState, wakeSpawnLocalZ, lodVisible } = opts;
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
      sternLocal.set(0, WAKE_SPAWN_LOCAL_Y, SHIP_STERN_Z + wakeSpawnLocalZ);
      sternWorld.copy(sternLocal).applyMatrix4(vis.group.matrixWorld);

      const nx = sternWorld.x;
      const nz = sternWorld.z;

      const last = samples.length > 0 ? samples[samples.length - 1] : null;
      const dist = last ? Math.hypot(nx - last.x, nz - last.z) : Infinity;
      if (dist >= DEFAULT_MIN_SAMPLE_DIST || !last) {
        samples.push({ x: nx, z: nz });
        while (samples.length > DEFAULT_MAX_SAMPLES) {
          samples.shift();
        }
      }

      rebuildGeometry();
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

  return {
    updateFromPlayers({ players, visuals, lodAnchorWorld, maxLodDistanceWorld, nowSeconds }) {
      const u = sharedMaterial.uniforms;
      if (u.time && nowSeconds !== undefined) {
        u.time.value = nowSeconds;
      }
      const maxD = maxLodDistanceWorld ?? DEFAULT_SHIP_WAKE_LOD_MAX_DIST_WORLD;
      const anchor = lodAnchorWorld;

      const activeIds = new Set<string>();
      for (const p of players) {
        activeIds.add(p.id);
        const vis = visuals.get(p.id);
        if (!vis) continue;

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
          wakeSpawnLocalZ: getShipDebugTuningForVisualClass(p.shipClass).wakeSpawnLocalZ,
          lodVisible,
        });
      }

      for (const [id, ribbon] of [...ribbons]) {
        if (!activeIds.has(id)) {
          ribbon.dispose();
          ribbons.delete(id);
        }
      }
    },
    dispose() {
      for (const ribbon of ribbons.values()) {
        ribbon.dispose();
      }
      ribbons.clear();
      sharedMaterial.dispose();
    },
  };
}
