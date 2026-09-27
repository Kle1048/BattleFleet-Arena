import bpy
from mathutils import Vector
s=bpy.context.scene
result={'collections':[c.name for c in s.collection.children],
 'objects':[{'name':o.name,'type':o.type,'location':list(o.location),
 'bounds':[[min((o.matrix_world@Vector(v))[i] for v in o.bound_box) for i in range(3)],
 [max((o.matrix_world@Vector(v))[i] for v in o.bound_box) for i in range(3)]]}
 for o in s.objects if o.name.startswith(('REF_MESH_76mm','REF_MESH_RAM','MESH_F124_HULL'))]}
