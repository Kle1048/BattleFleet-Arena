import assert from "node:assert/strict";
import { circleIntersectsShipHitboxFootprintXZ, minDistSqPointToShipHitboxFootprintXZ } from "./shipHitboxCollision";

const box: import("./shipVisualLayout").ShipCollisionHitbox = {
  center: { x: 0, y: 0, z: 0 },
  halfExtents: { x: 2, y: 1, z: 9 },
};

// Ohne Hitbox = Punktabstand
const d0 = minDistSqPointToShipHitboxFootprintXZ(10, 0, 0, 0, 0, undefined);
assert.equal(d0, 100);

// heading 0: Bug +Z — Punkt auf Bug-Mittellinie vorn
assert.ok(
  circleIntersectsShipHitboxFootprintXZ(0, 8.5, 1, 0, 0, 0, box),
  "splash trifft Bug-Seite der Box",
);

// Neben der Box (Steuerbord)
assert.ok(
  !circleIntersectsShipHitboxFootprintXZ(5, 0, 1, 0, 0, 0, box),
  "splash neben der Box trifft nicht",
);

// 90° gedreht: Bug zeigt nach +X
const h = Math.PI / 2;
assert.ok(circleIntersectsShipHitboxFootprintXZ(8.5, 0, 1, 0, 0, h, box));

console.log("shipHitboxCollision tests ok");
