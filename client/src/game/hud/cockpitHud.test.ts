import assert from "node:assert/strict";
import { createCockpitHud, type CockpitHudUpdate } from "./cockpitHud";

// Instrument the HUD-owned DOM surface without a browser/third-party DOM dependency.
let writes = 0;
let creates = 0;
const nodes = new Map<string, FakeElement>();
class FakeElement {
  private text = "";
  private html = "";
  className = "";
  children: FakeElement[] = [];
  replacements = 0;
  style = { setProperty() { writes++; } };
  classList = { toggle() { writes++; } };
  get textContent() { return this.text; }
  set textContent(value: string) { this.text = value; writes++; }
  get innerHTML() { return this.html; }
  set innerHTML(value: string) { this.html = value; writes++; }
  setAttribute() { writes++; }
  addEventListener() {}
  removeEventListener() {}
  remove() { writes++; }
  appendChild(child: FakeElement) { this.children.push(child); writes++; }
  replaceChildren() { this.children = []; this.replacements++; writes++; }
  querySelector(selector: string) {
    if (!nodes.has(selector)) nodes.set(selector, new FakeElement());
    return nodes.get(selector)!;
  }
}
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { configurable: true, value: {
  body: new FakeElement(),
  createElement() { creates++; return new FakeElement(); },
  createElementNS() { creates++; return new FakeElement(); },
} });
try {
  const hud = createCockpitHud();
  const root = (document.body as unknown as FakeElement).children[0]!;
  assert(root.innerHTML.includes('2000m'), "HMI labels the actual 2000m contact display radius");
  const model: CockpitHudUpdate = {
    speed: 0, maxSpeed: 100, headingRad: 0, worldX: 0, worldZ: 0, mainMountTrainRad: 0,
    aswmMagPortCap: 2, aswmMagStarboardCap: 2, aswmRemainingPort: 2, aswmRemainingStarboard: 2,
    hp: 100, maxHp: 100, primaryCooldownSec: 0, secondaryCooldownSec: 0, torpedoCooldownSec: 0,
    mineCount: 0, mineMaxCount: 0, respawnCountdownSec: 0, spawnProtectionSec: 0,
    matchRemainingSec: 300, score: 0, kills: 0, rankLabelEn: "Rank", xpLine: "0/10",
    shipClassLabel: "FAC", playerDisplayName: "Tester", shipClassId: "fac",
    radarBlips: [], radarVisible: true, ownRadarActive: true, esmLines: [], radarThreatLines: [], ssmRailLines: [],
  };
  hud.update(model);
  const initialWrites = writes;
  const initialCreates = creates;
  for (let i = 0; i < 120; i++) hud.update(model);
  assert.equal(writes, initialWrites, "unchanged HUD must not mutate DOM");
  assert.equal(creates, initialCreates, "unchanged magazines must not recreate nodes");
  const port = nodes.get(".cockpit-aswm-dots-port")!;
  const starboard = nodes.get(".cockpit-aswm-dots-starboard")!;
  model.aswmRemainingPort = 1;
  hud.update(model);
  assert.equal(port.replacements, 2); assert.equal(starboard.replacements, 1);
  model.radarBlips = [{ nx: 0.2, ny: 0.3 }];
  hud.update(model);
  const blips = nodes.get(".cockpit-radar-blips")!;
  assert.equal(blips.children.length, 1);
  model.radarBlips[0]!.designated = true; hud.update(model);
  assert.equal(blips.children.length, 2, "designation adds a frame even when the contact has not moved");
  const framedWrites = writes; hud.update(model);
  assert.equal(writes, framedWrites, "unchanged designation does not rebuild DOM");
  model.radarBlips[0]!.designated = false; hud.update(model);
  assert.equal(blips.children.length, 1, "clearing removes the frame but retains the contact");
  model.radarVisible = false; hud.update(model);
  assert.equal(blips.children.length, 0);
  const hiddenWrites = writes; hud.update(model); assert.equal(writes, hiddenWrites);
  model.radarVisible = true; hud.update(model); assert.equal(blips.children.length, 1);
  model.playerDisplayName = "<img src=x onerror=alert(1)>"; hud.update(model);
  assert.equal(nodes.get(".cockpit-player-name")!.textContent, model.playerDisplayName);
  assert.equal(nodes.get(".cockpit-player-name")!.innerHTML, "");
  assert(!root.innerHTML.includes("cockpit-weapon-map"));
  assert(!root.innerHTML.includes("cockpit-fc-status"));
  assert(root.innerHTML.includes("cockpit-weapons-block"));
  model.gunStatus = { autofire: true, inRange: true, inArc: false };
  model.airDefense = [{ system: "PDMS", status: "Cooldown" }];
  hud.update(model);
  assert.equal(nodes.get(".tac-auto")!.textContent, "AUTO ON");
  assert.equal(nodes.get(".tac-range")!.textContent, "RANGE YES");
  assert.equal(nodes.get(".tac-arc")!.textContent, "ARC NO");
  assert.equal(nodes.get(".tac-pdms-state")!.textContent, "Cooldown");
  assert.equal(nodes.get(".tac-ciws-state")!.textContent, "");
  const statusWrites = writes; hud.update(model);
  assert.equal(writes, statusWrites, "unchanged weapon status performs no DOM writes");
  model.gunStatus = { autofire: false, inRange: null, inArc: null };
  model.airDefense = [{ system: "PDMS", status: "Active" }];
  hud.update(model);
  assert.equal(nodes.get(".tac-range")!.textContent, "RANGE —");
  assert.equal(nodes.get(".tac-arc")!.textContent, "ARC —");
  assert.equal(nodes.get(".tac-pdms-state")!.textContent, "Active");
  hud.dispose();
  const disposedWrites = writes;
  hud.dispose(); hud.update(model);
  assert.equal(writes, disposedWrites, "a released HUD cannot write into detached DOM");
} finally {
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else Reflect.deleteProperty(globalThis, "document");
}
console.log("cockpit unchanged-DOM and magazine/radar regressions ok");
