import bpy
from pathlib import Path
out=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\f124\animation')
scene=bpy.context.scene
assert scene.name.startswith('F124_Animation_Demo')
hero=scene.camera
shots=[('animation-preview.png',hero,210),
       ('forward-tracking.png',next(o for o in scene.objects if o.name.startswith('CAM_03')),310),
       ('aft-limit.png',next(o for o in scene.objects if o.name.startswith('CAM_04')),410)]
for name,cam,frame in shots:
    scene.camera=cam; scene.frame_set(frame); scene.render.filepath=str(out/name)
    bpy.ops.render.render(write_still=True)
scene.camera=hero; scene.frame_set(210); scene.render.filepath=str(out/'animation-preview.png')
result={'images':[str(out/s[0]) for s in shots]}
