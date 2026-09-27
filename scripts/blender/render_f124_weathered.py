import bpy
from pathlib import Path
from mathutils import Vector
OUT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\f124\weathered')
scene=bpy.context.scene; assert scene.name.startswith('F124_Animation_Weathered')
hero=scene.camera
scene.render.filepath=str(OUT/'f124_weathered_hero.png'); bpy.ops.render.render(write_still=True)
cam=bpy.data.objects.new('CAM_WEATHERING_Detail',bpy.data.cameras.new('CAM_WEATHERING_Detail'))
scene.collection.objects.link(cam); cam.data.type='ORTHO'; cam.data.ortho_scale=88
cam.location=(70,-55,35); target=Vector((0,-26,6))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=cam; scene.render.filepath=str(OUT/'f124_weathered_detail.png'); bpy.ops.render.render(write_still=True)
scene.camera=hero; scene.render.filepath=str(OUT/'f124_weathered_hero.png')
bpy.data.libraries.write(str(OUT/'f124_hessen_animated_weathered.blend'),{scene},fake_user=True)
result={'hero':str(OUT/'f124_weathered_hero.png'),'detail':str(OUT/'f124_weathered_detail.png')}
