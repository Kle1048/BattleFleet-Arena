"""Spruance DD-963, VLS-era visual interpretation of the supplied references.
Metric X starboard / Y up / Z bow; existing destroyer gameplay kept separately.
Run through spruance_stage.py for geometry -> material bakes -> publish.
"""
import bpy,bmesh,math,json,ast
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT=ROOT/'assets/blender/spruance';PUB=ROOT/'client/public/assets'
ASSET_SLUG='spruance';LENGTH=171.7;PREPARE=10000/LENGTH;KEEL=8.8
G=lambda p:Vector((p[0],-p[2],p[1]))
scene=bpy.data.scenes.new('Spruance_DD963_Asset');bpy.context.window.scene=scene
scene.unit_settings.system='METRIC';scene['reference']='User photos/blueprint; VLS-era exterior; no interior'
scene['static_weapons']='Aft Mk45 and aft Phalanx are visual only; preserve three active destroyer slots'
def collection(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
hull=collection('SPRUANCE_HULL');helpers=collection('SPRUANCE_SOCKETS')
weapons=collection('SPRUANCE_MOUNTS_PREVIEW');studio=collection('SPRUANCE_PRESENTATION');current=hull
atlas=bpy.data.images.load(str(OUT/'textures/f124_surface_basecolor.png'),check_existing=False);atlas.pack()
rough=bpy.data.images.load(str(OUT/'textures/f124_surface_roughness.png'),check_existing=False);rough.colorspace_settings.name='Non-Color';rough.pack()
paint=bpy.data.materials.new('Spruance_PaintedSteel');paint.use_nodes=True
bs=paint.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=.045
for im,sock in [(atlas,'Base Color'),(rough,'Roughness')]:
    t=paint.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;paint.node_tree.links.new(t.outputs['Color'],bs.inputs[sock])
tree=ast.parse((ROOT/'scripts/blender/create_f124_asset.py').read_text(encoding='utf-8'))
names={'mesh','box','beam','taper','chamfer_house','quad','empty','sphere'}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'geometry_helpers','exec'))
tree=ast.parse((ROOT/'scripts/blender/create_gepard_asset.py').read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'lathe','join','export','instance','tris'}],type_ignores=[]),'asset_helpers','exec'))
stations=[(-85.85,6.7,5.6),(-82,7.7,5.65),(-75,8.2,5.72),(-62,8.4,5.82),(-45,8.4,5.96),(-25,8.4,6.10),
 (-5,8.4,6.25),(15,8.35,6.45),(30,8.1,6.72),(42,7.6,7.02),(52,6.75,7.3),(62,5.35,7.58),
 (70,3.85,7.8),(76,2.65,7.96),(81,1.50,8.10),(84,.65,8.19),(85.85,.075,8.25)]
def interp(z,index):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=z<=b[0]:return a[index]+(b[index]-a[index])*(z-a[0])/(b[0]-a[0])
    return stations[0 if z<0 else -1][index]
def rake(z,y):
    if z>60:return z-(z-60)/25.85*max(0,interp(z,2)-y)*.52
    if z<-64:return z+(-64-z)/21.85*max(0,1-y)*.40
    return z
def bottom(z):return -5.8+3.4*(max(0,-z-50)/35.85)**1.25
def shell(name,low,high,tile):
    vs=[]
    for z,w,h in stations:
        for y,scale in ((low(z,h)[0],low(z,h)[1]),(high(z,h)[0],high(z,h)[1])):
            vs.extend([(-w*scale,y,rake(z,y)),(w*scale,y,rake(z,y))])
    fs=[]
    for i in range(len(stations)-1):
        a=4*i;b=a+4;fs.extend([(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
    fs.extend([(0,2,3,1),(len(vs)-4,len(vs)-3,len(vs)-1,len(vs)-2)])
    return mesh(name,vs,fs,tile)
shell('SPRUANCE_underwater',lambda z,h:(bottom(z),.55),lambda z,h:(-.45,.91),7)
shell('SPRUANCE_bootstripe',lambda z,h:(-.45,.91),lambda z,h:(.35,.925),5)
shell('SPRUANCE_topsides',lambda z,h:(.35,.925),lambda z,h:(h,1),0)
mesh('SPRUANCE_deck',[(s*w,h,z) for z,w,h in stations for s in (-1,1)],[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(stations)-1)],2)
mesh('SPRUANCE_keel',[(s*w*.55,bottom(z),rake(z,bottom(z))) for z,w,h in stations for s in (-1,1)],[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(stations)-1)],7)
# Prominent bow sonar fairing; not a square full-depth keel.
o=sphere('SPRUANCE_sonar',(0,-5.45,72.0),3.35,7)
for v in o.data.vertices:v.co.y=-72+(v.co.y+72)*1.75
# Long stepped deckhouses with two separate, narrow exhaust stacks.
chamfer_house('SPRUANCE_forward_house',18.7,6.35,11.2,14.2,37.0,13.6,36.4,.65,0)
chamfer_house('SPRUANCE_bridge',29.7,10.9,16.55,14.4,12.8,13.8,12.1,.75,1)
for x in (-5.6,-4.2,-2.8,-1.4,0,1.4,2.8,4.2,5.6):
    quad('SPRUANCE_bridge_window',[(x-.47,15.20,35.86),(x+.47,15.20,35.86),(x+.47,16.02,35.82),(x-.47,16.02,35.82)],4)
for side in (-1,1):
    for z in (26,27.5,29,30.5,32):quad('SPRUANCE_bridge_side_window',[(side*6.97,15.2,z-.48),(side*6.97,15.2,z+.48),(side*6.92,16.02,z+.48),(side*6.92,16.02,z-.48)],4)
    box('SPRUANCE_bridge_wing',(side*7.18,14.62,27.1),(1.45,.85,4.3),0)
    box('SPRUANCE_wing_inset',(side*7.18,15.06,27.1),(1.2,.035,4.0),2)
chamfer_house('SPRUANCE_mid_house',-7,6.18,10.8,13.3,15.0,12.8,14.5,.45,0)
chamfer_house('SPRUANCE_hangar',-28.5,6.02,14.35,14.4,23.0,13.8,22.5,.45,0)
for x in (-3.55,3.55):box('SPRUANCE_hangar_door',(x,9.30,-40.03),(6.25,6.15,.08),10)
box('SPRUANCE_hangar_center_pillar',(0,9.35,-40.15),(.45,6.5,.30),1)
chamfer_house('SPRUANCE_aft_control',-27,14.3,17.3,7.8,7.6,7.5,7.3,.4,1)
for x in (-2.6,-1.3,0,1.3,2.6):box('SPRUANCE_aft_control_window',(x,16.15,-30.74),(.8,.65,.025),4)
for z,y,w,l in [(11,11.15,7.4,7.7),(-19,14.25,7.0,7.2)]:
    top=22.1 if z>0 else 22.5
    taper('SPRUANCE_stack',0,z,y,top,w,l,w-.5,l-.5,0)
    box('SPRUANCE_stack_cap',(0,top+.10,z),(w-.2,.2,l-.2),6)
    for x in (-1.75,1.75):
        for dz in (-1.85,1.85):beam('SPRUANCE_exhaust',(x,top,z+dz),(x,top+1.2,z+dz),.91,6,n=10)
    for side in (-1,1):box('SPRUANCE_stack_intake',(side*(w/2+.01),y+2.5,z),(.04,3.5,l-1),10)
# Open lattice masts: two tall recognisable silhouettes, not opaque towers.
def mast(z,base,top,width):
    for x,zz in [(-width/2,z-width/2),(width/2,z-width/2),(-width/2,z+width/2),(width/2,z+width/2)]:
        beam('SPRUANCE_mast_leg',(x,base,zz),(x*.46,top,z+(zz-z)*.46),.115,0,n=5)
    levels=5
    for j in range(levels):
        y0=base+(top-base)*j/levels;y1=base+(top-base)*(j+1)/levels
        w0=width*(1-.54*j/levels)/2;w1=width*(1-.54*(j+1)/levels)/2
        for side in (-1,1):
            beam('SPRUANCE_mast_xbrace',(side*w0,y0,z-w0),(side*w1,y1,z+w1),.065,0,n=4)
            beam('SPRUANCE_mast_xbrace',(side*w0,y0,z+w0),(side*w1,y1,z-w1),.065,0,n=4)
            beam('SPRUANCE_mast_crossbrace',(-w0,y0,z+side*w0),(w1,y1,z+side*w1),.06,0,n=4)
    for yy,ww in [(top-7,8),(top-2.5,9),(top+.2,11)]:
        box('SPRUANCE_mast_platform',(0,yy,z),(ww,.14,2.5),0)
        for side in (-1,1):
            beam('SPRUANCE_platform_stanchion',(side*(ww/2-.15),yy,z),(side*(ww/2-.15),yy+.8,z),.045,1,n=4)
            beam('SPRUANCE_platform_rail',(side*(ww/2-.15),yy+.8,z-1.1),(side*(ww/2-.15),yy+.8,z+1.1),.03,1,n=4)
        beam('SPRUANCE_yard',(-ww/2,yy+.6,z),(ww/2,yy+.6,z),.065,0,n=6)
        for dz in (-1.1,1.1):beam('SPRUANCE_platform_front_rail',(-ww/2,yy+.8,z+dz),(ww/2,yy+.8,z+dz),.03,1,n=4)
    beam('SPRUANCE_topmast',(0,top,z),(0,top+6,z),.10,0,n=6,r2=.05)
    for yy,ww in [(top+2,4.0),(top+4,3.0)]:beam('SPRUANCE_upper_yard',(-ww/2,yy,z),(ww/2,yy,z),.055,6,n=5)
mast(23.5,11.2,33.5,3.8);mast(-7.3,10.8,30.8,4.0)
# Radar shapes: SPS-40 rectangular open antenna fore; SPS-55/49 aft.
box('SPRUANCE_fore_radar_pedestal',(0,28.3,23.5),(1.0,1.0,.9),6)
for x in (-2.8,-1.4,0,1.4,2.8):beam('SPRUANCE_fore_radar_grid',(x,29.2,23.5),(x,31.2,23.5),.04,6,n=4)
for y in (29.2,30.2,31.2):beam('SPRUANCE_fore_radar_frame',(-2.8,y,23.5),(2.8,y,23.5),.055,6,n=4)
for x in (-2.4,-1.2,0,1.2,2.4):beam('SPRUANCE_aft_radar_grid',(x,26.1,-7.2),(x,28.6,-7.2),.045,6,n=4)
for y in (26.1,27.35,28.6):beam('SPRUANCE_aft_radar_frame',(-2.4,y,-7.2),(2.4,y,-7.2),.05,6,n=4)
for ob in list(hull.objects):
    if ob.name.startswith(('SPRUANCE_fore_radar_grid','SPRUANCE_fore_radar_frame')):
        center=G((0,30,23.5));ob.matrix_world=Matrix.Translation(center)@Matrix.Rotation(.65,4,'Z')@Matrix.Translation(-center)@ob.matrix_world
o=sphere('SPRUANCE_fore_mast_dome',(-2.0,25.3,24),1.0,1)
for p in o.data.polygons:p.use_smooth=True
for z,y in [(32,17.0),(-24,17.4)]:
    beam('SPRUANCE_director_base',(0,y,z),(0,y+1.25,z),.65,0,n=10)
    o=sphere('SPRUANCE_director',(0,y+1.9,z),1.05,1)
    for p in o.data.polygons:p.use_smooth=True
# 61-cell VLS on forecastle, represented with flat lids rather than hidden tubes.
box('SPRUANCE_VLS',(0,interp(47,2)+.22,47),(10,.44,10.2),1)
for row in range(8):
    for col in range(8):
        if row==0 and col<3:continue
        x=(col-3.5)*1.13;z=47+(row-3.5)*1.15;y=interp(47,2)+.455
        quad('SPRUANCE_VLS_lid',[(x-.47,y,z-.48),(x+.47,y,z-.48),(x+.47,y,z+.48),(x-.47,y,z+.48)],13)
box('SPRUANCE_VLS_service_panel',(-2.825,interp(47,2)+.47,42.975),(3.2,.06,.95),6)
# Helideck markings follow deck sheer (no floating texture planes).
def deckline(name,a,b,width=.14,tile=8):
    d=Vector((b[0]-a[0],b[1]-a[1]));d.normalize();p=Vector((-d.y,d.x))*width/2
    vs=[(x,interp(z,2)+.035,z) for x,z in [(a[0]+p.x,a[1]+p.y),(b[0]+p.x,b[1]+p.y),(b[0]-p.x,b[1]-p.y),(a[0]-p.x,a[1]-p.y)]]
    quad(name,vs,tile)
for a,b in [((-6.3,-43),(6.3,-43)),((-6.3,-60),(6.3,-60)),((-6.3,-43),(-6.3,-60)),((6.3,-43),(6.3,-60)),((0,-42),(0,-63))]:deckline('SPRUANCE_flightdeck_line',a,b)
for i in range(32):
    a=math.tau*i/32;b=math.tau*(i+1)/32
    deckline('SPRUANCE_landing_circle',(4.0*math.cos(a),-51+4*math.sin(a)),(4*math.cos(b),-51+4*math.sin(b)),.15)
for a,b in [((-2.1,-49.3),(-2.1,-52.7)),((2.1,-49.3),(2.1,-52.7)),((-2.1,-51),(2.1,-51))]:deckline('SPRUANCE_landing_H',a,b,.25)
# Railings, doors, life rafts and vents: thin silhouette details.
for side in (-1,1):
    zs=[-85,-77,-69,-61,-53,-45,-37,-29,-21,-13,-5,3,11,19,27,35,43,51,59,66,72,77,81,84]
    for z in zs:
        x=side*(interp(z,1)-.16);y=interp(z,2)
        beam('SPRUANCE_stanchion',(x,y,z),(x,y+1.05,z),.033,1,n=4)
    for a,b in zip(zs,zs[1:]):
        for dy in (.5,1.05):beam('SPRUANCE_rail',(side*(interp(a,1)-.16),interp(a,2)+dy,a),(side*(interp(b,1)-.16),interp(b,2)+dy,b),.022,1,n=4)
    for z in (-74,-54,-29,-5,24,54,72):
        x=side*(interp(z,1)-.72);y=interp(z,2)
        box('SPRUANCE_bollard_bed',(x,y+.04,z),(.85,.08,1.4),6)
        for dz in (-.42,.42):beam('SPRUANCE_bollard',(x,y,z+dz),(x,y+.62,z+dz),.14,6,n=6)
    for z in (-32,-23,5,14,24):
        x=side*(7.25 if z<0 else 7.15)
        box('SPRUANCE_service_door',(x,8.25,z),(.035,2.1,.95),13)
        box('SPRUANCE_door_window',(x+side*.025,8.72,z),(.03,.35,.50),4)
    for z in (-34,-30,-26,2,6):
        beam('SPRUANCE_liferaft',(side*7.55,7.6,z-.7),(side*7.55,7.6,z+.7),.50,1,n=8)
    for z in (-32,6,15):box('SPRUANCE_vent',(side*7.11,9.2,z),(.035,1.6,2.0),10)
    for z in (-72,-50,-28,0,32,58,74):
        w=interp(z,1);y=interp(z,2)
        quad('SPRUANCE_drain',[(side*(w+.01),y-.12,z-.20),(side*(w+.01),y-.12,z+.20),(side*(w-.10),y-.70,z+.20),(side*(w-.10),y-.70,z-.20)],6)
    # RHIB in the gap alongside the aft mast, with a dark cockpit recess.
    boat=chamfer_house('SPRUANCE_boat',-10.0,7.2,8.1,1.4,5.0,1.55,5.4,.55,1)
    boat.location.x=side*7.0
    box('SPRUANCE_boat_cockpit',(side*7.0,8.12,-10),(1.0,.04,3.0),5)
for side in (-1,1):
    beam('SPRUANCE_anchor_chain',(side*1.8,8.05,75),(side*.8,8.2,81),.085,6,n=5)
beam('SPRUANCE_jackstaff',(0,8.2,84),(0,11.1,84),.05,6,n=5)
beam('SPRUANCE_stern_staff',(0,5.7,-84),(0,8.5,-84),.05,6,n=5)
for side in (-1,1):
    curve=bpy.data.curves.new('DD963_number','FONT');curve.body='963';curve.size=2.65;curve.align_x='CENTER';curve.resolution_u=1
    text=bpy.data.objects.new('SPRUANCE_963',curve);hull.objects.link(text)
    text.location=G((side*6.83,3.40,53.0));text.rotation_euler=Matrix(((0,0,side),(side,0,0),(0,1,0))).to_euler()
    bpy.ops.object.select_all(action='DESELECT');text.select_set(True);bpy.context.view_layer.objects.active=text;bpy.ops.object.convert(target='MESH')
    text.data.materials.append(paint)
    if not text.data.uv_layers:text.data.uv_layers.new(name='UVMap')
    for v in text.data.uv_layers.active.data:v.uv=(.125,.375)
    # Conform identification to the flare instead of intersecting the bow.
    for v in text.data.vertices:
        p=text.matrix_world@v.co;z=-p.y;y=p.z
        w=interp(z,1);h=interp(z,2)
        p.x=side*(w*(.925+.075*(y-.35)/(h-.35))+.035)
        v.co=text.matrix_world.inverted()@p
    text.select_set(False)
# Two shafts/propellers, rudders; no rooms below deck.
for x in (-3.5,3.5):
    beam('SPRUANCE_shaft',(x,-3.3,-51),(x,-4.2,-75),.20,6,n=8)
    beam('SPRUANCE_prop_hub',(x,-4.2,-74),(x,-4.2,-76),.42,9,n=8)
    for i in range(5):
        a=i*math.tau/5
        quad('SPRUANCE_prop_blade',[(x+u*math.cos(a)-v*math.sin(a),-4.2+u*math.sin(a)+v*math.cos(a),-75) for u,v in [(.3,-.1),(2.0,-.3),(2.35,.35),(.45,.35)]],9)
    taper('SPRUANCE_rudder',x,-80,-5.4,-1.0,.28,2.6,.30,2.8,6)
# Modular weapon templates; origin at mount foot; +Z is forward.
templates={}
def template(key):
    global current
    current=collection('SPRUANCE_TEMPLATE_'+key);templates[key]=current
template('mk45')
lathe('MK45_base',0,0,[(0,1.6),(.45,1.6)],16,6)
chamfer_house('MK45_shield',0,.45,3.65,3.25,3.8,2.45,2.65,.55,1)
beam('MK45_trunnion',(-.45,2.35,1.05),(.45,2.35,1.05),.48,6,n=10)
beam('MK45_barrel',(0,2.35,1.10),(0,2.62,7.5),.19,6,n=10,r2=.11)
beam('MK45_muzzle',(0,2.60,7.15),(0,2.63,7.7),.16,5,n=10)
empty('bf_muzzle',(0,2.63,7.7),col=current)
template('phalanx')
lathe('PHALANX_base',0,0,[(0,.93),(.6,.93),(.75,.70),(1.25,.70)],12,0)
box('PHALANX_yoke',(0,1.60,0),(1.75,1.6,1.45),0)
lathe('PHALANX_radome',-.28,2.25,[(0,.79),(1.55,.79),(1.85,.6),(2.05,.15)],12,1)
box('PHALANX_magazine',(.78,1.6,.30),(.65,1.0,1.2),6)
beam('PHALANX_barrels',(0,1.55,.65),(0,1.55,2.65),.19,6,n=8)
beam('PHALANX_muzzle',(0,1.55,2.60),(0,1.55,2.85),.24,5,n=8)
empty('bf_muzzle',(0,1.55,2.85),col=current)
template('seasparrow')
lathe('MK29_base',0,0,[(0,.95),(.5,.95),(1.2,.62)],12,0)
for x in (-1.05,1.05):box('MK29_yoke',(x,1.65,0),(.27,1.55,1.0),0)
start=set(current.objects)
for x in (-.98,.98):
    box('MK29_bank',(x,2.4,0),(1.75,1.75,3.4),1,bevel=.07)
    for dx in (-.41,.41):
        for y in (1.99,2.81):
            box('MK29_cell_border',(x+dx,y,1.73),(.73,.73,.08),6)
            box('MK29_cell_cap',(x+dx,y,1.78),(.59,.59,.045),1)
axis=G((0,2.4,0));tilt=Matrix.Translation(axis)@Matrix.Rotation(-math.radians(12),4,'X')@Matrix.Translation(-axis)
for ob in set(current.objects)-start:ob.matrix_world=tilt@ob.matrix_world
empty('bf_muzzle',(0,2.76,1.80),col=current)
template('harpoon')
for x in (-.58,.58):
    for yy in (1.0,2.13):
        start=set(current.objects)
        beam('HARPOON_canister',(x,yy,-2.5),(x,yy,2.5),.52,0,n=8)
        for z in (-2.47,2.47):beam('HARPOON_cap',(x,yy,z-.08),(x,yy,z+.08),.57,1,n=8)
        for z in (-1.45,1.45):beam('HARPOON_band',(x,yy,z-.07),(x,yy,z+.07),.55,6,n=8)
        incline=Matrix.Rotation(-math.radians(14),4,'X')
        for ob in set(current.objects)-start:ob.matrix_world=incline@ob.matrix_world
for z in (-1.7,1.7):box('HARPOON_bed',(0,.27,z),(2.7,.54,.55),6)
empty('bf_muzzle',(0,2.9,2.43),col=current)
current=hull
slots={'main_fwd':((0,interp(63,2)+.20,63),0,'mk45'),
       'ciws_fwd':((-6.8,12.00,18),0,'phalanx'),
       'sam_aft':((0,interp(-66,2)+.15,-66),math.pi,'seasparrow')}
rails={'ssm_rail_port':((-4.7,11.20,-1.5),-math.pi/2,'harpoon'),
       'ssm_rail_starboard':((4.7,11.20,-1.5),math.pi/2,'harpoon')}
box('SPRUANCE_CIWS_platform',(-6.5,11.79,18),(3.6,.42,3.5),0)
for sid,(p,yaw,key) in slots.items():empty('SOCKET_'+sid,p);instance(key,p,yaw)
for sid,(p,yaw,key) in rails.items():empty('RAIL_'+sid,p,yaw);instance(key,p,yaw)
def static_instance(key,p,yaw):
    tr=Matrix.Translation(G(p))@Matrix.Rotation(yaw,4,'Z')
    for o in templates[key].objects:
        if o.type!='MESH':continue
        n=o.copy();n.data=o.data.copy();n.name='STATIC_'+o.name;hull.objects.link(n);n.matrix_world=tr@o.matrix_world;n['visual_only']=True
static_instance('mk45',(0,interp(-77,2)+.15,-77),math.pi)
static_instance('phalanx',(5.8,14.38,-32),math.pi)
empty('OPTIONAL_main_aft',(0,interp(-77,2)+.15,-77),math.pi)
empty('OPTIONAL_ciws_aft',(5.8,14.38,-32),math.pi)
bpy.context.view_layer.update()
bounds={o.name:{'min':[min((o.matrix_world@Vector(v))[i] for v in o.bound_box) for i in range(3)],'max':[max((o.matrix_world@Vector(v))[i] for v in o.bound_box) for i in range(3)]} for o in [*hull.objects,*weapons.objects] if o.type=='MESH'}
(OUT/'component-bounds.json').write_text(json.dumps(bounds,indent=2))
for c in [hull,*templates.values()]:join(c)
total=tris(hull)+sum(tris(templates[key]) for p,yaw,key in [*slots.values(),*rails.values()])
assert total<=10000,{'total':total,'parts':{c.name:tris(c) for c in [hull,*templates.values()]}}
(OUT/'geometry-stats.json').write_text(json.dumps({'assembled_triangles':total,'parts':{c.name:tris(c) for c in [hull,*templates.values()]}},indent=2))
WEATHER_PATCHES=[(-76,1.3,2.2),(-54,1.6,2.8),(-28,1.4,2.3),(-5,1.3,2.8),(25,1.5,2.5),(54,1.5,3.3),(72,1.4,2.7)]
exec(compile((ROOT/'scripts/blender/gepard_weathering_materials.py').read_text(encoding='utf-8'),'weathering_materials','exec'))
# Presentation is never exported.
current=studio
water=bpy.data.materials.new('Spruance_Sea');water.use_nodes=True
p=water.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.03,.10,.14,1);p.inputs['Roughness'].default_value=.43
box('PREVIEW_sea',(0,-.3,0),(1500,.1,1500),mat=water)
world=bpy.data.worlds.new('Spruance_World');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.64,.72,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
def camera(name,pos,target,scale):
    c=bpy.data.objects.new(name,bpy.data.cameras.new(name));studio.objects.link(c);c.location=G(pos)
    c.rotation_euler=(G(target)-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=scale;return c
scene.camera=camera('Spruance_Hero',(140,100,150),(0,10,0),197)
camera('Spruance_Side',(-200,12,0),(0,12,0),190)
camera('Spruance_Top',(0,200,0),(0,0,0),190)
sun=bpy.data.objects.new('Spruance_Sun',bpy.data.lights.new('Spruance_Sun','SUN'));studio.objects.link(sun);sun.rotation_euler=(.45,-.6,-.6);sun.data.energy=2.4;sun.data.angle=.13
for pos,power in [((-100,160,50),400000),((80,120,-90),340000)]:
    o=bpy.data.objects.new('Spruance_Area',bpy.data.lights.new('Spruance_Area','AREA'));studio.objects.link(o);o.location=G(pos);o.rotation_euler=(G((0,8,0))-o.location).to_track_quat('-Z','Y').to_euler();o.data.energy=power;o.data.size=90
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
for c in templates.values():c.hide_render=True;c.hide_viewport=True
bpy.ops.object.select_all(action='DESELECT')
scene.render.filepath=str(OUT/'spruance_hero.png')
bpy.data.libraries.write(str(OUT/'spruance_geometry.blend'),{scene},fake_user=True)
result={'scene':scene.name,'triangles':total,'parts':{c.name:tris(c) for c in [hull,*templates.values()]}}
