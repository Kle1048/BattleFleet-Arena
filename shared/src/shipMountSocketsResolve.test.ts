import assert from "node:assert/strict";
import { resolveMountSlotsWithSocketRegistry } from "./shipVisualLayout";

const reg = {
  a: { position: { x: 1, y: 2, z: 3 } },
};

const out = resolveMountSlotsWithSocketRegistry("test", [{ id: "a", compatibleKinds: ["artillery"] }], reg);
assert.equal(out[0].socket.position.z, 3);

const out2 = resolveMountSlotsWithSocketRegistry(
  "test",
  [
    {
      id: "a",
      compatibleKinds: ["artillery"],
      socket: { position: { x: 0, y: 0, z: 9 } },
    },
  ],
  { a: { position: { x: 1, y: 1, z: 1 } } },
);
assert.equal(out2[0].socket.position.z, 9, "Profil-Socket schlägt Registry");

assert.throws(
  () => resolveMountSlotsWithSocketRegistry("test", [{ id: "x", compatibleKinds: ["artillery"] }], {}),
  /kein socket/,
);

console.log("shipMountSocketsResolve tests ok");
