import * as THREE from "three";
import { ARTILLERY_ARC_HALF_ANGLE_RAD } from "@battlefleet/shared";
import { RUDDER_DEFLECTION_DEG, SHIP_BOW_Z, SHIP_STERN_Z } from "./createGameScene";

const DECK_Y = 1.2;

export type ShipVisual = {
  group: THREE.Group;
  aimLine: THREE.Line;
  rudderLine: THREE.Line;
};

/**
 * Ein Schiff für die Szene (eigene Gruppe, noch nicht scene.add).
 * **Peilung (Ziellinie):** immer sichtbar — Local orange (Maus, sofort), Remote cyan (State vom Server).
 * Dient als Debug-Vorbild für spätere **drehbare Geschütztürme** (jeder Spieler eigene Aim-Achse).
 */
export function createShipVisual(options: { isLocal: boolean }): ShipVisual {
  const group = new THREE.Group();
  const hullColor = options.isLocal ? 0x6a7a8e : 0x8a909e;

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
  const hull = new THREE.Mesh(
    hullGeom,
    new THREE.MeshStandardMaterial({
      color: hullColor,
      metalness: 0.12,
      roughness: 0.72,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
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

  if (options.isLocal) {
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
    group.add(new THREE.Line(arcGeom, arcMat));
    const edgePts = (
      a: number,
    ): [THREE.Vector3, THREE.Vector3] => [
      new THREE.Vector3(0, aimY, 0),
      new THREE.Vector3(Math.sin(a) * arcRadius, aimY, Math.cos(a) * arcRadius),
    ];
    for (const a of [-ARTILLERY_ARC_HALF_ANGLE_RAD, ARTILLERY_ARC_HALF_ANGLE_RAD]) {
      const g = new THREE.BufferGeometry().setFromPoints(edgePts(a));
      group.add(new THREE.Line(g, arcMat));
    }
  }

  return { group, aimLine, rudderLine };
}

export function rudderRotationRad(rudderUnit: number): number {
  return (-rudderUnit * RUDDER_DEFLECTION_DEG * Math.PI) / 180;
}
