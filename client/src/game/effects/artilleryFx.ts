import * as THREE from "three";
import type { GameRenderer } from "../runtime/rendererContracts";
import { VisualColorTokens, createArtilleryShellMaterial } from "../runtime/materialLibrary";
const MAX_ACTIVE_TRANSIENT_FX = 120;

export type ArtyFiredMsg = {
  shellId: number;
  ownerId: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  flightMs: number;
};

export type ArtyImpactKind = "water" | "hit" | "island";

export type ArtyImpactMsg = {
  shellId: number;
  x: number;
  z: number;
  /** Vom Server; ohne Feld = Wasser (ältere Server). */
  kind?: ArtyImpactKind;
};

type FlyingShell = {
  shellId: number;
  mesh: THREE.Mesh;
  start: number;
  flightMs: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
};

type TransientFx = {
  mesh: THREE.Mesh;
  poolKey: string;
  bornMs: number;
  maxAgeMs: number;
  initialOpacity: number;
  growthPerMs: number;
  risePerMs: number;
  baseY: number;
};

/**
 * Artillerie-VFX: Kugelflug + Einschlag abhängig von **kind** (Wasser / Treffer / Insel-Ufer).
 */
export type ArtyImpactOptions = {
  /** Wenn true: Kugel entfernen, aber keinen Splash (Cull: Einschlag außerhalb Sichtkreis). */
  skipSplash?: boolean;
};

export function createArtilleryFx(scene: THREE.Scene): {
  sync: (data: readonly []) => void;
  update: (nowPerfMs: number, dtMs?: number) => void;
  dispose: () => void;
  onFired: (msg: ArtyFiredMsg) => void;
  onImpact: (msg: ArtyImpactMsg, options?: ArtyImpactOptions) => void;
  getStats: () => { activeShells: number; activeTransientFx: number; pooledTransientMeshes: number };
} & GameRenderer<never> {
  const flying: FlyingShell[] = [];
  const shellMat = createArtilleryShellMaterial();
  const transientActive: TransientFx[] = [];
  const transientPools = new Map<string, THREE.Mesh[]>();
  const pooledMeshes = new Set<THREE.Mesh>();

  function removeShellById(shellId: number): void {
    const idx = flying.findIndex((f) => f.shellId === shellId);
    if (idx < 0) return;
    const f = flying[idx]!;
    scene.remove(f.mesh);
    f.mesh.geometry.dispose();
    (f.mesh.material as THREE.Material).dispose();
    flying.splice(idx, 1);
  }

  /** Flache Splashes von oben: ohne DepthTest + DoubleSide, sonst oft unsichtbar (Backface / Wasser-Z-Fight). */
  const splashMatOpts: THREE.MeshBasicMaterialParameters = {
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  };

  function poolTake(
    key: string,
    geometryFactory: () => THREE.BufferGeometry,
    materialFactory: () => THREE.MeshBasicMaterial,
  ): THREE.Mesh {
    const pool = transientPools.get(key);
    const cached = pool?.pop();
    if (cached) return cached;
    const mesh = new THREE.Mesh(geometryFactory(), materialFactory());
    mesh.visible = false;
    scene.add(mesh);
    pooledMeshes.add(mesh);
    return mesh;
  }

  function poolRelease(mesh: THREE.Mesh, key: string): void {
    mesh.visible = false;
    mesh.scale.set(1, 1, 1);
    const pool = transientPools.get(key) ?? [];
    pool.push(mesh);
    transientPools.set(key, pool);
  }

  function addTransientRing(
    poolKey: string,
    x: number,
    z: number,
    inner: number,
    outer: number,
    color: number,
    opacity: number,
    maxAge: number,
    growthPerMs: number,
    y = 0.55,
  ): void {
    while (transientActive.length >= MAX_ACTIVE_TRANSIENT_FX) {
      const dropped = transientActive.shift();
      if (!dropped) break;
      poolRelease(dropped.mesh, dropped.poolKey);
    }
    const ring = poolTake(
      poolKey,
      () => new THREE.RingGeometry(inner, outer, 28),
      () =>
        new THREE.MeshBasicMaterial({
          ...splashMatOpts,
          color,
          opacity,
        }),
    );
    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = opacity;
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    ring.renderOrder = 10;
    ring.visible = true;
    transientActive.push({
      mesh: ring,
      poolKey,
      bornMs: performance.now(),
      maxAgeMs: maxAge,
      initialOpacity: opacity,
      growthPerMs,
      risePerMs: 0,
      baseY: y,
    });
  }

  function addTransientSphere(
    poolKey: string,
    x: number,
    z: number,
    radius: number,
    color: number,
    opacity: number,
    maxAge: number,
    growthPerMs: number,
    risePerMs: number,
    y: number,
  ): void {
    while (transientActive.length >= MAX_ACTIVE_TRANSIENT_FX) {
      const dropped = transientActive.shift();
      if (!dropped) break;
      poolRelease(dropped.mesh, dropped.poolKey);
    }
    const burst = poolTake(
      poolKey,
      () => new THREE.SphereGeometry(radius, 10, 10),
      () =>
        new THREE.MeshBasicMaterial({
          ...splashMatOpts,
          color,
          opacity,
        }),
    );
    const mat = burst.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = opacity;
    burst.position.set(x, y, z);
    burst.renderOrder = 10;
    burst.visible = true;
    transientActive.push({
      mesh: burst,
      poolKey,
      bornMs: performance.now(),
      maxAgeMs: maxAge,
      initialOpacity: opacity,
      growthPerMs,
      risePerMs,
      baseY: y,
    });
  }

  function spawnWaterImpact(x: number, z: number): void {
    addTransientRing("water_outer", x, z, 3, 20, VisualColorTokens.artilleryImpactWaterDark, 0.82, 450, 0.0026);
    addTransientRing("water_mid", x, z, 1.5, 11, VisualColorTokens.artilleryImpactWaterMid, 0.68, 400, 0.0029, 0.58);
    addTransientRing("water_inner", x, z, 0.5, 5.5, VisualColorTokens.artilleryImpactWaterLight, 0.45, 320, 0.0032, 0.62);
  }

  function spawnIslandImpact(x: number, z: number): void {
    addTransientRing("island_outer", x, z, 3, 24, VisualColorTokens.artilleryImpactIslandDark, 0.62, 480, 0.0022);
    addTransientRing("island_row", x, z, 2.5, 17, VisualColorTokens.artilleryImpactIslandMid, 0.45, 420, 0.0025, 0.52);
  }

  function spawnHitImpact(x: number, z: number): void {
    addTransientRing("hit_outer", x, z, 9, 36, VisualColorTokens.artilleryImpactHitOuter, 0.75, 520, 0.0028, 0.3);
    addTransientRing("hit_inner", x, z, 4.5, 18, VisualColorTokens.artilleryImpactHitInner, 0.65, 520, 0.0034, 0.35);
    addTransientSphere(
      "hit_burst",
      x,
      z,
      4,
      VisualColorTokens.artilleryImpactHitBurst,
      0.55,
      520,
      0.0022,
      0.032,
      3.5,
    );
  }

  function sync(_data: readonly []): void {
    // Event-driven renderer; no replicated list to sync.
  }

  function update(nowPerfMs: number, _dtMs = 0): void {
    for (const f of flying) {
      const u = clamp01((nowPerfMs - f.start) / f.flightMs);
      const x = f.ax + (f.bx - f.ax) * u;
      const z = f.az + (f.bz - f.az) * u;
      const arcH = Math.sin(u * Math.PI) * 22;
      f.mesh.position.set(x, 10 + arcH, z);
    }

    for (let i = transientActive.length - 1; i >= 0; i--) {
      const fx = transientActive[i]!;
      const age = nowPerfMs - fx.bornMs;
      const mat = fx.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, fx.initialOpacity * (1 - age / fx.maxAgeMs));
      fx.mesh.scale.setScalar(1 + age * fx.growthPerMs);
      fx.mesh.position.y = fx.baseY + age * fx.risePerMs;
      if (age >= fx.maxAgeMs) {
        transientActive.splice(i, 1);
        poolRelease(fx.mesh, fx.poolKey);
      }
    }
  }

  function dispose(): void {
    for (const f of flying) {
      scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
    }
    flying.length = 0;
    shellMat.dispose();
    for (const fx of transientActive) {
      poolRelease(fx.mesh, fx.poolKey);
    }
    transientActive.length = 0;
    for (const mesh of pooledMeshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    pooledMeshes.clear();
    transientPools.clear();
  }

  return {
    sync,
    update,
    dispose,
    getStats() {
      return {
        activeShells: flying.length,
        activeTransientFx: transientActive.length,
        pooledTransientMeshes: pooledMeshes.size - transientActive.length,
      };
    },
    onFired(msg: ArtyFiredMsg): void {
      const r = 4.5;
      const geo = new THREE.SphereGeometry(r, 10, 10);
      const mesh = new THREE.Mesh(geo, shellMat.clone());
      mesh.position.set(msg.fromX, 12, msg.fromZ);
      mesh.castShadow = true;
      scene.add(mesh);
      flying.push({
        shellId: msg.shellId,
        mesh,
        start: performance.now(),
        flightMs: Math.max(80, msg.flightMs),
        ax: msg.fromX,
        az: msg.fromZ,
        bx: msg.toX,
        bz: msg.toZ,
      });
    },

    onImpact(msg: ArtyImpactMsg, options?: ArtyImpactOptions): void {
      removeShellById(msg.shellId);
      if (options?.skipSplash) return;
      const kind = msg.kind ?? "water";
      if (kind === "hit") spawnHitImpact(msg.x, msg.z);
      else if (kind === "island") spawnIslandImpact(msg.x, msg.z);
      else spawnWaterImpact(msg.x, msg.z);
    },

  };
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}
