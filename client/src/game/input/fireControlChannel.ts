import * as THREE from "three";
import {
  PlayerLifeState,
  canPrimaryArtilleryEngageAimAtWorldPoint,
  getAuthoritativeShipHullProfile,
  shipHitboxFootprintCircumcircleWorldXZ,
} from "@battlefleet/shared";
import type { InputSample } from "./keyboardMouse";
import { worldToRenderX } from "../runtime/renderCoords";
import { FIRE_CONTROL_RANGE_M } from "./fireControlRange";

type PlayerRow = {
  id: string;
  x: number;
  z: number;
  headingRad: number;
  shipClass: string;
  lifeState: string;
};

const TARGET_ACQUIRE_MAX_DIST_M = FIRE_CONTROL_RANGE_M;
const TARGET_LOST_DIST_M = FIRE_CONTROL_RANGE_M;

function findShipSessionFromIntersect(hit: THREE.Intersection): string | null {
  let o: THREE.Object3D | null = hit.object;
  while (o) {
    const id = o.userData?.bfaShipSessionId;
    if (typeof id === "string" && id.length > 0) return id;
    o = o.parent;
  }
  return null;
}

export function createFireControlChannel(options: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLElement;
  mySessionId: string;
  /** Spieler-Anzeige für Toasts */
  playerLabel: (p: { id: string; displayName?: string }) => string;
  onAutofireChange?: (enabled: boolean) => void;
  onToast: (text: string, kind: "info" | "danger", durationMs: number) => void;
}): {
  applyToInput: (
    sample: InputSample,
    players: Iterable<PlayerRow>,
    matchEnded: boolean,
  ) => InputSample;
  getTargetId: () => string | null;
  setAutofire: (enabled: boolean) => void;
  isAutofireEnabled: () => boolean;
  /** Wie F: durch Ziele innerhalb von 800 m schalten. */
  cycleNextTarget: () => void;
  selectNearestTarget: () => void;
  clearTarget: () => void;
  dispose: () => void;
} {
  const { scene, camera, canvas, mySessionId, playerLabel, onToast } = options;
  const raycaster = new THREE.Raycaster();

  let designatedTargetId: string | null = null;
  let disposed = false;
  let autofire = false;
  const setAutofire = (enabled: boolean) => {
    if (disposed || autofire === enabled) return;
    autofire = enabled;
    options.onAutofireChange?.(enabled);
  };
  const onBlur = () => setAutofire(false);

  /** Zusätzlicher Faktor nur für die Darstellung (Hitbox-Umkreis bleibt Berechnungsbasis). */
  const RING_RADIUS_VISUAL_FACTOR = 1.2;
  const RING_COLOR_OUT_OF_SECTOR = 0xffaa33;
  const RING_COLOR_IN_SECTOR = 0x44ee66;

  /** Einheitskreis; tatsächlicher Radius über `ringRoot.scale`. */
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const ringGeom = new THREE.BufferGeometry().setFromPoints(ringPts);
  const ringMat = new THREE.LineBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.92,
    depthTest: true,
    depthWrite: false,
  });
  const ringLine = new THREE.LineLoop(ringGeom, ringMat);
  ringLine.renderOrder = 10;
  const ringRoot = new THREE.Group();
  ringRoot.add(ringLine);
  ringRoot.visible = false;
  scene.add(ringRoot);

  const setRingVisible = (on: boolean): void => {
    ringRoot.visible = on;
  };

  const updateFireControlRing = (me: PlayerRow, target: PlayerRow): boolean => {
    const hull = getAuthoritativeShipHullProfile(target.shipClass);
    const h = target.headingRad;
    const { cx, cz, radius } = shipHitboxFootprintCircumcircleWorldXZ(
      target.x,
      target.z,
      h,
      hull?.collisionHitbox,
    );
    ringRoot.position.set(worldToRenderX(cx), 0.45, cz);
    ringRoot.scale.setScalar(Math.max(10, radius * RING_RADIUS_VISUAL_FACTOR));

    const canEngage = canPrimaryArtilleryEngageAimAtWorldPoint(
      me.x,
      me.z,
      me.headingRad,
      me.shipClass,
      target.x,
      target.z,
    );
    ringMat.color.setHex(canEngage ? RING_COLOR_IN_SECTOR : RING_COLOR_OUT_OF_SECTOR);
    return canEngage;
  };

  const clearDesignation = (reason: "manual" | "lost"): void => {
    if (!designatedTargetId) return;
    designatedTargetId = null;
    setRingVisible(false);
    if (reason === "lost") {
      onToast("Fire-control channel: target lost", "danger", 3200);
    }
  };

  const setDesignation = (target: PlayerRow): void => {
    if (target.lifeState === PlayerLifeState.AwaitingRespawn) return;
    if (target.id === mySessionId) return;
    designatedTargetId = target.id;
    onToast(`Fire-control channel: ${playerLabel(target)}`, "info", 2800);
  };

  const sqDist = (ax: number, az: number, bx: number, bz: number): number => {
    const dx = ax - bx;
    const dz = az - bz;
    return dx * dx + dz * dz;
  };

  const selectNextTargetWithinRange = (me: PlayerRow, nearest = false): void => {
    const maxSq = TARGET_ACQUIRE_MAX_DIST_M * TARGET_ACQUIRE_MAX_DIST_M;
    const candidates = latestPlayers
      .filter(
        (p) =>
          p.id !== mySessionId &&
          p.lifeState !== PlayerLifeState.AwaitingRespawn &&
          sqDist(me.x, me.z, p.x, p.z) <= maxSq,
      )
      .sort((a, b) => {
        const da = sqDist(me.x, me.z, a.x, a.z);
        const db = sqDist(me.x, me.z, b.x, b.z);
        if (da !== db) return da - db;
        return a.id.localeCompare(b.id);
      });
    if (candidates.length === 0) {
      onToast(`Fire-control channel: no target <= ${TARGET_ACQUIRE_MAX_DIST_M} m`, "danger", 2600);
      return;
    }
    if (nearest || !designatedTargetId) {
      setDesignation(candidates[0]!);
      return;
    }
    const idx = candidates.findIndex((p) => p.id === designatedTargetId);
    const next = candidates[(idx + 1 + candidates.length) % candidates.length]!;
    setDesignation(next);
  };

  /** Zuletzt aus dem Spieltick — für Raycast-Klicks zwischen Frames. */
  let latestPlayers: PlayerRow[] = [];

  let latestMatchEnded = false;
  const chooseTarget = (nearest: boolean): void => {
    if (disposed || latestMatchEnded) return;
    const me = latestPlayers.find((p) => p.id === mySessionId);
    if (!me || me.lifeState === PlayerLifeState.AwaitingRespawn) return;
    selectNextTargetWithinRange(me, nearest);
  };
  const cycleNextTarget = () => chooseTarget(false);

  const onPointerDown = (e: PointerEvent): void => {
    if (disposed || latestMatchEnded || e.defaultPrevented) return;
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const list = latestPlayers;
    for (const h of hits) {
      const sid = findShipSessionFromIntersect(h);
      if (!sid) continue;
      if (sid === mySessionId) return;
      const target = list.find((p) => p.id === sid);
      const me = list.find(p => p.id === mySessionId);
      if (target && me && me.lifeState !== PlayerLifeState.AwaitingRespawn &&
          sqDist(me.x, me.z, target.x, target.z) <= FIRE_CONTROL_RANGE_M ** 2 &&
          target.lifeState !== PlayerLifeState.AwaitingRespawn) {
        setDesignation(target);
        return;
      }
      return;
    }
    if (designatedTargetId) clearDesignation("manual");
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (disposed || e.repeat || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const element = e.target as HTMLElement | null;
    if (element?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName ?? "")) return;
    if (e.code === "CapsLock") {
      e.preventDefault(); setAutofire(!autofire);
      onToast(`Autofire ${autofire ? "ON" : "OFF"}`, "info", 2000);
      return;
    }
    if (e.code === "KeyF") {
      e.preventDefault();
      chooseTarget(false);
      return;
    }
    if (e.code !== "Escape" && e.code !== "KeyC") return;
    if (designatedTargetId) {
      designatedTargetId = null;
      setRingVisible(false);
      onToast("Fire-control channel: cleared", "info", 2000);
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", onBlur);

  return {
    getTargetId: () => designatedTargetId,
    setAutofire,
    isAutofireEnabled: () => autofire,
    applyToInput(sample, players, matchEnded): InputSample {
      if (disposed) return sample;
      latestPlayers = Array.from(players);
      latestMatchEnded = matchEnded;
      const ownShip = latestPlayers.find(p => p.id === mySessionId);
      if (!ownShip || ownShip.lifeState === PlayerLifeState.AwaitingRespawn) setAutofire(false);
      if (matchEnded) {
        setAutofire(false);
        setRingVisible(false);
        designatedTargetId = null;
        return sample;
      }
      if (!designatedTargetId) {
        setRingVisible(false);
        return sample;
      }

      const me = latestPlayers.find((p) => p.id === mySessionId);
      if (!me || me.lifeState === PlayerLifeState.AwaitingRespawn) {
        clearDesignation("manual");
        return sample;
      }

      const target = latestPlayers.find((p) => p.id === designatedTargetId);
      if (
        !target ||
        target.lifeState === PlayerLifeState.AwaitingRespawn ||
        target.id === mySessionId
      ) {
        clearDesignation("lost");
        return sample;
      }
      if (sqDist(me.x, me.z, target.x, target.z) > TARGET_LOST_DIST_M * TARGET_LOST_DIST_M) {
        clearDesignation("lost");
        return sample;
      }

      const canEngage = updateFireControlRing(me, target);
      setRingVisible(true);

      return {
        ...sample,
        primaryFire: sample.primaryFire || (autofire && canEngage),
        aimWorldX: target.x,
        aimWorldZ: target.z,
      };
    },
    cycleNextTarget,
    selectNearestTarget: () => chooseTarget(true),
    clearTarget: () => { if (!disposed && designatedTargetId) clearDesignation("manual"); },
    dispose() {
      if (disposed) return;
      disposed = true;
      latestPlayers = [];
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
      designatedTargetId = null;
      scene.remove(ringRoot);
      ringGeom.dispose();
      ringMat.dispose();
    },
  };
}
