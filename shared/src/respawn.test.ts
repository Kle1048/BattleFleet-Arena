import assert from "node:assert/strict";
import { AREA_OF_OPERATIONS_HALF_EXTENT } from "./mapBounds";
import { DEFAULT_MAP_ISLANDS } from "./islands";
import { MIN_RESPAWN_SEPARATION } from "./playerLife";
import {
  RESPAWN_AO_EDGE_INSET,
  RESPAWN_RIM_THICKNESS,
  pickRimSpawnDeterministic,
  tryPickRespawnPosition,
} from "./respawn";
import { isInSeaControlZone } from "./seaControl";

const outerR = AREA_OF_OPERATIONS_HALF_EXTENT - RESPAWN_AO_EDGE_INSET;
const innerR = Math.max(outerR - RESPAWN_RIM_THICKNESS, 0);

function assertRimAndNoSeaControl(x: number, z: number): void {
  assert.equal(isInSeaControlZone(x, z), false);
  const d = Math.hypot(x, z);
  assert.ok(d >= innerR - 0.5 && d <= outerR + 0.5, `expected rim distance, got d=${d}`);
}

for (let i = 0; i < 400; i++) {
  const rng = () => {
    const a = (i * 7919 + 17) % 10000;
    return a / 10000;
  };
  const p = tryPickRespawnPosition(
    AREA_OF_OPERATIONS_HALF_EXTENT,
    DEFAULT_MAP_ISLANDS,
    [],
    MIN_RESPAWN_SEPARATION,
    rng,
  );
  if (p) assertRimAndNoSeaControl(p.x, p.z);
}

for (let s = 0; s < 80; s++) {
  const p = pickRimSpawnDeterministic(
    AREA_OF_OPERATIONS_HALF_EXTENT,
    DEFAULT_MAP_ISLANDS,
    [],
    MIN_RESPAWN_SEPARATION,
    s * 0.913,
  );
  assertRimAndNoSeaControl(p.x, p.z);
}

const crowded: { x: number; z: number }[] = [
  { x: outerR * 0.99, z: 0 },
  { x: -outerR * 0.99, z: 0 },
];
const away = pickRimSpawnDeterministic(
  AREA_OF_OPERATIONS_HALF_EXTENT,
  DEFAULT_MAP_ISLANDS,
  crowded,
  MIN_RESPAWN_SEPARATION,
  1.7,
);
assertRimAndNoSeaControl(away.x, away.z);
let minSq = Infinity;
for (const o of crowded) {
  const dx = away.x - o.x;
  const dz = away.z - o.z;
  minSq = Math.min(minSq, dx * dx + dz * dz);
}
assert.ok(
  minSq >= MIN_RESPAWN_SEPARATION * MIN_RESPAWN_SEPARATION * 0.99,
  "deterministic spawn should respect separation when possible",
);
