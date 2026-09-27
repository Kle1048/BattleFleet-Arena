import bpy,json
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena');OUT=ROOT/'assets/blender/slava'
ns=bpy.app.driver_namespace['slava_build'];source=ns['scene'];bpy.context.window.scene=source
expected=json.loads((OUT/'geometry-stats.json').read_text())['assembled_triangles']
count=ns['tris'](ns['hull'])+ns['tris'](ns['weapons']);assert count==expected and count<=10000
images=set()
for col in [ns['hull'],*ns['templates'].values()]:
    for ob in col.objects:
        if ob.type!='MESH':continue
        for mat in ob.data.materials:
            for n in mat.node_tree.nodes:
                if n.type=='TEX_IMAGE' and n.image:images.add(n.image)
assert len(images)==5 and all(i.packed_file for i in images)
bpy.data.libraries.write(str(OUT/'slava.blend'),{source},fake_user=True)
exec(compile((ROOT/'scripts/blender/canonical_roundtrip.py').read_text(encoding='utf-8'),'canonical_roundtrip','exec'))
results=[]
for prior in (True,False):
    qa=bpy.data.scenes.new('Slava_Previous_Game_Asset' if prior else 'Slava_GLTF_Roundtrip_QA');qa.world=source.world;bpy.context.window.scene=qa
    for o in ns['studio'].objects:
        n=o.copy();qa.collection.objects.link(n)
        if o.type=='CAMERA':
            n.data=o.data.copy();n.location*=ns['GAME_METRES_PER_UNIT'];n.data.ortho_scale*=ns['GAME_METRES_PER_UNIT']
            if o==source.camera:qa.camera=n
    imported=[]
    def load(path,transform):
        if prior:path=OUT/'backup'/path.name
        before=set(qa.objects);bpy.ops.import_scene.gltf(filepath=str(path));obs=set(qa.objects)-before
        for o in obs:
            if o.parent not in obs:o.matrix_world=transform@o.matrix_world
        imported.extend(obs);return obs
    assemble_runtime_ship(ROOT,'cruiser',load)
    triangles=0
    for o in imported:
        if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    if not prior:assert triangles==expected
    qa.render.engine='BLENDER_EEVEE';qa.view_settings.view_transform='AgX';qa.render.resolution_x=1800;qa.render.resolution_y=1100;qa.render.resolution_percentage=100
    qa.render.filepath=str(OUT/('slava_before.png' if prior else 'slava_glb_roundtrip.png'));qa.render.image_settings.file_format='PNG';bpy.ops.render.render(write_still=True)
    results.append({'previous_asset':prior,'triangles':triangles,'render':qa.render.filepath})
bpy.context.window.scene=source
with bpy.data.libraries.load(str(OUT/'slava.blend'),link=False) as (available,unused):
    assert available.scenes==[source.name] and len(available.images)==5
result={'passed':True,'scene':source.name,'assembled_triangles':count,'packed_images':5,'roundtrip':results,'source_includes_hidden_templates':True}
(OUT/'saved-scene-validation.json').write_text(json.dumps(result,indent=2))
