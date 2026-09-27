import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena'); OUT=ROOT/'assets/blender/spruance'; PUB=ROOT/'client/public/assets'
source=bpy.context.scene;assert source.name.startswith('Spruance_DD963_Asset')
qa=bpy.data.scenes.new('Spruance_GLTF_Roundtrip_QA');qa.world=source.world;bpy.context.window.scene=qa
for o in source.objects:
    if o.type in ('CAMERA','LIGHT') or o.name.startswith('PREVIEW_sea'):
        n=o.copy();qa.collection.objects.link(n)
        if o==source.camera:qa.camera=n
def load(path,transform):
    before=set(qa.objects);bpy.ops.import_scene.gltf(filepath=str(path));obs=set(qa.objects)-before
    for o in obs:
        if o.parent not in obs:o.matrix_world=transform@o.matrix_world
    return obs
load(PUB/'ships/hull_spruance.glb',Matrix.Identity(4))
G=lambda p:Vector((p['x'],-p['z'],p['y']))
profile=json.loads((OUT/'destroyer.profile.json').read_text());sockets=json.loads((OUT/'destroyer.mountSockets.json').read_text())
for slot in profile['mountSlots']:
    key={'main_fwd':'mk45','ciws_fwd':'phalanx','sam_aft':'seasparrow'}[slot['id']];p=sockets[slot['id']]['position']
    transform=Matrix.Translation(G(p))@Matrix.Rotation(slot.get('trainBaseYawRadFromBow',math.pi if p['z']<0 else 0),4,'Z')@Matrix.Scale(171.7/100,4)
    load(PUB/('systems/mount_spruance_'+key+'.glb'),transform)
for rail in profile['fixedSeaSkimmerLaunchers']:
    transform=Matrix.Translation(G(rail['socket']['position']))@Matrix.Rotation(rail['launchYawRadFromBow'],4,'Z')@Matrix.Scale(171.7/10000,4)
    load(PUB/'systems/mount_spruance_harpoon.glb',transform)
qa.render.engine='BLENDER_EEVEE';qa.view_settings.view_transform='AgX'
qa.render.resolution_x=1500;qa.render.resolution_y=950;qa.render.resolution_percentage=100
qa.render.image_settings.file_format='PNG';qa.render.filepath=str(OUT/'spruance_glb_roundtrip.png')
bpy.ops.render.render(write_still=True)
images=set()
for o in qa.objects:
    if o.type=='MESH' and not o.name.startswith('PREVIEW_sea'):
        for m in o.data.materials:
            if m and m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type=='TEX_IMAGE' and n.image: images.add(n.image)
assert len(images)>=2
with bpy.data.libraries.load(str(OUT/'spruance_dd963.blend'),link=False) as (available,unused):
    assert available.scenes==[source.name]
bpy.context.window.scene=source
result={'passed':True,'roundtrip_texture_images':len(images),'saved_scene_only':source.name,'render':str(OUT/'spruance_glb_roundtrip.png')}
(OUT/'roundtrip-validation.json').write_text(json.dumps(result,indent=2))
