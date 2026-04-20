import assert from "node:assert/strict";
import { accumulateWreckRamDamage } from "./shipRamDamage";
import { createShipState } from "./shipMovement";
import type { ShipCollisionHitbox } from "./shipVisualLayout";

const box: ShipCollisionHitbox = {
  center: { x: 0, y: 0, z: 0 },
  halfExtents: { x: 5, y: 0, z: 5 },
};

const emptyWrecks = { length: 0, at: () => undefined };
const d = accumulateWreckRamDamage(
  [{ ship: createShipState(0, 0), hitbox: box, sessionId: "a" }],
  emptyWrecks,
  () => box,
  0.05,
);
assert.equal(d.size, 0);

console.log("shipRamDamage tests ok");
