import bpy,ast
from pathlib import Path
from mathutils import Vector
root=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena'); out=root/'assets/blender/f124/weathered'
tree=ast.parse((root/'scripts/blender/create_f124_asset.py').read_text(encoding='utf-8'))
stations=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='stations' for t in n.targets))
def height(z):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=z<=b[0]: return a[2]+(b[2]-a[2])*(z-a[0])/(b[0]-a[0])
    raise ValueError(z)
s=bpy.context.scene; assert s.name=='F124_Animation_Weathered'
hull=next(o for o in s.objects if o.type=='MESH' and 'HULL' in o.name and 'PaintedSteel' in o.name)
for o in s.objects:
    if not o.name.startswith('RUST_'): continue
    side=1 if 'starboard' in o.name else -1
    zvals=[-v.co.y for v in o.data.vertices]
    oldtop=max(v.co.z for v in o.data.vertices)
    top=min(height(min(zvals)),height(max(zvals)))-.045
    shift=top-oldtop
    for v in o.data.vertices:
        origin=Vector((side*35,v.co.y,v.co.z+shift))
        ok,p,n,index=hull.ray_cast(origin,Vector((-side,0,0)),distance=40)
        assert ok and n.x*side>.25,(o.name,origin)
        v.co=p+n*.014
    for uv in o.data.uv_layers.active.data: uv.uv.y=.04+.9*uv.uv.y
    o.data.update()
hero=s.camera
for prefix,name in [('CAM_WEATHERING_RustCloseup','f124_rust_closeup.png'),('CAM_WEATHERING_Detail','f124_weathered_detail.png')]:
    s.camera=next(o for o in s.objects if o.name.startswith(prefix)); s.render.filepath=str(out/name); bpy.ops.render.render(write_still=True)
s.camera=hero; s.render.filepath=str(out/'f124_weathered_hero.png'); bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(str(out/'f124_hessen_animated_weathered.blend'),{s},fake_user=True)
result={'origins':'aligned to actual hull deck sheer','saved':True}
