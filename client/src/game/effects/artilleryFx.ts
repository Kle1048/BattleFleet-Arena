import * as THREE from "three";
import type { GameRenderer } from "../runtime/rendererContracts";
import { createArtilleryShellMaterial } from "../runtime/materialLibrary";
import { worldToRenderX } from "../runtime/renderCoords";
import type { FxSystem } from "./fxSystem";
import type { ArtilleryFired } from "../presentation/MatchPresentationEvent";

export type ArtilleryMuzzleSeekCoords = { x: number; y: number; z: number };

export type ArtyFiredMsg = ArtilleryFired;

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
  ay: number;
  bx: number;
  bz: number;
};

const SHELL_IMPACT_FAILSAFE_GRACE_MS = 300;

/**
 * Artillerie-VFX: Kugelflug + Einschlag abhängig von **kind** (Wasser / Treffer / Insel-Ufer).
 */
export type ArtyImpactOptions = {
  /** Wenn true: Kugel entfernen, aber keinen Splash (Cull: Einschlag außerhalb Sichtkreis). */
  skipSplash?: boolean;
};

export function createArtilleryFx(scene: THREE.Scene, fx: FxSystem): {
  sync: (data: readonly []) => void;
  update: (nowPerfMs: number, dtMs?: number) => void;
  dispose: () => void;
  onFired: (msg: ArtyFiredMsg) => void;
  onImpact: (msg: ArtyImpactMsg, options?: ArtyImpactOptions) => void;
  getStats: () => { activeShells: number };
  createWarmupMesh: () => THREE.Mesh;
  /** Nach `createVisualRuntime`: Mündung aus Mount-GLB (`bf_muzzle`), sonst Fallback Server-Mündung. */
  setMuzzleSeekResolver: (fn: ((ownerId: string, slotId: string) => ArtilleryMuzzleSeekCoords | null) | null) => void;
} & GameRenderer<never> {
  const flying: FlyingShell[] = [];
  const shellMat = createArtilleryShellMaterial();
  const shellGeometry = new THREE.OctahedronGeometry(1.75, 0);
  let disposed = false;
  let resolveMuzzleSeek: ((ownerId: string, slotId: string) => ArtilleryMuzzleSeekCoords | null) | null = null;

  function removeShellById(shellId: number): void {
    const idx = flying.findIndex((f) => f.shellId === shellId);
    if (idx < 0) return;
    const f = flying[idx]!;
    scene.remove(f.mesh);
    flying.splice(idx, 1);
  }

  function sync(_data: readonly []): void {
    // Event-driven renderer; no replicated list to sync.
  }

  function update(nowPerfMs: number, _dtMs = 0): void {
    if (disposed) return;
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]!;
      if (nowPerfMs - f.start > f.flightMs + SHELL_IMPACT_FAILSAFE_GRACE_MS) {
        scene.remove(f.mesh);
        flying.splice(i, 1);
        continue;
      }
      const u = clamp01((nowPerfMs - f.start) / f.flightMs);
      const x = f.ax + (f.bx - f.ax) * u;
      const z = f.az + (f.bz - f.az) * u;
      const arcH = Math.sin(u * Math.PI) * 22;
      f.mesh.position.set(worldToRenderX(x), f.ay * (1 - u) + arcH, z);
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const f of flying) {
      scene.remove(f.mesh);
    }
    flying.length = 0;
    resolveMuzzleSeek = null;
    shellMat.dispose();
    shellGeometry.dispose();
  }

  return {
    sync,
    update,
    dispose,
    createWarmupMesh() { const mesh = new THREE.Mesh(shellGeometry, shellMat); mesh.castShadow = true; return mesh; },
    getStats() {
      return { activeShells: flying.length };
    },
    setMuzzleSeekResolver(fn) {
      if (!disposed) resolveMuzzleSeek = fn;
    },
    onFired(msg: ArtyFiredMsg): void {
      if (disposed) return;
      const dx = msg.toX - msg.fromX;
      const dz = msg.toZ - msg.fromZ;
      const len = Math.hypot(dx, dz);
      const headingRad = len > 1e-6 ? Math.atan2(dx, dz) : 0;
      const muzzle = msg.slotId ? resolveMuzzleSeek?.(msg.ownerId, msg.slotId) : null;
      const mx = muzzle ? muzzle.x : msg.fromX;
      const mz = muzzle ? muzzle.z : msg.fromZ;
      const my = muzzle?.y ?? msg.fromY ?? 10;
      fx.spawnArtilleryMuzzle(mx, mz, headingRad, my);

      // Keep the material/program and GPU buffers alive across gaps between shots.
      const mesh = new THREE.Mesh(shellGeometry, shellMat);
      mesh.position.set(worldToRenderX(mx), my, mz);
      mesh.castShadow = true;
      scene.add(mesh);
      flying.push({
        shellId: msg.shellId,
        mesh,
        start: performance.now(),
        flightMs: Math.max(80, msg.flightMs),
        ax: mx,
        ay: my,
        az: mz,
        bx: msg.toX,
        bz: msg.toZ,
      });
    },

    onImpact(msg: ArtyImpactMsg, options?: ArtyImpactOptions): void {
      if (disposed) return;
      removeShellById(msg.shellId);
      if (options?.skipSplash) return;
      const kind = msg.kind ?? "water";
      fx.spawnArtilleryImpact(
        kind,
        msg.x,
        msg.z,
        kind === "hit" ? 1.42 : kind === "island" ? 1 : 0.9,
      );
    },
  };
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}
