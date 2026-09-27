"""Reference-traced S143A/P6122. New scene; runtime hull and modular weapons.
Coordinates in metres: X starboard, Y up, Z bow. Never builds below-deck rooms.
"""
import bpy,bmesh,math,json,ast
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT=ROOT/'assets/blender/gepard'; PUB=ROOT/'client/public/assets'
G=lambda p:Vector((p[0],-p[2],p[1]))
LENGTH=57.6; PREPARE=10000/LENGTH; KEEL=1.95
scene=bpy.data.scenes.new('Gepard_P6122_Asset'); bpy.context.window.scene=scene
scene['reference']='User lines: side and top only; photos P6122; no below-deck arrangement'
scene['asset_revision']=3; scene.unit_settings.system='METRIC'
def collection(name):
    c=bpy.data.collections.new(name); scene.collection.children.link(c); return c
hull=collection('GEPARD_HULL'); helpers=collection('GEPARD_SOCKETS')
weapons=collection('GEPARD_MOUNTS_PREVIEW'); studio=collection('GEPARD_PRESENTATION'); current=hull
atlas=bpy.data.images.load(str(OUT/'textures/gepard_surface_basecolor.png'),check_existing=False); atlas.pack()
rough=bpy.data.images.load(str(OUT/'textures/gepard_surface_roughness.png'),check_existing=False); rough.pack(); rough.colorspace_settings.name='Non-Color'
paint=bpy.data.materials.new('Gepard_PaintedSteel_UV'); paint.use_nodes=True
bs=paint.node_tree.nodes.get('Principled BSDF'); bs.inputs['Metallic'].default_value=.06
for img,socket in [(atlas,'Base Color'),(rough,'Roughness')]:
    t=paint.node_tree.nodes.new('ShaderNodeTexImage'); t.image=img; paint.node_tree.links.new(t.outputs['Color'],bs.inputs[socket])
# Reuse the audited geometry/UV helpers without running the F124 builder.
tree=ast.parse((ROOT/'scripts/blender/create_f124_asset.py').read_text(encoding='utf-8'))
names={'mesh','box','taper','chamfer_house','beam','quad','empty'}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'f124_geometry_helpers','exec'))

# Top-plan trace: stern left, bow right. Maximum beam 7.8 m.
stations=[(-28.8,3.38,2.05),(-27,3.62,2.08),(-23,3.78,2.12),(-16,3.86,2.18),
 (-8,3.90,2.26),(0,3.88,2.39),(8,3.65,2.61),(14,3.22,2.83),
 (18,3.02,3.03),(20,2.76,3.13),(22,2.42,3.23),(24,1.98,3.3633333333333333),
 (25,1.69,3.43),(26,1.35,3.51),(27,.96,3.59),(27.7,.62,3.6405555555555558),
 (28.2,.36,3.6766666666666667),(28.55,.17,3.7019444444444445),(28.8,.075,3.72)]
def interp(z,index):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=z<=b[0]: return a[index]+(b[index]-a[index])*(z-a[0])/(b[0]-a[0])
    return stations[0 if z<0 else -1][index]
def shape(z,y):
    # Raked stem and shallow chine. Keep full planform at the deck.
    return z-max(0,z-18)/10.8*max(0,interp(z,2)-y)*.55
def shell(name,lower,upper,tile):
    vs=[]
    for z,w,h in stations:
        for sy,sw in (lower,upper):
            y=sy(h); ww=w*sw
            if y==-KEEL:
                y+=1.15*(max(0,-z-14)/14.8)**1.6+.95*(max(0,z-15)/13.8)**2
            vs.extend([(-ww,y,shape(z,y)),(ww,y,shape(z,y))])
    faces=[]
    for i in range(len(stations)-1):
        k=4*i; q=k+4; faces.extend([(k,q,q+2,k+2),(k+1,k+3,q+3,q+1)])
    faces += [(0,2,3,1),(len(vs)-4,len(vs)-3,len(vs)-1,len(vs)-2)]
    return mesh(name,vs,faces,tile)
shell('GEPARD_underwater',(lambda h:-KEEL,.53),(lambda h:-.18,.84),7)
shell('GEPARD_bootstripe',(lambda h:-.18,.84),(lambda h:.25,.87),5)
shell('GEPARD_hull_sides',(lambda h:.25,.87),(lambda h:h,1),0)
mesh('GEPARD_deck',[(s*w,h,z) for z,w,h in stations for s in (-1,1)],
     [(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(stations)-1)],2)
mesh('GEPARD_keel',[(s*w*.53,-KEEL+1.15*(max(0,-z-14)/14.8)**1.6+.95*(max(0,z-15)/13.8)**2,
                    shape(z,-KEEL+1.15*(max(0,-z-14)/14.8)**1.6+.95*(max(0,z-15)/13.8)**2)) for z,w,h in stations for s in (-1,1)],
     [(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(stations)-1)],7)
# Low, long deckhouse and distinctive high, polygonal bridge front.
chamfer_house('GEPARD_main_house',4.15,2.35,4.90,5.9,15.9,5.65,15.3,.50,0)
chamfer_house('GEPARD_aft_mast_pedestal',-5.3,2.30,4.88,3.1,4.4,2.0,2.5,.25,0)
chamfer_house('GEPARD_bridge',10.4,2.75,6.82,6.0,4.1,5.50,3.78,.82,1)
box('GEPARD_open_bridge_deck',(0,5.06,6.5),(5.8,.16,4.0),2)
for side in (-1,1):
    box('GEPARD_bridge_wing',(side*3.05,5.2,8.55),(1.05,.85,2.1),0,bevel=.06)
    box('GEPARD_wing_dark_inset',(side*3.05,5.66,8.55),(.86,.035,1.8),2)
    # Side glazing and access doors; remain low-cost textured planes.
    for z in (9.25,10.25,11.25):
        quad('GEPARD_side_window',[(side*2.808,6.09,z-.29),(side*2.808,6.09,z+.29),
              (side*2.78,6.56,z+.29),(side*2.78,6.56,z-.29)],4)
    for z in (-2.9,-.9,1.15):
        box('GEPARD_access_door',(side*2.95,3.74,z),(.025,1.48,.75),13)
        box('GEPARD_door_window',(side*2.973,4.12,z),(.026,.23,.46),4)
    for z in (2.5,4.0): box('GEPARD_house_window',(side*2.89,4.45,z),(.025,.30,.65),4)
    box('GEPARD_vent',(side*1.1,3.61,-4.65),(.025,1.0,.72),10)
# Across the bow-facing bridge panels, windows follow the chamfered front.
for x in (-1.65,-.82,0,.82,1.65):
    quad('GEPARD_bridge_front_window',[(x-.28,6.10,12.39),(x+.28,6.10,12.39),
      (x+.28,6.56,12.315),(x-.28,6.56,12.315)],4)
for side in (-1,1):
    quad('GEPARD_corner_window',[(side*2.10,6.10,12.27),(side*2.72,6.10,11.65),
      (side*2.67,6.56,11.65),(side*2.06,6.56,12.23)],4)
# The bridge housing already has a closed, chamfered upper face. Do not add a
# rectangular roof plate: its square corners overhung the chamfered bridge.
for x in (-1.65,1.65): box('GEPARD_bridge_hatch',(x,6.84,10.1),(.65,.04,.70),13)

def lathe(name,z,y,profile,n=16,tile=1):
    vs=[(r*math.cos(i*math.tau/n),y+h,z+r*math.sin(i*math.tau/n)) for h,r in profile for i in range(n)]
    faces=[tuple(reversed(range(n))),tuple(range((len(profile)-1)*n,len(profile)*n))]
    faces += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(profile)-1) for i in range(n)]
    ob=mesh(name,vs,faces,tile)
    if name in ('GEPARD_radome','OTO_cupola'):
        for poly in ob.data.polygons:
            if poly.index>=2: poly.use_smooth=True
    return ob
# Radome above the open bridge, open lattice supports underneath.
for x,z in [(-1.1,5.0),(1.1,5.0),(-1.1,7.4),(1.1,7.4)]:
    beam('GEPARD_radar_tripod',(x,4.98,z),(x*.47,8.65,6.2+(z-6.2)*.47),.072,0,n=6)
for y,w,l in [(6.35,1.65,1.9),(8.15,1.15,1.35)]:
    for x in (-w/2,w/2): beam('GEPARD_radar_brace',(x,y,6.2-l/2),(-x,y,6.2+l/2),.045,6,n=6)
lathe('GEPARD_radar_equipment',6.2,7.15,[(0,.83),(.7,.83)],12,0)
lathe('GEPARD_radome',6.2,9.20,[(0,.40),(.22,.76),(.60,1.08),(1.12,1.24),
 (1.60,1.24),(2.03,1.08),(2.40,.74),(2.60,.30),(2.64,.03)],20,1)
lathe('GEPARD_radome_equator',6.2,10.46,[(0,1.262),(.045,1.262)],20,3)
beam('GEPARD_radome_bearing',(0,8.6,6.2),(0,9.25,6.2),.22,0,n=10)
beam('GEPARD_radome_tip',(0,11.84,6.2),(0,11.99,6.2),.04,6,n=6)
# Navigation scanner and foremast aerials.
beam('GEPARD_nav_radar_post',(0,6.82,10.3),(0,7.55,10.3),.075,6,n=8)
box('GEPARD_nav_radar_bar',(0,7.58,10.3),(2.2,.11,.18),1)
beam('GEPARD_bridge_whip',(-1.65,6.82,9.9),(-1.65,13.5,9.9),.024,6,n=5)
beam('GEPARD_central_whip',(1.9,4.95,2.55),(1.9,17.50,2.55),.021,6,n=5)
# Slender aft mast; not a solid pyramidal tower.
beam('GEPARD_mainmast',(0,4.85,-4.10),(0,15.82,-4.10),.078,0,n=8,r2=.034)
for side in (-1,1):
    beam('GEPARD_mast_leg',(side*1.30,2.3,-6.95),(0,10.7,-4.10),.074,0,n=6)
    beam('GEPARD_mast_stay',(side*1.48,4.97,-1.7),(0,14.2,-4.10),.015,6,n=4)
for y,w in [(7.75,2.9),(9.6,2.2),(11.1,2.6),(12.45,2.1),(13.5,2.4),(14.9,2.1),(15.65,1.8)]:
    beam('GEPARD_yard',(-w/2,y,-4.1),(w/2,y,-4.1),.04,0,n=6)
    for side in (-1,1): beam('GEPARD_yard_sensor',(side*w/2,y,-4.1),(side*w/2,y+.36,-4.1),.045,1,n=6)
for y in (8.0,10.0,12.0): box('GEPARD_mast_box',(0,y,-4.21),(.35,.55,.32),13)
beam('GEPARD_mast_top',(0,15.7,-4.1),(0,16.2,-4.1),.035,6,n=5)
for y,a,b in [(9.5,-5.45,-3.0),(12.6,-5.6,-3.0),(13.7,-5.7,-3.4),(15.5,-5.2,-3.4)]:
    beam('GEPARD_longitudinal_yard',(0,y,a),(0,y,b),.033,0,n=6)
    beam('GEPARD_yard_aerial',(0,y,a),(0,y+.32,a),.026,6,n=5)
for i,tile in enumerate((5,7,9)):
    quad('GEPARD_flag',[(0,12.5-i*.16,-4.2),(0,12.55-i*.16,-5.25),
      (0,12.39-i*.16,-5.25),(0,12.34-i*.16,-4.2)],tile)
box('GEPARD_roof_vent_frame',(0,4.99,.25),(2.35,.12,2.3),6)
for x in (-.65,0,.65):
    for z in (-.3,.65):
        beam('GEPARD_roof_vent',(x,5.05,z),(x,5.30,z),.28,1,n=10)
for x in (-1.2,1.2):box('GEPARD_roof_hatch',(x,4.97,3.0),(.8,.12,.8),13)
# Ladder / fine signal halyards (few segments, silhouette-friendly).
for x in (-.18,.18): beam('GEPARD_ladder_rail',(x,4.95,-4.0),(x,13.2,-4.0),.022,6,n=4)
for i in range(25): beam('GEPARD_ladder_rung',(-.18,5+i*.32,-4),( .18,5+i*.32,-4),.018,6,n=4)
for side in (-1,1):
    beam('GEPARD_halyard',(side*.9,5.0,-4.0),(side*.9,14.9,-4.0),.012,6,n=3)
    for z in (-3.2,1.4):
        beam('GEPARD_liferaft',(side*3.19,2.9,z-.72),(side*3.19,2.9,z+.72),.32,1,n=10)
        box('GEPARD_raft_strap',(side*3.19,2.90,z),(.67,.67,.055),6)
    for z in (-5,0,5): beam('GEPARD_upper_stanchion',(side*2.7,4.96,z),(side*2.7,5.73,z),.027,1,n=5)
    beam('GEPARD_upper_rail',(side*2.7,5.73,-5),(side*2.7,5.73,7.4),.027,1,n=5)
    # Sparse low-poly main-deck rails, small fittings.
    zs=[-28,-24,-20,-16,-12,-8,-4,0,4,8,12,16,20,23,25.5,27]
    for z in zs:
        x=side*(interp(z,1)-.12); y=interp(z,2)
        beam('GEPARD_stanchion',(x,y,z),(x,y+.78,z),.024,1,n=5)
    for a,b in zip(zs,zs[1:]):
        for dy in (.36,.78):
            beam('GEPARD_rail',(side*(interp(a,1)-.12),interp(a,2)+dy,a),
                 (side*(interp(b,1)-.12),interp(b,2)+dy,b),.017,1,n=4)
    for z in (-26,-7,16,23):
        y=interp(z,2); x=side*(interp(z,1)-.58)
        box('GEPARD_bollard_bed',(x,y+.045,z),(.6,.09,.8),6)
        for dz in (-.22,.22): beam('GEPARD_bollard',(x,y+.05,z+dz),(x,y+.4,z+dz),.085,6,n=6)
    for z in (-22,-12,8,18):
        quad('GEPARD_drain',[(side*(interp(z,1)+.012),interp(z,2)-.1,z-.12),
              (side*(interp(z,1)+.012),interp(z,2)-.1,z+.12),
              (side*(interp(z,1)-.1),interp(z,2)-.52,z+.12),(side*(interp(z,1)-.1),interp(z,2)-.52,z-.12)],6)
# Foredeck anchor gear / stern utility rails.
for side in (-1,1):
    beam('GEPARD_anchor_chain',(side*.8,3.38,23),(side*.35,3.58,26),.052,5,n=6)
    beam('GEPARD_mine_rail',(side*2.45,2.21,-28),(side*2.45,2.33,-8),.045,6,n=4)
beam('GEPARD_capstan',(0,3.35,23.6),(0,3.75,23.6),.20,6,n=10)
beam('GEPARD_jackstaff',(0,3.7,27.5),(0,6.5,27.5),.029,6,n=5)
beam('GEPARD_stern_staff',(0,2.1,-28),(0,3.95,-28),.028,6,n=5)
# Identification is mesh lettering, not a blurred decal; shared paint atlas retained.
for side in (-1,1):
    curve=bpy.data.curves.new('P6122','FONT'); curve.body='P6122'; curve.size=.68; curve.align_x='CENTER'; curve.resolution_u=2
    text=bpy.data.objects.new('GEPARD_P6122',curve); hull.objects.link(text)
    text.location=G((side*2.91,3.92,5.9))
    text.rotation_euler=Matrix(((0,0,side),(side,0,0),(0,1,0))).to_euler()
    bpy.context.view_layer.objects.active=text; text.select_set(True); bpy.ops.object.convert(target='MESH'); text.select_set(False)
    text.data.materials.append(paint); layer=text.data.uv_layers.new()
    for v in layer.data: v.uv=(.125,.375)
# Four shafts/props and two rudders: outer silhouette only.
for x in (-2.0,-.72,.72,2.0):
    beam('GEPARD_shaft',(x,-.75,-17),(x,-1.28,-25),.08,6,n=6)
    beam('GEPARD_prop_hub',(x,-1.28,-24.7),(x,-1.28,-25.2),.18,9,n=6)
    for a in (0,math.tau/3,2*math.tau/3):
        quad('GEPARD_prop_blade',[(x+u*math.cos(a)-v*math.sin(a),-1.28+u*math.sin(a)+v*math.cos(a),-25)
             for u,v in [(.12,-.08),(.55,-.16),(.62,.08),(.15,.13)]],9)
for x in (-1.7,1.7): taper('GEPARD_rudder',x,-27,-1.9,-.5,.13,.75,.16,1.0,6)

templates={}
def template(key):
    global current
    c=collection('GEPARD_TEMPLATE_'+key); templates[key]=c; current=c
template('artillery')
lathe('OTO_base',0,0,[(0,1.12),(.54,1.12)],20,6)
lathe('OTO_cupola',0,.54,[(0,1.38),(1.1,1.38),(1.70,1.10),(2.00,.68),(2.10,.08)],20,1)
beam('OTO_trunnion',(-.4,1.66,.78),(.4,1.66,.78),.29,6,n=12)
beam('OTO_barrel',(0,1.75,.90),(0,1.89,4.65),.095,6,n=10,r2=.061)
beam('OTO_muzzle',(0,1.88,4.45),(0,1.91,4.8),.083,5,n=10)
empty('bf_muzzle',(0,1.91,4.8),col=current)
template('pdms')
lathe('RAM_base',0,0,[(0,.72),(.32,.72),(.40,.56),(1.1,.45)],12,0)
for x in (-.76,.76): box('RAM_yoke',(x,1.35,0),(.20,1.5,.85),0)
start=set(current.objects)
box('RAM_box',(0,1.75,.1),(2.3,1.65,2.1),1,bevel=.11)
for row,count in enumerate((5,6,5,5)):
    for i in range(count):
        x=(i-(count-1)/2)*.34; y=1.22+row*.35
        beam('RAM_cell',(x,y,1.16),(x,y,1.20),.132,5,n=8)
axis=G((0,1.75,.1)); tilt=Matrix.Translation(axis)@Matrix.Rotation(math.radians(-15),4,'X')@Matrix.Translation(-axis)
for o in set(current.objects)-start: o.matrix_world=tilt@o.matrix_world
empty('bf_muzzle',(0,2.08,1.28),col=current)
template('exocet')
# Two parallel MM38 containers per rail: broad ribbed rectangular canisters.
for x in (-.61,.61):
    start=set(current.objects)
    box('EXOCET_container',(x,1.05,0),(.92,.94,5.4),0,bevel=.07)
    for z in (-2.7,2.7): box('EXOCET_cap',(x,1.05,z),(1.02,1.03,.12),13,bevel=.04)
    for z in (-2.3,-1.7,-1.1,-.5,.1,.7,1.3,1.9,2.4):
        # Three sides of each reinforcing band, no hidden bottom faces.
        box('EXOCET_band_top',(x,1.55,z),(1.02,.07,.065),1)
        for side in (-1,1): box('EXOCET_band_side',(x+side*.49,1.05,z),(.065,.96,.065),1)
    incline=Matrix.Rotation(math.radians(-8),4,'X')
    for o in set(current.objects)-start: o.matrix_world=incline@o.matrix_world
for z in (-1.8,1.8): box('EXOCET_bed',(0,.28,z),(2.3,.56,.42),6)
empty('bf_muzzle',(0,1.43,2.72),col=current)
current=hull
slots={'main_fwd':((0,interp(17.25,2)+.325,17.25),0,'artillery'),
       'ciws_aft':((0,interp(-23.35,2)+.025,-23.35),math.pi,'pdms')}
rails={'ssm_rail_port':((0,interp(-18.2,2)+.03,-18.2),-math.pi/4,'exocet'),
       'ssm_rail_starboard':((0,interp(-10.6,2)+.03,-10.6),math.pi/4,'exocet')}
lathe('GEPARD_gun_plinth',17.25,interp(17.25,2),[(0,1.48),(.325,1.40)],20,6)
def instance(key,p,yaw):
    mat=Matrix.Translation(G(p))@Matrix.Rotation(yaw,4,'Z')
    for ob in list(templates[key].objects):
        if ob.type!='MESH': continue
        clone=ob.copy(); clone.data=ob.data.copy(); clone.name='ASSEMBLED_'+ob.name
        weapons.objects.link(clone); clone.matrix_world=mat@ob.matrix_world
for sid,(p,yaw,key) in slots.items(): empty('SOCKET_'+sid,p); instance(key,p,yaw)
for sid,(p,yaw,key) in rails.items(): empty('RAIL_'+sid,p,yaw); instance(key,p,yaw)

bpy.context.view_layer.update()
bounds={o.name:{'min':[min((o.matrix_world@Vector(v))[i] for v in o.bound_box) for i in range(3)],
                'max':[max((o.matrix_world@Vector(v))[i] for v in o.bound_box) for i in range(3)]}
        for o in [*hull.objects,*weapons.objects] if o.type=='MESH'}
(OUT/'component-bounds.json').write_text(json.dumps(bounds,indent=2))
def join(col):
    obs=[o for o in col.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
    if len(obs)>1:bpy.ops.object.join()
    obs[0].name='MESH_'+col.name
for c in [hull,*templates.values()]:join(c)
def tris(col):
    total=0
    for ob in col.objects:
        if ob.type=='MESH': ob.data.calc_loop_triangles(); total+=len(ob.data.loop_triangles)
    return total
stats={c.name:tris(c) for c in [hull,*templates.values()]}
total=tris(hull)+tris(templates['artillery'])+tris(templates['pdms'])+2*tris(templates['exocet'])
assert total<=10000,{'total':total,'parts':stats}
(OUT/'geometry-stats.json').write_text(json.dumps({'assembled_triangles':total,'parts':stats},indent=2))
def export(path,objects):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in objects if o.type=='MESH')
    renamed=[]
    for ob in objects:
        desired=ob.get('export_name')
        if desired and ob.name!=desired:
            conflict=bpy.data.objects.get(desired)
            if conflict:old=conflict.name; conflict.name='RESERVED_'+old; renamed.append((conflict,old))
            old=ob.name; ob.name=desired; renamed.append((ob,old))
    try:bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,
                                export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_extras=True)
    finally:
        for ob,old in reversed(renamed): ob.name=old
export(PUB/'ships/hull_gepard.glb',list(hull.objects)+list(helpers.objects))
for key,c in templates.items():
    obs=list(c.objects); export(OUT/('mount_gepard_'+key+'_metric.glb'),obs)
    saved={ob:ob.matrix_world.copy() for ob in obs}
    # Standard game identities artillery/pdms apply an additional factor 100.
    factor=PREPARE/(100 if key in ('artillery','pdms') else 1)
    for ob in obs:ob.matrix_world=Matrix.Scale(factor,4)@ob.matrix_world
    export(PUB/('systems/mount_gepard_'+key+'.glb'),obs)
    for ob,mat in saved.items():ob.matrix_world=mat
    c.hide_render=True;c.hide_viewport=True
def socket(p,yaw=0):return {'position':dict(zip(('x','y','z'),p)),'eulerRad':{'x':0,'y':yaw,'z':0}}
profile=json.loads((OUT/'backup/fac.json').read_text());profile['hullGltfId']='gepard'
profile['labelDe']='Gepard-Klasse (Typ 143A)'
# Retain FAC visual size: 10000 * 0.00968 * class hullScale 0.62 = 60.016.
profile['clientVisualTuningDefaults'].update({'gltfHullYOffset':-KEEL*PREPARE,'gltfHullOffsetX':0,'gltfHullOffsetZ':0,'shipPivotLocalZ':0,'wakeSpawnLocalZ':-18.4})
registry={sid:socket(p) for sid,(p,yaw,key) in slots.items()}
for rail in profile['fixedSeaSkimmerLaunchers']:
    p,yaw,key=rails[rail['id']];rail['socket']=socket(p,yaw);rail['launchYawRadFromBow']=yaw
(OUT/'fac.profile.json').write_text(json.dumps(profile,indent=2))
(OUT/'fac.mountSockets.json').write_text(json.dumps(registry,indent=2))
current=studio
water=bpy.data.materials.new('Gepard_Sea');water.diffuse_color=(.03,.10,.14,1);water.use_nodes=True
wbs=water.node_tree.nodes.get('Principled BSDF');wbs.inputs['Base Color'].default_value=(.03,.10,.14,1);wbs.inputs['Roughness'].default_value=.43
box('PREVIEW_sea',(0,-.21,0),(1000,.10,1000),mat=water)
world=bpy.data.worlds.new('Gepard_World');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.64,.72,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
def camera(name,pos,target,scale):
    c=bpy.data.objects.new(name,bpy.data.cameras.new(name));studio.objects.link(c);c.location=G(pos)
    c.rotation_euler=(G(target)-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=scale;return c
scene.camera=camera('Gepard_Hero',(65,48,69),(0,5,0),76)
camera('Gepard_Side',(100,0,0),(0,0,0),64)
camera('Gepard_Top',(0,100,0),(0,0,0),64)
sun=bpy.data.objects.new('Gepard_Sun',bpy.data.lights.new('Gepard_Sun','SUN'));studio.objects.link(sun)
sun.rotation_euler=(.45,-.6,-.6);sun.data.energy=2.4;sun.data.angle=.13
for pos,power in [((-40,70,20),90000),((30,50,-50),80000)]:
    o=bpy.data.objects.new('Gepard_Area',bpy.data.lights.new('Gepard_Area','AREA'));studio.objects.link(o);o.location=G(pos)
    o.rotation_euler=(G((0,3,0))-o.location).to_track_quat('-Z','Y').to_euler();o.data.energy=power;o.data.size=45
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1500;scene.render.resolution_y=950;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.render.filepath=str(OUT/'gepard_hero.png')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
bpy.data.libraries.write(str(OUT/'gepard_p6122.blend'),{scene},fake_user=True)
result={'scene':scene.name,'assembled_triangles':total,'parts':stats,'output':str(OUT)}
