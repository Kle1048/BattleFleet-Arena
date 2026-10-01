/** Five-minute, paired-side runtime duels. No Python, no changes to live models. */
import {readFileSync, statSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {LearnedPolicyStrategy} from '@battlefleet/shared/rules';
import {TrainingArena} from '../server/src/training/TrainingArena.js';

const manifestPath = process.argv[2], output = process.argv[3];
const episodes = Number(process.argv[4] ?? 8), seed = Number(process.argv[5] ?? 8100000);
if (!manifestPath || !output || !Number.isInteger(episodes) || episodes < 1 || episodes > 100 || !Number.isInteger(seed) || seed < 0 || seed + episodes > 0xffffffff)
  throw new Error('Usage: tournament.mts manifest.json output.json [pairedSeeds 1..100] [seed]');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
const entries = Object.entries(manifest);
if (entries.length < 2 || entries.length > 8 || entries.some(([key,path]) => !/^[a-z0-9-]+$/.test(key) || typeof path !== 'string')) throw new Error('Invalid manifest');
const loaded = entries.map(([name,path]) => {
  const absolute = resolve(path);
  if (statSync(absolute).size > 2_000_000) throw new Error('Policy exceeds 2 MB');
  const raw = readFileSync(absolute);
  const artifact = JSON.parse(raw.toString('utf8'));
  const strategy = new LearnedPolicyStrategy(artifact);
  if (strategy.profile === 'standard') throw new Error('Tournament requires personality profiles with full-round respawns');
  return {name, path:absolute, sha256:createHash('sha256').update(raw).digest('hex'), artifact, strategy};
});
const rows: Record<string, unknown>[] = [];
const totals = Object.fromEntries(loaded.map(m=>[m.name,{games:0,observedGames:0,wins:0,draws:0,score:0,opponentScore:0,deaths:0,kills:0,aliveSeconds:0,zoneSeconds:0,radarSeconds:0,gunShots:0,missileShots:0}]));
for (let i=0;i<loaded.length;i++) for(let j=i+1;j<loaded.length;j++) {
  for(let k=0;k<episodes;k++) for(const [self,opponent] of [[loaded[i]!,loaded[j]!],[loaded[j]!,loaded[i]!]]) {
    const arena = new TrainingArena(self.strategy,self.strategy.profile,opponent.strategy,300);
    try {
      arena.reset(seed+k);
      for(let step=0;step<7000;step++) {
        const result=arena.step(0);
        if(result.terminated || result.truncated) {
          const info=result.info;
          rows.push({self:self.name,opponent:opponent.name,seed:seed+k,...info});
          const t=totals[self.name]!; t.games++; t.observedGames++; t.wins+=Number(info.outcome==='win'); t.draws+=Number(info.outcome==='draw');
          t.score+=info.selfScore; t.opponentScore+=info.opponentScore;
          const other=totals[opponent.name]!; other.games++; other.wins+=Number(info.outcome==='loss'); other.draws+=Number(info.outcome==='draw');
          other.score+=info.opponentScore; other.opponentScore+=info.selfScore;
          for(const key of ['deaths','kills','aliveSeconds','zoneSeconds','radarSeconds','gunShots','missileShots'] as const) t[key]+=info[key];
          break;
        }
        if(step===6999) throw new Error('Tournament episode did not finish');
      }
    } finally {arena.close();}
  }
  console.log(`Finished ${loaded[i]!.name} vs ${loaded[j]!.name}`);
}
const summary=Object.fromEntries(Object.entries(totals).map(([name,t])=>[name,{games:t.games,winRate:t.wins/t.games,draws:t.draws,
  meanScore:t.score/t.games,meanOpponentScore:t.opponentScore/t.games,observedGames:t.observedGames,meanDeaths:t.deaths/t.observedGames,meanKills:t.kills/t.observedGames,
  zoneFraction:t.zoneSeconds/Math.max(1,t.aliveSeconds),radarFraction:t.radarSeconds/Math.max(1,t.aliveSeconds),
  meanGunShots:t.gunShots/t.observedGames,meanMissileShots:t.missileShots/t.observedGames}]));
mkdirSync(dirname(resolve(output)),{recursive:true});
writeFileSync(output,JSON.stringify({episodeSeconds:300,pairedSeeds:episodes,seed,models:loaded.map(({name,path,sha256})=>({name,path,sha256})),summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
