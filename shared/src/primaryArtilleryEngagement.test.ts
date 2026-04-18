import assert from "node:assert/strict";
import { ARTILLERY_MAX_RANGE } from "./artillery";
import { canPrimaryArtilleryEngageAimAtWorldPoint } from "./primaryArtilleryEngagement";
import { SHIP_CLASS_DESTROYER } from "./shipClass";

/** Bug nach +Z, Ziel voraus in Reichweite */
assert.equal(
  canPrimaryArtilleryEngageAimAtWorldPoint(0, 0, 0, SHIP_CLASS_DESTROYER, 0, 200),
  true,
  "in Sektor und innerhalb max range",
);

/** Gleiche Richtung, aber über ARTILLERY_MAX_RANGE — Salvo würde klemmen, HUD soll „nicht in Reichweite“ */
assert.equal(
  canPrimaryArtilleryEngageAimAtWorldPoint(0, 0, 0, SHIP_CLASS_DESTROYER, 0, ARTILLERY_MAX_RANGE + 80),
  false,
  "Zielpunkt außerhalb nominaler Reichweite",
);

console.log("primaryArtilleryEngagement tests ok");
