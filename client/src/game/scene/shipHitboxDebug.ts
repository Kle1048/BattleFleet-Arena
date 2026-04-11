import * as THREE from "three";
import type { ShipCollisionHitbox } from "@battlefleet/shared";

/**
 * Kanten-Geometrie der Hitbox in **Schiffskoordinaten** (+Y oben, +Z Bug, +X Steuerbord),
 * dieselben Einheiten wie Server/`collisionHitbox` im JSON.
 */
export function createShipHitboxWireframe(hit: ShipCollisionHitbox): THREE.LineSegments {
  const { center, halfExtents } = hit;
  const geom = new THREE.BoxGeometry(
    halfExtents.x * 2,
    halfExtents.y * 2,
    halfExtents.z * 2,
  );
  const edges = new THREE.EdgesGeometry(geom);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: 0x44ffaa,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
    }),
  );
  line.position.set(center.x, center.y, center.z);
  line.name = "shipHitboxDebug";
  geom.dispose();
  edges.dispose();
  return line;
}
