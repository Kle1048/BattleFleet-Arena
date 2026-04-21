import assert from "node:assert/strict";
import {
  buildIslandPolygonsFromCircleSpecs,
  DEFAULT_MAP_ISLANDS,
  isCircleOverlappingAnyIslandPolygon,
  isInsideAnyIslandCircle,
  resolveShipIslandCollisions,
  resolveShipIslandPolygonCollisions,
  SHIP_ISLAND_COLLISION_RADIUS,
} from "./islands";
import {
  shipLocalDeltaToWorldXZ,
  worldDeltaToShipLocalXZ,
} from "./shipHitboxCollision";
import { createShipState } from "./shipMovement";
import type { ShipCollisionHitbox } from "./shipVisualLayout";

function distIslandCenterToHitboxFootprint(
  ship: { x: number; z: number; headingRad: number },
  hitbox: ShipCollisionHitbox,
  ix: number,
  iz: number,
): number {
  const ox = ix - ship.x;
  const oz = iz - ship.z;
  const { lx, lz } = worldDeltaToShipLocalXZ(ox, oz, ship.headingRad);
  const cx = hitbox.center.x;
  const cz = hitbox.center.z;
  const hx = Math.max(0, hitbox.halfExtents.x);
  const hz = Math.max(0, hitbox.halfExtents.z);
  const qx = Math.max(cx - hx, Math.min(cx + hx, lx));
  const qz = Math.max(cz - hz, Math.min(cz + hz, lz));
  const { ox: wx, oz: wz } = shipLocalDeltaToWorldXZ(qx, qz, ship.headingRad);
  const px = ship.x + wx;
  const pz = ship.z + wz;
  return Math.hypot(ix - px, iz - pz);
}

{
  const specs = [{ id: "t", x: 0, z: 0, radius: 100 }];
  const polys = buildIslandPolygonsFromCircleSpecs(specs);
  assert.equal(isCircleOverlappingAnyIslandPolygon(0, 0, 0, polys), true);
  assert.equal(isCircleOverlappingAnyIslandPolygon(150, 0, 0, polys), false);
  assert.equal(isCircleOverlappingAnyIslandPolygon(135, 0, 0, polys), false);
  assert.equal(isCircleOverlappingAnyIslandPolygon(99, 0, 0, polys), true);
  assert.equal(isCircleOverlappingAnyIslandPolygon(108, 0, 10, polys), true);
}

{
  const i1 = DEFAULT_MAP_ISLANDS[0]!;
  assert.ok(i1, "fixture island");
  assert.equal(
    isInsideAnyIslandCircle(i1.x, i1.z, DEFAULT_MAP_ISLANDS, 14),
    true,
    "center of island i1",
  );
  assert.equal(
    isInsideAnyIslandCircle(i1.x + i1.radius * 2.2 + 40, i1.z, DEFAULT_MAP_ISLANDS, 14),
    false,
    "well outside i1 (Polygon-Ufer + Splash-Radius)",
  );
}

{
  const box: ShipCollisionHitbox = {
    center: { x: 0, y: 0, z: 0 },
    halfExtents: { x: 5, y: 0, z: 5 },
  };
  const islandSpec = { id: "t", x: 8, z: 0, radius: 10 };
  const polys = buildIslandPolygonsFromCircleSpecs([islandSpec]);
  const ship = createShipState(0, 0);
  resolveShipIslandPolygonCollisions(ship, polys, box);
  const d = distIslandCenterToHitboxFootprint(ship, box, islandSpec.x, islandSpec.z);
  assert.ok(d >= islandSpec.radius - 0.05, "Hitbox: nach Auflösung liegt OBB nicht mehr im Inselkreis");
}

{
  const ship = createShipState(0, 0);
  const islandSpec = { id: "t", x: 5, z: 0, radius: 10 };
  const polys = buildIslandPolygonsFromCircleSpecs([islandSpec]);
  resolveShipIslandPolygonCollisions(ship, polys, undefined, SHIP_ISLAND_COLLISION_RADIUS);
  const dist = Math.hypot(ship.x - islandSpec.x, ship.z - islandSpec.z);
  assert.ok(dist >= islandSpec.radius + SHIP_ISLAND_COLLISION_RADIUS - 0.05, "Legacy: Kreis um Bug");
}

console.log("islands tests ok");
