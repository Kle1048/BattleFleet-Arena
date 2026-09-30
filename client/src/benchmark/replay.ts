import type * as THREE from "three";
import type { ShipClassId } from "@battlefleet/shared/rules";
import { createArtilleryFx } from "../game/effects/artilleryFx";
import { createFxSystem } from "../game/effects/fxSystem";
import { createMissileFx } from "../game/effects/missileFx";
import { createTorpedoFx } from "../game/effects/torpedoFx";
import { createShipRenderer } from "../game/renderers/ships/shipRenderer";
import type { ShipVisual } from "../game/scene/shipVisual";
import { createShipWakeRibbonSystem } from "../game/scene/shipWakeRibbon";
import { advanceIfPoseChanged, createInterpolationBuffer } from "../game/network/remoteInterpolation";
import { createFrameRuntimeState, runFrameRuntimeStep } from "../game/runtime/frameRuntime";
import { createCameraCullRuntimeState } from "../game/runtime/cameraCullRuntime";
import { getAirDefenseMuzzleSeekCoords, getPrimaryArtilleryMuzzleSeekCoords } from "../game/scene/shipMountVisuals";
import { createCombatFixture, FIXTURE_STEP_MS, FIXTURE_SEED, seededRandom } from "./fixture";
import { withFixtureClock } from "./fixtureClock";
import { pruneVisualRollSmoothed } from "../game/scene/shipVisualRoll";

type FrameOptions = Parameters<typeof runFrameRuntimeStep>[0];
const realNow = performance.now.bind(performance);

/** Production frame/FX implementations driven by deterministic, offline presentation data. */
export function createReplay(options: {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; cockpit: FrameOptions["cockpit"];
  getHullGltfTemplate(id: ShipClassId): THREE.Group | null;
  getMountGltfTemplate(id: string): THREE.Group | null;
}) {
  const random = seededRandom(FIXTURE_SEED);
  const fixture = createCombatFixture();
  const ships = createShipRenderer(options.scene, "fixture-0", options);
  let replayNow = 0;
  const pool = createFxSystem(options.scene, { camera: options.camera, random: seededRandom(FIXTURE_SEED), now: () => replayNow });
  const artillery = createArtilleryFx(options.scene, pool);
  const missiles = createMissileFx(options.scene, pool);
  let seenMissileIds = new Set<number>();
  const torpedoes = createTorpedoFx(options.scene, pool);
  const wakes = createShipWakeRibbonSystem(options.scene);
  withFixtureClock(0, random, () => ships.sync(fixture.players));
  const visuals = ships.getVisuals() as Map<string, ShipVisual>;
  artillery.setMuzzleSeekResolver((id, slotId) => getPrimaryArtilleryMuzzleSeekCoords(visuals.get(id), slotId));
  const remoteInterp = new Map(fixture.players.slice(1).map(p => [p.id, createInterpolationBuffer(p, 0)]));
  let fxCpuMs = 0;
  let inputs = 0, hudUpdates = 0, deaths = 0;
  let disposed = false;
  const measureFx = (operation: () => void): void => {
    const start = realNow(); operation(); fxCpuMs += realNow() - start;
  };
  const runtime: FrameOptions = {
    now: 0, dtMs: FIXTURE_STEP_MS, camera: options.camera, mySessionId: "fixture-0", cfgMaxSpeed: 100,
    playerList: fixture.players, visuals, remoteInterp, roomSendInput: () => { inputs++; },
    inputSample: { throttle: 0.6, rudderInput: 0.25, aimWorldX: 200, aimWorldZ: 200,
      primaryFire: true, secondaryFire: false, torpedoFire: false, radarActive: true },
    matchEnded: false, matchRemainingSecRaw: 180,
    cockpit: { update(model) { hudUpdates++; options.cockpit.update(model); } },
    gameMessageHud: { showToast() {}, updateFrame() {} },
    // Deliberately silent: autoplay/user-gesture state must not affect a CPU/GPU replay.
    gameAudio: { warning() {}, levelUp() {}, telegraphNotchClick() {}, updateEngineBed() {},
      updateEngineBedOff() {}, updateDynamicMusic() {} },
    shortSessionIdForMessage: id => id, playerDisplayLabel: p => p.id,
    fx: {
      artilleryFx: { update: (now, dt) => measureFx(() => artillery.update(now, dt)) },
      missileFx: { sync: data => measureFx(() => {
        for (const m of data ?? []) if (!seenMissileIds.has(m.missileId)) missiles.onFired({
          missileId: m.missileId, ownerId: "fixture", launcherId: "fixture", fromX: m.x, fromY: 3.3, fromZ: m.z, headingRad: m.headingRad,
        });
        missiles.sync(data); seenMissileIds = new Set(Array.from(data ?? [], m => m.missileId));
      }), update: (now, dt) => measureFx(() => missiles.update(now, dt)) },
      torpedoFx: { sync: data => measureFx(() => torpedoes.sync(data)), update: (now, dt) => measureFx(() => torpedoes.update(now, dt)) },
      shipDamageSmokeTick: (x, z, heading, severity) => measureFx(() => pool.spawnShipDamageSmokeTick(x, z, heading, severity)),
    },
    missileList: fixture.missiles, torpedoList: [],
    state: createFrameRuntimeState(), cameraCullState: createCameraCullRuntimeState(),
    onShipDestroyed(p) { deaths++; measureFx(() => pool.spawnShipDestroyedExplosion(p.x, p.z)); },
  };

  function artilleryEvent(frame: number, impact: boolean): void {
    const launchFrame = impact ? frame - 36 : frame;
    if (launchFrame < 0 || launchFrame % 12 !== 0) return;
    for (let index = 0; index < 4; index++) {
      const shellId = launchFrame * 4 + index;
      const toX = Math.sin(shellId) * 250, toZ = Math.cos(shellId) * 250;
      if (impact) artillery.onImpact({ shellId, x: toX, z: toZ, kind: index % 2 ? "water" : "hit" });
      else {
        const owner = fixture.players[index * 3]!;
        artillery.onFired({ shellId, ownerId: owner.id, fromX: owner.x, fromZ: owner.z, toX, toZ, flightMs: 600 });
      }
    }
  }

  return {
    step(frame: number) {
      if (disposed) throw new Error("replay disposed");
      const now = frame * FIXTURE_STEP_MS;
      replayNow = now;
      fxCpuMs = 0;
      let runtimeCpuMs = 0;
      withFixtureClock(now, random, () => {
        fixture.step(frame);
        if (frame % 3 === 0) for (const player of fixture.players) {
          if (player.id === "fixture-0") continue;
          advanceIfPoseChanged(remoteInterp.get(player.id)!, player, now);
        }
        measureFx(() => {
          artilleryEvent(frame, false); artilleryEvent(frame, true);
          if (frame % 90 === 0) pool.spawnMissileImpact(80, 60, "hit");
          if (frame % 180 === 0) pool.spawnSoftkillChaffCloud(0, 0, 0);
          // Exercise the actual launch-smoke recipe without the legacy AD rAF scheduler.
          if (frame % 120 === 0) {
            const muzzle = getAirDefenseMuzzleSeekCoords(visuals.get("fixture-0"), "ciws_aft", "pd");
            pool.spawnMissileLaunchSmoke(muzzle?.x ?? 0, muzzle?.z ?? 0, Math.PI * 0.25);
          }
        });
        runtime.now = now; runtime.matchRemainingSecRaw = 180 - Math.floor(frame / 60);
        const start = realNow();
        runFrameRuntimeStep(runtime);
        runtimeCpuMs = realNow() - start;
        // The existing visual factory may read the user's hitbox flag once. This fixed
        // scene keeps that overlay hidden without writing the user's localStorage value.
        if (frame === 0) for (const visual of visuals.values()) {
          if (visual.hitboxLogicalGroup) visual.hitboxLogicalGroup.visible = false;
        }
        wakes.updateFromPlayers({ players: fixture.players, visuals,
          lodAnchorWorld: { x: fixture.players[0]!.x, z: fixture.players[0]!.z }, nowSeconds: now / 1000 });
        measureFx(() => pool.update(FIXTURE_STEP_MS));
      });
      return { runtimeCpuMs, fxCpuMs, ...pool.getStats() };
    },
    counts: () => ({ inputs, hudUpdates, deaths }),
    dispose() {
      if (disposed) return;
      disposed = true;
      artillery.dispose(); missiles.dispose(); torpedoes.dispose(); pool.dispose(); wakes.dispose(); ships.dispose();
      pruneVisualRollSmoothed(new Set());
    },
  };
}
