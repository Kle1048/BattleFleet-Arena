import bpy,json,math
from pathlib import Path
from mathutils import Vector
out=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\f124\animation')
scene=bpy.context.scene
assert scene.name=='F124_Animation_Demo.002'
assert scene.get('animation_source')=='F124_Hessen_Asset_v3.003'
# Remove only the two incomplete/test scene containers created in this turn.
# The original F124 scenes and all source datablocks are retained.
for name in ('F124_Animation_Demo','F124_Animation_Demo.001'):
    draft=bpy.data.scenes.get(name)
    if draft:
        assert draft.get('animation_source')==scene['animation_source']
        bpy.data.scenes.remove(draft)
scene.name='F124_Animation_Demo'
radar=next(o for o in scene.objects if o.name.startswith('CTRL_SMARTL'))
plane=next(o for o in scene.objects if o.name.startswith('CTRL_AIRCRAFT'))
data=json.loads((out/'animation-data.json').read_text())
for row in data['frames']:
    scene.frame_set(row['frame']); dg=bpy.context.evaluated_depsgraph_get()
    p=plane.evaluated_get(dg).matrix_world.translation
    expected=Vector((row['aircraft']['x'],-row['aircraft']['z'],row['aircraft']['y']))
    assert (p-expected).length<.0001
    axis=radar.evaluated_get(dg).matrix_world.to_3x3()@Vector((1,0,0))
    delta=math.atan2(axis.y,axis.x)-row['radarYaw']
    assert abs(math.atan2(math.sin(delta),math.cos(delta)))<.0001
images=set()
for ob in scene.objects:
    if ob.type!='MESH': continue
    for mat in ob.data.materials:
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type=='TEX_IMAGE' and node.image: images.add(node.image)
assert len(images)==4 and all(i.packed_file for i in images)
scene.frame_set(210)
scene['animation_validated']=True
bpy.data.libraries.write(str(out/'f124_hessen_animated.blend'),{scene},fake_user=True)
with bpy.data.libraries.load(str(out/'f124_hessen_animated.blend'),link=False) as (available,unused):
    assert available.scenes==[scene.name]
    saved_actions=list(available.actions)
    assert len(saved_actions)==8,(len(saved_actions),saved_actions)
report={'passed':True,'scene':scene.name,'frames':scene.frame_end,'actions':len(saved_actions),
        'packed_textures':len(images),'radar_and_aircraft_frames_checked':len(data['frames']),
        'saved_scene_count':1,'static_source_retained':scene['animation_source']}
(out/'saved-animation-validation.json').write_text(json.dumps(report,indent=2))
result=report
