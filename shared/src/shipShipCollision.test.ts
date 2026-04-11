import assert from "node:assert/strict";
import {
  hitboxWorldCenterXZ,
  resolveShipShipCollisions,
  satOBB2DOverlapMTV,
} from "./shipShipCollision";
import type { ShipCollisionHitbox } from "./shipVisualLayout";
import { createShipState } from "./shipMovement";

const box5: ShipCollisionHitbox = {
  center: { x: 0, y: 0, z: 0 },
  halfExtents: { x: 5, y: 0, z: 5 },
};

// Hitbox-Mittelpunkt: gleiche Formel wie Punkt↔Hitbox (shipHitboxCollision)
const wc = hitboxWorldCenterXZ(100, 200, 0, box5);
assert.equal(wc.x, 100);
assert.equal(wc.z, 200);

// Getrennte OBBs → kein Overlap
const sep = satOBB2DOverlapMTV(
  { x: 0, z: 0 },
  5,
  5,
  0,
  { x: 30, z: 0 },
  5,
  5,
  0,
);
assert.equal(sep, null);

// Überlappende kongruente Boxen gleicher Orientierung
const ov = satOBB2DOverlapMTV(
  { x: 0, z: 0 },
  5,
  5,
  0,
  { x: 2, z: 0 },
  5,
  5,
  0,
);
assert.ok(ov && ov.depth > 0);

// Zwei Schiffe: gleiche Hitbox, zu nah → nach Auflösung größerer Abstand der Schiffspositionen
const a = createShipState(0, 0);
const b = createShipState(3, 0);
const distBefore = Math.hypot(b.x - a.x, b.z - a.z);
resolveShipShipCollisions([
  { ship: a, hitbox: box5 },
  { ship: b, hitbox: box5 },
]);
const distAfter = Math.hypot(b.x - a.x, b.z - a.z);
assert.ok(distAfter > distBefore + 0.5, "Schiffe werden auseinandergeschoben");

console.log("shipShipCollision tests ok");
