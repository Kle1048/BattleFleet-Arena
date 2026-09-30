import * as THREE from "three";
import { createWakeFoamTexture } from "./wakeFoamTexture";
import { createBowFoam } from "./bowFoam";
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

function createWakeRibbonShaderMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      foamMap: { value: texture },
      wakeStrength: { value: 1 },
      time: { value: 0 },
      diffuse: { value: new THREE.Color(0xc8e2f8) },
      opacity: { value: DEFAULT_OPACITY },
    },
    vertexShader: `
      attribute vec2 ribbonUv;
      varying vec2 vRibbonUv;
      varying vec2 vWorldXZ;
      #include <fog_pars_vertex>
      void main() {
        vRibbonUv = ribbonUv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorldXZ = w.xz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 diffuse;
      uniform float opacity;
      uniform float wakeStrength;
      uniform sampler2D foamMap;
      varying vec2 vRibbonUv;
      varying vec2 vWorldXZ;
      #include <fog_pars_fragment>
      void main() {
        float u = vRibbonUv.x, across = abs(vRibbonUv.y * 2.0 - 1.0);
        // Two texture reads replace the previous stack of animated sine waves.
        vec2 foam = texture2D(foamMap, vWorldXZ * .045 + vec2(time * .012, -time * .008)).rg;
        float detail = texture2D(foamMap, vWorldXZ * .11 - vec2(time * .018, 0.0)).g;
        float broken = smoothstep(.3, .76, foam.r * .75 + detail * .35);
        float edge = 1.0 - smoothstep(.68 + foam.g * .14, 1.0, across);
        float tail = smoothstep(0.0, .22, u);
        float propeller = (1.0 - smoothstep(.08, .43, across)) * smoothstep(.3, 1.0, u);
        float ridgeAt = mix(.72, .42, u);
        float ridge = 1.0 - smoothstep(.03, .16, abs(across - ridgeAt + (foam.r - .5) * .16));
        float density = (.1 + broken * .8 + propeller * .35 + ridge * broken * .4);
        vec3 color = mix(diffuse * .7, vec3(.91, .97, 1.0), broken);
        gl_FragColor = vec4(color, min(.8, opacity * wakeStrength * tail * edge * density));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -0.8,
    polygonOffsetUnits: -0.8,
    fog: true,
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
    nowSeconds: number;
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
  let strength = 1, movingStrength = 1, lastMovingAt = 0;
  mesh.onBeforeRender = () => {
    sharedMaterial.uniforms.wakeStrength!.value = strength;
    sharedMaterial.uniformsNeedUpdate = true;
  };

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
        widthScales[i] = 1.65 - .85 * Math.pow(uAlong, .65);
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
      if (speed < 0) { clearTrail(); return; }
      if (speed < DEFAULT_MIN_SPEED) {
        const idle = Math.max(0, opts.nowSeconds - lastMovingAt);
        strength = Math.max(0, 1 - idle / 3) * movingStrength;
        if (idle >= 3) clearTrail();
        return;
      }
      lastMovingAt = opts.nowSeconds;
      strength = movingStrength = .35 + .65 * Math.min(1, speed / 28);

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
  const foamTexture = createWakeFoamTexture();
  const sharedMaterial = createWakeRibbonShaderMaterial(foamTexture);
  const bowFoam = createBowFoam(scene, foamTexture);

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

      bowFoam.begin(nowSeconds ?? 0);
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
          nowSeconds: nowSeconds ?? 0,
        });
        if (lodVisible && p.lifeState !== PlayerLifeState.AwaitingRespawn && vis.profile?.modelEffects?.wake) bowFoam.add(vis, p.speed);
      }

      bowFoam.end();
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
      bowFoam.dispose();
      foamTexture.dispose();
    },
  };
}
