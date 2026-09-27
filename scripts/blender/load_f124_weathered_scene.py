"""Append the saved weathered animation without discarding the open scene."""
import bpy
from pathlib import Path

path=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\f124\weathered\f124_hessen_animated_weathered.blend')
assert path.is_file(),str(path)
previous=bpy.context.scene
with bpy.data.libraries.load(str(path),link=False) as (available,requested):
    names=[name for name in available.scenes if name.startswith('F124_Animation_Weathered')]
    assert len(names)==1,names
    requested.scenes=names
scene=requested.scenes[0]
assert scene is not None
bpy.context.window.scene=scene
scene.frame_set(210)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
assert scene.camera is not None
animated=[o for o in scene.objects if o.animation_data and o.animation_data.action]
assert len(animated)==8,len(animated)
result={'active_scene':scene.name,'source_file':str(path),'objects':len(scene.objects),
        'animated_objects':len(animated),'frames':[scene.frame_start,scene.frame_end],
        'fps':scene.render.fps,'previous_scene_retained':previous.name in bpy.data.scenes}
