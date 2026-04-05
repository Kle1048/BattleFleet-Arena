import assert from "node:assert/strict";
import {
  PLAYER_DISPLAY_NAME_MAX_LEN,
  sanitizePlayerDisplayName,
} from "./displayName";

assert.equal(sanitizePlayerDisplayName(""), "Spieler");
assert.equal(sanitizePlayerDisplayName("   "), "Spieler");
assert.equal(sanitizePlayerDisplayName("  Anna  "), "Anna");
assert.equal(sanitizePlayerDisplayName("a\n\tb"), "a b");
const long = "x".repeat(PLAYER_DISPLAY_NAME_MAX_LEN + 8);
assert.equal(sanitizePlayerDisplayName(long).length, PLAYER_DISPLAY_NAME_MAX_LEN);

console.log("displayName tests ok");
