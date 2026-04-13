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

assert.deepEqual(parseDefaultLoadoutJson('{"m1":"ciws"}'), { m1: "ciws" });

assert.throws(() => parseDefaultLoadoutJson("[]"), ShipProfileJsonParseError);

console.log("shipProfileEditorJson tests ok");
