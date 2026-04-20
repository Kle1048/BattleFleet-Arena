import assert from "node:assert/strict";
import { clientXToRudder, clientYToThrottle } from "./machineryTelegraphLevers";

{
  const top = 100;
  const height = 100;
  assert.ok(Math.abs(clientYToThrottle(top, top, height) - 1) < 1e-6);
  assert.ok(Math.abs(clientYToThrottle(top + height, top, height) - (-1)) < 1e-6);
  assert.ok(Math.abs(clientYToThrottle(top + height / 2, top, height)) < 1e-6);
}

{
  const left = 50;
  const width = 80;
  assert.ok(Math.abs(clientXToRudder(left, left, width) - (-1)) < 1e-6);
  assert.ok(Math.abs(clientXToRudder(left + width, left, width) - 1) < 1e-6);
  assert.ok(Math.abs(clientXToRudder(left + width / 2, left, width)) < 1e-6);
}

{
  assert.equal(clientYToThrottle(0, 10, 0), 0);
  assert.equal(clientXToRudder(0, 20, 0), 0);
}

console.log("machineryTelegraphLevers tests ok");
