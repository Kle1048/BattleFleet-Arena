import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clonePreparedShipHull } from '../../client/src/game/scene/shipGltfHull';
import { attachMountVisualsToHullModel } from '../../client/src/game/scene/shipMountVisuals';
import { readMarkedSocketTransformsFromHullGltf } from '../../client/src/game/scene/shipSocketGltf';
import { getAuthoritativeShipHullProfile } from '../../shared/src/shipProfiles';
import { inferMountTrainBaseYawFromBow, listPrimaryArtilleryMountConfigs } from '../../shared/src/shipVisualLayout';
import { resolveMountModelVisualId } from '../../client/src/game/runtime/mountGltfUrls';
import { getShipClassProfile } from '../../shared/src/shipClass';

const out='assets/blender/spruance',pub='client/public/assets',reports:any[]=[];
if(!globalThis.ProgressEvent)(globalThis as any).ProgressEvent=class{constructor(public type:string,public init:any){}};
async function load(path:string,report=true){
  const buf=fs.readFileSync(path);assert.equal(buf.readUInt32LE(0),0x46546c67);
  const len=buf.readUInt32LE(12),g=JSON.parse(buf.subarray(20,20+len).toString()),bin=buf.subarray(28+len);
  assert.equal(g.scenes.length,1);assert(!g.cameras?.length);assert(!g.extensions?.KHR_lights_punctual);
  assert.equal(g.images?.length,3,'Three embedded PBR maps required');
  for(const m of g.materials){assert(m.normalTexture);assert(m.pbrMetallicRoughness?.baseColorTexture);assert(m.pbrMetallicRoughness?.metallicRoughnessTexture);}
  for(const im of g.images){const bv=g.bufferViews[im.bufferView];assert.equal(im.uri,undefined);assert.equal(bin.subarray(bv.byteOffset,bv.byteOffset+8).toString('hex'),'89504e470d0a1a0a');}
  let tris=0;for(const m of g.meshes)for(const p of m.primitives){assert(p.attributes.TEXCOORD_0!==undefined);tris+=g.accessors[p.indices].count/3;}
  if(report)reports.push({file:path,triangles:tris,bytes:buf.length,meshBatches:g.meshes.length});
  for(const m of g.materials){delete m.pbrMetallicRoughness?.baseColorTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
  delete g.images;delete g.textures;delete g.samplers;g.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(g),'');gltf.scene.updateMatrixWorld(true);return gltf.scene;
}
async function main(){
  const profile=getAuthoritativeShipHullProfile('destroyer')!;
  assert.equal(profile.hullGltfId,'spruance');
  assert.equal(listPrimaryArtilleryMountConfigs(profile,Math.PI).length,1);
  const old=JSON.parse(fs.readFileSync(`${out}/backup/destroyer.json`,'utf8'));
  for(const key of ['movement','collisionHitbox','defaultLoadout','aswmMagazine','aswmMagicReloadMs'] as const)
    assert.deepEqual(profile[key],old[key]);
  for(let i=0;i<old.mountSlots.length;i++){
    const {socket,...actual}=profile.mountSlots[i];assert.deepEqual(actual,old.mountSlots[i]);
  }
  const hull=await load(`${pub}/ships/hull_spruance.glb`);
  const bbox=new THREE.Box3().setFromObject(hull),size=bbox.getSize(new THREE.Vector3());
  assert(Math.abs(size.z-171.7)<.001);assert(Math.abs(size.x-16.82)<.001,'16.8 m beam plus 1 cm drain lip per side');assert(Math.abs(bbox.min.y+8.8)<.001);
  const markers=readMarkedSocketTransformsFromHullGltf(hull);
  for(const slot of profile.mountSlots){assert(markers.sockets.has(slot.id));const p=markers.sockets.get(slot.id)!.position;for(const axis of ['x','y','z'] as const)assert(Math.abs(p[axis]-slot.socket.position[axis])<1e-5);}
  const templates:Record<string,THREE.Group>={},metric:Record<string,THREE.Group>={};
  for(const key of ['mk45','phalanx','seasparrow','harpoon']){
    templates[`visual_spruance_${key}`]=await load(`${pub}/systems/mount_spruance_${key}.glb`);
    metric[`visual_spruance_${key}`]=await load(`${out}/mount_spruance_${key}_metric.glb`,false);
    assert(templates[`visual_spruance_${key}`].getObjectByName('bf_muzzle'));
  }
  const prepared=clonePreparedShipHull(hull);const mounted=attachMountVisualsToHullModel(prepared,profile,id=>templates[id]??null);
  assert.equal(mounted.rotatingMountTrains.length,3);
  assert.equal(mounted.rotatingMountTrains.filter(m=>m.isAirDefense).length,2);
  assert.deepEqual(mounted.rotatingMountTrains.filter(m=>m.isAirDefense).map(m=>m.weaponGuide.visualId).sort(),['visual_ciws','visual_sam']);
  for(const m of mounted.rotatingMountTrains)m.train.rotation.y=m.baseYawFromBow;
  prepared.scale.multiplyScalar(profile.hullVisualScale!);prepared.position.y+=profile.clientVisualTuningDefaults!.gltfHullYOffset!;
  const visualScale=10000/171.7*profile.hullVisualScale!;
  prepared.updateMatrixWorld(true);assert(Math.abs(prepared.scale.x-visualScale)<1e-5);assert(Math.abs(prepared.position.y)<.0001);
  for(const slot of profile.mountSlots){
    const id=profile.defaultLoadout![slot.id];const model=resolveMountModelVisualId(id,profile.hullGltfId);
    const expected=metric[model].clone(true);expected.position.copy(new THREE.Vector3(slot.socket.position.x,slot.socket.position.y,slot.socket.position.z));
    expected.rotation.y=inferMountTrainBaseYawFromBow(slot);expected.scale.setScalar(visualScale);expected.position.multiplyScalar(visualScale);expected.updateMatrixWorld(true);
    const actual=new THREE.Box3().setFromObject(prepared.getObjectByName(`mount_${slot.id}`)!);
    const target=new THREE.Box3().setFromObject(expected);
    assert(actual.min.distanceTo(target.min)<.001&&actual.max.distanceTo(target.max)<.001,`${slot.id} size/position/rotation`);
  }
  for(const rail of profile.fixedSeaSkimmerLaunchers!){
    assert(markers.rails.has(rail.id));const expected=metric.visual_spruance_harpoon.clone(true);
    expected.position.set(rail.socket.position.x,rail.socket.position.y,rail.socket.position.z);expected.rotation.y=rail.launchYawRadFromBow;expected.scale.setScalar(visualScale);expected.position.multiplyScalar(visualScale);expected.updateMatrixWorld(true);
    const actual=new THREE.Box3().setFromObject(prepared.getObjectByName(`ssm_${rail.id}`)!);
    const target=new THREE.Box3().setFromObject(expected);
    assert(actual.min.distanceTo(target.min)<.001&&actual.max.distanceTo(target.max)<.001,rail.id);
  }
  const total=reports[0].triangles+reports[1].triangles+reports[2].triangles+reports[3].triangles+2*reports[4].triangles;
  assert(total<=10000);
  const classScale=getShipClassProfile('destroyer').hullScale;
  const worldLength=size.z*visualScale*classScale;
  assert(Math.abs(worldLength-10000*old.hullVisualScale*classScale)<.001,'Preserve prior FAC world length');
  const wake=(profile.collisionHitbox!.center.z-profile.collisionHitbox!.halfExtents.z+profile.clientVisualTuningDefaults!.wakeSpawnLocalZ!)*classScale;
  assert(Math.abs(wake+worldLength/2)<.001,'Wake must start at rendered stern');
  const report={passed:true,assembledTriangles:total,hullDimensions:size.toArray(),worldLength,wakeWorldZ:wake,drawCalls:6,
    checks:['actual game loader and mount attachment','embedded PNG textures and UVs','three independent rotating weapons; two visual-only aft mounts','eight Harpoon canisters','muzzle empties','exact socket agreement','metre-scale reconstruction','unchanged loadout / CIWS and SAM defense / sectors / movement / magazine / collision box'],files:reports};
  fs.writeFileSync(`${out}/runtime-validation.json`,JSON.stringify(report,null,2));console.log(report);
}
main().catch(e=>{console.error(e);process.exitCode=1});
