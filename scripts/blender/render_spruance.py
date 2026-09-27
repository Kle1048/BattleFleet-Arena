import bpy,math
from pathlib import Path
from mathutils import Vector
OUT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\spruance')
s=bpy.context.scene;assert s.name.startswith('Spruance_DD963_Asset')
hero=s.camera;sea=next(o for o in s.objects if o.name.startswith('PREVIEW_sea'))
s.render.resolution_x=1600;s.render.resolution_y=1000;s.render.film_transparent=False
s.render.filepath=str(OUT/'spruance_hero.png');bpy.ops.render.render(write_still=True)
sea.hide_render=True;s.render.film_transparent=True
side=next(o for o in s.objects if o.name.startswith('Spruance_Side'))
side.location=(-200,0,13);side.rotation_euler=(Vector((0,0,13))-side.location).to_track_quat('-Z','Y').to_euler();side.data.ortho_scale=190
s.camera=side;s.render.resolution_x=1800;s.render.resolution_y=600;s.render.filepath=str(OUT/'spruance_side.png');bpy.ops.render.render(write_still=True)
top=next(o for o in s.objects if o.name.startswith('Spruance_Top'))
top.location=(0,0,200);top.rotation_euler=(0,0,-math.pi/2);top.data.ortho_scale=190
s.camera=top;s.render.resolution_y=340;s.render.filepath=str(OUT/'spruance_top.png');bpy.ops.render.render(write_still=True)
sea.hide_render=False;s.render.film_transparent=False;s.camera=hero;s.render.resolution_x=1600;s.render.resolution_y=1000
s.render.filepath=str(OUT/'spruance_hero.png')
result={'rendered':['spruance_hero.png','spruance_side.png','spruance_top.png']}
