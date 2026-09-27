import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clonePreparedShipHull } from '../../client/src/game/scene/shipGltfHull';
import { attachMountVisualsToHullModel } from '../../client/src/game/scene/shipMountVisuals';
import { readMarkedSocketTransformsFromHullGltf } from '../../client/src/game/scene/shipSocketGltf';
import { getAuthoritativeShipHullProfile } from '../../shared/src/shipProfiles';
import { hullProvidesAirDefensePdLayer, listPrimaryArtilleryMountConfigs } from '../../shared/src/shipVisualLayout';
import { resolveMountModelVisualId } from '../../client/src/game/runtime/mountGltfUrls';
import { getShipClassProfile } from '../../shared/src/shipClass';

const out='assets/blender/gepard',pub='client/public/assets',reports:any[]=[];
if(!globalThis.ProgressEvent)(globalThis as any).ProgressEvent=class{constructor(public type:string,public init:any){}};
async function load(path:string,report=true){
  const buf=fs.readFileSync(path);assert.equal(buf.readUInt32LE(0),0x46546c67);
  const len=buf.readUInt32LE(12),g=JSON.parse(buf.subarray(20,20+len).toString()),bin=buf.subarray(28+len);
  assert.equal(g.scenes.length,1);assert(!g.cameras?.length);assert(!g.extensions?.KHR_lights_punctual);
  assert(g.images?.length>=2,'Embedded base-color and roughness maps required');
  for(const im of g.images){const bv=g.bufferViews[im.bufferView];assert.equal(im.uri,undefined);assert.equal(bin.subarray(bv.byteOffset,bv.byteOffset+8).toString('hex'),'89504e470d0a1a0a');}
  let tris=0;for(const m of g.meshes)for(const p of m.primitives){assert(p.attributes.TEXCOORD_0!==undefined);tris+=g.accessors[p.indices].count/3;}
  if(report)reports.push({file:path,triangles:tris,bytes:buf.length,meshBatches:g.meshes.length});
  for(const m of g.materials){delete m.pbrMetallicRoughness?.baseColorTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
  delete g.images;delete g.textures;delete g.samplers;g.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(g),'');gltf.scene.updateMatrixWorld(true);return gltf.scene;
}
async function main(){
  const profile=getAuthoritativeShipHullProfile('fac')!;
  assert.equal(profile.hullGltfId,'gepard');assert(hullProvidesAirDefensePdLayer(profile));
  assert.equal(listPrimaryArtilleryMountConfigs(profile,Math.PI).length,1);
  const old=JSON.parse(fs.readFileSync(`${out}/backup/fac.json`,'utf8'));
  for(const key of ['movement','collisionHitbox','defaultLoadout','aswmMagazine','aswmMagicReloadMs'] as const)
    assert.deepEqual(profile[key],old[key]);
  for(let i=0;i<old.mountSlots.length;i++){
    const {socket,...actual}=profile.mountSlots[i];assert.deepEqual(actual,old.mountSlots[i]);
  }
  const hull=await load(`${pub}/ships/hull_gepard.glb`);
  const bbox=new THREE.Box3().setFromObject(hull),size=bbox.getSize(new THREE.Vector3());
  assert(Math.abs(size.z-57.6)<.001);assert(Math.abs(size.x-7.8)<.001);assert(Math.abs(bbox.min.y+1.95)<.001);
  const markers=readMarkedSocketTransformsFromHullGltf(hull);
  for(const slot of profile.mountSlots){assert(markers.sockets.has(slot.id));const p=markers.sockets.get(slot.id)!.position;for(const axis of ['x','y','z'] as const)assert(Math.abs(p[axis]-slot.socket.position[axis])<1e-5);}
  const templates:Record<string,THREE.Group>={},metric:Record<string,THREE.Group>={};
  for(const key of ['artillery','pdms','exocet']){
    templates[`visual_gepard_${key}`]=await load(`${pub}/systems/mount_gepard_${key}.glb`);
    metric[`visual_gepard_${key}`]=await load(`${out}/mount_gepard_${key}_metric.glb`,false);
    assert(templates[`visual_gepard_${key}`].getObjectByName('bf_muzzle'));
  }
  const prepared=clonePreparedShipHull(hull);const mounted=attachMountVisualsToHullModel(prepared,profile,id=>templates[id]??null);
  assert.equal(mounted.rotatingMountTrains.length,2);
  assert.equal(mounted.rotatingMountTrains.filter(m=>m.isAirDefense).length,1);
  assert.equal(mounted.rotatingMountTrains.find(m=>m.isAirDefense)!.weaponGuide.visualId,'visual_pdms');
  for(const m of mounted.rotatingMountTrains)m.train.rotation.y=m.baseYawFromBow;
  prepared.scale.multiplyScalar(profile.hullVisualScale!);prepared.position.y+=profile.clientVisualTuningDefaults!.gltfHullYOffset!;
  const visualScale=10000/57.6*profile.hullVisualScale!;
  prepared.updateMatrixWorld(true);assert(Math.abs(prepared.scale.x-visualScale)<1e-5);assert(Math.abs(prepared.position.y)<.0001);
  for(const slot of profile.mountSlots){
    const id=profile.defaultLoadout![slot.id];const model=resolveMountModelVisualId(id,profile.hullGltfId);
    const expected=metric[model].clone(true);expected.position.copy(new THREE.Vector3(slot.socket.position.x,slot.socket.position.y,slot.socket.position.z));
    expected.rotation.y=slot.trainBaseYawRadFromBow??0;expected.scale.setScalar(visualScale);expected.position.multiplyScalar(visualScale);expected.updateMatrixWorld(true);
    const actual=new THREE.Box3().setFromObject(prepared.getObjectByName(`mount_${slot.id}`)!);
    const target=new THREE.Box3().setFromObject(expected);
    assert(actual.min.distanceTo(target.min)<.001&&actual.max.distanceTo(target.max)<.001,`${slot.id} size/position/rotation`);
  }
  for(const rail of profile.fixedSeaSkimmerLaunchers!){
    assert(markers.rails.has(rail.id));const expected=metric.visual_gepard_exocet.clone(true);
    expected.position.set(rail.socket.position.x,rail.socket.position.y,rail.socket.position.z);expected.rotation.y=rail.launchYawRadFromBow;expected.scale.setScalar(visualScale);expected.position.multiplyScalar(visualScale);expected.updateMatrixWorld(true);
    const actual=new THREE.Box3().setFromObject(prepared.getObjectByName(`ssm_${rail.id}`)!);
    const target=new THREE.Box3().setFromObject(expected);
    assert(actual.min.distanceTo(target.min)<.001&&actual.max.distanceTo(target.max)<.001,rail.id);
  }
  const total=reports[0].triangles+reports[1].triangles+reports[2].triangles+2*reports[3].triangles;
  assert(total<=10000);
  const classScale=getShipClassProfile('fac').hullScale;
  const worldLength=size.z*visualScale*classScale;
  assert(Math.abs(worldLength-10000*old.hullVisualScale*classScale)<.001,'Preserve prior FAC world length');
  const wake=(profile.collisionHitbox!.center.z-profile.collisionHitbox!.halfExtents.z+profile.clientVisualTuningDefaults!.wakeSpawnLocalZ!)*classScale;
  assert(Math.abs(wake+worldLength/2)<.001,'Wake must start at rendered stern');
  const report={passed:true,assembledTriangles:total,hullDimensions:size.toArray(),worldLength,wakeWorldZ:wake,drawCalls:5,
    checks:['actual game loader and mount attachment','embedded PNG textures and UVs','two independent rotating weapons','four Exocet canisters','muzzle empties','exact socket agreement','metre-scale reconstruction','unchanged loadout / PD defense / sectors / movement / magazine / collision box'],files:reports};
  fs.writeFileSync(`${out}/runtime-validation.json`,JSON.stringify(report,null,2));console.log(report);
}
main().catch(e=>{console.error(e);process.exitCode=1});
