"""Non-destructive animated copy of the F124, executed through Blender MCP."""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT=ROOT/'assets/blender/f124/animation'
data=json.loads((OUT/'animation-data.json').read_text())
manifest=json.loads((OUT.parent/'component-bounds-blender.json').read_text())
G=lambda p:Vector((p[0],-p[2],p[1]))
source=max((s for s in bpy.data.scenes if s.name.startswith('F124_Hessen_Asset')),
           key=lambda s:(s.get('f124_asset_revision',1),s.name))
source_signature={o.name:(len(o.data.vertices),len(o.data.polygons)) for o in source.objects if o.type=='MESH'}
scene=source.copy(); scene.name='F124_Animation_Demo'
scene['animation_source']=source.name
scene['sector_source']=data['source']
scene['animation_note']='20 s flyby; game yaw sectors; presentation-only elevation and slew limits.'
for c in list(scene.collection.children): scene.collection.children.unlink(c)
mapping={}; collections={}
for c in source.collection.children:
    if c.name.startswith('F124_TEMPLATE'): continue
    clone=bpy.data.collections.new('ANIM_'+c.name); scene.collection.children.link(clone)
    collections[c.name.split('.')[0]]=clone
    for o in c.objects:
        n=o.copy()
        if o.data: n.data=o.data.copy()
        clone.objects.link(n); mapping[o]=n
for o,n in mapping.items():
    if o.parent: n.parent=mapping.get(o.parent)
scene.camera=mapping[source.camera]
scene.world=source.world.copy()
bpy.context.window.scene=scene
rig=bpy.data.collections.new('ANIM_RIG_AND_AIRCRAFT'); scene.collection.children.link(rig)

def empty(name,pos):
    o=bpy.data.objects.new(name,None); rig.objects.link(o); o.location=G(pos)
    o.empty_display_type='ARROWS'; o.empty_display_size=2; return o

def parent_keep(o,p):
    bpy.context.view_layer.update()
    world=o.matrix_world.copy(); o.parent=p; o.matrix_world=world

def components(bm):
    unseen=set(bm.verts)
    while unseen:
        seed=unseen.pop(); group={seed}; todo=[seed]
        while todo:
            v=todo.pop()
            for e in v.link_edges:
                w=e.other_vert(v)
                if w in unseen: unseen.remove(w); group.add(w); todo.append(w)
        yield group

# Extract the ten original connected SMART-L components with UVs intact.
# Match component bounds recorded BEFORE batching, not a crude height cut.
expected={k:v for k,v in manifest.items() if k.startswith('MESH_SMARTL_array')}
hull=collections['F124_HULL']
painted=next(o for o in hull.objects if o.type=='MESH' and 'PaintedSteel' in o.name)
bm=bmesh.new(); bm.from_mesh(painted.data); bm.verts.ensure_lookup_table()
selected=set(); matched=[]
for group in components(bm):
    pts=[painted.matrix_world@v.co for v in group]
    lo=[min(v[i] for v in pts) for i in range(3)]
    hi=[max(v[i] for v in pts) for i in range(3)]
    for name,bounds in expected.items():
        # The beveled array's transformed local bounding box exceeds the actual
        # vertex extrema by up to 5.6 cm. Rib boxes match exactly.
        tolerance=.06 if name=='MESH_SMARTL_array' else .0002
        if max(abs(lo[i]-bounds['min'][i]) for i in range(3))<tolerance and max(abs(hi[i]-bounds['max'][i]) for i in range(3))<tolerance:
            selected.update(v.index for v in group); matched.append(name); break
assert len(matched)==10,(len(matched),matched)
radar_mesh=painted.data.copy()
rb=bmesh.new(); rb.from_mesh(radar_mesh); rb.verts.ensure_lookup_table()
bmesh.ops.delete(rb,geom=[v for v in rb.verts if v.index not in selected],context='VERTS')
rb.to_mesh(radar_mesh); rb.free()
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in selected],context='VERTS')
bm.to_mesh(painted.data); bm.free()
panel=bpy.data.objects.new('SMARTL_ROTATING_ARRAY',radar_mesh); rig.objects.link(panel)
panel.matrix_world=painted.matrix_world.copy()
radar=empty('CTRL_SMARTL_20rpm',(0,20.5,-25.5)); parent_keep(panel,radar)

# Source preview bases share the template's joined mesh, while their other pieces
# remain separate. Retain only the base island to avoid a second static weapon.
weapons=collections['F124_MOUNTS_PREVIEW']
controllers={}
for m in data['mounts']:
    ident=m['id']; is_gun=ident=='main_fwd'
    p=m['position']; pos=(p['x'],p['y'],p['z'])
    prefix='REF_MESH_76mm' if is_gun else 'REF_MESH_RAM'
    parts=[o for o in weapons.objects if o.name.startswith(prefix) and (o.location-G(pos)).length<.01]
    assert len(parts)==(4 if is_gun else 25),(ident,len(parts))
    base=next(o for o in parts if '_base' in o.name)
    bb=bmesh.new(); bb.from_mesh(base.data)
    keep=set()
    for group in components(bb):
        if max(v.co.z for v in group)<(.551 if is_gun else .801) and min(v.co.z for v in group)<.01: keep.update(group)
    assert keep
    bmesh.ops.delete(bb,geom=[v for v in bb.verts if v not in keep],context='VERTS')
    bb.to_mesh(base.data); bb.free()
    sector_root=empty('SECTOR_'+ident,pos); sector_root.rotation_euler.z=m['center']
    train=empty('CTRL_'+ident+'_YAW',(0,0,0)); train.parent=sector_root
    for prop,val in [('game_slot',m['gameSlot']),('sector_center_rad',m['center']),('sector_half_rad',m['half'])]: train[prop]=val
    constraint=train.constraints.new('LIMIT_ROTATION'); constraint.name='Game sector — hard stop'
    constraint.owner_space='LOCAL'; constraint.use_limit_z=True
    constraint.min_z=-m['half']; constraint.max_z=m['half']
    # Local zero is forward; the aft neutral heading comes from the train once.
    pivot=(0,1.55,.8) if is_gun else (0,1.9,.15)
    elev=empty('CTRL_'+ident+'_ELEVATION',(0,0,0)); elev.parent=train; elev.location=G(pivot)
    bpy.context.view_layer.update()
    for o in parts:
        if o==base: continue
        pitching=('_barrel' in o.name or '_muzzle' in o.name) if is_gun else ('_launcher' in o.name or '_cell' in o.name)
        parent_keep(o,elev if pitching else train)
    intrinsic=math.atan2(.17,4.3) if is_gun else 0
    pc=elev.constraints.new('LIMIT_ROTATION'); pc.name='Demo-only elevation stop'
    pc.owner_space='LOCAL'; pc.use_limit_x=True
    pc.min_x=-m['pitchMax']+intrinsic; pc.max_x=-m['pitchMin']+intrinsic
    controllers[ident]=(train,elev,intrinsic)

def material(name,color,metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.48
    return m

orange=material('AIRCRAFT_Orange',(.9,.19,.025))
dark=material('AIRCRAFT_Canopy',(.025,.07,.105),.35)
plane=empty('CTRL_AIRCRAFT_FLYBY',(0,0,0))
def aircraft_mesh(name,verts,faces,mat):
    me=bpy.data.meshes.new(name); me.from_pydata([G(v) for v in verts],[],faces); me.update()
    ob=bpy.data.objects.new(name,me); rig.objects.link(ob); ob.parent=plane; me.materials.append(mat)
    bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free()
    return ob
aircraft_mesh('AIRCRAFT_fuselage',[(0,0,8),(-.85,-.45,2),(.85,-.45,2),(0,.95,2),(-.55,-.35,-6),(.55,-.35,-6),(0,.5,-6)],
              [(0,2,1),(0,3,2),(0,1,3),(1,2,5,4),(1,4,6,3),(3,6,5,2),(4,5,6)],orange)
aircraft_mesh('AIRCRAFT_swept_wings',[(-.6,0,2),(-7.8,0,-2.6),(-7.8,.15,-3.5),(-.5,.25,-1.6),
              (.6,0,2),(7.8,0,-2.6),(7.8,.15,-3.5),(.5,.25,-1.6)],[(0,1,2,3),(4,7,6,5)],orange)
aircraft_mesh('AIRCRAFT_tail',[(-.4,.1,-3.6),(-3,.1,-5.6),(-.4,.1,-5.7),(.4,.1,-3.6),(3,.1,-5.6),(.4,.1,-5.7),
              (0,.4,-3.3),(0,3,-5.6),(0,.4,-5.9)],[(0,1,2),(3,5,4),(6,7,8)],orange)
aircraft_mesh('AIRCRAFT_canopy',[(-.48,.5,4.4),(.48,.5,4.4),(0,1.1,2),(-.5,.65,.5),(.5,.65,.5)],
              [(0,1,2),(0,2,3),(1,4,2),(2,4,3)],dark)

scene.render.fps=data['fps']; scene.frame_start=1; scene.frame_end=len(data['frames'])
animated=[radar,plane]+[o for pair in controllers.values() for o in pair[:2]]
for row in data['frames']:
    f=row['frame']; pos=row['aircraft']
    plane.location=G((pos['x'],pos['y'],pos['z']))
    plane.rotation_euler=(-row['aircraftPitch'],0,row['aircraftYaw'])
    plane.keyframe_insert('location',frame=f); plane.keyframe_insert('rotation_euler',frame=f)
    radar.rotation_euler.z=row['radarYaw']; radar.keyframe_insert('rotation_euler',index=2,frame=f)
    for target in row['targets']:
        train,elev,intrinsic=controllers[target['id']]
        train.rotation_euler.z=target['yaw']-train['sector_center_rad']; elev.rotation_euler.x=-target['pitch']+intrinsic
        train.keyframe_insert('rotation_euler',index=2,frame=f)
        elev.keyframe_insert('rotation_euler',index=0,frame=f)
for o in animated:
    action=o.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points: key.interpolation='LINEAR'

def camera(name,pos,target,scale):
    ob=bpy.data.objects.new(name,bpy.data.cameras.new(name)); rig.objects.link(ob)
    ob.location=G(pos); ob.rotation_euler=(G(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    ob.data.type='ORTHO'; ob.data.ortho_scale=scale; ob.data.lens=45; return ob
hero=scene.camera; hero.name='CAM_01_Ship_and_flyby'; hero.data.ortho_scale=205
hero.location=G((150,155,175)); hero.rotation_euler=(G((0,18,0))-hero.location).to_track_quat('-Z','Y').to_euler()
camera('CAM_02_Entire_flight',(210,300,290),(0,20,0),370)
camera('CAM_03_Gun_and_forward_RAM',(40,45,83),(0,11,45),48)
camera('CAM_04_Aft_RAM_and_SMARTL',(45,45,-66),(0,16,-30),60)
for name,f in [('START — approach / forward hard stops',1),('CROSSING — tracking',241),('DEPARTURE — aft hard stop',410)]:
    scene.timeline_markers.new(name,frame=f)

# Evaluate the actual constrained rig at frames AND half-frames for independent TS checks.
samples=[]
for k in range((scene.frame_end-1)*2+1):
    f=1+k/2; scene.frame_set(int(f),subframe=f%1)
    dg=bpy.context.evaluated_depsgraph_get(); row={'frame':f,'mounts':{}}
    for ident,(train,elev,intrinsic) in controllers.items():
        t=train.evaluated_get(dg); e=elev.evaluated_get(dg)
        direction=t.matrix_world.to_3x3()@Vector((0,-1,0))
        local=t.matrix_world.inverted()@e.matrix_world
        row['mounts'][ident]={'yaw':math.atan2(direction.x,-direction.y),'pitch':-local.to_euler().x+intrinsic}
    samples.append(row)
(OUT/'evaluated-transforms.json').write_text(json.dumps({'samples':samples},indent=2))
assert source_signature=={o.name:(len(o.data.vertices),len(o.data.polygons)) for o in source.objects if o.type=='MESH'}
scene.frame_set(210); scene.camera=hero
scene.render.resolution_x=1440; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(OUT/'animation-preview.png')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
plane.select_set(True); bpy.context.view_layer.objects.active=plane
bpy.data.libraries.write(str(OUT/'f124_hessen_animated.blend'),{scene},fake_user=True)
result={'scene':scene.name,'frames':scene.frame_end,'seconds':data['duration'],'radar_components':len(matched),
        'evaluated_samples':len(samples),'saved':str(OUT/'f124_hessen_animated.blend'),'source_unchanged':True}
