"""Rebuild the four APAR disks as complete components using the corrected helper."""
import bpy
import bmesh
import math
from pathlib import Path
from mathutils import Vector

ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
scene=next(s for s in bpy.data.scenes if s.name.startswith('F124_Hessen_Asset'))
bpy.context.window.scene=scene
current=bpy.data.collections['F124_HULL']
main=next(o for o in current.objects if o.type=='MESH' and o.data.materials[0].name.startswith('F124_PaintedSteel'))
paint=main.data.materials[0]; me=main.data
indices=set()
for poly in me.polygons:
    if all(.75<me.uv_layers.active.data[k].uv.x<1 and
           .75<me.uv_layers.active.data[k].uv.y<1 for k in poly.loop_indices):
        indices.update(poly.vertices)
bm=bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.verts[i] for i in indices],context='VERTS')
bm.to_mesh(me); bm.free(); me.update()
G=lambda p: Vector((p[0],-p[2],p[1]))
source=(ROOT/'scripts/blender/create_f124_asset.py').read_text(encoding='utf-8')
exec(source[source.index('def mesh('):source.index('# F124 sheer line')])
for sign in (-1,1):
    dish('MESH_APAR_side_array',(sign*2.83,26.3,15),1.55,3,axis=(sign,.18,0))
    dish('MESH_APAR_front_array',(0,26.3,15+sign*2.83),1.55,3,axis=(0,.18,sign))
bpy.ops.object.select_all(action='DESELECT')
for ob in current.objects:
    if ob.type=='MESH' and ob.data.materials[0]==paint: ob.select_set(True)
bpy.context.view_layer.objects.active=main
bpy.ops.object.join()
result={'status':'ok','rebuilt_array_vertices':len(indices)}
