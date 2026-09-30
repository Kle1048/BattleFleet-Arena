import { createGameScene } from "../game/scene/createGameScene";
import { createGameRenderer } from "../game/runtime/rendererLifecycle";
import { createArtilleryFx } from "../game/effects/artilleryFx";
import { createMissileFx } from "../game/effects/missileFx";
import type { FxSystem } from "../game/effects/fxSystem";
import { installReflectionCameraLayerMask } from "../game/runtime/renderOverlayLayers";
import { warmupWeaponRendering } from "../game/runtime/warmupWeaponRendering";

async function start() {
const renderer = createGameRenderer(document.querySelector<HTMLElement>("#app")!);
renderer.setSize(1280,720); renderer.setPixelRatio(1);
const bundle = await createGameScene();
bundle.camera.aspect=1280/720; bundle.camera.updateProjectionMatrix();
bundle.camera.position.set(60,65,100); bundle.camera.lookAt(0,0,0);
const reflection=installReflectionCameraLayerMask(renderer,bundle.camera);
const silentFx={spawnArtilleryMuzzle(){},spawnArtilleryImpact(){},spawnMissileTrailStreamTick(){},spawnMissileLaunchSmoke(){}} as unknown as FxSystem;
const artillery=createArtilleryFx(bundle.scene,silentFx), missiles=createMissileFx(bundle.scene,silentFx);
const gl=renderer.getContext(), compile=gl.compileShader.bind(gl), link=gl.linkProgram.bind(gl);
let compiles=0,links=0;
gl.compileShader=(shader)=>{compiles++;compile(shader);};
gl.linkProgram=(program)=>{links++;link(program);};
const run=document.querySelector<HTMLButtonElement>("#run")!;
const status=document.querySelector<HTMLElement>("#status")!;
const results=document.querySelector<HTMLElement>("#results")!;
renderer.render(bundle.scene,bundle.camera);
run.onclick=async()=>{
  run.disabled=true; results.textContent="";
  warmupWeaponRendering(renderer,bundle.scene,bundle.camera,[artillery.createWarmupMesh(),missiles.createWarmupMesh()]);
  const samples:unknown[]=[];
  let previous=performance.now();
  for(let frame=0;frame<12*90;frame++){
    const now=await new Promise<number>(resolve=>requestAnimationFrame(resolve));
    const phase=frame%90, shot=Math.floor(frame/90), kind=shot<6?"artillery":"missile";
    const beforeCompile=compiles,beforeLink=links,start=performance.now();
    if(phase===10){
      if(kind==="artillery") artillery.onFired({shellId:shot,ownerId:"test",fromX:0,fromY:10,fromZ:0,toX:0,toZ:40,flightMs:300});
      else missiles.sync([{missileId:shot,x:0,z:0,headingRad:0}]);
    }
    if(phase===35){
      if(kind==="artillery") artillery.onImpact({shellId:shot,x:0,z:40},{skipSplash:true});
      else missiles.sync([]);
    }
    artillery.update(now); missiles.update(now,now-previous);
    const updateMs=performance.now()-start,renderStart=performance.now();
    renderer.render(bundle.scene,bundle.camera);
    if(phase===10||phase===11||phase===35){samples.push({shot,kind,phase,intervalMs:now-previous,updateMs,renderMs:performance.now()-renderStart,compiles:compiles-beforeCompile,links:links-beforeLink,programs:renderer.info.programs?.length,geometries:renderer.info.memory.geometries});}
    previous=now;
    if(phase===89)status.textContent=`${shot+1}/12 launches — particles/audio disabled`;
  }
  results.textContent=JSON.stringify(samples,null,2);status.textContent="Complete";run.disabled=false;
};
window.addEventListener("beforeunload",()=>{artillery.dispose();missiles.dispose();reflection.dispose();bundle.dispose();renderer.dispose();});
}
void start().catch(error => { document.querySelector<HTMLElement>("#status")!.textContent = String(error); console.error(error); });
