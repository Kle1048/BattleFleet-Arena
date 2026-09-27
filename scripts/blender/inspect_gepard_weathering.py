import bpy,json
from pathlib import Path
s=bpy.context.scene
result={'scene':s.name,'meshes':[{'name':o.name,'uvs':[(u.name,u.active_render) for u in o.data.uv_layers],
 'uv_sample':[list(v.uv) for v in o.data.uv_layers.active.data[:12]],'materials':[m.name for m in o.data.materials]}
 for o in s.objects if o.type=='MESH' and o.name.startswith('MESH_GEPARD')]}
