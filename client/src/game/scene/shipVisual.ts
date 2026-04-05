import * as THREE from "three";
import { ARTILLERY_ARC_HALF_ANGLE_RAD, PlayerLifeState } from "@battlefleet/shared";
import { RUDDER_DEFLECTION_DEG, SHIP_BOW_Z, SHIP_STERN_Z } from "./createGameScene";

const DECK_Y = 1.2;

const LOCAL_HULL_ALIVE = 0x6a7a8e;
const REMOTE_HULL_ALIVE = 0x8a909e;

export type ShipVisual = {
  group: THREE.Group;
  aimLine: THREE.Line;
  rudderLine: THREE.Line;
  hull: THREE.Mesh;
  /** Nur lokaler Spieler: Feuerbogen — bei Zerstörung ausgeblendet. */
  weaponGuideGroup: THREE.Group | null;
};

function hullAliveMaterial(isLocal: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: isLocal ? LOCAL_HULL_ALIVE : REMOTE_HULL_ALIVE,
    metalness: 0.12,
    roughness: 0.72,
    side: THREE.DoubleSide,
    fog: false,
  });
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
    hullMat.color.setHex(0x2c2830);
    hullMat.metalness = 0.04;
    hullMat.roughness = 0.92;
    hullMat.transparent = true;
    hullMat.opacity = 0.4;
    hullMat.emissive.setHex(0x2a1018);
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
    hullMat.color.setHex(isLocal ? 0x4a7a88 : 0x5a8898);
    hullMat.metalness = 0.18;
    hullMat.roughness = 0.55;
    hullMat.transparent = false;
    hullMat.opacity = 1;
    hullMat.depthWrite = true;
    hullMat.emissive.setHex(0x00a090);
    hullMat.emissiveIntensity = 0.55;

    aimMat.transparent = true;
    aimMat.color.setHex(isLocal ? 0xffcc66 : 0x66eeff);
    aimMat.opacity = isLocal ? 1 : 0.92;

    rudderMat.transparent = false;
    rudderMat.opacity = 1;

    if (vis.weaponGuideGroup) {
      vis.weaponGuideGroup.visible = true;
      vis.weaponGuideGroup.traverse((o) => {
        const l = o as THREE.Line;
        const m = l.material as THREE.LineBasicMaterial | undefined;
        if (m) {
          m.color.setHex(0x66ffd0);
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
        m.color.setHex(0xff9900);
        m.opacity = 0.32;
      }
    });
  }

  hullMat.color.setHex(isLocal ? LOCAL_HULL_ALIVE : REMOTE_HULL_ALIVE);
  hullMat.metalness = 0.12;
  hullMat.roughness = 0.72;
  hullMat.emissive.setHex(0x000000);
  hullMat.emissiveIntensity = 0;
  hullMat.transparent = false;
  hullMat.opacity = 1;
  hullMat.depthWrite = true;

  const aimColor = isLocal ? 0xff9900 : 0x33ddff;
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
export function createShipVisual(options: { isLocal: boolean }): ShipVisual {
  const group = new THREE.Group();

  const halfBeam = 15;
  const hullGeom = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0,
    DECK_Y,
    SHIP_BOW_Z,
    -halfBeam,
    DECK_Y,
    SHIP_STERN_Z,
    halfBeam,
    DECK_Y,
    SHIP_STERN_Z,
  ]);
  hullGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  hullGeom.computeVertexNormals();
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
    new THREE.LineBasicMaterial({ color: 0xe02030, linewidth: 2, fog: false }),
  );
  rudderLine.position.set(0, 0, SHIP_STERN_Z);
  group.add(rudderLine);

  const aimY = DECK_Y + 1.2;
  const aimLen = 130;
  const aimGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, aimY, 0),
    new THREE.Vector3(0, aimY, aimLen),
  ]);
  const aimColor = options.isLocal ? 0xff9900 : 0x33ddff;
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
  group.add(aimLine);

  let weaponGuideGroup: THREE.Group | null = null;
  if (options.isLocal) {
    weaponGuideGroup = new THREE.Group();
    const arcRadius = 145;
    const segments = 32;
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const ang =
        -ARTILLERY_ARC_HALF_ANGLE_RAD + u * (2 * ARTILLERY_ARC_HALF_ANGLE_RAD);
      arcPts.push(new THREE.Vector3(Math.sin(ang) * arcRadius, aimY, Math.cos(ang) * arcRadius));
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arcMat = new THREE.LineBasicMaterial({
      color: 0xff9900,
      transparent: true,
      opacity: 0.32,
      fog: false,
      depthTest: true,
    });
    weaponGuideGroup.add(new THREE.Line(arcGeom, arcMat));
    const edgePts = (
      a: number,
    ): [THREE.Vector3, THREE.Vector3] => [
      new THREE.Vector3(0, aimY, 0),
      new THREE.Vector3(Math.sin(a) * arcRadius, aimY, Math.cos(a) * arcRadius),
    ];
    for (const a of [-ARTILLERY_ARC_HALF_ANGLE_RAD, ARTILLERY_ARC_HALF_ANGLE_RAD]) {
      const g = new THREE.BufferGeometry().setFromPoints(edgePts(a));
      weaponGuideGroup.add(new THREE.Line(g, arcMat));
    }
    group.add(weaponGuideGroup);
  }

  return { group, aimLine, rudderLine, hull, weaponGuideGroup };
}

export function rudderRotationRad(rudderUnit: number): number {
  return (-rudderUnit * RUDDER_DEFLECTION_DEG * Math.PI) / 180;
}
