import * as THREE from "three";
import { ASWM_SPEED } from "@battlefleet/shared";
import { createMissileBodyMaterial } from "../runtime/materialLibrary";
import { worldToRenderX, worldToRenderYaw } from "../runtime/renderCoords";
import type { FxSystem } from "./fxSystem";

const BODY_Y = 2.8;
const MISSILE_CONE_HEIGHT = 12;

/** Max. Vorlauf der sichtbaren Pose hinter dem letzten Sync (verhindert Sprünge / Flackern). */
const MAX_EXTRAPOLATE_SEC = 0.14;
/** Geschwindigkeit aus Deltas, begrenzt (Homing kurvt, Server-Tick variiert). */
const MAX_TRAIL_VEL = ASWM_SPEED * 1.35;

export type MissilePose = {
  missileId: number;
  x: number;
  z: number;
  headingRad: number;
};

type Entry = {
  group: THREE.Group;
  body: THREE.Mesh;
  syncWorldX: number;
  syncWorldZ: number;
  headingRad: number;
  velX: number;
  velZ: number;
  lastSyncMs: number;
  trailSuppressUntilMs: number;
};

/**
 * ASuM: Körper aus repliziertem State; Einschlag über gemeinsames Partikel-FX.
 */
const syncKeepIds = new Set<number>();

export function createMissileFx(scene: THREE.Scene, fx: FxSystem): {
  sync: (missiles: Iterable<MissilePose> | null) => void;
  update: (nowMs: number, dtMs: number) => void;
  dispose: () => void;
  flashImpact: (x: number, z: number, kind: string) => void;
  getStats: () => { activeMissiles: number };
} {
  const byId = new Map<number, Entry>();

  function removeMissileEntry(id: number): void {
    const e = byId.get(id);
    if (!e) return;
    scene.remove(e.group);
    e.body.geometry.dispose();
    (e.body.material as THREE.Material).dispose();
    byId.delete(id);
  }

  function ensure(id: number): Entry {
    let e = byId.get(id);
    if (e) return e;

    const group = new THREE.Group();
    const geo = new THREE.ConeGeometry(3.5, MISSILE_CONE_HEIGHT, 6);
    const mat = createMissileBodyMaterial();
    const body = new THREE.Mesh(geo, mat);
    body.rotation.x = Math.PI / 2;
    body.position.y = BODY_Y;
    group.add(body);

    scene.add(group);
    const created: Entry = {
      group,
      body,
      syncWorldX: 0,
      syncWorldZ: 0,
      headingRad: 0,
      velX: 0,
      velZ: 0,
      lastSyncMs: 0,
      trailSuppressUntilMs: 0,
    };
    byId.set(id, created);
    return created;
  }

  function sync(missiles: Iterable<MissilePose> | null): void {
    syncKeepIds.clear();
    const now = performance.now();
    if (missiles === null) {
      for (const id of Array.from(byId.keys())) {
        removeMissileEntry(id);
      }
      return;
    }
    for (const m of missiles) {
      syncKeepIds.add(m.missileId);
      const isNew = !byId.has(m.missileId);
      const e = ensure(m.missileId);

      if (!isNew && e.lastSyncMs > 0) {
        const dtSec = (now - e.lastSyncMs) * 0.001;
        if (dtSec > 0.0008) {
          let vx = (m.x - e.syncWorldX) / dtSec;
          let vz = (m.z - e.syncWorldZ) / dtSec;
          const sp = Math.hypot(vx, vz);
          if (sp > MAX_TRAIL_VEL) {
            const s = MAX_TRAIL_VEL / sp;
            vx *= s;
            vz *= s;
          }
          e.velX = vx;
          e.velZ = vz;
        }
      } else if (isNew) {
        e.velX = 0;
        e.velZ = 0;
        e.trailSuppressUntilMs = now + 88;
      }

      e.syncWorldX = m.x;
      e.syncWorldZ = m.z;
      e.headingRad = m.headingRad;
      e.lastSyncMs = now;

      if (isNew) {
        fx.spawnMissileLaunchSmoke(m.x, m.z, m.headingRad);
      }
    }
    for (const id of byId.keys()) {
      if (!syncKeepIds.has(id)) {
        removeMissileEntry(id);
      }
    }
  }

  function update(nowMs: number, dtMs: number): void {
    const dt = Math.max(0, Math.min(dtMs, 80));
    for (const e of byId.values()) {
      const ago = Math.min(MAX_EXTRAPOLATE_SEC, Math.max(0, (nowMs - e.lastSyncMs) * 0.001));
      const ex = e.syncWorldX + e.velX * ago;
      const ez = e.syncWorldZ + e.velZ * ago;
      e.group.position.set(worldToRenderX(ex), 0, ez);
      e.group.rotation.y = worldToRenderYaw(e.headingRad);

      if (nowMs < e.trailSuppressUntilMs) continue;
      const n = Math.max(3, Math.min(9, Math.round(2.85 * (dt / 16.67))));
      fx.spawnMissileTrailStreamTick(ex, ez, e.headingRad, n);
    }
  }

  function dispose(): void {
    for (const id of Array.from(byId.keys())) {
      removeMissileEntry(id);
    }
  }

  return {
    sync,
    update,
    dispose,
    getStats() {
      return { activeMissiles: byId.size };
    },
    flashImpact(x, z, kind) {
      fx.spawnMissileImpact(x, z, kind);
    },
  };
}
