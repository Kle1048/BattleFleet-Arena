import assert from "node:assert/strict";
import { controlGuideHtml } from "./controlGuide";

const desktop = controlGuideHtml();
assert.match(desktop, /W \/ S/);
assert.match(desktop, /Caps Lock/);
assert.match(desktop, /Mouse wheel/);
assert.match(desktop, /200 m/);
const mobile = controlGuideHtml(false, true);
for (const label of ["Assign Fire Control Channel", "Break FC", "Fire Gun", "Fire port SSM", "Fire Stbd SSM", "Throttle lever", "RADAR"]) {
  assert.ok(mobile.includes(label), `Mobile help must name the visible control: ${label}`);
}
for (const key of ["W / S", "Caps Lock", "Mouse wheel", "LMB", "Space"]) {
  assert.ok(!mobile.includes(key), `Mobile help must not require desktop input: ${key}`);
}
console.log("Device-specific control guide checks passed");
