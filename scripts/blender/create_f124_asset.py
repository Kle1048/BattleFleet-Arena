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
KEEL_DEPTH=6.4
PREPARE=10000.0/LENGTH
G=lambda p: Vector((p[0],-p[2],p[1]))
scene=bpy.data.scenes.new('F124_Hessen_Asset_v3')
scene['f124_asset_revision']=3
scene['reference_note']='User-supplied orthographic sheet; proportions estimated, F221 identity retained.'
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
    i=bpy.data.images.load(str(TEX/name),check_existing=False); i.pack(); return i

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

def chamfer_house(name,z,y0,y1,w0,l0,w1,l1,cut=1.4,tile=0,open_top=False):
    verts=[]
    for y,w,l in [(y0,w0,l0),(y1,w1,l1)]:
        a=w/2; b=l/2; c=min(cut,a*.45,b*.45)
        verts += [(x,y,z+zz) for x,zz in [(-a,-b+c),(-a+c,-b),(a-c,-b),(a,-b+c),
                                          (a,b-c),(a-c,b),(-a+c,b),(-a,b-c)]]
    return mesh(name,verts,[tuple(reversed(range(8)))]+([] if open_top else [tuple(range(8,16))])+
                [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)],tile)

def platform_rails(z,y,w,length):
    for sign in (-1,1):
        for zz in (-length/2,0,length/2):
            beam('MESH_platform_stanchion',(sign*w/2,y,z+zz),(sign*w/2,y+.8,z+zz),.04,6,n=6)
        beam('MESH_platform_rail',(sign*w/2,y+.8,z-length/2),(sign*w/2,y+.8,z+length/2),.035,6,n=6)

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
stations=[(-71.5,6.4,5.15),(-69,8.3,5.17),(-64,8.55,5.2),(-47,8.7,5.35),(-28,8.7,5.55),
          (-6,8.7,5.8),(17,8.5,6.1),(30,8.0,8.2),(40,7.1,8.3),
          (48,6.0,8.35),(58,4.05,8.4),(66,2.0,8.45),(71.5,.06,8.5)]

def interp(z,index):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=z<=b[0]: return a[index]+(b[index]-a[index])*(z-a[0])/(b[0]-a[0])
    return stations[0 if z<0 else -1][index]

def rake(z,y,h):
    # Raked stem and tucked-under transom, instead of the first vertical-ended slab.
    if z>48: return z-(z-48)/23.5*max(0,h-y)*.62
    if z<-60: return z+(-60-z)/11.5*max(0,2-y)*.52
    return z

def keel_y(z):
    # The stern underbody rises around the shafts, exposing the propellers below it.
    if z < -52: return -4.7+2.7*((-z-52)/19.5)**1.1
    if z > 54: return -4.7-1.7*min(1,(z-54)/12)
    return -4.7

def shell(name,layer0,layer1,tile):
    verts=[]
    for z,w,h in stations:
        for layer in (layer0,layer1):
            scale,yy=layer(w,h)
            if name=='MESH_underwater' and yy==-4.5: yy=keel_y(z)
            zz=rake(z,yy,h)
            verts.extend([(-w*scale,yy,zz),(w*scale,yy,zz)])
    fs=[]
    for i in range(len(stations)-1):
        k=i*4; q=k+4; fs.extend([(k,q,q+2,k+2),(k+1,k+3,q+3,q+1)])
    fs.extend([(0,2,3,1),(len(verts)-4,len(verts)-3,len(verts)-1,len(verts)-2)])
    return mesh(name,verts,fs,tile)

shell('MESH_underwater',lambda w,h:(.58,-4.5),lambda w,h:(.91,-.5),7)
shell('MESH_bootstripe',lambda w,h:(.91,-.5),lambda w,h:(.925,.4),5)
shell('MESH_hull_sides',lambda w,h:(.925,.4),lambda w,h:(1,h),0)
verts=[(x,h,z) for z,w,h in stations for x in (-w,w)]
# A non-planar, single deck ngon hid the VLS in v1. Each station gets its own quad.
mesh('MESH_deck_contour',verts,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(stations)-1)],2)
mesh('MESH_keel',[(x,keel_y(z),rake(z,keel_y(z),h)) for z,w,h in stations for x in (-w*.58,w*.58)],
     [(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(stations)-1)],7)

# Long slab-sided aft house / helicopter hangar; exposed RHIB bays on both sides.
taper('MESH_hangar',0,-31,5.3,11.9,14.7,25,13.7,24.5,0)
taper('MESH_boat_bay_inner_core',0,-12.75,5.65,10.7,11.6,11.5,11.3,11.5,0)
taper('MESH_mid_house',0,4.5,5.8,10.7,15.9,23.0,14.6,23.0,0)
chamfer_house('MESH_bridge_lower',20.9,6.2,12.75,14.0,13.3,12.8,11.4,cut=2.0)
chamfer_house('MESH_bridge_glazing_band',21.0,12.75,13.9,12.9,10.7,12.5,10.3,cut=1.7,tile=4)
chamfer_house('MESH_bridge_roof',21.0,13.9,14.3,13.8,11.4,13.6,11.2,cut=1.8,tile=1)
for i in range(-4,5):
    beam('MESH_bridge_mullion',(i*1.03,12.75,26.37),(i*1.0,13.9,26.17),.065,0,n=4)
for sign in (-1,1):
    for z in (18,20,22,24):
        beam('MESH_bridge_side_mullion',(sign*6.47,12.75,z),(sign*6.27,13.9,z),.065,0,n=4)
    box('MESH_bridge_wing',(sign*6.4,12.1,18.0),(2.1,.35,3.4),0)
    box('MESH_boat_bay_dark',(sign*5.79,8.25,-12.75),(.06,3.5,11.1),5)
    for z in (-18.4,-7.1): box('MESH_boat_bay_endwall',(sign*6.85,8.2,z),(2.25,4.7,.40),0)
    box('MESH_boat_bay_sill',(sign*6.9,6.25,-12.75),(2.4,.65,11.5),0)
    box('MESH_boat_bay_roof',(sign*6.85,10.55,-12.75),(2.4,.35,11.5),0)
    # RHIB hull with dark collar and center console, at the visible bay mouth.
    taper('MESH_RHIB_collar',sign*6.95,-12.2,6.75,7.4,1.7,7.4,1.6,6.8,5)
    taper('MESH_RHIB_body',sign*6.95,-12.2,7.4,7.65,1.3,6.3,1.1,5.8,6)
    box('MESH_RHIB_console',(sign*6.95,8.05,-11.2),(.85,1.0,1.1),1)
    for z in (-15,-9):
        beam('MESH_davit',(sign*6.6,8,z),(sign*6.6,10.2,z),.14,6)
        beam('MESH_davit_arm',(sign*6.6,10.2,z),(sign*8.05,10.2,z),.14,6)
    for z in (-35,4,9,18):
        box('MESH_access_door',(sign*(7.15 if z<0 else 7.67 if z<10 else 6.84),8.2,z),(.08,1.85,.9),11)
    # Hull identification lies on the flared side, clear of the sea.
    z0,z1=16,29; y0,y1=1.6,4.5
    side=[]
    for y,z in [(y0,z0),(y0,z1),(y1,z1),(y1,z0)]:
        w=interp(z,1); h=interp(z,2); xx=w*(.925+.075*(y-.4)/(h-.4))+.025
        side.append((sign*xx,y,z))
    uvs=[(0,0),(1,0),(1,1),(0,1)] if sign<0 else [(1,0),(0,0),(0,1),(1,1)]
    quad('MESH_F221_pennant',side,mat=numbermat,uv=uvs)

# APAR integrated forward mast: stacked, faceted and tapered, joined to bridge roof.
taper('MESH_APAR_lower',0,14.5,10.7,20.2,8.0,9.5,4.3,5.1,0)
taper('MESH_APAR_shoulder',0,14.5,20.2,22.8,4.3,5.1,6.4,6.4,0)
taper('MESH_APAR_radar_housing',0,14.5,22.8,28.7,6.4,6.4,4.0,4.0,1)
for sign in (-1,1):
    # Four fixed array faces, contrasting circular antenna panels.
    c=(sign*2.62,26.0,14.5); dish('MESH_APAR_side_array',c,1.27,3,axis=(sign,.2034,0))
    c=(0,26.0,14.5+sign*2.62); dish('MESH_APAR_front_array',c,1.27,3,axis=(0,.2034,sign))
    beam('MESH_lower_mast_sensor',(sign*2.7,16.9,14.5),(sign*3.25,16.9,14.5),.7,1,n=12)
chamfer_house('MESH_APAR_lower_gallery',14.5,16.2,16.5,9.5,7.8,9.5,7.8,.9)
platform_rails(14.5,16.5,9.2,7.3)
chamfer_house('MESH_APAR_upper_gallery',14.5,19.8,20.1,6.1,6.7,6.1,6.7,.7)
taper('MESH_APAR_crown',0,14.5,28.7,29.5,3.6,3.6,2.4,2.4,0)
beam('MESH_mainmast',(0,29.5,14.5),(0,35.3,14.5),.20,0,r2=.07)
for y,w in ((30.3,6.2),(32.1,4.0),(33.5,2.2)):
    box('MESH_mast_crossbar',(0,y,14.5),(w,.15,.22),6)
    for x in (-w/2,w/2): beam('MESH_antenna',(x,y,14.5),(x,y+1.1,14.5),.045,5,n=6)
    if y<33: beam('MESH_mast_foreaft_yard',(0,y,14.5-w*.3),(0,y,14.5+w*.3),.06,6,n=6)
sphere('MESH_mast_tip',(0,35.0,14.5),.24,1)
for x in (-4.9,4.9):
    beam('MESH_satcom_pole',(x,11,10),(x,14.8,10),.15,0)
    sphere('MESH_satcom_radome',(x,15.0,10),.9,1)

# Funnel and SMART-L aft radar, separated in silhouette as in the references.
for side,sign in [('port',-1),('starboard',1)]:
    # Two independent casings, with a full-height central passage. No shared cap.
    ob=chamfer_house('MESH_funnel_'+side,-8.3,11.6,17.8,3.6,10.0,2.85,8.6,.48,open_top=True)
    ob.location.x=sign*3.65
    # Slight aft rake of the upper casing is visible in the profile reference.
    for v in ob.data.vertices:
        v.co.y+=(v.co.z-11.6)/(17.8-11.6)*.65
    cx=sign*3.65; z=-8.95
    box('MESH_funnel_foundation_'+side,(cx,11.15,-8.3),(3.6,.9,10),0)
    # Hollow rim: the recessed opening does not sit on a solid, shared roof.
    outer=[(-1.5,-3.85),(-1,-4.35),(1,-4.35),(1.5,-3.85),(1.5,3.85),(1,4.35),(-1,4.35),(-1.5,3.85)]
    inner=[(-1,-3.35),(-.6,-3.75),(.6,-3.75),(1,-3.35),(1,3.35),(.6,3.75),(-.6,3.75),(-1,3.35)]
    verts=[(cx+x,y,z+zz) for y,ring in [(18.1,outer),(18.1,inner),(17.5,inner)] for x,zz in ring]
    faces=[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    faces += [(i+8,(i+1)%8+8,(i+1)%8+16,i+16) for i in range(8)]
    mesh('MESH_funnel_rim_'+side,verts,faces,5)
    mesh('MESH_exhaust_'+side,[(cx+x,17.52,z+zz) for x,zz in inner],[tuple(range(8))],15)
chamfer_house('MESH_SMARTL_pedestal',-25.5,11.9,13.3,7.0,7.8,6.6,7.5,.6)
taper('MESH_SMARTL_mast',0,-25.5,13.3,19.6,6.6,7.5,4.0,4.5,0)
box('MESH_SMARTL_service_gallery',(0,14.0,-25.5),(7.0,.3,7.7),0)
beam('MESH_SMARTL_bearing',(0,19.6,-25.5),(0,20.5,-25.5),.85,6,n=12)
radar_parts=[box('MESH_SMARTL_array',(0,22.0,-25.5),(8.5,3.5,.72),5,bevel=.12)]
for x in range(-4,5): radar_parts.append(box('MESH_SMARTL_array_rib',(x,22,-25.09),(.06,3.2,.12),10))
# A rotating antenna may face any azimuth; this orientation shows its full panel in profile.
turn=Matrix.Translation(G((0,22,-25.5))) @ Matrix.Rotation(math.radians(15),4,'Z') @ Matrix.Rotation(math.radians(12),4,'X') @ Matrix.Translation(-G((0,22,-25.5)))
for ob in radar_parts: ob.matrix_world=turn @ ob.matrix_world
beam('MESH_signal_mast',(0,10.7,-3.0),(0,25.5,-3.0),.14,6,n=8,r2=.06)
box('MESH_signal_yard',(0,23.0,-3.0),(10.2,.17,.2),6)
for x in (-4.6,4.6): beam('MESH_signal_aerial',(x,23.0,-3.0),(x,24.6,-3.0),.035,5,n=6)
for x in (-4.0,4.0):
    sphere('MESH_hangar_radome',(x,13.35,-35),.8,1)
    beam('MESH_hangar_radome_base',(x,11.9,-35),(x,12.7,-35),.4,0)

# Twin hangar doors, vent louvres and aft flight deck texture.
for x in (-3.4,3.4):
    box('MESH_hangar_door',(x,8.65,-43.56),(5.8,5.3,.10),10)
    for y in (6.3,6.9,7.5,8.1,8.7,9.3,9.9,10.5): box('MESH_hangar_door_rib',(x,y,-43.63),(5.65,.055,.055),6)
for sign in (-1,1):
    box('MESH_hangar_vent',(sign*7.08,9,-36),(.08,1.6,3.0),10)
    box('MESH_long_intake_louvres',(sign*7.61,8.5,1.5),(.09,2.1,13.0),10)
    for z in (-32,-29,6,8):
        y=12.2 if z<0 else 11.1
        beam('MESH_liferaft_capsule',(sign*6.2,y,z-.65),(sign*6.2,y,z+.65),.38,1,n=10)
        box('MESH_liferaft_cradle',(sign*6.2,y-.33,z),(1.05,.17,1.5),6)
# Aft deck plane maps the bow end of the texture toward the hangar.
quad('MESH_flightdeck',[(sign*(interp(z,1)-.16),interp(z,2)+.035,z)
     for sign,z in [(-1,-69.8),(1,-69.8),(1,-44.1),(-1,-44.1)]],
     mat=flightmat,uv=[(0,0),(1,0),(1,1),(0,1)])

# The sheet shows a transverse 8-by-4 VLS array on a raised forward deckhouse.
chamfer_house('MESH_VLS_deckhouse',33.2,7.9,10.65,12.1,14.0,11.4,13.4,cut=1.2)
box('MESH_VLS_frame',(0,10.84,34),(8.9,.36,5.7),6,bevel=.08)
for x in range(8):
    for z in range(4):
        box('MESH_VLS_hatch',((x-3.5)*1.02,11.065,34+(z-1.5)*1.30),(.9,.09,1.18),13,bevel=.035)
        box('MESH_VLS_hinge',((x-3.5)*1.02,11.13,34+(z-1.5)*1.30+.52),(.62,.07,.10),5)

# Foredeck anchors / capstans, edge railing with sparse low-poly stanchions.
for x in (-2.0,2.0):
    beam('MESH_capstan',(x,interp(56,2),56),(x,interp(56,2)+.8,56),.48,6,n=10)
    beam('MESH_anchor_chain',(x,interp(57,2)+.15,57),(x*.6,interp(65,2)+.15,65),.12,5,n=6)
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
beam('MESH_bow_jackstaff',(0,8.3,70),(0,11.3,70),.055,6,n=6)
beam('MESH_stern_flagstaff',(0,5.4,-69),(0,9.5,-69),.065,6,n=6)
for i,tile in enumerate((5,7,9)):
    quad('MESH_naval_flag',[(0,9.4-i*.3,-69),(1.6,9.25-i*.3,-69),(1.6,8.96-i*.3,-69),(0,9.1-i*.3,-69)],tile)

# Simplified underwater silhouette for the bow/stern elevations; not a hydrodynamic model.
for sign in (-1,1):
    beam('MESH_propeller_shaft',(sign*3.3,-2.8,-55),(sign*3.3,-3.8,-66),.20,6,n=8)
    beam('MESH_propeller_hub',(sign*3.3,-3.8,-65),(sign*3.3,-3.8,-66.6),.36,9,n=10,r2=.12)
    for angle in range(0,360,72):
        a=math.radians(angle)
        blade=[(.25,-.17),(1.4,-.42),(1.55,.1),(.43,.31)]
        quad('MESH_propeller_blade',[(sign*3.3+u*math.cos(a)-v*math.sin(a),
              -3.8+u*math.sin(a)+v*math.cos(a),-65.8) for u,v in blade],9)
    taper('MESH_rudder',sign*3.3,-68,-5.8,-1.5,.28,2.5,.45,3.3,6)

# Separate reusable weapon templates, metres, forward +Z; each has bf_muzzle.
templates={}
def start_template(key):
    global current
    c=collection('F124_TEMPLATE_'+key); templates[key]=c; current=c; return c

start_template('76mm')
beam('MESH_76mm_base',(0,0,0),(0,.55,0),1.5,6,n=20)
chamfer_house('MESH_76mm_cupola',0,.55,2.25,2.85,2.8,2.1,1.95,.60,1)
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

slots={'main_fwd':((0,8.42,51),0,'76mm'),
       'ram_fwd':((0,10.6,42.5),0,'ram'),
       'ram_aft':((0,11.95,-38.1),math.pi,'ram')}
# Orthographic reference: gun -> RAM -> VLS -> bridge, viewed from the bow.
chamfer_house('MESH_RAM_fwd_plinth',42.5,8.25,10.6,3.8,3.4,3.2,2.9,.45)
rails={'ssm_rail_port':((-3.8,10.75,4.5),-math.pi/2,'harpoon'),
       'ssm_rail_starboard':((3.8,10.75,4.5),math.pi/2,'harpoon')}

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
# Align the forward mast assembly to the independently traced centerline in the sheet.
for ob in hull.objects:
    if ob.name.startswith(('MESH_APAR_','MESH_mainmast','MESH_mast_','MESH_antenna',
                           'MESH_lower_mast_sensor','MESH_platform_','MESH_satcom_')):
        ob.location+=G((0,0,-.6))

# Preserve inspectable component bounds before batching. Actual GLB renders remain
# the visual acceptance evidence; this manifest is only a dimensional cross-check.
component_bounds={}
bpy.context.view_layer.update()
for ob in hull.objects:
    if ob.type!='MESH': continue
    points=[ob.matrix_world @ Vector(v) for v in ob.bound_box]
    component_bounds[ob.name]={'min':[min(p[i] for p in points) for i in range(3)],
                               'max':[max(p[i] for p in points) for i in range(3)]}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'component-bounds-blender.json').write_text(json.dumps(component_bounds,indent=2),encoding='utf-8')
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
    'clientVisualTuningDefaults':{'spriteScale':1,'gltfHullYOffset':-KEEL_DEPTH*PREPARE,'gltfHullOffsetX':0,'gltfHullOffsetZ':0,'shipPivotLocalZ':0,'wakeSpawnLocalZ':-71.5},
    'collisionHitbox':{'center':{'x':0,'y':1.05,'z':0},'halfExtents':{'x':8.7,'y':7.45,'z':71.5}},
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
