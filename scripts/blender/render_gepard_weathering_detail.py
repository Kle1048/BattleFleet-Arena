import bpy
from pathlib import Path
from mathutils import Vector
out=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\gepard')
s=bpy.context.scene;assert s.name.startswith('Gepard_P6122_Asset') and s.get('weathering')
hero=s.camera
c=bpy.data.objects.new('Gepard_WeatheringDetail',bpy.data.cameras.new('Gepard_WeatheringDetail'))
s.collection.objects.link(c);c.location=(34,-25,14)
c.rotation_euler=(Vector((0,-14,3.7))-c.location).to_track_quat('-Z','Y').to_euler()
c.data.type='ORTHO';c.data.ortho_scale=24
s.camera=c;s.render.resolution_x=1500;s.render.resolution_y=950
s.render.filepath=str(out/'gepard_weathering_detail.png');bpy.ops.render.render(write_still=True)
s.camera=hero;s.render.filepath=str(out/'gepard_hero.png')
result={'detail':str(out/'gepard_weathering_detail.png')}
