import bpy
from pathlib import Path
from mathutils import Vector

out=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\f124')
scene=next(s for s in bpy.data.scenes if s.name.startswith('F124_Hessen_Asset'))
bpy.context.window.scene=scene
scene.render.filepath=str(out/'f124_hero.png')
bpy.ops.render.render(write_still=True)
result={'status':'ok','preview':scene.render.filepath}
