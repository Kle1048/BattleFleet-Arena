"""Reference-led Slava exterior. New source scene; canonical cruiser identities.
Author coordinates +X starboard, +Y up, +Z bow. No interiors / new weapons rules.
186 author units express the supplied proportions; retain 169.946 game metres.
"""
import bpy,bmesh,math,json,ast
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT=ROOT/'assets/blender/slava';OUT.mkdir(parents=True,exist_ok=True)
ASSET_SLUG='slava';LENGTH=186.0;GAME_METRES_PER_UNIT=169.946/LENGTH
G=lambda p:Vector((p[0],-p[2],p[1]))
scene=bpy.data.scenes.new('Slava_Reference_Asset');bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
scene['bfa_model_id']='cruiser';scene['bfa_metres_per_unit']=GAME_METRES_PER_UNIT;scene['bfa_marker_contract']=2
scene['reference']='Six user references; exterior only; real photograph prioritized over modified NavalArt drawing'
scene['static_weapons']='Five extra AK630, aft director, twelve SSM canisters and VLS covers are visual only'
def collection(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
hull=collection('SLAVA_HULL');helpers=collection('SLAVA_MARKERS');weapons=collection('SLAVA_MOUNTS_PREVIEW');studio=collection('SLAVA_PRESENTATION');current=hull
hull['bfa_model_id']='cruiser';helpers['bfa_model_id']='cruiser'
atlas=bpy.data.images.load(str(ROOT/'assets/blender/f124/textures/f124_surface_basecolor.png'),check_existing=False);atlas.pack()
rough=bpy.data.images.load(str(ROOT/'assets/blender/f124/textures/f124_surface_roughness.png'),check_existing=False);rough.colorspace_settings.name='Non-Color';rough.pack()
paint=bpy.data.materials.new('Slava_Paint');paint.use_nodes=True
bs=paint.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=.045
for im,sock in [(atlas,'Base Color'),(rough,'Roughness')]:
    t=paint.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;paint.node_tree.links.new(t.outputs['Color'],bs.inputs[sock])
for file,names in [('create_f124_asset.py',{'mesh','box','beam','taper','chamfer_house','quad','empty','sphere'}),('create_gepard_asset.py',{'lathe','join','instance','tris'})]:
    tree=ast.parse((ROOT/'scripts/blender'/file).read_text(encoding='utf-8'))
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),file,'exec'))
exec(compile((ROOT/'scripts/blender/canonical_publish.py').read_text(encoding='utf-8'),'canonical_publish','exec'))
original_beam=beam
def beam(name,a,b,r,tile=0,n=8,r2=None):
    if name.startswith('P500_'):
        # Collars are sleeves: their hidden end disks add nothing to silhouette.
        a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,1,0))).normalized();v=d.cross(u);n=8
        vs=[tuple(p+rr*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))) for p,rr in ((a,r),(b,r if r2 is None else r2)) for i in range(n)]
        faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        if name=='P500_canister':faces.append(tuple(reversed(range(n))))
        if name=='P500_cap_face':faces.append(tuple(range(n,2*n)))
        return mesh(name,vs,faces,tile)
    if r>.15:return original_beam(name,a,b,r,tile,n,r2)
    a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,1,0)))
    if u.length<.01:u=d.cross(Vector((1,0,0)))
    u.normalize();v=d.cross(u)
    vs=[tuple(p+rr*(u*math.cos(i*math.tau/3)+v*math.sin(i*math.tau/3))) for p,rr in ((a,r),(b,r if r2 is None else r2)) for i in range(3)]
    return mesh(name,vs,[(i,(i+1)%3,(i+1)%3+3,i+3) for i in range(3)],tile)
original_sphere=sphere
def sphere(name,c,r,tile=1):
    if r>2:return original_sphere(name,c,r,tile)
    n=8;vs=[(c[0],c[1]+r,c[2])]
    for j in range(1,4):
        t=math.pi*j/4
        vs.extend([(c[0]+r*math.sin(t)*math.cos(i*math.tau/n),c[1]+r*math.cos(t),c[2]+r*math.sin(t)*math.sin(i*math.tau/n)) for i in range(n)])
    vs.append((c[0],c[1]-r,c[2]));faces=[]
    for i in range(n):
        faces.append((0,1+i,1+(i+1)%n));faces.append((25,17+(i+1)%n,17+i))
        for j in range(2):faces.append((1+j*n+i,1+j*n+(i+1)%n,1+(j+1)*n+(i+1)%n,1+(j+1)*n+i))
    return mesh(name,vs,faces,tile)
def roof(ob,tile=12):
    for p in ob.data.polygons:
        if p.normal.z>.65:
            for k in p.loop_indices:
                uv=ob.data.uv_layers.active.data[k].uv;uv.x=(uv.x*4%1+tile%4)/4;uv.y=(uv.y*4%1+3-tile//4)/4
    return ob
def house(name,z,y0,y1,w,l,w1=None,l1=None,cut=.5):
    return roof(chamfer_house('SLAVA_'+name,z,y0,y1,w,l,w if w1 is None else w1,l if l1 is None else l1,cut,0))
def railing(x,y,z,w,l):
    for s in (-1,1):
        for zz in (z-l/2,z+l/2):beam('SLAVA_platform_post',(x+s*w/2,y,zz),(x+s*w/2,y+.95,zz),.035,1)
        for yy in (y+.45,y+.95):beam('SLAVA_platform_rail',(x+s*w/2,yy,z-l/2),(x+s*w/2,yy,z+l/2),.025,1)
    for zz in (z-l/2,z+l/2):beam('SLAVA_platform_end',(x-w/2,y+.95,zz),(x+w/2,y+.95,zz),.025,1)
def platform(name,x,y,z,w,l):
    roof(box(name,(x,y,z),(w,.18,l),0));railing(x,y+.09,z,w,l)
def smooth(o):
    for p in o.data.polygons:p.use_smooth=True
    return o
stations=[(-93,8.6,5.4),(-89,9.5,5.5),(-78,10.1,5.6),(-60,10.4,5.7),(-40,10.4,5.8),(-20,10.4,6.0),
 (0,10.4,6.3),(20,10.2,6.6),(35,9.9,6.9),(50,9.2,7.2),(62,8.0,7.5),(72,6.5,7.8),(80,4.6,8.05),(87,2.45,8.3),(91,1.05,8.45),(93,.06,8.5)]
def interp(z,index):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=z<=b[0]:return a[index]+(b[index]-a[index])*(z-a[0])/(b[0]-a[0])
    return stations[0 if z<0 else -1][index]
def bottom(z):return -5.8+3.5*(max(0,-z-55)/38)**1.3+2.5*(max(0,z-60)/33)**1.7
def rake(z,y):
    if z>62:return z-(z-62)/31*max(0,interp(z,2)-y)*.67
    if z<-72:return z+(-72-z)/21*max(0,1-y)*.35
    return z
def shell(name,low,high,tile):
    vs=[]
    for z,w,h in stations:
        for y,scale in (low(z,h),high(z,h)):vs.extend([(-w*scale,y,rake(z,y)),(w*scale,y,rake(z,y))])
    fs=[]
    for i in range(len(stations)-1):
        a=4*i;b=a+4;fs.extend([(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
    fs.extend([(0,2,3,1),(len(vs)-4,len(vs)-3,len(vs)-1,len(vs)-2)])
    return mesh(name,vs,fs,tile)
shell('SLAVA_underbody',lambda z,h:(bottom(z),.52),lambda z,h:(-.45,.90),7)
shell('SLAVA_bootstripe',lambda z,h:(-.45,.90),lambda z,h:(.3,.925),5)
shell('SLAVA_topsides',lambda z,h:(.3,.925),lambda z,h:(h,1),0)
mesh('SLAVA_deck',[(s*w,h,z) for z,w,h in stations for s in (-1,1)],[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(stations)-1)],12)
mesh('SLAVA_keel',[(s*w*.52,bottom(z),rake(z,bottom(z))) for z,w,h in stations for s in (-1,1)],[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(stations)-1)],7)
# Sonar fairing and twin shafts are deliberately simple below the waterline.
o=smooth(sphere('SLAVA_sonar',(0,-5.5,70),2.5,7))
for v in o.data.vertices:v.co.y=-70+(v.co.y+70)*1.8
for x in (-3.9,3.9):
    beam('SLAVA_shaft',(x,-3.2,-54),(x,-4.0,-82),.22,6,n=8)
    beam('SLAVA_propeller_hub',(x,-4,-80),(x,-4,-82),.42,9,n=8)
    for i in range(4):
        a=i*math.tau/4
        quad('SLAVA_propeller',[(x+u*math.cos(a)-v*math.sin(a),-4+u*math.sin(a)+v*math.cos(a),-81) for u,v in [(.25,-.1),(2,-.4),(2.3,.3),(.3,.35)]],9)
    taper('SLAVA_rudder',x,-87,-5.0,-1,.25,3,.3,3,0)
# Long narrow forecastle house flanked by the exposed missile batteries.
house('forecastle_house',45,7.0,10.45,5.6,38,5.4,36,.65)
house('forward_main_block',22.0,6.7,15.0,7.4,23,8.0,21,.6)
house('bridge_lower',25,14.8,18.7,12.3,13.8,12.2,13.3,.75)
house('bridge_wings',25.8,18.6,20.65,17.2,12.6,16.8,12.4,1.9)
for x in (-6.4,-5,-3.6,-2.2,-.8,.8,2.2,3.6,5,6.4):
    quad('SLAVA_bridge_front_window',[(x-.47,19.05,32.115),(x+.47,19.05,32.115),(x+.47,20.12,32.02),(x-.47,20.12,32.02)],4)
for side in (-1,1):
    for z in (22.2,24,25.8,27.6):quad('SLAVA_bridge_side_window',[(side*8.57,19.0,z-.54),(side*8.57,19.0,z+.54),(side*8.44,20.1,z+.54),(side*8.44,20.1,z-.54)],4)
    for z in (22,27):beam('SLAVA_bridge_brace',(side*5.9,16.7,z),(side*8.35,18.65,z),.11,0)
railing(0,20.75,25.8,16.7,12.2)
house('bridge_roof_cabin',25.7,20.65,21.75,7.0,6.8,6.8,6.6,.5)
# Solid, stepped pyramidal foremast; platforms are offset and differently sized.
house('foremast_base',16.6,14.95,23.1,9.6,10.0,7.0,7.8,.65)
house('foremast_lower',16.0,23.0,30.0,7.2,7.8,4.8,5.5,.4)
house('foremast_upper',15.6,30.0,37.3,4.9,5.6,2.6,3.1,.25)
house('foremast_head',15.5,37.2,41,2.7,3.1,1.65,2.3,.15)
for x,y,z,w,l in [(-3.9,25.5,17.2,3.4,3.7),(3.8,28.5,16.3,3.6,3.0),(0,32.9,15.6,7.5,3.1),(0,37.5,15.5,6.4,2.9)]:platform('SLAVA_fore_sensor_platform',x,y,z,w,l)
for side in (-1,1):
    for z,y in [(21,23.0),(13,29.5)]:
        beam('SLAVA_sensor_post',(side*4.8,y,z),(side*4.8,y+1.2,z),.22,0,n=8)
        smooth(sphere('SLAVA_white_radome',(side*4.8,y+1.9,z),.78,1))
    beam('SLAVA_fore_yard',(0,35,16),(side*7.0,35,16),.11,0)
    beam('SLAVA_fore_yard_brace',(0,33,16),(side*7,35,16),.065,0)
    beam('SLAVA_fore_yard_aerial',(side*6.5,35,16),(side*6.5,37.2,16),.03,6)
beam('SLAVA_fore_topmast',(0,40.5,15.5),(0,46,15.5),.095,0,r2=.035)
ladder=[(15.2,21.72),(23.1,20.63),(30,18.87),(37.2,17.32)]
for x in (.90,1.52):
    for (y0,z0),(y1,z1) in zip(ladder,ladder[1:]):beam('SLAVA_mast_ladder_rail',(x,y0,z0),(x,y1,z1),.03,6)
for j in range(24):
    y=15.3+j*.93
    for (y0,z0),(y1,z1) in zip(ladder,ladder[1:]):
        if y0<=y<=y1:
            z=z0+(z1-z0)*(y-y0)/(y1-y0);beam('SLAVA_mast_ladder_rung',(.90,y,z),(1.52,y,z),.025,6);break
box('SLAVA_top_search_array',(0,42.2,15.5),(3.5,2.3,.35),6)
for x in (-1.2,-.4,.4,1.2):box('SLAVA_top_array_rib',(x,42.2,15.72),(.025,2.25,.04),1)
# Lower central mast with the big canted open search radar behind the foremast.
house('central_equipment',-5,6.1,13.3,14.2,27,13.4,26,.7)
house('aftmast_pyramid',-8.5,13.3,26.0,6.0,7.2,2.8,3.6,.3)
platform('SLAVA_aft_radar_platform',0,26,-8.5,5.7,5)
beam('SLAVA_aft_radar_pedestal',(0,26,-8.5),(0,28,-8.5),.4,0,n=8)
# Rectangular curved grid, tilted backwards, with no opaque oversized slab.
for j in range(11):
    x=-4.2+j*.84
    beam('SLAVA_search_array_rib',(x,28,-8.3+.45*(x/4.2)**2),(x,35.5,-10.0+.45*(x/4.2)**2),.048,6)
for k in range(9):
    y=28+k*7.5/8;z=-8.3-(y-28)*1.7/7.5
    for j in range(5):
        x0=-4.2+j*1.68;x1=x0+1.68
        beam('SLAVA_search_array_grid',(x0,y,z+.45*(x0/4.2)**2),(x1,y,z+.45*(x1/4.2)**2),.035,6)
for s in (-1,1):beam('SLAVA_search_array_brace',(0,27.5,-8.5),(s*4.2,35.5,-9.55),.09,0)
# Broad twin funnel unit, four deeply dark rectangular openings.
house('funnel_base',-23,6.0,13.4,14.6,15.8,13.9,15.1,.6)
for side in (-1,1):
    o=taper('SLAVA_funnel',side*3.4,-23,13.3,22.2,5.7,12.6,4.7,10.8,0);roof(o)
    box('SLAVA_funnel_soot_rim',(side*3.4,22.23,-23),(4.82,.24,10.92),6)
    for z in (-25.8,-20.2):box('SLAVA_funnel_opening',(side*3.4,22.37,z),(4.2,.04,4.9),5)
    for z in (-27,-23,-19):box('SLAVA_funnel_side_grille',(side*6.28,15.1,z),(.025,2.6,2.6),10)
    platform('SLAVA_funnel_gallery',side*7.5,12.6,-23,1.0,16.2)
# Eight circular VLS covers in two longitudinal rows; low, open mid-aft deck.
for x in (-4.3,4.3):
    for z in (-36.5,-42.5,-48.5,-54.5):
        o=lathe('SLAVA_VLS_coaming',z,interp(z,2),[(0,2.05),(.22,2.05)],8,6);o.location.x=x
        mesh('SLAVA_VLS_lid',[(x+1.84*math.cos(i*math.tau/16),interp(z,2)+.255,z+1.84*math.sin(i*math.tau/16)) for i in range(16)],[tuple(range(16))],0)
        box('SLAVA_VLS_hinge',(x,interp(z,2)+.40,z+1.5),(.8,.15,.32),6)
# Aft hangar and elevated Top Dome director.
house('aft_hangar',-68,5.5,10.2,13.4,18,12.8,17.6,.65)
house('aft_director_house',-66.5,10.2,13.6,8.6,9.8,7.8,9.2,.5)
platform('SLAVA_director_platform',0,13.6,-66.5,8.8,10.2)
beam('SLAVA_director_pedestal',(0,13.7,-66.5),(0,15.2,-66.5),1.45,0,n=12)
# Tilted radar radome body: round face / shallow bowl viewed from the side.
o=smooth(sphere('SLAVA_Top_Dome',(0,17.3,-66.5),2.75,1))
for v in o.data.vertices:v.co.y=66.5+(v.co.y-66.5)*.58
beam('SLAVA_director_face',(0,17.3,-64.89),(0,17.3,-64.7),2.35,3,n=16)
box('SLAVA_hangar_door',(0,7.7,-77.05),(8.4,4.2,.05),10)
for y in (6,6.8,7.6,8.4,9.2):box('SLAVA_hangar_slat',(0,y,-77.10),(8.3,.035,.04),1)
for side in (-1,1):
    platform('SLAVA_hangar_sidewalk',side*6.8,10.25,-68,1.1,16.7)
    for z in (-61,-69):box('SLAVA_hangar_windows',(side*6.71,8.8,z),(.025,.48,.9),4)
# Flight deck is right at the transom, with low safety nets.
def deckline(a,b,width=.15,tile=8):
    d=Vector((b[0]-a[0],b[1]-a[1])).normalized();p=Vector((-d.y,d.x))*width/2
    quad('SLAVA_deck_marking',[(x,interp(z,2)+.04,z) for x,z in [(a[0]+p.x,a[1]+p.y),(b[0]+p.x,b[1]+p.y),(b[0]-p.x,b[1]-p.y),(a[0]-p.x,a[1]-p.y)]],tile)
for a,b in [((-6.8,-78.5),(6.8,-78.5)),((-6.8,-91),(6.8,-91)),((-6.8,-78.5),(-6.8,-91)),((6.8,-78.5),(6.8,-91)),((-1.6,-82),(-1.6,-87)),((1.6,-82),(1.6,-87)),((-1.6,-84.5),(1.6,-84.5))]:deckline(a,b)
for i in range(28):
    a=i*math.tau/28;b=(i+1)*math.tau/28;deckline((4.8*math.cos(a),-84.6+4.8*math.sin(a)),(4.8*math.cos(b),-84.6+4.8*math.sin(b)))
# Deck equipment keeps the topside readable without dense hidden geometry.
for side in (-1,1):
    zs=[-92,-84,-76,-68,-60,-52,-44,-36,-28,-20,-12,-4,4,12,20,28,36,44,52,60,68,75,81,86,90,92]
    for z in zs:
        x=side*(interp(z,1)-.15);y=interp(z,2);beam('SLAVA_rail_post',(x,y,z),(x,y+1.0,z),.034,1)
    for a,b in zip(zs,zs[1:]):
        for dy in (.48,1.0):beam('SLAVA_rail_wire',(side*(interp(a,1)-.15),interp(a,2)+dy,a),(side*(interp(b,1)-.15),interp(b,2)+dy,b),.025,1)
    for z in (-84,-59,-30,0,34,72,83):
        x=side*(interp(z,1)-.8);y=interp(z,2)
        box('SLAVA_bollard_foot',(x,y+.06,z),(1.0,.12,1.5),6)
        for dz in (-.45,.45):beam('SLAVA_bollard',(x,y,z+dz),(x,y+.65,z+dz),.16,6,n=6)
    for z in (-70,-60,-32,-5,15,35,55,74):
        y=interp(z,2);w=interp(z,1)
        quad('SLAVA_scupper',[(side*(w+.015),y-.1,z-.22),(side*(w+.015),y-.1,z+.22),(side*(w-.07),y-.6,z+.22),(side*(w-.07),y-.6,z-.22)],6)
    for z in (-70,-62,-22,-12,5,21):
        x=side*(6.78 if z<-55 else 7.13 if z<8 else 6.6)
        box('SLAVA_service_door',(x,7.5 if z<-55 else 8.4,z),(.035,2.05,.95),13)
    # Boat bays behind the uptakes, with davits visible from above.
    o=house('ships_boat',-31.2,6.7,7.9,1.8,6.2,2.05,6.9,.65);o.location.x=side*8.5
    box('SLAVA_boat_cockpit',(side*8.5,7.95,-31.2),(1.4,.08,4.1),5)
    for z in (-33,-29):
        beam('SLAVA_davit',(side*7.4,6.5,z),(side*7.4,10.3,z),.12,0)
        beam('SLAVA_davit_arm',(side*7.4,10.3,z),(side*9.0,9.7,z),.10,0)
    for z in (-57,-60,-74):beam('SLAVA_liferaft',(side*8.0,6.5,z-.65),(side*8.0,6.5,z+.65),.43,1,n=6)
    for y in (22,27,32):
        box('SLAVA_mast_panel',(side*(3.5 if y<27 else 2.3 if y<32 else 1.7),y,16),(.045,1.1,.85),6)
    beam('SLAVA_bridge_whip',(side*7.0,20.8,29),(side*7.0,27.0,29),.03,6)
    beam('SLAVA_bow_chain',(side*1.5,8.2,78),(side*.7,8.45,87),.075,6)
beam('SLAVA_jackstaff',(0,8.5,92),(0,12.1,92),.055,1)
beam('SLAVA_stern_staff',(0,5.5,-92),(0,9,-92),.045,1)
# Weapon templates keep the existing cruiser model IDs and mount counts.
templates={}
def template(key):
    global current
    current=collection('SLAVA_TEMPLATE_'+key);current['bfa_model_id']='cruiser_'+key;templates[key]=current
template('artillery')
lathe('AK130_base',0,0,[(0,2.1),(.5,2.1),(.65,1.85)],16,6)
chamfer_house('AK130_shield',0,.5,3.55,4.7,4.9,3.45,3.35,.9,1)
for x in (-.66,.66):
    beam('AK130_trunnion',(x-.38,2.2,1.45),(x+.38,2.2,1.45),.57,0,n=10)
    beam('AK130_barrel',(x,2.2,1.6),(x,2.53,8.4),.19,6,n=10,r2=.105)
    beam('AK130_muzzle',(x,2.51,8.15),(x,2.54,8.65),.14,5,n=8)
empty('bf_muzzle',(-.66,2.54,8.65),col=current)
template('ciws')
lathe('AK630_base',0,0,[(0,.93),(.55,.93),(.7,.72)],8,0)
smooth(lathe('AK630_turret',0,.65,[(0,.92),(.8,.92),(1.4,.70),(1.63,.18)],8,1))
beam('AK630_barrel_bundle',(0,1.3,.45),(0,1.42,2.25),.17,6,n=8)
beam('AK630_muzzle',(0,1.41,2.18),(0,1.43,2.40),.2,5,n=8)
empty('bf_muzzle',(0,1.43,2.40),col=current)
template('sam')
lathe('OSA_base',0,0,[(0,.88),(.6,.88),(1.1,.48)],10,0)
box('OSA_yoke',(0,1.55,0),(.7,1.25,.7),0)
beam('OSA_cross_arm',(-1.75,1.8,0),(1.75,1.8,0),.16,6,n=6)
for x in (-1.15,1.15):
    beam('OSA_missile',(x,2.0,-1.55),(x,2.48,2.0),.19,1,n=8,r2=.11)
    beam('OSA_nose',(x,2.48,2.0),(x,2.55,2.52),.11,1,n=8,r2=.01)
    for s in (-1,1):quad('OSA_fin',[(x,2.08,-1.0),(x+s*.54,2.08,-1.4),(x+s*.54,2.10,-1.7),(x,2.08,-1.65)],0)
empty('bf_muzzle',(-1.15,2.55,2.52),col=current)
template('ssm')
for x in (-1.25,1.25):
    # Rear ends low; rounded bow-facing caps and stiffening collars.
    a=Vector((x,1.25,-5.8));b=Vector((x,5.05,5.3));d=(b-a).normalized()
    smooth(beam('P500_canister',a,b,1.18,0,n=10))
    for t in (.10,.50,.89):
        p=a+(b-a)*t;beam('P500_collar',p-d*.11,p+d*.11,1.24,1,n=10)
    smooth(beam('P500_rounded_cap',b,b+d*.42,1.18,1,n=10,r2=.77))
    beam('P500_cap_face',b+d*.42,b+d*.47,.77,1,n=10)
    # Long wedge supports with recessed side apertures, not isolated columns.
    vs=[(x+dx,y,z) for dx in (-.80,.80) for y,z in [(0,-4.7),(0,4.2),(3.8,4.2),(.65,-4.7)]]
    mesh('P500_wedge_cradle',vs,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],0)
    for dx in (-.812,.812):quad('P500_cradle_recess',[(x+dx,.25,-2.8),(x+dx,.25,3.2),(x+dx,2.75,3.2),(x+dx,.8,-2.8)],6)
empty('bf_muzzle',(-1.25,5.21,5.76),col=current)
current=hull
slots={'main_fwd':((0,interp(72,2)+.16,72),0,'artillery'),
       'ciws_fwd':((-5.15,15.0,30),0,'ciws'),
       'sam_aft':((0,10.3,-74),math.pi,'sam')}
rails={'ssm_rail_port':((-5.4,7.1,55),-math.pi/18,'ssm'),
       'ssm_rail_starboard':((5.4,7.1,55),math.pi/18,'ssm')}
for sid,(p,yaw,key) in slots.items():empty('SOCKET_'+sid,p,yaw);instance(key,p,yaw)
for sid,(p,yaw,key) in rails.items():empty('RAIL_'+sid,p,yaw);instance(key,p,yaw)
empty('bf_wake',(0,0,-LENGTH/2))
def static_instance(key,p,yaw):
    tr=Matrix.Translation(G(p))@Matrix.Rotation(yaw,4,'Z')
    for o in templates[key].objects:
        if o.type!='MESH':continue
        n=o.copy();n.data=o.data.copy();n.name='STATIC_'+o.name;hull.objects.link(n);n.matrix_world=tr@o.matrix_world;n['visual_only']=True
for side in (-1,1):
    for z,x in [(42,6.0),(29,6.4),(16,6.8)]:static_instance('ssm',(side*x,interp(z,2)+.05,z),side*math.pi/18)
    # Two secondary close-in systems per side plus the second forward system.
    for z,y in [(0,13.35),(-13.5,13.35)]:static_instance('ciws',(side*5.65,y,z),side*math.pi/2)
    if side>0:static_instance('ciws',(5.15,15.0,30),0)
    platform('SLAVA_forward_CIWS_platform',side*5.2,14.88,30,2.4,3.2)
    for z in (2,-11):smooth(sphere('SLAVA_director_radome',(side*5.3,15.8,z),.85,1))
# Forecastle round director and two compact RBU silhouettes ahead of bridge.
beam('SLAVA_fore_director_base',(0,10.5,42),(0,12.1,42),.75,0,n=10)
smooth(sphere('SLAVA_fore_director',(0,13.0,42),1.1,1))
for side in (-1,1):
    box('SLAVA_RBU_pedestal',(side*2.4,11.0,49),(.85,1.0,1.0),0)
    for i in range(6):
        a=i*math.pi/5;beam('SLAVA_RBU_tube',(side*2.4+.6*math.cos(a),11.4+.6*math.sin(a),48.6),(side*2.4+.6*math.cos(a),11.8+.6*math.sin(a),49.6),.13,6,n=6)
# Pennant deliberately omitted: class asset mixes reference fits, and avoids
# baking a reversed hull number into the game's reflected coordinate basis.
bpy.context.view_layer.update()
(OUT/'component-bounds.json').write_text(json.dumps({o.name:{'min':[min((o.matrix_world@Vector(v))[i] for v in o.bound_box) for i in range(3)],'max':[max((o.matrix_world@Vector(v))[i] for v in o.bound_box) for i in range(3)]} for o in [*hull.objects,*weapons.objects] if o.type=='MESH'},indent=2))
for c in [hull,*templates.values()]:join(c)
total=tris(hull)+sum(tris(templates[key]) for p,yaw,key in [*slots.values(),*rails.values()])
stats={'assembled_triangles':total,'parts':{c.name:tris(c) for c in [hull,*templates.values()]}}
assert total<=10000,stats
(OUT/'geometry-stats.json').write_text(json.dumps(stats,indent=2))
WEATHER_PATCHES=[(-81,1.4,2.4),(-58,1.5,2.7),(-31,1.5,2.6),(-6,1.3,2.7),(24,1.4,3.0),(50,1.4,3.0),(74,1.3,3.6)]
exec(compile((ROOT/'scripts/blender/gepard_weathering_materials.py').read_text(encoding='utf-8'),'weathering_materials','exec'))
current=studio
water=bpy.data.materials.new('Slava_Sea');water.use_nodes=True
p=water.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.035,.10,.14,1);p.inputs['Roughness'].default_value=.44
box('PREVIEW_sea',(0,-.3,0),(1500,.1,1500),mat=water)
world=bpy.data.worlds.new('Slava_World');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.64,.72,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
def camera(name,pos,target,scale):
    c=bpy.data.objects.new(name,bpy.data.cameras.new(name));studio.objects.link(c);c.location=G(pos);c.rotation_euler=(G(target)-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=scale;return c
scene.camera=camera('Slava_Hero',(155,95,165),(0,12,0),212)
camera('Slava_Side',(-220,15,0),(0,15,0),202)
camera('Slava_Top',(0,220,0),(0,0,0),202)
camera('Slava_Front',(0,19,220),(0,19,0),64)
sun=bpy.data.objects.new('Slava_Sun',bpy.data.lights.new('Slava_Sun','SUN'));studio.objects.link(sun);sun.rotation_euler=(.45,-.6,-.6);sun.data.energy=2.4;sun.data.angle=.13
for pos,power in [((-100,160,50),400000),((80,120,-90),340000)]:
    o=bpy.data.objects.new('Slava_Area',bpy.data.lights.new('Slava_Area','AREA'));studio.objects.link(o);o.location=G(pos);o.rotation_euler=(G((0,8,0))-o.location).to_track_quat('-Z','Y').to_euler();o.data.energy=power;o.data.size=90
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
for c in templates.values():c.hide_render=True;c.hide_viewport=True
scene['assembled_triangles']=total
bpy.data.libraries.write(str(OUT/'slava_geometry.blend'),{scene},fake_user=True)
result={'scene':scene.name,**stats}
