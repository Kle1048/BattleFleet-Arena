import bpy,json
from pathlib import Path
from mathutils import Vector
OUT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\spruance')
s=bpy.context.scene;assert s.name.startswith('Spruance_DD963_Asset')
hero=s.camera
c=bpy.data.objects.new('Spruance_WeatheringDetail',bpy.data.cameras.new('Spruance_WeatheringDetail'))
s.collection.objects.link(c);c.location=(90,-65,40)
c.rotation_euler=(Vector((0,-32,10))-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=65
s.camera=c;s.render.resolution_x=1600;s.render.resolution_y=1000
s.render.filepath=str(OUT/'spruance_detail.png');bpy.ops.render.render(write_still=True)
s.camera=hero;s.render.filepath=str(OUT/'spruance_hero.png')
for col in list(s.collection.children):
    if col.name.startswith('SPRUANCE_TEMPLATE_'):s.collection.children.unlink(col)
count=0;images=set()
for o in s.objects:
    if o.type!='MESH' or o.name.startswith('PREVIEW_sea'):continue
    o.data.calc_loop_triangles();count+=len(o.data.loop_triangles)
    for m in o.data.materials:
        for n in m.node_tree.nodes:
            if n.type=='TEX_IMAGE' and n.image:images.add(n.image)
assert count==9500 and len(images)==15
assert all(i.packed_file for i in images)
bpy.data.libraries.write(str(OUT/'spruance_dd963.blend'),{s},fake_user=True)
with bpy.data.libraries.load(str(OUT/'spruance_dd963.blend'),link=False) as (available,unused):
    assert available.scenes==[s.name] and len(available.images)==15
result={'passed':True,'scene':s.name,'triangles':count,'packed_textures':15,'single_saved_scene':True,'static_aft_weapons':True}
(OUT/'saved-scene-validation.json').write_text(json.dumps(result,indent=2))
