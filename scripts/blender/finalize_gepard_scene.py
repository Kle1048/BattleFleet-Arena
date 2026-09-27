import bpy,json
from pathlib import Path
OUT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\gepard')
s=bpy.context.scene;assert s.name.startswith('Gepard_P6122_Asset')
# Exports and independent preview copies already exist. Remove hidden template
# collection links from this scene only, not datablocks or earlier iterations.
for c in list(s.collection.children):
    if c.name.startswith('GEPARD_TEMPLATE_'):s.collection.children.unlink(c)
total=0
for o in s.objects:
    if o.type=='MESH' and not o.name.startswith('PREVIEW_sea'):
        o.data.calc_loop_triangles();total+=len(o.data.loop_triangles)
expected=json.loads((OUT/'geometry-stats.json').read_text())['assembled_triangles']
assert total==expected and total<=10000,(total,expected)
s['assembled_triangles']=total;s['runtime_hull_id']='gepard'
bpy.data.libraries.write(str(OUT/'gepard_p6122.blend'),{s},fake_user=True)
with bpy.data.libraries.load(str(OUT/'gepard_p6122.blend'),link=False) as (available,unused):
    assert available.scenes==[s.name]
    expected_images=4 if s.get('material_style') == 'clean-colour-v1' else 12 if s.get('weathering') else 2
    assert len(available.images)==expected_images,(len(available.images),expected_images)
result={'scene':s.name,'saved_ship_triangles':total,'single_scene':True,'packed_texture_count':expected_images}
(OUT/'saved-scene-validation.json').write_text(json.dumps(result,indent=2))
