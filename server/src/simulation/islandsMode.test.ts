import assert from "node:assert/strict";
import { DEFAULT_MAP_ISLAND_POLYGONS } from "@battlefleet/shared/rules";
import type { GameEventMap, GameEventSink } from "@battlefleet/shared/protocol";
import { GameSimulation } from "./GameSimulation.js";
import { testSettings } from "./testSettings.js";
import { configCodec } from "../persistence/jsonConfigRepository.js";
import { defaultConfig } from "../application/configValues.js";

const verts = DEFAULT_MAP_ISLAND_POLYGONS[0]!.verts;
const x = verts.reduce((sum, v) => sum + v.x, 0) / verts.length;
const z = verts.reduce((sum, v) => sum + v.z, 0) / verts.length;
for (const enabled of [true, false]) {
  let configured = enabled;
  let now = 10000;
  const impacts: GameEventMap["artyImpact"][] = [];
  const salvos: GameEventMap["artyFired"][] = [];
  const contacts: string[] = [];
  const events: GameEventSink = {
    broadcast(type, payload) {
      if (type === "artyImpact") impacts.push(payload as GameEventMap["artyImpact"]);
      if (type === "artyFired") salvos.push(payload as GameEventMap["artyFired"]);
    },
    send(_id, type) { if (type === "collisionContact") contacts.push(type); },
  };
  const game = new GameSimulation({ nowMs: () => now, random: () => 0.5 },
    { ...testSettings, getIslandsEnabled: () => configured }, events, () => 1, () => now, () => {}, () => "islands-test");
  try {
    game.start(); game.join("ship", "Test");
    const p = game.findPlayer("ship")!, row = game.participants.simulations.get("ship")!;
    const place = (px: number, pz: number) => {
      Object.assign(row.ship, { x: px, z: pz, headingRad: 0, speed: 0, throttle: 0 });
      Object.assign(p, { x: px, z: pz, headingRad: 0 });
    };
    place(x, z);
    const hp = p.hp;
    game.step(0);
    assert.equal(contacts.length, enabled ? 1 : 0);
    assert.equal(p.hp < hp, enabled, "disabled islands cannot scrape hulls");
    assert.equal(row.ship.x === x && row.ship.z === z, !enabled, "disabled islands cannot displace ships");

    place(x, z - 120);
    game.applyInput("ship", { throttle: 0, rudderInput: 0, primaryFire: true, aimX: x, aimZ: z });
    assert.equal(salvos.length, 1);
    place(-1800, -1800);
    game.state.missileList.push({ missileId: 999, ownerId: "ship", targetId: "", x, z, headingRad: 0 });
    now += salvos[0]!.flightMs + 1;
    game.step(0);
    assert.equal(game.state.missileList.length, enabled ? 0 : 1, "missiles cross disabled terrain");
    assert.equal(impacts[0]?.kind, enabled ? "island" : "water", "shell effects follow the actual map");

    configured = !enabled;
    game.step(0);
    assert.equal(game.state.islandsEnabled, enabled, "config does not change terrain mid-round");
    game.reset(now, true);
    assert.equal(game.state.islandsEnabled, !enabled, "round restart adopts map setting before respawn");
    assert.equal(game.state.missileList.length, 0);
    contacts.length = 0;
    place(x, z); game.step(0);
    assert.equal(contacts.length, enabled ? 0 : 1, "systems read the new round's terrain");
  } finally { game.dispose(); }
}

const defaults = defaultConfig();
assert.equal(defaults.islandsEnabled, false, "new installations start without islands");
const oldV1 = { ...defaults } as Partial<typeof defaults>;
delete oldV1.islandsEnabled;
const codec = configCodec(defaults);
assert.equal(codec.decode({ version: 1, revision: 4, config: oldV1 }).value.config.islandsEnabled, false);
assert.equal(codec.decode({ version: 1, revision: 5, config: { ...defaults, islandsEnabled: false } }).value.config.islandsEnabled, false);
assert.equal(codec.decode({ version: 1, revision: 6, config: { ...defaults, islandsEnabled: true } }).value.config.islandsEnabled, true,
  "explicit admin opt-in remains available");
assert.throws(() => codec.decode({ version: 1, revision: 5, config: { ...defaults, islandsEnabled: "false" } }));
console.log("island mode: hull collisions/damage, missiles, shell impacts, round boundaries and old config migration");
