import * as THREE from "three";
import { worldToRenderX } from "../runtime/renderCoords";

/**
 * VFX-Maßstab: bewusst **größer** als reale Meter — Ortho (~320 m Halbhöhe) + Schiff ~40 m;
 * sonst sind FK/Tracer nur wenige Pixel groß.
 */
const FLIGHT_Y = 16;
const SAM_FLIGHT_MS = 780;
const SAM_CONE_R = 3.2;
const SAM_CONE_H = 22;

const CIWS_TRACER_COUNT = 16;
const CIWS_BURST_SPREAD_MS = 320;
const CIWS_TRACER_FLIGHT_MS_MIN = 140;
const CIWS_TRACER_FLIGHT_MS_MAX = 240;

const AD_FX_RENDER_ORDER = 12;

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
  const born = performance.now();
  const fade = (): void => {
    const t = performance.now() - born;
    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.82 * (1 - t / 240));
    ring.scale.setScalar(1 + t * 0.006);
    if (t >= 240) {
      scene.remove(ring);
      ring.geometry.dispose();
      mat.dispose();
      return;
    }
    requestAnimationFrame(fade);
  };
  requestAnimationFrame(fade);
}

function buildSamInterceptMissile(): THREE.Group {
  const group = new THREE.Group();
  group.frustumCulled = false;
  const geo = new THREE.ConeGeometry(SAM_CONE_R, SAM_CONE_H, 10);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe8f8ff,
    fog: false,
    depthTest: false,
  });
  const body = new THREE.Mesh(geo, mat);
  body.frustumCulled = false;
  body.renderOrder = AD_FX_RENDER_ORDER;
  body.rotation.x = Math.PI / 2;
  body.position.y = 0;
  group.add(body);
  return group;
}

/** Quadratische Bézier — Punkt t∈[0,1]. */
function bezierQuad1D(p0: number, p1: number, p2: number, t: number): number {
  const o = 1 - t;
  return o * o * p0 + 2 * o * t * p1 + t * t * p2;
}

/** Ableitung d/dt (für Fluglage tangential zur Bahn). */
function bezierQuadDeriv1D(p0: number, p1: number, p2: number, t: number): number {
  const o = 1 - t;
  return 2 * o * (p1 - p0) + 2 * t * (p2 - p1);
}

function playSamIntercept(
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
      interceptRingFlash(scene, toX, toZ, 0x88c8ff, 5, 20);
    }
    return;
  }

  const sx = fromX;
  const sz = fromZ;
  const ex = toX;
  const ez = toZ;
  const sy = launchY;
  const ey = launchY;

  /** Hundekurve: Kontrollpunkt seitlich zur Streckenmitte + leichte Höhe. */
  const mx = (sx + ex) * 0.5;
  const mz = (sz + ez) * 0.5;
  const perpX = -dz / len;
  const perpZ = dx / len;
  const bend = len * randRange(0.12, 0.22);
  const side = Math.random() < 0.5 ? -1 : 1;
  const cx = mx + perpX * bend * side;
  const cz = mz + perpZ * bend * side;
  const cy = launchY + Math.min(10, len * 0.055);

  const easeFlight = (u: number): number =>
    u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

  const runFlight = (group: THREE.Group, tStart: number): void => {
    const step = (): void => {
      const u = Math.min(1, (performance.now() - tStart) / SAM_FLIGHT_MS);
      const t = easeFlight(u);
      const px = bezierQuad1D(sx, cx, ex, t);
      const py = bezierQuad1D(sy, cy, ey, t);
      const pz = bezierQuad1D(sz, cz, ez, t);
      group.position.set(px, py, pz);

      const tx = bezierQuadDeriv1D(sx, cx, ex, t);
      const tz = bezierQuadDeriv1D(sz, cz, ez, t);
      const horiz = Math.hypot(tx, tz);
      if (horiz > 1e-5) {
        group.rotation.y = Math.atan2(tx, tz);
      }

      if (u >= 1) {
        disposeSamGroup(scene, group);
        if (withEndBurst) {
          interceptRingFlash(scene, toX, toZ, 0x88c8ff, 6, 22);
        }
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const g = buildSamInterceptMissile();
  g.position.set(sx, sy, sz);
  const tx0 = bezierQuadDeriv1D(sx, cx, ex, 0);
  const tz0 = bezierQuadDeriv1D(sz, cz, ez, 0);
  if (Math.hypot(tx0, tz0) > 1e-5) {
    g.rotation.y = Math.atan2(tx0, tz0);
  } else {
    g.rotation.y = headingRadFromDelta(dx, dz);
  }
  scene.add(g);
  runFlight(g, performance.now());
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function playCiwsIntercept(
  scene: THREE.Scene,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  withEndBurst: boolean,
): void {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) {
    if (withEndBurst) {
      interceptRingFlash(scene, toX, toZ, 0xffcc66, 3, 16);
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
    const sx = fromX + px * jitter;
    const sz = fromZ + pz * jitter;
    const sy = FLIGHT_Y + (Math.random() - 0.5) * 1.2;
    const flightMs =
      CIWS_TRACER_FLIGHT_MS_MIN +
      Math.random() * (CIWS_TRACER_FLIGHT_MS_MAX - CIWS_TRACER_FLIGHT_MS_MIN);

    window.setTimeout(() => {
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

      const t0 = performance.now();
      const ex = toX;
      const ez = toZ;
      const ey = sy * 0.4;
      const anim = (): void => {
        const u = Math.min(1, (performance.now() - t0) / flightMs);
        const m = u * u;
        mesh.position.set(sx + (ex - sx) * m, sy + (ey - sy) * m, sz + (ez - sz) * m);
        const fade = mesh.material as THREE.MeshBasicMaterial;
        fade.opacity = 0.95 * (1 - u * 0.85);
        if (u >= 1) {
          disposeMesh(scene, mesh);
          return;
        }
        requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }, delay);
  }

  if (withEndBurst) {
    window.setTimeout(() => {
      interceptRingFlash(scene, toX, toZ, 0xffea90, 4, 15);
    }, CIWS_BURST_SPREAD_MS * 0.65);
  }
}

/**
 * Server `airDefenseFire`: nur ausgehende FK / Tracer — **ohne** Einschlag-Ring.
 * `pdLaunchY`: optional Mündungs-Höhe (Three.js) für PDMS; sonst fester `FLIGHT_Y` wie SAM.
 */
export function playAirDefenseFire(
  scene: THREE.Scene,
  layer: "sam" | "pd" | "ciws",
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  pdLaunchY?: number,
): void {
  try {
    const rx0 = worldToRenderX(fromX);
    const rx1 = worldToRenderX(toX);
    if (layer === "sam" || layer === "pd") {
      const y =
        layer === "pd" && Number.isFinite(pdLaunchY) ? (pdLaunchY as number) : FLIGHT_Y;
      playSamIntercept(scene, rx0, fromZ, rx1, toZ, false, y);
    } else {
      playCiwsIntercept(scene, rx0, fromZ, rx1, toZ, false);
    }
  } catch (e) {
    console.warn("[airDefenseFx] playAirDefenseFire", e);
  }
}

/** Server `airDefenseIntercept`: Detonation am Zielpunkt (nach Trefferwurf). */
export function playAirDefenseHitBurst(
  scene: THREE.Scene,
  x: number,
  z: number,
  layer: "sam" | "pd" | "ciws",
): void {
  try {
    const rx = worldToRenderX(x);
    if (layer === "sam") {
      interceptRingFlash(scene, rx, z, 0x88c8ff, 6, 22);
    } else if (layer === "pd") {
      interceptRingFlash(scene, rx, z, 0xa8d8ff, 5, 18);
    } else {
      interceptRingFlash(scene, rx, z, 0xffea90, 4, 15);
    }
  } catch (e) {
    console.warn("[airDefenseFx] playAirDefenseHitBurst", e);
  }
}

/**
 * Kurzer 2D-Puls am abgebildeten Abfangpunkt — unabhängig von Three-Meshes (Debug + Nutzer-Feedback).
 */
export function showAirDefenseScreenPulse(
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
  requestAnimationFrame(() => {
    el.style.opacity = "0";
    el.style.transform = "scale(2.2)";
  });
  window.setTimeout(() => el.remove(), 420);
}
