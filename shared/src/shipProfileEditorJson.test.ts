import assert from "node:assert/strict";
import {
  ShipProfileJsonParseError,
  parseDefaultLoadoutJson,
  parseFixedSeaSkimmerLaunchersJson,
  parseMountSlotsJson,
} from "./shipProfileEditorJson";

{
  assert.deepEqual(parseMountSlotsJson(""), []);
  assert.deepEqual(parseMountSlotsJson("   "), []);
}

{
  const j =
    '[{"id":"a","socket":{"position":{"x":0,"y":0,"z":0}},"compatibleKinds":["artillery"]}]';
  const out = parseMountSlotsJson(j);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.id, "a");
}

assert.throws(() => parseMountSlotsJson("{}"), ShipProfileJsonParseError);

assert.throws(() => parseFixedSeaSkimmerLaunchersJson("null"), ShipProfileJsonParseError);

assert.deepEqual(parseDefaultLoadoutJson('{"m1":{"weaponId":"ciws","modelId":"spruance_phalanx"}}'),
  { m1: { weaponId: "ciws", modelId: "spruance_phalanx" } });
for (const invalid of ['{"m1":"ciws"}', '{"m1":{"weaponId":"unknown","modelId":"spruance_phalanx"}}',
  '{"m1":{"weaponId":"ciws","modelId":"spruance"}}', '{"m1":{"weaponId":"ciws","modelId":"constructor"}}']) {
  assert.throws(() => parseDefaultLoadoutJson(invalid), ShipProfileJsonParseError);
}

assert.throws(() => parseDefaultLoadoutJson("[]"), ShipProfileJsonParseError);

console.log("shipProfileEditorJson tests ok");
