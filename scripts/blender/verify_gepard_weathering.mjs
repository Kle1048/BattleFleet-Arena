// Compare actual triangle surfaces before/after weathering, ignoring UV splits.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root='assets/blender/gepard';
function inspect(file){
  const bytes=fs.readFileSync(file),length=bytes.readUInt32LE(12);
  const g=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
  function accessor(id){
    const a=g.accessors[id],v=g.bufferViews[a.bufferView],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
    const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
    return Array.from({length:a.count},(_,i)=>Array.from({length:components},(_,j)=>bin[read]((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??size*components)+j*size)));
  }
  const triangles=[];
  for(const mesh of g.meshes)for(const p of mesh.primitives){
    const pos=accessor(p.attributes.POSITION),idx=accessor(p.indices).flat();
    for(let i=0;i<idx.length;i+=3)triangles.push(idx.slice(i,i+3).map(k=>pos[k].map(x=>Math.round(x*1e5)).join(',')).sort().join('|'));
  }
  return {g,triangles:triangles.length,hash:crypto.createHash('sha256').update(triangles.sort().join('\n')).digest('hex')};
}
const report=[];
for(const [folder,file] of [['ships','hull_gepard.glb'],...['artillery','pdms','exocet'].map(k=>['systems',`mount_gepard_${k}.glb`])]){
  const before=inspect(`${root}/backup/pre-weathering/${file}`),after=inspect(`client/public/assets/${folder}/${file}`);
  assert.equal(after.triangles,before.triangles,file);assert.equal(after.hash,before.hash,`${file}: geometry changed`);
  assert.equal(after.g.images.length,3,file);
  for(const mat of after.g.materials){assert(mat.normalTexture);assert(mat.pbrMetallicRoughness.baseColorTexture);assert(mat.pbrMetallicRoughness.metallicRoughnessTexture);}
  report.push({file,triangles:after.triangles,geometryUnchanged:true,embeddedPbrImages:3});
}
fs.writeFileSync(`${root}/weathering-export-validation.json`,JSON.stringify({passed:true,files:report},null,2));
console.log(report);
