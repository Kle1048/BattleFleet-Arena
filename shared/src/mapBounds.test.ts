import {
  MAP_WORLD_HALF_EXTENT,
  OPERATIONAL_AREA_HALF_EXTENT_MAX,
  OPERATIONAL_AREA_HALF_EXTENT_MIN,
  operationalHalfExtentFromParticipantCount,
} from "./mapBounds";

{
  const a = operationalHalfExtentFromParticipantCount(1);
  const b = operationalHalfExtentFromParticipantCount(16);
  if (a !== OPERATIONAL_AREA_HALF_EXTENT_MIN) {
    throw new Error(`expected min AO for 1 player, got ${a}`);
  }
  if (b !== OPERATIONAL_AREA_HALF_EXTENT_MAX) {
    throw new Error(`expected max AO for 16 players, got ${b}`);
  }
  if (b <= a) throw new Error("AO max must exceed AO min");
}

{
  const mid = operationalHalfExtentFromParticipantCount(8);
  if (mid <= OPERATIONAL_AREA_HALF_EXTENT_MIN || mid >= OPERATIONAL_AREA_HALF_EXTENT_MAX) {
    throw new Error(`expected mid AO between min and max, got ${mid}`);
  }
}

{
  if (OPERATIONAL_AREA_HALF_EXTENT_MAX > MAP_WORLD_HALF_EXTENT) {
    throw new Error("OPERATIONAL_AREA_HALF_EXTENT_MAX must fit inside MAP_WORLD_HALF_EXTENT");
  }
}

console.log("mapBounds tests ok");
