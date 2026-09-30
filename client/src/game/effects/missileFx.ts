import * as THREE from "three";
import { ASWM_SPEED } from "@battlefleet/shared";
import { createProjectileBody } from "./projectileVisual";
import { worldToRenderX, worldToRenderYaw } from "../runtime/renderCoords";
import type { FxSystem } from "./fxSystem";
import type { MissileFired } from "../presentation/MatchPresentationEvent";

const BODY_Y = 2.8;

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
  launch?: Launch;
};
type Launch = { x: number; y: number; z: number; at: number };
type MuzzleResolver = (ownerId: string, launcherId: string) => { x: number; y: number; z: number } | null;
const LAUNCH_BLEND_MS = 250;

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
  createWarmupMesh: () => THREE.Mesh;
  onFired: (message: MissileFired) => void;
  setMuzzleSeekResolver: (resolver: MuzzleResolver) => void;
} {
  const byId = new Map<number, Entry>();
  // Session-owned resources survive the last missile, retaining compiled programs.
  const bodyTemplate = createProjectileBody("ssm");
  // Wire events may precede the state patch. Bounded and short-lived, never a projectile authority.
  const pendingLaunches = new Map<number, Launch>();
  let resolveMuzzle: MuzzleResolver | undefined;
  let disposed = false;

  function removeMissileEntry(id: number): void {
    const e = byId.get(id);
    if (!e) return;
    scene.remove(e.group);
    byId.delete(id);
  }

  function ensure(id: number): Entry {
    let e = byId.get(id);
    if (e) return e;

    const group = new THREE.Group();
    const body = bodyTemplate.clone();
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
    if (disposed) return;
    syncKeepIds.clear();
    const now = performance.now();
    if (missiles === null) {
      pendingLaunches.clear();
      for (const id of Array.from(byId.keys())) {
        removeMissileEntry(id);
      }
      return;
    }
    for (const m of missiles) {
      syncKeepIds.add(m.missileId);
      const isNew = !byId.has(m.missileId);
      const e = ensure(m.missileId);
      const launch = pendingLaunches.get(m.missileId);
      if (launch) { e.launch = launch; pendingLaunches.delete(m.missileId); }

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
        const start = e.launch ?? { x: m.x, y: BODY_Y, z: m.z };
        e.group.position.set(worldToRenderX(start.x), start.y - BODY_Y, start.z);
      }
    }
    for (const id of byId.keys()) {
      if (!syncKeepIds.has(id)) {
        removeMissileEntry(id);
      }
    }
  }

  function update(nowMs: number, dtMs: number): void {
    if (disposed) return;
    for (const [id, launch] of pendingLaunches) if (nowMs - launch.at > 1000) pendingLaunches.delete(id);
    const dt = Math.max(0, Math.min(dtMs, 80));
    for (const e of byId.values()) {
      const ago = Math.min(MAX_EXTRAPOLATE_SEC, Math.max(0, (nowMs - e.lastSyncMs) * 0.001));
      let ex = e.syncWorldX + e.velX * ago;
      let ez = e.syncWorldZ + e.velZ * ago;
      let y = BODY_Y;
      if (e.launch) {
        const u = Math.min(1, Math.max(0, (nowMs - e.launch.at) / LAUNCH_BLEND_MS));
        ex = e.launch.x + (ex - e.launch.x) * u;
        ez = e.launch.z + (ez - e.launch.z) * u;
        y = e.launch.y + (BODY_Y - e.launch.y) * u;
        if (u === 1) e.launch = undefined;
      }
      e.group.position.set(worldToRenderX(ex), y - BODY_Y, ez);
      e.group.rotation.y = worldToRenderYaw(e.headingRad);

      if (nowMs < e.trailSuppressUntilMs) continue;
      const n = Math.max(3, Math.min(9, Math.round(2.85 * (dt / 16.67))));
      fx.spawnMissileTrailStreamTick(ex, ez, e.headingRad, n);
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pendingLaunches.clear();
    resolveMuzzle = undefined;
    for (const id of Array.from(byId.keys())) {
      removeMissileEntry(id);
    }
    bodyTemplate.geometry.dispose();
    bodyTemplate.material.dispose();
  }

  return {
    sync,
    update,
    dispose,
    createWarmupMesh: () => bodyTemplate.clone(),
    setMuzzleSeekResolver(resolver) { if (!disposed) resolveMuzzle = resolver; },
    onFired(message) {
      if (disposed) return;
      const origin = resolveMuzzle?.(message.ownerId, message.launcherId) ??
        { x: message.fromX, y: message.fromY, z: message.fromZ };
      fx.spawnMissileLaunchSmoke(origin.x, origin.z, message.headingRad, origin.y);
      const launch = { ...origin, at: performance.now() };
      const entry = byId.get(message.missileId);
      if (entry) entry.launch = launch;
      else {
        if (pendingLaunches.size >= 256) pendingLaunches.delete(pendingLaunches.keys().next().value!);
        pendingLaunches.set(message.missileId, launch);
      }
    },
    getStats() {
      return { activeMissiles: byId.size };
    },
    flashImpact(x, z, kind) {
      if (disposed) return;
      fx.spawnMissileImpact(x, z, kind);
    },
  };
}
