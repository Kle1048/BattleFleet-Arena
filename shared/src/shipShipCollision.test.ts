import assert from "node:assert/strict";
import {
  hitboxWorldCenterXZ,
  resolveShipAndWreckObbOverlaps,
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

// Wrack: beide Massen gleich → Schiff und Anker verschieben sich, keine Überlappung mehr
const ship = createShipState(2, 0);
const wreck = { anchorX: 0, anchorZ: 0, headingRad: 0, shipClass: "fac" };
const wreckList = { length: 1, at: (i: number) => (i === 0 ? wreck : undefined) };
resolveShipAndWreckObbOverlaps(ship, box5, wreckList, () => box5);
const stillOverlap = satOBB2DOverlapMTV(
  hitboxWorldCenterXZ(ship.x, ship.z, ship.headingRad, box5),
  5,
  5,
  ship.headingRad,
  hitboxWorldCenterXZ(wreck.anchorX, wreck.anchorZ, wreck.headingRad, box5),
  5,
  5,
  wreck.headingRad,
);
assert.equal(stillOverlap, null);

console.log("shipShipCollision tests ok");
