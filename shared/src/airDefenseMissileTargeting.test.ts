import assert from "node:assert/strict";
import { PlayerLifeState } from "./playerLife";
import {
  pickThreatMissilePositionForDefender,
  resolveAirDefenseDefenderIdForMissile,
} from "./airDefenseMissileTargeting";

{
  const players = [
    {
      id: "a",
      x: 0,
      z: 0,
      headingRad: 0,
      lifeState: PlayerLifeState.Alive,
      shipClass: "fac",
    },
    {
      id: "b",
      x: 500,
      z: 0,
      headingRad: 0,
      lifeState: PlayerLifeState.Alive,
      shipClass: "fac",
    },
  ];
  const m = { ownerId: "a", targetId: "b", x: 100, z: 0 };
  assert.equal(resolveAirDefenseDefenderIdForMissile(m, players), "b");
  const pos = pickThreatMissilePositionForDefender([m], "b", players);
  assert.ok(pos);
  assert.equal(pos!.x, 100);
  assert.equal(pos!.z, 0);
}

console.log("airDefenseMissileTargeting tests ok");
