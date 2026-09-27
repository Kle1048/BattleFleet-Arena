/** Still capture using production scene/renderer/ship factories. No replacement shaders. */
import * as THREE from 'three';
import { getAuthoritativeShipHullProfile, PlayerLifeState } from '@battlefleet/shared';
import { createGameScene } from '../game/scene/createGameScene';
import { createGameRenderer } from '../game/runtime/rendererLifecycle';
import { DEFAULT_ENVIRONMENT_TUNING } from '../game/runtime/environmentTuning';
import { createShipVisual, setShipVisualLifeState } from '../game/scene/shipVisual';
import { loadShipHullGltfSource, getShipHullGltfSourceForUrl } from '../game/scene/shipGltfHull';
import { resolveShipHullGltfUrl } from '../game/runtime/hullGltfUrls';
import { resolveMountGltfUrl } from '../game/runtime/mountGltfUrls';
import { updateGameWaterAnimations } from '../game/runtime/materialLibrary';

async function main() {
  const shipClassId=new URLSearchParams(location.search).get('ship')==='cruiser'?'cruiser':'destroyer';
  const slug=shipClassId==='cruiser'?'slava':'spruance';
  const label=shipClassId==='cruiser'?'Slava':'Spruance';
  document.title=label+' · Spielengine-Render';
  document.querySelector('header strong')!.textContent=label+' · BattleFleet Arena';
  (document.getElementById('output') as HTMLImageElement).alt=label+' im echten Spiel-Renderer';
  const root=document.getElementById('render-root')!;
  const renderer=createGameRenderer(root);
  renderer.setPixelRatio(1);renderer.setSize(1920,1080);
  const bundle=await createGameScene({environmentTuning:{...DEFAULT_ENVIRONMENT_TUNING,
    lightingPreset:'midday_clear',elevationDeg:38,azimuthDeg:45,waterSunColorHex:0xffffff}});
  const {scene,camera,water}=bundle;
  const profile=getAuthoritativeShipHullProfile(shipClassId)!;
  const hullUrl=resolveShipHullGltfUrl(profile.hullGltfId!);
  const models=[...new Set([...Object.values(profile.defaultLoadout??{}).map(e=>e.modelId),...(profile.fixedSeaSkimmerLaunchers??[]).flatMap(r=>r.equipment?[r.equipment.modelId]:[])])];
  await Promise.all([hullUrl,...models.map(resolveMountGltfUrl)].map(u=>loadShipHullGltfSource(u)));
  await bundle.assetsReady;
  const visual=createShipVisual({isLocal:false,profile,shipClassId,
    hullGltfSource:getShipHullGltfSourceForUrl(hullUrl),
    getMountGltfTemplate:id=>getShipHullGltfSourceForUrl(resolveMountGltfUrl(id))});
  if(!visual.hullModel || visual.rotatingMountTrains.length!==profile.mountSlots.length)throw new Error(label+' / weapon mounts incomplete');
  setShipVisualLifeState(visual,PlayerLifeState.Alive,false);
  for(const overlay of [visual.aimLine,visual.hitboxLogicalGroup,visual.weaponGuideGroup,visual.rangeRingsGroup])if(overlay)overlay.visible=false;
  scene.add(visual.group);visual.group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(visual.hullModel);
  const size=bounds.getSize(new THREE.Vector3());
  const target=new THREE.Vector3(0,size.y*.23,0);
  camera.up.set(0,1,0);camera.layers.set(0);camera.aspect=1920/1080;camera.fov=34;camera.updateProjectionMatrix();
  updateGameWaterAnimations(water,16000);
  function capture(side=false){
    const length=size.z;
    camera.position.copy(target).add(new THREE.Vector3(side?1.18:.93,side?.30:.43,side?.05:.80).multiplyScalar(length));
    camera.lookAt(target);camera.updateMatrixWorld(true);
    // Capture synchronously after drawing; no preserveDrawingBuffer override.
    renderer.render(scene,camera);
    const png=renderer.domElement.toDataURL('image/png');
    (document.getElementById('output') as HTMLImageElement).src=png;
    const link=document.getElementById('download') as HTMLAnchorElement;
    link.href=png;link.download=slug+(side?'-game-engine-side.png':'-game-engine.png');link.hidden=false;
    document.getElementById('status')!.textContent='Echter Spiel-Renderer · originale PBR-Materialien, Wasser und Tageslicht · freie Kamera · kein laufendes Match';
  }
  await renderer.compileAsync(scene,camera);
  capture();
  document.getElementById('hero')!.onclick=()=>capture();
  document.getElementById('side')!.onclick=()=>capture(true);
}
void main().catch(error=>{document.getElementById('status')!.textContent='Renderfehler: '+String(error);console.error(error);});
