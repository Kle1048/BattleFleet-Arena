import * as THREE from "three";
import { createAnimationLifetime, type AnimationClock, type AnimationLifetime } from "../runtime/animationLifetime";
import { renderToWorldX, worldToRenderX } from "../runtime/renderCoords";
import { createProjectileBody } from "./projectileVisual";

/**
 * VFX-Maßstab: bewusst **größer** als reale Meter — Ortho (~320 m Halbhöhe) + Schiff ~40 m;
 * sonst sind FK/Tracer nur wenige Pixel groß.
 */
const FLIGHT_Y = 16;
const SAM_FLIGHT_MS = 780;
/** Abstand (Render-XZ), ab dem der Abfang-VFX endet. */
const SAM_INTERCEPT_CLOSE_DIST = 8;
/** Sicherheits-Timeout, falls das Ziel nicht erreicht wird. */
const SAM_INTERCEPT_MAX_MS = SAM_FLIGHT_MS * 3;

const CIWS_TRACER_COUNT = 16;
const CIWS_BURST_SPREAD_MS = 320;
const CIWS_TRACER_FLIGHT_MS_MIN = 140;
const CIWS_TRACER_FLIGHT_MS_MAX = 240;

const AD_FX_RENDER_ORDER = 12;
/** Wie ASuM: kurz kein Schweif direkt am Start. */
const SAM_INTERCEPT_TRAIL_SUPPRESS_MS = 88;

function headingRadFromDelta(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

function disposeMesh(scene: THREE.Scene, mesh: THREE.Mesh): void {
  scene.remove(mesh);
  mesh.geometry.dispose();
  const m = mesh.material;
  if (Array.isArray(m)) {
    for (const x of m) x.dispose();
  } else {
    m.dispose();
  }
}

function disposeSamGroup(scene: THREE.Scene, group: THREE.Group): void {
  scene.remove(group);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

function interceptRingFlash(
  animation: AnimationLifetime,
  scene: THREE.Scene,
  x: number,
  z: number,
  color: number,
  inner: number,
  outer: number,
): void {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 20),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthTest: false,
      fog: false,
    }),
  );
  ring.renderOrder = AD_FX_RENDER_ORDER;
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.4, z);
  scene.add(ring);
  const release = animation.own(() => disposeMesh(scene, ring));
  const born = animation.now();
  const fade = (): void => {
    const t = animation.now() - born;
    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.82 * (1 - t / 240));
    ring.scale.setScalar(1 + t * 0.006);
    if (t >= 240) {
      release();
      return;
    }
    animation.frame(fade);
  };
  animation.frame(fade);
}

function buildSamInterceptMissile(kind: "sam" | "pd"): THREE.Group {
  const group = new THREE.Group();
  group.frustumCulled = false;
  const body = createProjectileBody(kind);
  body.frustumCulled = false;
  body.renderOrder = AD_FX_RENDER_ORDER;
  body.position.y = 0;
  group.add(body);
  return group;
}

/** Live-Ziel in **Render**-XZ (wie `worldToRenderX` auf ASuM-Position). `null` = Rakete nicht mehr in der Liste. */
export type SamInterceptTrackedTargetXZ = () => { x: number; z: number } | null;

/** Gleiche Hooks wie ASuM-Start/Schweif (`createFxSystem`). */
export type AirDefenseSamLaunchFx = {
  spawnMissileLaunchSmoke: (worldX: number, worldZ: number, headingRad: number, launchY?: number) => void;
  spawnMissileTrailStreamTick: (
    worldX: number,
    worldZ: number,
    headingRad: number,
    particleCount?: number,
  ) => void;
};

function emitSamInterceptTrailTick(
  launchFx: AirDefenseSamLaunchFx | null | undefined,
  pxRender: number,
  pzWorld: number,
  txRender: number,
  tzWorld: number,
  dtMs: number,
  nowMs: number,
  trailSuppressUntilMs: number,
): void {
  if (!launchFx || nowMs < trailSuppressUntilMs) return;
  const wx = renderToWorldX(pxRender);
  const wz = pzWorld;
  const wtx = renderToWorldX(txRender);
  const wtz = tzWorld;
  const heading = Math.atan2(wtx - wx, wtz - wz);
  const n = Math.max(3, Math.min(9, Math.round(2.85 * (dtMs / 16.67))));
  launchFx.spawnMissileTrailStreamTick(wx, wz, heading, n);
}

function playSamIntercept(
  animation: AnimationLifetime,
  scene: THREE.Scene,
  kind: "sam" | "pd",
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  withEndBurst: boolean,
  launchY: number = FLIGHT_Y,
  getTrackedTargetXZ?: SamInterceptTrackedTargetXZ | null,
  launchFx?: AirDefenseSamLaunchFx | null,
): void {
  const sx = fromX;
  const sz = fromZ;
  let ex = toX;
  let ez = toZ;
  if (getTrackedTargetXZ) {
    const live = getTrackedTargetXZ();
    if (live) {
      ex = live.x;
      ez = live.z;
    }
  }

  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) {
    if (withEndBurst) {
      interceptRingFlash(animation, scene, ex, ez, 0x88c8ff, 5, 20);
    }
    return;
  }

  const sy = launchY;
  const ey = FLIGHT_Y;
  const chordYaw = headingRadFromDelta(dx, dz);

  const g = buildSamInterceptMissile(kind);
  g.position.set(sx, sy, sz);
  scene.add(g);
  const release = animation.own(() => disposeSamGroup(scene, g));

  const trailSuppressUntilMs = animation.now() + (launchFx ? SAM_INTERCEPT_TRAIL_SUPPRESS_MS : 0);
  let lastTrailAt = animation.now();

  if (getTrackedTargetXZ) {
    const speed = len / (SAM_FLIGHT_MS * 0.001);
    let px = sx;
    let pz = sz;
    let py = sy;
    let tx = ex;
    let tz = ez;
    let lastNow = animation.now();
    const tStart = lastNow;

    const finishAt = (fx: number, fz: number): void => {
      g.position.set(fx, py, fz);
      const hx = tx - fx;
      const hz = tz - fz;
      if (Math.hypot(hx, hz) > 1e-4) {
        g.rotation.y = Math.atan2(hx, hz);
      } else {
        g.rotation.y = chordYaw;
      }
      release();
      if (withEndBurst) {
        interceptRingFlash(animation, scene, fx, fz, 0x88c8ff, 6, 22);
      }
    };

    const stepTrack = (): void => {
      const now = animation.now();
      const dt = Math.min(0.08, (now - lastNow) / 1000);
      lastNow = now;

      const live = getTrackedTargetXZ();
      if (live) {
        tx = live.x;
        tz = live.z;
      }

      let rdx = tx - px;
      let rdz = tz - pz;
      let dist = Math.hypot(rdx, rdz);

      if (dist < SAM_INTERCEPT_CLOSE_DIST || now - tStart > SAM_INTERCEPT_MAX_MS) {
        finishAt(tx, tz);
        return;
      }

      const stepDist = speed * dt;
      if (stepDist >= dist) {
        px = tx;
        pz = tz;
      } else {
        rdx /= dist;
        rdz /= dist;
        px += rdx * stepDist;
        pz += rdz * stepDist;
      }

      py = sy + (ey - sy) * Math.min(1, (now - tStart) / SAM_FLIGHT_MS);
      g.position.set(px, py, pz);
      rdx = tx - px;
      rdz = tz - pz;
      dist = Math.hypot(rdx, rdz);
      if (dist > 1e-4) {
        g.rotation.y = Math.atan2(rdx, rdz);
      } else {
        g.rotation.y = chordYaw;
      }

      const nowMs = animation.now();
      const dtMs = Math.min(80, nowMs - lastTrailAt);
      lastTrailAt = nowMs;
      emitSamInterceptTrailTick(launchFx, px, pz, tx, tz, dtMs, nowMs, trailSuppressUntilMs);

      animation.frame(stepTrack);
    };
    g.rotation.y = Math.hypot(tx - sx, tz - sz) > 1e-4 ? Math.atan2(tx - sx, tz - sz) : chordYaw;
    animation.frame(stepTrack);
    return;
  }

  const runFlight = (group: THREE.Group, tStart: number): void => {
    const aimConeAtTarget = (px: number, pz: number): void => {
      const rdx = ex - px;
      const rdz = ez - pz;
      const horiz = Math.hypot(rdx, rdz);
      if (horiz > 1e-4) {
        group.rotation.y = Math.atan2(rdx, rdz);
      } else {
        group.rotation.y = chordYaw;
      }
    };

    let prevStep = animation.now();
    const step = (): void => {
      const nowMs = animation.now();
      const u = Math.min(1, (nowMs - tStart) / SAM_FLIGHT_MS);
      const px = sx + (ex - sx) * u;
      const py = sy + (ey - sy) * u;
      const pz = sz + (ez - sz) * u;
      group.position.set(px, py, pz);
      aimConeAtTarget(px, pz);

      const dtMs = Math.min(80, nowMs - prevStep);
      prevStep = nowMs;
      emitSamInterceptTrailTick(launchFx, px, pz, ex, ez, dtMs, nowMs, trailSuppressUntilMs);

      if (u >= 1) {
        release();
        if (withEndBurst) {
          interceptRingFlash(animation, scene, ex, ez, 0x88c8ff, 6, 22);
        }
        return;
      }
      animation.frame(step);
    };
    animation.frame(step);
  };

  g.rotation.y = chordYaw;
  runFlight(g, animation.now());
}

function playCiwsIntercept(
  animation: AnimationLifetime,
  scene: THREE.Scene,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  withEndBurst: boolean,
  launchY: number = FLIGHT_Y,
): void {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) {
    if (withEndBurst) {
      interceptRingFlash(animation, scene, toX, toZ, 0xffcc66, 3, 16);
    }
    return;
  }
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;

  for (let i = 0; i < CIWS_TRACER_COUNT; i++) {
    const delay = (i / Math.max(1, CIWS_TRACER_COUNT - 1)) * CIWS_BURST_SPREAD_MS;
    const jitter = (Math.random() - 0.5) * 12;
    const sx = fromX;
    const sz = fromZ;
    const sy = launchY;
    const flightMs =
      CIWS_TRACER_FLIGHT_MS_MIN +
      Math.random() * (CIWS_TRACER_FLIGHT_MS_MAX - CIWS_TRACER_FLIGHT_MS_MIN);

    animation.delay(() => {
      const toTarget = new THREE.Vector3(toX - sx, 0, toZ - sz);
      if (toTarget.lengthSq() < 1e-6) return;
      toTarget.normalize();
      const bend = new THREE.Vector3(toTarget.x, 0.15, toTarget.z).normalize();

      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff0c0,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        fog: false,
      });
      const geo = new THREE.CylinderGeometry(0.55, 0.38, 14, 8);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = AD_FX_RENDER_ORDER;
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        bend,
      );
      mesh.setRotationFromQuaternion(quat);
      mesh.position.set(sx, sy, sz);
      scene.add(mesh);
      const release = animation.own(() => disposeMesh(scene, mesh));

      const t0 = animation.now();
      const ex = toX + px * jitter;
      const ez = toZ + pz * jitter;
      const ey = FLIGHT_Y;
      const anim = (): void => {
        const u = Math.min(1, (animation.now() - t0) / flightMs);
        const m = u * u;
        mesh.position.set(sx + (ex - sx) * m, sy + (ey - sy) * m, sz + (ez - sz) * m);
        const fade = mesh.material as THREE.MeshBasicMaterial;
        fade.opacity = 0.95 * (1 - u * 0.85);
        if (u >= 1) {
          release();
          return;
        }
        animation.frame(anim);
      };
      animation.frame(anim);
    }, delay);
  }

  if (withEndBurst) {
    animation.delay(() => {
      interceptRingFlash(animation, scene, toX, toZ, 0xffea90, 4, 15);
    }, CIWS_BURST_SPREAD_MS * 0.65);
  }
}

/**
 * Server `airDefenseFire`: nur ausgehende FK / Tracer — **ohne** Einschlag-Ring.
 * `launchY`: Modell-Mündungshöhe für alle Abwehrschichten; alte Replay-Ereignisse nutzen `FLIGHT_Y`.
 */
function playAirDefenseFire(
  animation: AnimationLifetime,
  scene: THREE.Scene,
  layer: "sam" | "pd" | "ciws",
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  launchY?: number,
  getTrackedTargetXZ?: SamInterceptTrackedTargetXZ | null,
  launchFx?: AirDefenseSamLaunchFx | null,
): void {
  try {
    const rx0 = worldToRenderX(fromX);
    const rx1 = worldToRenderX(toX);
    if (layer === "sam" || layer === "pd") {
      const y =
        Number.isFinite(launchY) ? (launchY as number) : FLIGHT_Y;
      if (launchFx) {
        const launchHeading = Math.atan2(toX - fromX, toZ - fromZ);
        launchFx.spawnMissileLaunchSmoke(fromX, fromZ, launchHeading, y);
      }
      playSamIntercept(animation, scene, layer, rx0, fromZ, rx1, toZ, false, y, getTrackedTargetXZ ?? null, launchFx ?? null);
    } else {
      playCiwsIntercept(animation, scene, rx0, fromZ, rx1, toZ, false, launchY);
    }
  } catch (e) {
    console.warn("[airDefenseFx] playAirDefenseFire", e);
  }
}

/** Server `airDefenseIntercept`: Detonation am Zielpunkt (nach Trefferwurf). */
function playAirDefenseHitBurst(
  animation: AnimationLifetime,
  scene: THREE.Scene,
  x: number,
  z: number,
  layer: "sam" | "pd" | "ciws",
): void {
  try {
    const rx = worldToRenderX(x);
    if (layer === "sam") {
      interceptRingFlash(animation, scene, rx, z, 0x88c8ff, 6, 22);
    } else if (layer === "pd") {
      interceptRingFlash(animation, scene, rx, z, 0xa8d8ff, 5, 18);
    } else {
      interceptRingFlash(animation, scene, rx, z, 0xffea90, 4, 15);
    }
  } catch (e) {
    console.warn("[airDefenseFx] playAirDefenseHitBurst", e);
  }
}

/**
 * Kurzer 2D-Puls am abgebildeten Abfangpunkt — unabhängig von Three-Meshes (Debug + Nutzer-Feedback).
 */
function showAirDefenseScreenPulse(
  animation: AnimationLifetime,
  camera: THREE.Camera,
  mount: HTMLElement,
  worldX: number,
  worldZ: number,
  layer: "sam" | "pd" | "ciws",
): void {
  const v = new THREE.Vector3(worldToRenderX(worldX), 1.4, worldZ);
  v.project(camera);
  if (v.z > 1) return;
  const px = (v.x * 0.5 + 0.5) * window.innerWidth;
  const py = (-v.y * 0.5 + 0.5) * window.innerHeight;
  const el = document.createElement("div");
  const col = layer === "sam" ? "#66a8ff" : layer === "pd" ? "#88b8ff" : "#ffcc44";
  const glow =
    layer === "sam"
      ? "rgba(136,200,255,0.95)"
      : layer === "pd"
        ? "rgba(160,210,255,0.92)"
        : "rgba(255,234,144,0.95)";
  el.style.cssText =
    `position:fixed;left:${px}px;top:${py}px;width:28px;height:28px;margin:-14px;border-radius:50%;` +
    `pointer-events:none;z-index:12000;background:${col};box-shadow:0 0 22px 6px ${glow};opacity:0.95;` +
    `transition:opacity 0.35s ease-out,transform 0.35s ease-out;transform:scale(1);`;
  mount.appendChild(el);
  const release = animation.own(() => el.remove());
  animation.frame(() => {
    el.style.opacity = "0";
    el.style.transform = "scale(2.2)";
  });
  animation.delay(release, 420);
}

/** Public effect arguments omit the session-owned lifetime injected by this factory. */
type EffectArgs<T extends unknown[]> = T extends [AnimationLifetime, ...infer Args] ? Args : never;

/** A session owns every delayed tracer, flying interceptor and screen pulse. */
export function createAirDefenseFx(clock?: AnimationClock) {
  const animation = createAnimationLifetime(clock);
  return {
    fire(...args: EffectArgs<Parameters<typeof playAirDefenseFire>>) {
      if (!animation.disposed) playAirDefenseFire(animation, ...args);
    },
    hit(...args: EffectArgs<Parameters<typeof playAirDefenseHitBurst>>) {
      if (!animation.disposed) playAirDefenseHitBurst(animation, ...args);
    },
    pulse(...args: EffectArgs<Parameters<typeof showAirDefenseScreenPulse>>) {
      if (!animation.disposed) showAirDefenseScreenPulse(animation, ...args);
    },
    dispose: animation.dispose,
  };
}
