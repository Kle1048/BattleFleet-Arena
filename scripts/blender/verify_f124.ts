/** Offline geometry audit of the archived V1 F124 prototype.
 * Not a V2 runtime/attachment acceptance test. Migrate/register it before activation.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { extractModelMetadata } from "../models/extractModelMetadata";

const root=process.cwd();
const out=`${root}/assets/blender/f124`;
const pub=`${root}/client/public/assets`;
const reports:any[]=[];

async function load(path:string, audit=true) {
  const buf=fs.readFileSync(path);
  assert.equal(buf.readUInt32LE(0),0x46546c67);
  const len=buf.readUInt32LE(12);
  const data=JSON.parse(buf.subarray(20,20+len).toString());
  const bin=buf.subarray(28+len);
  assert.equal(data.scenes.length,1,'Only the selected F124 scene may be exported');
  assert(!data.cameras?.length); assert(!data.extensions?.KHR_lights_punctual);
  assert(data.images?.length>=2,'Embedded textures required');
  for(const im of data.images) {
    assert.equal(im.mimeType,'image/png'); assert.equal(im.uri,undefined);
    const bv=data.bufferViews[im.bufferView];
    assert.equal(bin.subarray(bv.byteOffset,bv.byteOffset+8).toString('hex'),'89504e470d0a1a0a');
  }
  let triangles=0;
  for(const m of data.meshes) for(const p of m.primitives) {
    assert(p.attributes.TEXCOORD_0!==undefined,'UVs missing');
    triangles+=data.accessors[p.indices].count/3;
  }
  // Node has no image decoder/WebGL: retain all geometry and transforms, remove
  // material texture references only in this in-memory diagnostic representation.
  for(const m of data.materials) {
    delete m.pbrMetallicRoughness?.baseColorTexture;
    delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
  }
  delete data.images; delete data.textures; delete data.samplers;
  data.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(data),'');
  gltf.scene.updateMatrixWorld(true);
  if(audit) reports.push({file:path.replace(root+'/',''),bytes:buf.length,triangles,nodes:data.nodes.map((n:any)=>n.name)});
  return gltf.scene;
}

async function main() {
  // Three's FileLoader emits ProgressEvent when decoding the in-memory buffer.
  if(!globalThis.ProgressEvent) (globalThis as any).ProgressEvent=class { constructor(public type:string,public init:any){} };
  const src=await load(`${pub}/ships/hull_f124.glb`);
  function heightAt(x:number,z:number) {
    const ray=new THREE.Raycaster(new THREE.Vector3(x,45,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(src,true)[0];
    assert(hit,'Hull must have geometry below probe'); return hit.point.y;
  }
  // Probe the shipped GLB, not authoring names: a merged/shared funnel roof must fail.
  assert(heightAt(0,-8.3)<11.0,'Funnel center passage obstructed');
  for(const sign of [-1,1]) {
    assert(Math.abs(heightAt(sign*4.95,-8.95)-18.1)<.05,'Separate funnel rim missing');
    const opening=heightAt(sign*3.65,-8.95);
    assert(opening>17.45 && opening<17.65,'Funnel opening must be recessed and open');
  }
  assert(heightAt(3.57,34.65)>11,'Transverse VLS array / raised deck missing');
  const size=new THREE.Box3().setFromObject(src).getSize(new THREE.Vector3());
  assert(Math.abs(size.z-143)<.01,'Length / +Z bow axis');
  assert(Math.abs(size.x-17.4)<.01,'Beam / +X starboard axis');
  const profile=JSON.parse(fs.readFileSync(`${out}/f124.profile.json`,'utf8'));
  const registry=JSON.parse(fs.readFileSync(`${out}/f124.mountSockets.json`,'utf8'));
  const markers=extractModelMetadata(fs.readFileSync(`${pub}/ships/hull_f124.glb`));
  for(const slot of profile.mountSlots) {
    assert(Object.hasOwn(markers.sockets, slot.id));
    const p=markers.sockets[slot.id]!.position;
    for(const a of ['x','y','z'] as const) assert(Math.abs(p[a]-registry[slot.id].position[a])<1e-4);
  }
  for(const rail of profile.fixedSeaSkimmerLaunchers) {
    const marker=markers.rails[rail.id]; assert(marker,rail.id+' rail marker missing');
    for(const a of ['x','y','z'] as const) assert(Math.abs(marker.position[a]-rail.socket.position[a])<1e-4);
    const e=marker.eulerRad ?? {x:0,y:0,z:0};
    const actual=new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x,e.y,e.z));
    const expected=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rail.launchYawRadFromBow,0));
    assert(actual.angleTo(expected)<1e-4,rail.id+' rail orientation mismatch');
  }
  const gunSlot=profile.mountSlots.find((s:any)=>s.id==='main_fwd');
  const ramSlot=profile.mountSlots.find((s:any)=>s.id==='ram_fwd');
  assert(gunSlot.socket.position.z>ramSlot.socket.position.z && ramSlot.socket.position.z>41,
    'Reference layout requires RAM between gun and VLS');
  const templates:Record<string,THREE.Group>={};
  for(const key of ['76mm','ram','harpoon']) {
    templates['visual_f124_'+key]=await load(`${pub}/systems/mount_f124_${key}.glb`);
    assert(templates['visual_f124_'+key].getObjectByName('bf_muzzle'));
  }
  const assembledTriangles=reports[0].triangles+reports[1].triangles+2*reports[2].triangles+2*reports[3].triangles;
  assert(assembledTriangles<=10000,'Low-poly prototype budget exceeded');
  fs.writeFileSync(`${out}/export-validation.json`,JSON.stringify({status:'pass',scope:'archived V1 geometry only; not V2 runtime acceptance',hullMetres:size.toArray(),assembledTriangles,checks:['single scene','embedded PNGs','UV coordinates','exact socket names and JSON agreement','rail positions and orientations','forward RAM ahead of VLS','separate open port and starboard funnels verified by GLB raycasts','unobstructed central passage','raised transverse VLS','bf_muzzle per mount','assembled triangle budget <= 10000'],files:reports},null,2));
  console.log(JSON.stringify({status:'pass',hullMetres:size.toArray(),files:reports.map(({nodes,...r})=>r)},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
