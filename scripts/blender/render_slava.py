import bpy,math,json
from pathlib import Path
OUT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\slava')
s=bpy.context.scene;assert s.name.startswith('Slava_Reference_Asset')
hero=next(o for o in s.objects if o.name.startswith('Slava_Hero'));sea=next(o for o in s.objects if o.name.startswith('PREVIEW_sea'))
for name,width,height in [('Hero',1800,1100),('Side',2000,640),('Top',2000,420),('Front',800,900)]:
    camera=next(o for o in s.objects if o.name.startswith('Slava_'+name))
    if name=='Top':camera.rotation_euler=(0,0,-math.pi/2)
    sea.hide_render=name!='Hero';s.render.film_transparent=name!='Hero'
    s.camera=camera;s.render.resolution_x=width;s.render.resolution_y=height;s.render.resolution_percentage=100
    s.render.filepath=str(OUT/('slava_'+name.lower()+'.png'));bpy.ops.render.render(write_still=True)
s.camera=hero;sea.hide_render=False;s.render.film_transparent=False;s.render.resolution_x=1800;s.render.resolution_y=1100
s.render.filepath=str(OUT/'slava_hero.png')
result={'rendered':['hero','side','top','front']}
