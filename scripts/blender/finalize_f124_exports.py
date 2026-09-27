"""Re-export current F124 scene with strict scene filtering and canonical markers."""
import bpy
from pathlib import Path
from mathutils import Matrix

ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT=ROOT/'assets/blender/f124'; PUB=ROOT/'client/public/assets'; PREPARE=10000/143
scene=max((s for s in bpy.data.scenes if s.name.startswith('F124_Hessen_Asset')),
          key=lambda s:(s.get('f124_asset_revision',1),s.name))
bpy.context.window.scene=scene
source=(ROOT/'scripts/blender/create_f124_asset.py').read_text(encoding='utf-8')
part=source[source.index('def export(path,objects):'):source.index("export(PUB/'ships/hull_f124.glb'")]
exec(part)
def scene_collection(prefix):
    return next(c for c in scene.collection.children if c.name.startswith(prefix))
hull=scene_collection('F124_HULL'); helpers=scene_collection('F124_SOCKETS')
for o in helpers.objects: o['export_name']=o.name.split('.')[0]
export(PUB/'ships/hull_f124.glb',list(hull.objects)+list(helpers.objects))
for key in ('76mm','ram','harpoon'):
    c=scene_collection('F124_TEMPLATE_'+key); c.hide_viewport=False; c.hide_render=False
    obs=list(c.objects)
    for o in obs:
        if o.type=='EMPTY': o['export_name']='bf_muzzle'
    export(OUT/('mount_f124_'+key+'_metric.glb'),obs)
    saved={o:o.matrix_world.copy() for o in obs}
    for o in obs: o.matrix_world=Matrix.Scale(PREPARE,4) @ o.matrix_world
    export(PUB/('systems/mount_f124_'+key+'.glb'),obs)
    for o,m in saved.items(): o.matrix_world=m
    c.hide_viewport=True; c.hide_render=True
bpy.ops.object.select_all(action='DESELECT')
bpy.data.libraries.write(str(OUT/'f124_hessen.blend'),{scene},fake_user=True)
result={'status':'ok','corrected_exports':7}
