import bpy,math
from pathlib import Path
from mathutils import Vector
OUT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\gepard')
s=bpy.context.scene; assert s.name.startswith('Gepard_P6122_Asset')
hero=s.camera; sea=next(o for o in s.objects if o.name.startswith('PREVIEW_sea'))
s.render.resolution_x=1500;s.render.resolution_y=950;s.render.film_transparent=False
s.render.filepath=str(OUT/'gepard_hero.png');bpy.ops.render.render(write_still=True)
sea.hide_render=True;s.render.film_transparent=True
side=next(o for o in s.objects if o.name.startswith('Gepard_Side'))
side.location=(-100,0,7);side.rotation_euler=(Vector((0,0,7))-side.location).to_track_quat('-Z','Y').to_euler();side.data.ortho_scale=64
s.camera=side;s.render.resolution_x=1800;s.render.resolution_y=650
s.render.filepath=str(OUT/'gepard_side.png');bpy.ops.render.render(write_still=True)
top=next(o for o in s.objects if o.name.startswith('Gepard_Top'))
top.location=(0,0,100);top.rotation_euler=(0,0,-math.pi/2);top.data.ortho_scale=64
s.camera=top;s.render.resolution_y=360
s.render.filepath=str(OUT/'gepard_top.png');bpy.ops.render.render(write_still=True)
sea.hide_render=False;s.render.film_transparent=False;s.camera=hero
s.render.resolution_x=1500;s.render.resolution_y=950;s.render.filepath=str(OUT/'gepard_hero.png')
bpy.data.libraries.write(str(OUT/'gepard_p6122.blend'),{s},fake_user=True)
result={'images':['gepard_hero.png','gepard_side.png','gepard_top.png']}
