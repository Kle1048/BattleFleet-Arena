/** Matched five-minute FFA tests: one evaluated model versus three frozen opponents. */
import {readFileSync,statSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {LearnedPolicyStrategy} from '@battlefleet/shared/rules';
import {TrainingArena} from '../server/src/training/TrainingArena.js';

const [manifestPath,rosterPath,output]=process.argv.slice(2);
const episodes=Number(process.argv[5]??20),seed=Number(process.argv[6]??10100000);
if(!manifestPath||!rosterPath||!output||!Number.isInteger(episodes)||episodes<1||episodes>100||!Number.isInteger(seed)||seed<0||seed+episodes>0xffffffff)
  throw new Error('Usage: ffa-evaluate.mts models.json opponents.json output.json [episodes 1..100] [seed]');
function json(path:string,limit:number):unknown {
  if(statSync(path).size>limit) throw new Error(`File exceeds ${limit} bytes`);
  return JSON.parse(readFileSync(path,'utf8'));
}
function load(path:string) {
  const artifact=json(path,2_000_000);
  return {path:resolve(path),sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),strategy:new LearnedPolicyStrategy(artifact)};
}
const paths=json(rosterPath,16_000);
if(!Array.isArray(paths)||paths.length!==3||paths.some(p=>typeof p!=='string'||!p)) throw new Error('Exactly three frozen policy paths required');
const opponents=paths.map(p=>load(resolve(dirname(rosterPath),p)));
const manifest=json(manifestPath,16_000);
if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)) throw new Error('Invalid model manifest');
const entries=Object.entries(manifest);
if(entries.length<1||entries.length>8||entries.some(([name,path])=>!/^[a-z0-9-]+$/.test(name)||typeof path!=='string')) throw new Error('Invalid models');
const reports:Record<string,unknown>={};
for(const [name,path] of entries) {
  const model=load(resolve(String(path)));
  const arena=new TrainingArena(model.strategy,model.strategy.profile,undefined,undefined,opponents.map(p=>p.strategy));
  const rows=[];
  try {
    for(let episode=0;episode<episodes;episode++) {
      arena.reset(seed+episode);
      let completed=false;
      for(let step=0;step<7000;step++) {
        const result=arena.step(0);
        if(result.terminated||result.truncated) {rows.push({seed:seed+episode,...result.info});completed=true;break;}
      }
      if(!completed) throw new Error('FFA round did not finish');
    }
  } finally {arena.close();}
  const mean=(key:'rank'|'selfScore'|'deaths'|'kills')=>rows.reduce((sum,row)=>sum+row[key]!,0)/rows.length;
  const alive=rows.reduce((sum,row)=>sum+row.aliveSeconds,0);
  const summary={episodes:rows.length,winRate:rows.filter(r=>r.outcome==='win').length/rows.length,
    meanRank:mean('rank'),meanScore:mean('selfScore'),meanDeaths:mean('deaths'),meanKills:mean('kills'),
    zoneFraction:rows.reduce((s,r)=>s+r.zoneSeconds,0)/Math.max(1,alive),
    radarFraction:rows.reduce((s,r)=>s+r.radarSeconds,0)/Math.max(1,alive)};
  reports[name]={path:model.path,sha256:model.sha256,summary,rows};
  console.log(name,JSON.stringify(summary));
}
mkdirSync(dirname(resolve(output)),{recursive:true});
writeFileSync(output,JSON.stringify({mode:'ffa4',teams:false,episodeSeconds:300,seed,episodes,
  opponents:opponents.map(({path,sha256})=>({path,sha256})),reports},null,2)+'\n');
