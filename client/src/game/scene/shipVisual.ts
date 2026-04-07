import * as THREE from "three";
import { ARTILLERY_RANGE, getShipClassProfile, PlayerLifeState } from "@battlefleet/shared";
import {
  OVERLAY_RENDER_ORDER,
  RUDDER_DEFLECTION_DEG,
  SHIP_BOW_Z,
  SHIP_CAMERA_PIVOT_LOCAL_Z,
  SHIP_STERN_Z,
} from "./createGameScene";
import { VisualColorTokens, createShipHullAliveMaterial } from "../runtime/materialLibrary";

const DECK_Y = 1.2;
const AIM_TURRET_GRAY = 0xb8bcc4;
const AIM_ORIGIN_LOCAL_Z = SHIP_CAMERA_PIVOT_LOCAL_Z;
/** Kiel knapp über der Wasseroberfläche — Rumpf als Prisma (Dreieck × Höhe in Y). */
const HULL_KEEL_Y = 0.28;

function createHullPrismGeometry(halfBeam: number): THREE.BufferGeometry {
  const bowZ = SHIP_BOW_Z;
  const sternZ = SHIP_STERN_Z;
  const y0 = HULL_KEEL_Y;
  const y1 = DECK_Y;
  // Unten / oben: Bug +Z, Backbord −X, Steuerbord +X (wie bisher).
  const positions = new Float32Array([
    0,
    y0,
    bowZ,
    -halfBeam,
    y0,
    sternZ,
    halfBeam,
    y0,
    sternZ,
    0,
    y1,
    bowZ,
    -halfBeam,
    y1,
    sternZ,
    halfBeam,
    y1,
    sternZ,
  ]);
  const indices = [
    // Deck (+Y)
    3, 4, 5,
    // Kiel (−Y)
    0, 2, 1,
    // Backbord
    0, 1, 4, 0, 4, 3,
    // Steuerbord
    0, 3, 5, 0, 5, 2,
    // Heck
    1, 2, 5, 1, 5, 4,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export type ShipVisual = {
  group: THREE.Group;
  aimLine: THREE.Line;
  rudderLine: THREE.Line;
  hull: THREE.Mesh;
  /** Nur lokaler Spieler: Feuerbogen — bei Zerstörung ausgeblendet. */
  weaponGuideGroup: THREE.Group | null;
};

function hullAliveMaterial(isLocal: boolean): THREE.MeshStandardMaterial {
  return createShipHullAliveMaterial(isLocal);
}

/**
 * Darstellung „zerstört“ (`awaiting_respawn`) vs. operativ — Materialien & Waffenführung.
 * Y-Versatz (Einsinken) setzt der Aufrufer auf `group.position.y`.
 */
export function setShipVisualLifeState(
  vis: ShipVisual,
  lifeState: string,
  isLocal: boolean,
): void {
  const wreck = lifeState === PlayerLifeState.AwaitingRespawn;
  const shielded = lifeState === PlayerLifeState.SpawnProtected;
  const hullMat = vis.hull.material as THREE.MeshStandardMaterial;
  const aimMat = vis.aimLine.material as THREE.LineBasicMaterial;
  const rudderMat = vis.rudderLine.material as THREE.LineBasicMaterial;

  if (wreck) {
    hullMat.color.setHex(VisualColorTokens.shipHullWreck);
    hullMat.metalness = 0.04;
    hullMat.roughness = 0.92;
    hullMat.transparent = true;
    hullMat.opacity = 0.4;
    hullMat.emissive.setHex(VisualColorTokens.shipHullWreckEmissive);
    hullMat.emissiveIntensity = 0.45;
    hullMat.depthWrite = false;

    aimMat.transparent = true;
    aimMat.opacity = isLocal ? 0.08 : 0.06;

    rudderMat.transparent = true;
    rudderMat.opacity = 0.22;

    if (vis.weaponGuideGroup) {
      vis.weaponGuideGroup.visible = false;
    }
    return;
  }

  if (shielded) {
    hullMat.color.setHex(
      isLocal ? VisualColorTokens.shipHullShieldedLocal : VisualColorTokens.shipHullShieldedRemote,
    );
    hullMat.metalness = 0.18;
    hullMat.roughness = 0.55;
    hullMat.transparent = false;
    hullMat.opacity = 1;
    hullMat.depthWrite = true;
    hullMat.emissive.setHex(VisualColorTokens.shipHullShieldedEmissive);
    hullMat.emissiveIntensity = 0.55;

    aimMat.transparent = true;
    aimMat.color.setHex(AIM_TURRET_GRAY);
    aimMat.opacity = isLocal ? 1 : 0.92;

    rudderMat.transparent = false;
    rudderMat.opacity = 1;

    if (vis.weaponGuideGroup) {
      vis.weaponGuideGroup.visible = true;
      vis.weaponGuideGroup.traverse((o) => {
        const l = o as THREE.Line;
        const m = l.material as THREE.LineBasicMaterial | undefined;
        if (m) {
          m.color.setHex(VisualColorTokens.shipGuideShield);
          m.opacity = 0.55;
          m.transparent = true;
        }
      });
    }
    return;
  }

  if (vis.weaponGuideGroup) {
    vis.weaponGuideGroup.traverse((o) => {
      const l = o as THREE.Line;
      const m = l.material as THREE.LineBasicMaterial | undefined;
      if (m) {
        m.color.setHex(VisualColorTokens.shipAimLocal);
        m.opacity = 0.32;
      }
    });
  }

  hullMat.color.setHex(
    isLocal ? VisualColorTokens.shipHullLocalAlive : VisualColorTokens.shipHullRemoteAlive,
  );
  hullMat.metalness = 0.12;
  hullMat.roughness = 0.72;
  hullMat.emissive.setHex(0x000000);
  hullMat.emissiveIntensity = 0;
  hullMat.transparent = false;
  hullMat.opacity = 1;
  hullMat.depthWrite = true;

  const aimColor = AIM_TURRET_GRAY;
  const aimOpacity = isLocal ? 0.95 : 0.88;
  aimMat.color.setHex(aimColor);
  aimMat.opacity = aimOpacity;

  rudderMat.transparent = false;
  rudderMat.opacity = 1;

  if (vis.weaponGuideGroup) {
    vis.weaponGuideGroup.visible = true;
  }
}

/**
 * Ein Schiff für die Szene (eigene Gruppe, noch nicht scene.add).
 * **Peilung (Ziellinie):** immer sichtbar — Local orange (Maus, sofort), Remote cyan (State vom Server).
 * Dient als Debug-Vorbild für spätere **drehbare Geschütztürme** (jeder Spieler eigene Aim-Achse).
 */
export function createShipVisual(options: { isLocal: boolean; shipClassId?: string }): ShipVisual {
  const prof = getShipClassProfile(options.shipClassId);
  const group = new THREE.Group();
  group.scale.setScalar(prof.hullScale);

  const halfBeam = 15;
  const hullGeom = createHullPrismGeometry(halfBeam);
  const hull = new THREE.Mesh(hullGeom, hullAliveMaterial(options.isLocal));
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const rudLen = 9;
  const rudderGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, DECK_Y + 0.15, 0),
    new THREE.Vector3(0, DECK_Y + 0.15, -rudLen),
  ]);
  const rudderLine = new THREE.Line(
    rudderGeom,
    new THREE.LineBasicMaterial({
      color: VisualColorTokens.shipRudderLine,
      linewidth: 2,
      fog: false,
    }),
  );
  rudderLine.position.set(0, 0, SHIP_STERN_Z);
  group.add(rudderLine);

  const aimY = DECK_Y + 1.2;
  const aimLen = 10;
  const aimGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, aimY, 0),
    new THREE.Vector3(0, aimY, aimLen),
  ]);
  const aimColor = AIM_TURRET_GRAY;
  const aimOpacity = options.isLocal ? 0.95 : 0.88;
  const aimLine = new THREE.Line(
    aimGeom,
    new THREE.LineBasicMaterial({
      color: aimColor,
      transparent: true,
      opacity: aimOpacity,
      fog: false,
      depthTest: true,
    }),
  );
  aimLine.renderOrder = OVERLAY_RENDER_ORDER;
  const aimLineMat = aimLine.material as THREE.LineBasicMaterial;
  aimLineMat.depthTest = false;
  aimLineMat.depthWrite = false;
  // Rotate around the turret point (forward third), not ship center.
  aimLine.position.z = AIM_ORIGIN_LOCAL_Z;
  group.add(aimLine);

  const turretRingRadius = 2.4;
  const turretRingSeg = 20;
  const turretPts: THREE.Vector3[] = [];
  for (let i = 0; i < turretRingSeg; i++) {
    const a = (i / turretRingSeg) * Math.PI * 2;
    turretPts.push(
      new THREE.Vector3(
        Math.cos(a) * turretRingRadius,
        aimY,
        AIM_ORIGIN_LOCAL_Z + Math.sin(a) * turretRingRadius,
      ),
    );
  }
  const turretGeom = new THREE.BufferGeometry().setFromPoints(turretPts);
  const turretRing = new THREE.LineLoop(
    turretGeom,
    new THREE.LineBasicMaterial({
      color: AIM_TURRET_GRAY,
      transparent: true,
      opacity: options.isLocal ? 0.95 : 0.88,
      fog: false,
      depthTest: false,
      depthWrite: false,
    }),
  );
  turretRing.renderOrder = OVERLAY_RENDER_ORDER;
  group.add(turretRing);

  let weaponGuideGroup: THREE.Group | null = null;
  if (options.isLocal) {
    weaponGuideGroup = new THREE.Group();
    // Keep guide radius in world units even though ship mesh is class-scaled.
    const invHullScale = prof.hullScale > 1e-6 ? 1 / prof.hullScale : 1;
    weaponGuideGroup.scale.setScalar(invHullScale);
    const arcRadius = ARTILLERY_RANGE;
    const arcHalf = prof.artilleryArcHalfAngleRad;
    const segments = 32;
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const ang = -arcHalf + u * (2 * arcHalf);
      arcPts.push(new THREE.Vector3(Math.sin(ang) * arcRadius, aimY, Math.cos(ang) * arcRadius));
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arcMat = new THREE.LineBasicMaterial({
      color: VisualColorTokens.shipAimLocal,
      transparent: true,
      opacity: 0.32,
      fog: false,
      depthTest: false,
      depthWrite: false,
    });
    const arcLine = new THREE.Line(arcGeom, arcMat);
    arcLine.renderOrder = OVERLAY_RENDER_ORDER;
    weaponGuideGroup.add(arcLine);
    const edgePts = (
      a: number,
    ): [THREE.Vector3, THREE.Vector3] => [
      new THREE.Vector3(0, aimY, 0),
      new THREE.Vector3(Math.sin(a) * arcRadius, aimY, Math.cos(a) * arcRadius),
    ];
    for (const a of [-arcHalf, arcHalf]) {
      const g = new THREE.BufferGeometry().setFromPoints(edgePts(a));
      const edgeLine = new THREE.Line(g, arcMat);
      edgeLine.renderOrder = OVERLAY_RENDER_ORDER;
      weaponGuideGroup.add(edgeLine);
    }
    group.add(weaponGuideGroup);
  }

  return { group, aimLine, rudderLine, hull, weaponGuideGroup };
}

export function rudderRotationRad(rudderUnit: number): number {
  return (-rudderUnit * RUDDER_DEFLECTION_DEG * Math.PI) / 180;
}
