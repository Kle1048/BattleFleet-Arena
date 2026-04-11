import assert from "node:assert/strict";
import {
  accumulateShipRamDamage,
  hitboxFootprintAreaXZ,
  SHIP_RAM_MIN_REL_SPEED,
} from "./shipRamDamage";
import type { ShipCollisionHitbox } from "./shipVisualLayout";
import { createShipState } from "./shipMovement";

const box: ShipCollisionHitbox = {
  center: { x: 0, y: 0, z: 0 },
  halfExtents: { x: 2, y: 1, z: 3 },
};

assert.equal(hitboxFootprintAreaXZ(box), 4 * 6);

{
  const a = createShipState(0, 0);
  a.headingRad = 0;
  a.speed = 20;
  const b = createShipState(0, 0);
  b.headingRad = 0;
  b.speed = -20;
  const r = accumulateShipRamDamage(
    [
      { ship: a, hitbox: box, sessionId: "a" },
      { ship: b, hitbox: box, sessionId: "b" },
    ],
    0.05,
  );
  const da = r.rawDamageBySessionId.get("a") ?? 0;
  const db = r.rawDamageBySessionId.get("b") ?? 0;
  assert.ok(da > 0 && db > 0, "Gegenläufig: Ram-RoHSchaden");
  assert.ok(Math.abs(da - db) < 1e-6, "gleiche Fläche → gleicher RoHTreffer");
}

{
  const a = createShipState(0, 0);
  a.headingRad = 0;
  a.speed = SHIP_RAM_MIN_REL_SPEED * 0.25;
  const b = createShipState(0, 0);
  b.headingRad = 0;
  b.speed = -SHIP_RAM_MIN_REL_SPEED * 0.25;
  const r = accumulateShipRamDamage(
    [
      { ship: a, hitbox: box, sessionId: "a" },
      { ship: b, hitbox: box, sessionId: "b" },
    ],
    0.05,
  );
  assert.equal(r.rawDamageBySessionId.get("a"), undefined, "unter Mindest-v_rel kein Schaden");
}

console.log("shipRamDamage tests ok");
