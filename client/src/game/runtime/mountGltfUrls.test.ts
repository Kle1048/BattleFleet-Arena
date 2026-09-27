import assert from 'node:assert/strict';
import {resolveMountModelVisualId,resolveMountGltfUrl} from './mountGltfUrls';
for(const hull of ['gepard','s143a']) {
  assert.equal(resolveMountModelVisualId('visual_artillery',hull),'visual_gepard_artillery');
  assert.equal(resolveMountModelVisualId('visual_pdms',hull),'visual_gepard_pdms');
  assert.equal(resolveMountModelVisualId('visual_ssm',hull),'visual_gepard_exocet');
  assert.equal(resolveMountModelVisualId('visual_ciws',hull),'visual_ciws');
}
for(const hull of ['spruance','destroyer']) {
  assert.equal(resolveMountModelVisualId('visual_artillery',hull),'visual_spruance_mk45');
  assert.equal(resolveMountModelVisualId('visual_ciws',hull),'visual_spruance_phalanx');
  assert.equal(resolveMountModelVisualId('visual_sam',hull),'visual_spruance_seasparrow');
  assert.equal(resolveMountModelVisualId('visual_ssm',hull),'visual_spruance_harpoon');
  assert.equal(resolveMountModelVisualId('visual_pdms',hull),'visual_pdms');
}
for(const hull of ['cruiser','f124','fac']) {
  assert.equal(resolveMountModelVisualId('visual_artillery',hull),'visual_artillery');
  assert.equal(resolveMountModelVisualId('visual_pdms',hull),'visual_pdms');
}
assert(resolveMountGltfUrl(resolveMountModelVisualId('visual_pdms','gepard')).endsWith('/mount_gepard_pdms.glb'));
console.log('Hull-specific mount models preserve existing weapon identities.');
