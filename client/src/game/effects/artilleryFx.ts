import * as THREE from "three";
import type { GameRenderer } from "../runtime/rendererContracts";
import { createArtilleryShellMaterial } from "../runtime/materialLibrary";
import { worldToRenderX } from "../runtime/renderCoords";
import type { FxSystem } from "./fxSystem";

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
} & GameRenderer<never> {
  const flying: FlyingShell[] = [];
  const shellMat = createArtilleryShellMaterial();

  function removeShellById(shellId: number): void {
    const idx = flying.findIndex((f) => f.shellId === shellId);
    if (idx < 0) return;
    const f = flying[idx]!;
    scene.remove(f.mesh);
    f.mesh.geometry.dispose();
    (f.mesh.material as THREE.Material).dispose();
    flying.splice(idx, 1);
  }

  function sync(_data: readonly []): void {
    // Event-driven renderer; no replicated list to sync.
  }

  function update(nowPerfMs: number, _dtMs = 0): void {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]!;
      if (nowPerfMs - f.start > f.flightMs + SHELL_IMPACT_FAILSAFE_GRACE_MS) {
        scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        flying.splice(i, 1);
        continue;
      }
      const u = clamp01((nowPerfMs - f.start) / f.flightMs);
      const x = f.ax + (f.bx - f.ax) * u;
      const z = f.az + (f.bz - f.az) * u;
      const arcH = Math.sin(u * Math.PI) * 22;
      f.mesh.position.set(worldToRenderX(x), 10 + arcH, z);
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
  }

  return {
    sync,
    update,
    dispose,
    getStats() {
      return { activeShells: flying.length };
    },
    onFired(msg: ArtyFiredMsg): void {
      const r = 4.5;
      const geo = new THREE.SphereGeometry(r, 10, 10);
      const mesh = new THREE.Mesh(geo, shellMat.clone());
      mesh.position.set(worldToRenderX(msg.fromX), 12, msg.fromZ);
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
      fx.spawnArtilleryImpact(
        kind,
        msg.x,
        msg.z,
        kind === "hit" ? 1.25 : kind === "island" ? 1 : 0.9,
      );
    },
  };
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}
