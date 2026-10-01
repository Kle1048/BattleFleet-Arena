import assert from "node:assert/strict";
import { canIdentifyShip, radarDetectionRange, visualDetectionRange, shipHasDamageSmoke, esmDetectionRange } from "./sensors";
import { observeWorld } from "./bot/perceptionSystem";
import type { BotVisiblePlayer } from "./bot/types";
const self: BotVisiblePlayer = {id:"self",x:0,z:0,hp:100,maxHp:100,headingRad:0,speed:0,
  radarActive:false,shipClass:"fac",lifeState:"alive",primaryCooldownSec:0,secondaryCooldownSec:0,
  torpedoCooldownSec:0,adHudIncomingAswm:0};
for(const [shipClass,factor] of [["fac",1],["destroyer",4/3],["cruiser",5/3]] as const) {
  assert.equal(radarDetectionRange(shipClass),1200*factor);
  assert.equal(esmDetectionRange(shipClass),shipClass === "fac" ? 1600 : shipClass === "destroyer" ? 2000 : 2400);
  for(const hp of [100,90,89,29]) {
    const range=hp<90?800:600*factor;
    assert.equal(visualDetectionRange(shipClass,hp,100),range);
    for(const radarActive of [false,true]) {
      const me={...self,radarActive};
      const detectionRange=radarActive?1200*factor:range;
      const target={...self,id:"enemy",shipClass,hp,z:detectionRange};
      assert(canIdentifyShip(me,target));
      assert(!canIdentifyShip(me,{...target,z:detectionRange+0.01}));
      const seen=observeWorld(100,[me,target],me.id,[],[],2000)!;
      assert.equal(seen.enemies.length,1);
      assert.equal(seen.enemies[0]!.hp,hp,"visual contact carries identified target information");
      assert.equal(seen.esmBearings!.length,0,"silent ship emits no ESM bearing");
      const absent=observeWorld(100,[me,{...target,z:detectionRange+0.01}],me.id,[],[],2000)!;
      assert.equal(absent.enemies.length,0);
      const dead=observeWorld(100,[me,{...target,lifeState:"awaiting_respawn"}],me.id,[],[],2000)!;
      assert.equal(dead.enemies.length,0);
    }
  }
}
assert(!shipHasDamageSmoke(90,100));
assert(shipHasDamageSmoke(89,100));
assert(!shipHasDamageSmoke(0,100));
assert(!shipHasDamageSmoke(NaN,100));
assert(!shipHasDamageSmoke(1,0));
console.log("Visual, smoke and target-size radar boundaries; silent identification; no dead contacts passed");
