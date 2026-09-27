import bpy,bmesh
from pathlib import Path
from mathutils import Vector
out=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\f124\weathered')
s=bpy.context.scene; assert s.name=='F124_Animation_Weathered'
m=bpy.data.materials['SEA_SERVICE_RustRunoff']
for node in m.node_tree.nodes:
    if node.type=='MATH': node.inputs[1].default_value=.55
    if node.type=='HUE_SAT': node.inputs['Saturation'].default_value=.72; node.inputs['Value'].default_value=.80
m['opacity']=.55
for o in s.objects:
    if not o.name.startswith('RUST_'): continue
    side=1 if 'starboard' in o.name else -1
    if o.data.polygons[0].normal.x*side<0:
        bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.reverse_faces(bm,faces=list(bm.faces)); bm.to_mesh(o.data); bm.free()
hero=s.camera
close=bpy.data.objects.new('CAM_WEATHERING_RustCloseup',bpy.data.cameras.new('CAM_WEATHERING_RustCloseup'))
s.collection.objects.link(close); close.data.type='ORTHO'; close.data.ortho_scale=32
close.location=(60,-61,19); close.rotation_euler=(Vector((0,-54,5))-close.location).to_track_quat('-Z','Y').to_euler()
shots=[(close,'f124_rust_closeup.png'),(next(o for o in s.objects if o.name.startswith('CAM_WEATHERING_Detail')),'f124_weathered_detail.png'),(hero,'f124_weathered_hero.png')]
for cam,name in shots:
    s.camera=cam; s.render.filepath=str(out/name); bpy.ops.render.render(write_still=True)
s.camera=hero; s.render.filepath=str(out/'f124_weathered_hero.png')
bpy.data.libraries.write(str(out/'f124_hessen_animated_weathered.blend'),{s},fake_user=True)
result={'scene':s.name,'opacity':.55,'closeup':str(out/'f124_rust_closeup.png')}
