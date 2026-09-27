"""Build an F124 visual prototype in a NEW scene via Blender MCP.

Authoring helper coordinates: +X starboard, +Y up, +Z bow (metres).
G() converts these to Blender's native Z-up; standard glTF Y-up export reverses it.
Sources: user references, Bundeswehr F124 principal dimensions; detail is stylized.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT=ROOT/'assets/blender/f124'
TEX=OUT/'textures'
PUB=ROOT/'client/public/assets'
LENGTH=143.0
PREPARE=10000.0/LENGTH
G=lambda p: Vector((p[0],-p[2],p[1]))
scene=bpy.data.scenes.new('F124_Hessen_Asset')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1

def collection(name):
    c=bpy.data.collections.new(name); scene.collection.children.link(c); return c

hull=collection('F124_HULL')
helpers=collection('F124_SOCKETS')
weapons=collection('F124_MOUNTS_PREVIEW')
studio=collection('F124_PRESENTATION')
current=hull

def img(name):
    i=bpy.data.images.load(str(TEX/name),check_existing=True); i.pack(); return i

atlas=img('f124_surface_basecolor.png'); rough=img('f124_surface_roughness.png')
rough.colorspace_settings.name='Non-Color'

def material(name,image,metal=.12,roughness=.68,alpha=False,roughmap=None):
    m=bpy.data.materials.new(name); m.use_nodes=True
    nodes=m.node_tree.nodes; links=m.node_tree.links
    p=nodes.get('Principled BSDF'); p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=roughness
    t=nodes.new('ShaderNodeTexImage'); t.image=image
    links.new(t.outputs['Color'],p.inputs['Base Color'])
    if roughmap:
        r=nodes.new('ShaderNodeTexImage'); r.image=roughmap
        links.new(r.outputs['Color'],p.inputs['Roughness'])
    if alpha:
        links.new(t.outputs['Alpha'],p.inputs['Alpha'])
        m.surface_render_method='DITHERED'
    return m

paint=material('F124_PaintedSteel_UV',atlas,roughmap=rough)
flightmat=material('F124_FlightDeck_UV',img('f124_flightdeck_basecolor.png'),metal=.03)
numbermat=material('F124_Pennant_Alpha',img('f124_pennant.png'),alpha=True)

def mesh(name,verts,faces,tile=0,mat=None,uv=None,col=None,bevel=0):
    me=bpy.data.meshes.new(name); me.from_pydata([G(v) for v in verts],[],faces); me.update()
    ob=bpy.data.objects.new(name,me); (col or current).objects.link(ob)
    bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free()
    me.materials.append(mat or paint)
    layer=me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        points=[me.vertices[me.loops[k].vertex_index].co for k in poly.loop_indices]
        axis=max(range(3),key=lambda a:abs(poly.normal[a])); axes=[a for a in range(3) if a!=axis]
        lo=[min(v[a] for v in points) for a in axes]; hi=[max(v[a] for v in points) for a in axes]
        for k in poly.loop_indices:
            vi=me.loops[k].vertex_index; p=me.vertices[vi].co
            if uv is not None: u,v=uv[vi]
            else:
                u=(p[axes[0]]-lo[0])/max(hi[0]-lo[0],1e-8)
                v=(p[axes[1]]-lo[1])/max(hi[1]-lo[1],1e-8)
                u=((tile%4)+.045+u*.91)/4
                v=(3-tile//4+.045+v*.91)/4
            layer.data[k].uv=(u,v)
    if bevel:
        mod=ob.modifiers.new('Small_edge_bevel','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.context.view_layer.objects.active=ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob

def box(name,center,size,tile=0,bevel=0,mat=None,col=None):
    x,y,z=center; a,b,c=(v/2 for v in size)
    vs=[(x+sx*a,y+sy*b,z+sz*c) for sx,sy,sz in
        [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    return mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],tile,mat=mat,col=col,bevel=bevel)

def taper(name,x,z,y0,y1,w0,l0,w1,l1,tile=0):
    vs=[]
    for y,w,l in [(y0,w0,l0),(y1,w1,l1)]:
        vs += [(x-w/2,y,z-l/2),(x+w/2,y,z-l/2),(x+w/2,y,z+l/2),(x-w/2,y,z+l/2)]
    return mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],tile)

def beam(name,a,b,r,tile=0,n=8,r2=None):
    a=Vector(a); b=Vector(b); axis=(b-a).normalized(); side=axis.cross(Vector((0,1,0)))
    if side.length<.01: side=axis.cross(Vector((1,0,0)))
    side.normalize(); other=axis.cross(side).normalized()
    vs=[]
    for c,rad in [(a,r),(b,r if r2 is None else r2)]:
        vs += [c+rad*(math.cos(i*math.tau/n)*side+math.sin(i*math.tau/n)*other) for i in range(n)]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,tile)

def dish(name,center,r,tile=1,axis=(0,1,0)):
    c=Vector(center); a=Vector(axis)
    return beam(name,c-a*.13,c+a*.13,r,tile,n=16)

def sphere(name,c,r,tile=1):
    vs=[]; n=12; rings=6
    for j in range(rings+1):
        t=math.pi*j/rings
        for i in range(n):
            p=math.tau*i/n; vs.append((c[0]+r*math.sin(t)*math.cos(p),c[1]+r*math.cos(t),c[2]+r*math.sin(t)*math.sin(p)))
    fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(rings) for i in range(n)]
    return mesh(name,vs,fs,tile)

def quad(name,verts,tile=0,mat=None,uv=None):
    return mesh(name,verts,[(0,1,2,3)],tile,mat,uv=uv)

def empty(name,p,yaw=0,col=None):
    o=bpy.data.objects.new(name,None); (col or helpers).objects.link(o); o.location=G(p)
    o['export_name']=name
    o.rotation_euler.z=yaw; o.empty_display_size=1; o.empty_display_type='ARROWS'; return o

# F124 sheer line, flared bow and tapered stern. These stations also define the deck.
stations=[(-71.5,6.6,5.1),(-64,7.8,5.2),(-47,8.6,5.35),(-28,8.7,5.55),
          (-6,8.7,5.8),(17,8.5,6.1),(35,7.7,6.45),(48,6.0,6.8),(60,3.6,7.2),(68,1.45,7.6),(71.5,.06,7.9)]

def interp(z,index):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=z<=b[0]: return a[index]+(b[index]-a[index])*(z-a[0])/(b[0]-a[0])
    return stations[0 if z<0 else -1][index]

def shell(name,layer0,layer1,tile):
    verts=[]
    for z,w,h in stations:
        for layer in (layer0,layer1):
            scale,yy=layer(w,h); verts.extend([(-w*scale,yy,z),(w*scale,yy,z)])
    fs=[]
    for i in range(len(stations)-1):
        k=i*4; q=k+4; fs.extend([(k,q,q+2,k+2),(k+1,k+3,q+3,q+1)])
    fs.extend([(0,2,3,1),(len(verts)-4,len(verts)-3,len(verts)-1,len(verts)-2)])
    return mesh(name,verts,fs,tile)

shell('MESH_underwater',lambda w,h:(.58,-4.5),lambda w,h:(.91,-.5),7)
shell('MESH_bootstripe',lambda w,h:(.91,-.5),lambda w,h:(.925,.4),5)
shell('MESH_hull_sides',lambda w,h:(.925,.4),lambda w,h:(1,h),0)
verts=[(-w,h,z) for z,w,h in stations]+[(w,h,z) for z,w,h in reversed(stations)]
mesh('MESH_deck_contour',verts,[tuple(range(len(verts)))],2)
mesh('MESH_keel',[(x,-4.5,z) for z,w,h in stations for x in (-w*.58,w*.58)],
     [(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(stations)-1)],7)

# Long slab-sided aft house / helicopter hangar; exposed RHIB bays on both sides.
taper('MESH_hangar',0,-29,5.55,11.0,15.7,29,14.7,28,0)
taper('MESH_mid_house',0,4,5.8,10.7,15.9,24,14.6,22.5,0)
taper('MESH_bridge_lower',0,23,6.2,12.6,14.6,15,12.6,13,0)
taper('MESH_bridge_glazing_band',0,24,12.6,14.4,13.4,11.5,12.3,10.3,4)
taper('MESH_bridge_roof',0,24,14.4,14.9,14.4,12.5,14.1,12.2,1)
for i in range(-5,6):
    box('MESH_bridge_mullion',(i*1.12,13.45,29.45),(.11,1.65,.20),0)
for sign in (-1,1):
    for z in (20,22,24,26,28): box('MESH_bridge_side_mullion',(sign*6.4,13.45,z),(.16,1.6,.13),0)
    for z in (-27,-22,-17,-12):
        box('MESH_boat_bay_dark',(sign*7.84,8.5,z),(.06,3.6,4.6),5)
    for z in (-29.4,-19.5,-9.7): box('MESH_boat_bay_pillar',(sign*7.94,8.4,z),(.26,4.0,.4),0)
    box('MESH_boat_bay_roof',(sign*7.5,10.75,-19.5),(1.4,.45,21),0)
    # RHIB hull with dark collar and center console, at the visible bay mouth.
    taper('MESH_RHIB_collar',sign*7.35,-21,7.0,7.65,1.7,7.4,1.6,6.8,5)
    taper('MESH_RHIB_body',sign*7.35,-21,7.65,7.9,1.3,6.3,1.1,5.8,6)
    box('MESH_RHIB_console',(sign*7.35,8.4,-20),(.85,1.0,1.1),1)
    for z in (-24,-18):
        beam('MESH_davit',(sign*6.6,8,z),(sign*6.6,10.2,z),.14,6)
        beam('MESH_davit_arm',(sign*6.6,10.2,z),(sign*8.05,10.2,z),.14,6)
    for z in (-35,4,9,18):
        box('MESH_access_door',(sign*(7.85 if z<10 else 7.0),8.2,z),(.08,1.85,.9),11)
    # Hull identification lies on the flared side, clear of the sea.
    z0,z1=16,29; y0,y1=1.6,4.5
    side=[]
    for y,z in [(y0,z0),(y0,z1),(y1,z1),(y1,z0)]:
        w=interp(z,1); h=interp(z,2); xx=w*(.925+.075*(y-.4)/(h-.4))+.025
        side.append((sign*xx,y,z))
    uvs=[(0,0),(1,0),(1,1),(0,1)] if sign<0 else [(1,0),(0,0),(0,1),(1,1)]
    quad('MESH_F221_pennant',side,mat=numbermat,uv=uvs)

# APAR integrated forward mast: stacked, faceted and tapered, joined to bridge roof.
taper('MESH_APAR_lower',0,15,10.7,20.2,7.2,8.3,4.5,5.2,0)
taper('MESH_APAR_shoulder',0,15,20.2,22,4.5,5.2,7.0,7.0,0)
taper('MESH_APAR_radar_housing',0,15,22,29.5,7,7,4.4,4.4,1)
for sign in (-1,1):
    # Four fixed array faces, contrasting circular antenna panels.
    c=(sign*2.83,26.3,15); dish('MESH_APAR_side_array',c,1.55,3,axis=(sign,.18,0))
    c=(0,26.3,15+sign*2.83); dish('MESH_APAR_front_array',c,1.55,3,axis=(0,.18,sign))
taper('MESH_APAR_crown',0,15,29.5,31,3.8,3.8,2.6,2.6,0)
beam('MESH_mainmast',(0,31,15),(0,37,15),.22,0,r2=.08)
box('MESH_mast_crossbar',(0,32.7,15),(6.6,.18,.24),6)
for x in (-2.9,2.9): beam('MESH_antenna',(x,32.7,15),(x,34.7,15),.06,5,n=6)
sphere('MESH_mast_tip',(0,36.6,15),.30,1)
for x in (-4.9,4.9):
    beam('MESH_satcom_pole',(x,11,10),(x,14.8,10),.15,0)
    sphere('MESH_satcom_radome',(x,15.0,10),.9,1)

# Funnel and SMART-L aft radar, separated in silhouette as in the references.
taper('MESH_funnel',0,-6,10.7,19.0,7.4,7.5,5.5,6.0,0)
box('MESH_funnel_black_cap',(0,19.1,-6),(5.7,.55,6.1),5)
for x in (-1.5,1.5): box('MESH_exhaust',(x,19.43,-6),(1.7,.15,4.8),15)
taper('MESH_SMARTL_mast',0,-29,11,22.5,6.4,6.4,3.1,3.6,0)
beam('MESH_SMARTL_bearing',(0,22.5,-29),(0,23.6,-29),.9,6,n=12)
radar=box('MESH_SMARTL_array',(0,25.0,-29),(9.0,3.8,.7),5,bevel=.16)
for x in range(-4,5): box('MESH_SMARTL_array_rib',(x,25,-28.61),(.05,3.35,.07),10)
beam('MESH_signal_mast',(0,10.7,-15),(0,24.5,-15),.16,6,n=8,r2=.07)
box('MESH_signal_yard',(0,22.5,-15),(10.2,.17,.2),6)
for x in (-4.6,4.6): beam('MESH_signal_aerial',(x,22.5,-15),(x,24,-15),.035,5,n=6)
for x in (-4.0,4.0):
    sphere('MESH_hangar_radome',(x,12.25,-35),.8,1)
    beam('MESH_hangar_radome_base',(x,11,-35),(x,11.6,-35),.4,0)

# Twin hangar doors, vent louvres and aft flight deck texture.
for x in (-3.7,3.7):
    box('MESH_hangar_door',(x,8.25,-43.56),(6.3,4.5,.10),10)
    for y in (6.3,6.9,7.5,8.1,8.7,9.3,9.9): box('MESH_hangar_door_rib',(x,y,-43.63),(6.15,.055,.055),6)
for sign in (-1,1):
    for z in (-36,0): box('MESH_vent',(sign*7.78,9,z),(.08,1.6,3.0),10)
# Aft deck plane maps the bow end of the texture toward the hangar.
quad('MESH_flightdeck',[(sign*(interp(z,1)-.16),interp(z,2)+.035,z)
     for sign,z in [(-1,-69.8),(1,-69.8),(1,-44.1),(-1,-44.1)]],
     mat=flightmat,uv=[(0,0),(1,0),(1,1),(0,1)])

# 32-cell flush VLS forward of the bridge, raised safety frame.
box('MESH_VLS_frame',(0,6.72,37),(5.7,.45,8.9),6,bevel=.08)
for x in range(4):
    for z in range(8):
        box('MESH_VLS_hatch',((x-1.5)*1.30,6.985,33.25+z*1.02),(1.18,.09,.9),13,bevel=.035)
        box('MESH_VLS_hinge',((x-1.5)*1.30,7.05,33.65+z*1.02),(.62,.07,.10),5)

# Foredeck anchors / capstans, edge railing with sparse low-poly stanchions.
for x in (-2.0,2.0):
    beam('MESH_capstan',(x,7.1,56),(x,7.9,56),.48,6,n=10)
    beam('MESH_anchor_chain',(x,7.33,57),(x*.6,7.62,65),.12,5,n=6)
for sign in (-1,1):
    for z in (-66,-55,-45,43,49,55,61,66):
        w=interp(z,1)-.45; y=interp(z,2)
        beam('MESH_rail_post',(sign*w,y,z),(sign*w,y+1.05,z),.045,1,n=6)
    for za,zb in [(-66,-55),(-55,-45),(43,49),(49,55),(55,61),(61,66)]:
        for dy in (.52,1.03):
            beam('MESH_rail',(sign*(interp(za,1)-.45),interp(za,2)+dy,za),(sign*(interp(zb,1)-.45),interp(zb,2)+dy,zb),.035,1,n=6)
    for z in (-64,-47,46):
        y=interp(z,2); x=sign*(interp(z,1)-1.1)
        box('MESH_bollard_base',(x,y+.06,z),(.85,.12,1.6),6)
        for dz in (-.45,.45): beam('MESH_bollard',(x,y+.12,z+dz),(x,y+.7,z+dz),.20,5,n=8)
beam('MESH_bow_jackstaff',(0,7.9,70),(0,10.9,70),.055,6,n=6)
beam('MESH_stern_flagstaff',(0,5.4,-69),(0,9.5,-69),.065,6,n=6)
for i,tile in enumerate((5,7,9)):
    quad('MESH_naval_flag',[(0,9.4-i*.3,-69),(1.6,9.25-i*.3,-69),(1.6,8.96-i*.3,-69),(0,9.1-i*.3,-69)],tile)

# Separate reusable weapon templates, metres, forward +Z; each has bf_muzzle.
templates={}
def start_template(key):
    global current
    c=collection('F124_TEMPLATE_'+key); templates[key]=c; current=c; return c

start_template('76mm')
beam('MESH_76mm_base',(0,0,0),(0,.55,0),1.5,6,n=20)
taper('MESH_76mm_cupola',0,0,.55,2.25,2.85,2.8,2.1,1.95,1)
beam('MESH_76mm_barrel',(0,1.55,.8),(0,1.72,5.1),.14,6,n=12,r2=.085)
beam('MESH_76mm_muzzle',(0,1.72,5),(0,1.73,5.35),.12,5,n=12)
empty('bf_muzzle',(0,1.73,5.35),col=current)
start_template('ram')
beam('MESH_RAM_base',(0,0,0),(0,.8,0),.95,6,n=16)
for x in (-.9,.9): box('MESH_RAM_yoke',(x,1.3,0),(.24,1.3,1.05),0)
box('MESH_RAM_launcher',(0,1.9,.15),(2.75,2.0,2.6),1,bevel=.16)
# Stylized RAM face with 21 distinct sealed tubes.
for row,count in enumerate((5,6,5,5)):
    for i in range(count):
        x=(i-(count-1)/2)*.40; y=1.25+row*.43
        beam('MESH_RAM_cell',(x,y,1.47),(x,y,1.52),.16,5,n=8)
empty('bf_muzzle',(0,1.9,1.55),col=current)
start_template('harpoon')
box('MESH_Harpoon_bed',(0,.18,0),(3.3,.36,4.9),6)
for x in (-.9,.9):
    for y in (.8,1.9):
        a=(x,y,-2.15); b=(x,y+1.4,2.15)
        beam('MESH_Harpoon_canister',a,b,.46,0,n=8)
        beam('MESH_Harpoon_endcap',b,(x,y+1.43,2.24),.48,13,n=8)
for z in (-1.4,1.4): box('MESH_Harpoon_support',(0,.7,z),(3.4,1.3,.25),6)
empty('bf_muzzle',(0,2.6,2.24),col=current)
current=hull

slots={'main_fwd':((0,7.02,51),0,'76mm'),
       'ram_fwd':((0,10.0,31),0,'ram'),
       'ram_aft':((0,11.1,-40.5),math.pi,'ram')}
# Forward RAM plinth stands behind VLS, against the forward bridge wall.
taper('MESH_RAM_fwd_plinth',0,31,6.4,10,3.8,3.8,3.2,3.2,0)
rails={'ssm_rail_port':((-3.8,11.0,-.5),-math.pi/2,'harpoon'),
       'ssm_rail_starboard':((3.8,11.0,-.5),math.pi/2,'harpoon')}

def instance(key,p,yaw):
    transform=Matrix.Translation(G(p)) @ Matrix.Rotation(yaw,4,'Z')
    for ob in templates[key].objects:
        if ob.type!='MESH': continue
        clone=ob.copy(); clone.data=ob.data; clone.name='REF_'+ob.name; weapons.objects.link(clone)
        clone.matrix_world=transform @ ob.matrix_world

for sid,(p,yaw,key) in slots.items():
    # Train base handles aft RAM heading; socket itself is neutral to avoid double yaw.
    empty('SOCKET_'+sid,p); instance(key,p,yaw)
for sid,(p,yaw,key) in rails.items():
    empty('RAIL_'+sid,p,yaw); instance(key,p,yaw)

# Merge each material batch for a small draw-call footprint; sockets remain separate.
def join_batch(col):
    groups={}
    for ob in list(col.objects):
        if ob.type=='MESH': groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for name,obs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in obs: ob.select_set(True)
        bpy.context.view_layer.objects.active=obs[0]
        if len(obs)>1: bpy.ops.object.join()
        obs[0].name='MESH_'+col.name+'_'+name

join_batch(hull)
for c in templates.values(): join_batch(c)

def export(path,objects):
    path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in objects if o.type=='MESH')
    # Blender object names are global across scenes: reserve canonical socket/muzzle
    # names only for the export, then restore every pre-existing name.
    renamed=[]
    for ob in objects:
        desired=ob.get('export_name')
        if desired and ob.name!=desired:
            conflict=bpy.data.objects.get(desired)
            if conflict:
                previous=conflict.name; conflict.name='__F124_EXPORT_RESERVED_'+previous
                renamed.append((conflict,previous))
            previous=ob.name; ob.name=desired; renamed.append((ob,previous))
    try:
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,
            export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_extras=True)
    finally:
        for ob,previous in reversed(renamed): ob.name=previous

export(PUB/'ships/hull_f124.glb',list(hull.objects)+list(helpers.objects))
for key,c in templates.items():
    obs=list(c.objects)
    export(OUT/('mount_f124_'+key+'_metric.glb'),obs)
    saved={ob:ob.matrix_world.copy() for ob in obs}
    for ob in obs: ob.matrix_world=Matrix.Scale(PREPARE,4) @ ob.matrix_world
    export(PUB/('systems/mount_f124_'+key+'.glb'),obs)
    for ob,transform in saved.items(): ob.matrix_world=transform
    c.hide_render=True
    c.hide_viewport=True

profile={'profileId':'f124_visual_prototype','hullGltfId':'f124','shipClassId':'destroyer',
    'labelDe':'F124 Hessen — visueller Prototyp','hullVisualScale':1/PREPARE,
    'clientVisualTuningDefaults':{'spriteScale':1,'gltfHullYOffset':-4.5*PREPARE,'gltfHullOffsetX':0,'gltfHullOffsetZ':0,'shipPivotLocalZ':0,'wakeSpawnLocalZ':-71.5},
    'collisionHitbox':{'center':{'x':0,'y':2,'z':0},'halfExtents':{'x':8.7,'y':6.5,'z':71.5}},
    'mountSlots':[],'fixedSeaSkimmerLaunchers':[],'defaultLoadout':{}}
registry={}
def socket(p,yaw=0):
    return {'position':dict(zip(('x','y','z'),p)), 'eulerRad':{'x':0,'y':yaw,'z':0}}
for sid,(p,yaw,key) in slots.items():
    vid='visual_f124_'+key
    registry[sid]=socket(p)
    profile['mountSlots'].append({'id':sid,'socket':registry[sid],
        'compatibleKinds':['artillery' if key=='76mm' else 'pdms'],
        'defaultVisualId':vid,'trainBaseYawRadFromBow':yaw,
        'fireSector':{'kind':'symmetric','halfAngleRadFromBow':2.1,'centerYawRadFromBow':yaw}})
    profile['defaultLoadout'][sid]=vid
for sid,(p,yaw,key) in rails.items():
    profile['fixedSeaSkimmerLaunchers'].append({'id':sid,'side':'port' if 'port' in sid else 'starboard',
        'visualId':'visual_f124_harpoon','socket':socket(p,yaw),'launchYawRadFromBow':yaw})
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'f124.profile.json').write_text(json.dumps(profile,indent=2),encoding='utf-8')
(OUT/'f124.mountSockets.json').write_text(json.dumps(registry,indent=2),encoding='utf-8')

# Neutral sea presentation, bright lighting, accurate Z-up camera.
current=studio
water=bpy.data.materials.new('F124_Preview_Sea'); water.use_nodes=True
bs=water.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(.026,.09,.12,1)
bs.inputs['Roughness'].default_value=.40; bs.inputs['Metallic'].default_value=.15
box('PREVIEW_sea',(0,-.3,0),(2000,.1,2000),mat=water)
world=bpy.data.worlds.new('F124_StudioWorld'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.64,.72,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.65; scene.world=world
def look(ob,target): ob.rotation_euler=(G(target)-ob.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('F124_HeroCamera',bpy.data.cameras.new('F124_HeroCamera')); studio.objects.link(cam)
cam.location=G((155,115,165)); look(cam,(0,9,0)); cam.data.type='ORTHO'; cam.data.ortho_scale=177
scene.camera=cam
sun=bpy.data.objects.new('F124_Sun',bpy.data.lights.new('F124_Sun','SUN')); studio.objects.link(sun)
sun.location=G((100,180,80)); look(sun,(0,0,0)); sun.data.energy=2.5; sun.data.angle=.12
for name,p,power,size in [('Key',(-70,110,50),180000,90),('Rim',(30,80,-100),210000,65)]:
    light=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA')); studio.objects.link(light)
    light.location=G(p); light.data.energy=power; light.data.shape='DISK'; light.data.size=size; look(light,(0,4,0))
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1500; scene.render.resolution_y=950; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(OUT/'f124_hero.png')
scene.render.image_settings.color_mode='RGB'
# Frame the new scene in the interactive viewport as well.
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
stats={}
for c in [hull,*templates.values()]:
    tris=0
    for ob in c.objects:
        if ob.type=='MESH': ob.data.calc_loop_triangles(); tris+=len(ob.data.loop_triangles)
    stats[c.name]={'triangles':tris,'mesh_batches':sum(o.type=='MESH' for o in c.objects)}
(OUT/'geometry-stats.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
bpy.data.libraries.write(str(OUT/'f124_hessen.blend'),{scene},fake_user=True)
result={'status':'ok','scene':scene.name,'output':str(OUT),'stats':stats,'runtime_mount_scale':PREPARE}
