/** Scene-only demonstration; sectors and clamp are imported from the game. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { clampYawToMountSector, isYawWithinMountFireSector } from '../../shared/src/artillery';
import type { MountFireSector } from '../../shared/src/shipVisualLayout';

const out='assets/blender/f124/animation';
const source='shared/src/data/ships/destroyer.json';
const game=JSON.parse(fs.readFileSync(source,'utf8'));
const profile=JSON.parse(fs.readFileSync('assets/blender/f124/f124.profile.json','utf8'));
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const rad=(d:number)=>d*Math.PI/180;
const mounts=[['main_fwd','main_fwd'],['ram_fwd','ciws_fwd'],['ram_aft','sam_aft']].map(([id,gameSlot])=>{
  const slot=profile.mountSlots.find((s:any)=>s.id===id);
  const sector=game.mountSlots.find((s:any)=>s.id===gameSlot).fireSector as MountFireSector;
  assert(sector.kind==='symmetric','Demo rig requires one continuous symmetric sector');
  return {id,gameSlot,sector,position:slot.socket.position,
    center:sector.centerYawRadFromBow??0,half:sector.halfAngleRadFromBow,
    pitchMin:0,pitchMax:rad(id==='main_fwd'?75:80),slewRadPerSec:rad(55)};
});
const fps=24, duration=20, frames:any[]=[];
const state=new Map<string,number>();
const limitCounts=Object.fromEntries(mounts.map(m=>[m.id,0]));
for(let i=0;i<=fps*duration;i++) {
  const u=i/(fps*duration), time=i/fps;
  const aircraft={x:-65+130*u,y:55+8*Math.sin(Math.PI*u),z:-165+330*u};
  const velocity={x:130,y:8*Math.PI*Math.cos(Math.PI*u),z:330};
  const targets=mounts.map(m=>{
    const dx=aircraft.x-m.position.x,dz=aircraft.z-m.position.z;
    const raw=Math.atan2(dx,dz);
    const desired=wrap(clampYawToMountSector(raw,m.sector)-m.center);
    const old=state.get(m.id)??desired;
    // Do NOT shortest-path-wrap this delta: that would cross the forbidden wedge.
    const step=m.slewRadPerSec/fps;
    const local=Math.max(-m.half,Math.min(m.half,old+Math.max(-step,Math.min(step,desired-old))));
    state.set(m.id,local);
    const yaw=m.center+local;
    const height=m.position.y+(m.id==='main_fwd'?1.55:1.9);
    const pitch=Math.max(m.pitchMin,Math.min(m.pitchMax,Math.atan2(aircraft.y-height,Math.hypot(dx,dz))));
    assert(isYawWithinMountFireSector(yaw,m.sector));
    if(Math.abs(Math.abs(local)-m.half)<1e-6) limitCounts[m.id]++;
    return {id:m.id,yaw,pitch,rawYaw:raw,clamped:!isYawWithinMountFireSector(raw,m.sector)};
  });
  frames.push({frame:i+1,time,aircraft,aircraftYaw:Math.atan2(velocity.x,velocity.z),
    aircraftPitch:Math.atan2(velocity.y,Math.hypot(velocity.x,velocity.z)),radarYaw:time*Math.PI/3,targets});
}
assert(Object.values(limitCounts).every(n=>n>0),'Every mount must demonstrate its limit');
fs.mkdirSync(out,{recursive:true});
if(process.argv.includes('--verify')) {
  const actual=JSON.parse(fs.readFileSync(`${out}/evaluated-transforms.json`,'utf8'));
  for(const row of actual.samples) for(const m of mounts) {
    const a=row.mounts[m.id];
    assert(isYawWithinMountFireSector(a.yaw,m.sector),`${m.id} outside sector at ${row.frame}`);
    assert(a.pitch>=m.pitchMin-1e-5&&a.pitch<=m.pitchMax+1e-5);
    const f=Math.floor(row.frame)-1,t=row.frame-Math.floor(row.frame);
    const expected=frames[f].targets.find((x:any)=>x.id===m.id);
    const next=frames[Math.min(f+1,frames.length-1)].targets.find((x:any)=>x.id===m.id);
    assert(Math.abs(wrap(a.yaw-(expected.yaw*(1-t)+next.yaw*t)))<2e-5,'Rig orientation mismatch');
  }
  const report={passed:true,source,samples:actual.samples.length,gameClamp:'clampYawToMountSector',limitCounts,
    mounts:mounts.map(m=>({id:m.id,gameSlot:m.gameSlot,halfAngleDegrees:m.half*180/Math.PI})),
    note:'Pitch limits and slew speed are scene-only presentation settings, not game rules.'};
  fs.writeFileSync(`${out}/validation.json`,JSON.stringify(report,null,2));
  console.log(report);
} else {
  fs.writeFileSync(`${out}/animation-data.json`,JSON.stringify({source,fps,duration,mounts,frames,limitCounts},null,2));
  console.log({frames:frames.length,limitCounts});
}
