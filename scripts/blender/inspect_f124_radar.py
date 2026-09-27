import bpy,bmesh,json
from pathlib import Path
o=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'HULL' in o.name and 'PaintedSteel' in o.name)
bm=bmesh.new(); bm.from_mesh(o.data)
unseen=set(bm.verts); rows=[]
while unseen:
    seed=unseen.pop(); group={seed}; todo=[seed]
    while todo:
        v=todo.pop()
        for e in v.link_edges:
            w=e.other_vert(v)
            if w in unseen: unseen.remove(w); group.add(w); todo.append(w)
    pts=[o.matrix_world@v.co for v in group]
    lo=[min(v[i] for v in pts) for i in range(3)]; hi=[max(v[i] for v in pts) for i in range(3)]
    if lo[1]>20 and hi[1]<31 and lo[2]>19: rows.append({'verts':len(group),'min':lo,'max':hi})
result={'candidates':rows,'expected':json.loads(Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\f124\component-bounds-blender.json').read_text())['MESH_SMARTL_array']}
bm.free()
