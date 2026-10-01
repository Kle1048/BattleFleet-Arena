import assert from "node:assert/strict";
import { type BotDecisionStrategy, POLICY_FEATURES } from "@battlefleet/shared/rules";
import { TrainingArena } from "./TrainingArena.js";
import type { GameSimulation } from "../simulation/GameSimulation.js";

const calls = [0,0,0];
const profiles = ["aggressive", "objective", "cautious"] as const;
const opponents: BotDecisionStrategy[] = profiles.map((profile,i) => ({profile, decide: () => {calls[i]!++; return "ATTACK";}}));
assert.throws(() => new TrainingArena(undefined,"standard",undefined,undefined,opponents),/FFA requires/);
assert.throws(() => new TrainingArena(undefined,"cautious",undefined,undefined,opponents.slice(1)),/FFA requires/);
const a = new TrainingArena(undefined,"objective",undefined,undefined,opponents);
const b = new TrainingArena(undefined,"objective",undefined,undefined,opponents);
try {
  assert.equal(a.specification.episodeSeconds,300);
  assert.deepEqual(a.reset(1001),b.reset(1001));
  let done=false;
  for(let i=0;i<7000;i++) {
    const left=a.step(0),right=b.step(0);
    assert.deepEqual(left,right,"four independent brains reproduce the same battle");
    assert.equal(left.observation.length,POLICY_FEATURES.length);
    assert(left.observation.every(v=>Number.isFinite(v) && v>=-1 && v<=1));
    assert.equal(left.terminated,false,"death does not end a four-player round");
    assert.equal(left.info.participants!.length,4);
    assert.equal(new Set(left.info.participants!.map(p=>p.id)).size,4);
    if(left.truncated) {
      assert.equal(left.info.seconds,300);
      assert(left.info.deaths>0,"fixture exercises deaths and respawns");
      const others=left.info.participants!.filter(p=>p.id!=="learner");
      assert.equal(left.info.opponentScore,Math.max(...others.map(p=>p.score)));
      assert.equal(left.info.rank,1+others.filter(p=>p.score>left.info.selfScore).length);
      assert.equal(left.info.outcome,left.info.selfScore>left.info.opponentScore?'win':left.info.selfScore===left.info.opponentScore?'draw':'loss');
      done=true;break;
    }
  }
  assert(done);assert(calls.every(n=>n>100),"all three opponents make decisions");
  assert.deepEqual(a.reset(1001),b.reset(1001),"reset clears all four controllers");
} finally {a.close();b.close();}

// Isolate a combat tick: only a third party loses HP; learner must earn no damage reward.
const credit = new TrainingArena(undefined,"aggressive",undefined,undefined,opponents);
try {
  credit.reset(333);
  const game=(credit as unknown as {game:GameSimulation}).game;
  const learner=game.findPlayer("learner")!;
  learner.x=1000;learner.z=1000;
  game.step=()=>{game.findPlayer("opponent2")!.hp-=1;};
  const result=credit.step(0);
  assert(result.info.opponentNetHpLost>0);
  assert.equal(result.reward,0,"opponents damaging each other is not learner damage");
} finally {credit.close();}
console.log("FFA: four brains, seeded replay, full five-minute round, respawns, ranking and no borrowed damage credit passed");
