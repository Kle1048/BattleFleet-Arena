import bpy
result={'active':bpy.context.scene.name,'animation_scenes':[s.name for s in bpy.data.scenes if 'Animation' in s.name],
        'materials':[m.name for m in bpy.data.materials if m.name.startswith('F124_')][-15:]}
