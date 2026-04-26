import assert from "node:assert/strict";
import { effectiveSfxGain, extendDuckUntil, MASTER_SFX_MULT, SFX_DUCK_MULT } from "./sfxMix";

assert.ok(Math.abs(effectiveSfxGain(1, 100, 0) - MASTER_SFX_MULT) < 1e-9);
assert.ok(Math.abs(effectiveSfxGain(1, 100, 200) - MASTER_SFX_MULT * SFX_DUCK_MULT) < 1e-9);

assert.equal(extendDuckUntil(1000, 0, 50), 1050);
assert.equal(extendDuckUntil(1000, 1200, 50), 1200);

console.log("sfxMix tests ok");
