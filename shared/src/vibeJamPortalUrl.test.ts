import assert from "node:assert/strict";
import { sanitizePortalReturnRef } from "./vibeJamPortalUrl";

assert.equal(sanitizePortalReturnRef(""), null);
assert.equal(sanitizePortalReturnRef("http://evil.com"), null);
assert.equal(sanitizePortalReturnRef("javascript:alert(1)"), null);
assert.ok(sanitizePortalReturnRef("https://example.com/game"));
assert.ok(sanitizePortalReturnRef("https://fly.pieter.com/path?x=1"));

console.log("vibeJamPortalUrl tests ok");
