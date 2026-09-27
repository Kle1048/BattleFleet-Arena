"""Render the shipped GLBs after reimport, including all embedded textures."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT=ROOT/'assets/blender/f124'; PUB=ROOT/'client/public/assets'
source=max((s for s in bpy.data.scenes if s.name.startswith('F124_Hessen_Asset')),
           key=lambda s:(s.get('f124_asset_revision',1),s.name))
qa=bpy.data.scenes.new('F124_GLTF_REIMPORT_QA'); bpy.context.window.scene=qa
qa.world=source.world
def imported(path):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return list(set(bpy.data.objects)-before)
hull=imported(PUB/'ships/hull_f124.glb')
assert len([o for o in hull if o.type=='MESH'])==3
profile=json.loads((OUT/'f124.profile.json').read_text(encoding='utf-8'))
mounts=[]
for slot in profile['mountSlots']:
    mounts.append((slot['defaultVisualId'],slot['socket']['position'],slot['trainBaseYawRadFromBow']))
for rail in profile['fixedSeaSkimmerLaunchers']:
    mounts.append((rail['visualId'],rail['socket']['position'],rail['launchYawRadFromBow']))
for vid,p,yaw in mounts:
    key=vid.removeprefix('visual_f124_')
    objs=imported(PUB/('systems/mount_f124_'+key+'.glb'))
    trans=Matrix.Translation((p['x'],-p['z'],p['y'])) @ Matrix.Rotation(yaw,4,'Z') @ Matrix.Scale(143/10000,4)
    for o in objs:
        if o.parent is None: o.matrix_world=trans @ o.matrix_world
for c in source.collection.children:
    if c.name.startswith('F124_PRESENTATION'):
        for o in c.objects:
            clone=o.copy()
            if o.type=='CAMERA': clone.data=o.data.copy(); qa.camera=clone
            qa.collection.objects.link(clone)
qa.render.engine='BLENDER_EEVEE'
qa.render.resolution_x=1500; qa.render.resolution_y=950; qa.render.resolution_percentage=100
qa.render.image_settings.file_format='PNG'; qa.render.image_settings.color_mode='RGB'
qa.view_settings.view_transform='AgX'
cam=qa.camera
def shot(name,p,target=(0,9,0),scale=177):
    cam.location=(p[0],-p[2],p[1]); aim=Vector((target[0],-target[2],target[1]))
    cam.rotation_euler=(aim-cam.location).to_track_quat('-Z','Y').to_euler()
    if name in ('f124_top.png','f124_match_top.png'): cam.rotation_euler=(0,0,-math.pi/2)
    cam.data.type='ORTHO'; cam.data.ortho_scale=scale
    qa.render.filepath=str(OUT/name); bpy.ops.render.render(write_still=True)
shot('f124_hero.png',(155,115,165))
shot('f124_stern.png',(-150,125,-155))
sea=[o for o in qa.objects if o.name.startswith('PREVIEW_sea')]
for o in sea: o.hide_render=True
qa.render.resolution_y=600
shot('f124_profile.png',(-200,14,0),(0,14,0),163)
# True orthographic top, bow and stern elevations for the new reference sheet.
qa.render.resolution_x=1500; qa.render.resolution_y=450
shot('f124_top.png',(0,200,0),(0,0,0),163)
qa.render.resolution_x=800; qa.render.resolution_y=1000
shot('f124_bow.png',(0,15.4,200),(0,15.4,0),48)
shot('f124_aft.png',(0,15.4,-200),(0,15.4,0),48)
qa.render.film_transparent=True; qa.render.image_settings.color_mode='RGBA'
qa.render.resolution_x=1500; qa.render.resolution_y=444
side_scale=488/143
side_y=(230-108-74)/side_scale
shot('f124_match_side.png',(-200,side_y,0),(0,side_y,0),500/side_scale)
qa.render.resolution_y=240
top_scale=488/143
top_x=-1.5/top_scale; top_z=0
shot('f124_match_top.png',(top_x,200,top_z),(top_x,0,top_z),500/top_scale)
materials={m.name for o in qa.objects if o.type=='MESH' for m in o.data.materials}
report={'status':'pass','scene':qa.name,'mesh_count':sum(o.type=='MESH' for o in qa.objects),
    'reimport_materials':sorted(materials),'renders':['f124_hero.png','f124_stern.png','f124_profile.png','f124_top.png','f124_bow.png','f124_aft.png','f124_match_side.png','f124_match_top.png']}
(OUT/'reimport-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.context.window.scene=source
result=report
