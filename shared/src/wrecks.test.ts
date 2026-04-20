import assert from "node:assert";
import { wreckVariantFromSessionId } from "./wrecks";

assert.equal(wreckVariantFromSessionId("a"), wreckVariantFromSessionId("a"));
assert.ok([0, 1, 2, 3].includes(wreckVariantFromSessionId("xyz")));

console.log("wrecks tests ok");
