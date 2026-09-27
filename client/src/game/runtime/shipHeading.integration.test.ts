import assert from "node:assert/strict";
import * as THREE from "three";
import { PlayerState, PlayerLifeState, createShipState, stepMovement, DESTROYER_LIKE_MVP } from "@battlefleet/shared";
import { createShipRenderer } from "../renderers/ships/shipRenderer";
import { createShipWakeRibbonSystem } from "../scene/shipWakeRibbon";
import { updateFrameWorld } from "./frameWorld";
import { advanceIfPoseChanged, createInterpolationBuffer } from "../network/remoteInterpolation";

// Exercise the real async replacement AND following frame, rather than assigning
// a known-good matrix directly as the model metadata contract tests do.
for (const local of [true, false]) {
  for (const shipClass of ["fac", "destroyer", "cruiser"]) {
    for (const heading of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, -3 * Math.PI / 4]) {
      const label = `${local ? "local" : "remote"} ${shipClass} heading=${heading}`;
      const scene = new THREE.Scene();
      let finishLoad!: () => void;
      let ready = false;
      const renderer = createShipRenderer(scene, local ? "ship" : "observer", {
        getHullGltfTemplate: () => ready ? new THREE.Group() : null,
        loadShipAssets: () => new Promise<void>((resolve) => { finishLoad = resolve; }),
      });
      const wake = createShipWakeRibbonSystem(scene);
      const player = new PlayerState();
      Object.assign(player, { id: "ship", shipClass, headingRad: heading, speed: 20,
        hp: 100, maxHp: 100, lifeState: PlayerLifeState.Alive });
      const playersById = new Map([[player.id, player]]);
      const remoteInterp = new Map([[player.id, createInterpolationBuffer(player, 0)]]);
      const state = { aimLineSectorDebug: "", lastDamageSmokeAtBySessionId: new Map<string, number>() };
      let now = 0;
      function frame() {
        advanceIfPoseChanged(remoteInterp.get(player.id)!, player, now);
        const visuals = new Map(renderer.getVisuals());
        updateFrameWorld({ now: now + 100, dtMs: 16, camera: new THREE.PerspectiveCamera(),
          mySessionId: local ? player.id : "observer", playersById, me: local ? player : undefined,
          visuals, remoteInterp, inputSample: { throttle: 0, rudderInput: 0,
            aimWorldX: 100, aimWorldZ: 100, primaryFire: false, secondaryFire: false,
            torpedoFire: false, radarActive: false },
          adMissileSnapsScratch: [], adPlayerSnapshots: [], state,
          fx: { shipDamageSmokeTick() {} }, onLocalVisual() {},
        });
        wake.updateFromPlayers({ players: [player], visuals, nowSeconds: now / 1000 });
        now += 200;
      }
      function forward() {
        const vis = renderer.getVisuals().get(player.id)!;
        vis.group.updateMatrixWorld(true);
        return new THREE.Vector3(0, 0, 1).transformDirection(vis.modelMotion.matrixWorld);
      }
      const expected = new THREE.Vector3(-Math.sin(heading), 0, Math.cos(heading));
      try {
        renderer.ensureShip(player.id, shipClass);
        frame();
        assert.ok(forward().distanceTo(expected) < 1e-10, `placeholder: ${label}`);
        ready = true;
        finishLoad();
        await Promise.resolve();
        assert.ok(renderer.getVisuals().get(player.id)!.hullModel);
        assert.ok(forward().distanceTo(expected) < 1e-10, `immediately after load: ${label}`);
        frame();
        assert.ok(forward().distanceTo(expected) < 1e-10, `next frame after load: ${label}`);

        // A restored quaternion may legitimately use another Euler decomposition.
        // The frame must recover a pure logical yaw, irrespective of that history.
        const loaded = renderer.getVisuals().get(player.id)!;
        loaded.group.quaternion.copy(loaded.group.quaternion.clone());
        loaded.modelMotion.rotation.set(0.2, 0.4, 2, "YXZ");
        frame();
        assert.ok(forward().distanceTo(expected) < 1e-10, `full pose reset: ${label}`);

        const movement = { ...createShipState(), headingRad: heading, speed: 20, throttle: 1 };
        for (let i = 0; i < 3; i++) {
          stepMovement(movement, DESTROYER_LIKE_MVP, 0.2);
          Object.assign(player, movement);
          frame();
        }
        const ribbon = scene.getObjectByName("shipWakeRibbon_ship") as THREE.Mesh<THREE.BufferGeometry>;
        const positions = ribbon.geometry.getAttribute("position");
        const last = ribbon.geometry.drawRange.count / 6;
        function center(index: number) {
          return new THREE.Vector3().fromBufferAttribute(positions, index * 2)
            .add(new THREE.Vector3().fromBufferAttribute(positions, index * 2 + 1)).multiplyScalar(0.5);
        }
        const travel = center(last).sub(center(last - 1)).normalize();
        assert.ok(forward().dot(travel) > 0.999999, `hull follows wake/travel: ${label}`);
      } finally {
        wake.dispose();
        renderer.dispose();
      }
    }
  }
}
console.log("ship heading survives async loading and follows travel/wake for local and remote ships");
