"""Revision 2: reference-led exterior, in the generator's metric coordinates."""

def dark_roof(ob):
    # Assign upward-facing surfaces a non-slip deck tile, not wall paint.
    for poly in ob.data.polygons:
        if poly.normal.z > .65:
            for li in poly.loop_indices:
                uv=ob.data.uv_layers.active.data[li].uv
                uv.x=(uv.x*4%1+2)/4;uv.y=(uv.y*4%1+3)/4
    return ob

def house(name,z,y0,y1,w,l,cut=.35,upper=None):
    return dark_roof(chamfer_house('SPRUANCE_'+name,z,y0,y1,w,l,w if upper is None else upper,l,cut,0))

def rail(a,b):
    beam('SPRUANCE_walkway_rail',a,b,.027,1,n=3)

def platform(name,x,y,z,w,l):
    dark_roof(box('SPRUANCE_'+name,(x,y,z),(w,.16,l),0))
    for s in (-1,1):
        for zz in (z-l/2,z,z+l/2):
            rail((x+s*w/2,y,zz),(x+s*w/2,y+1,zz))
        for yy in (y+.48,y+1):rail((x+s*w/2,yy,z-l/2),(x+s*w/2,yy,z+l/2))
    for zz in (z-l/2,z+l/2):rail((x-w/2,y+1,zz),(x+w/2,y+1,zz))

# The bridge front is one continuous face. The lower house does not project
# beyond it as a second oversized ledge. The upper deck steps aft in plan.
house('fore_deckhouse',13.0,6.42,11.15,13.6,26.0,.55)
house('bridge_front',31.5,6.75,15.45,13.55,11.0,.85,13.35)
house('pilot_house',31.45,15.40,17.12,13.75,10.7,1.0,13.4)
house('bridge_rear',23.4,11.12,14.8,10.6,6.0,.25)
for x in (-5.4,-4.05,-2.7,-1.35,0,1.35,2.7,4.05,5.4):
    quad('SPRUANCE_front_glazing',[(x-.48,15.72,36.815),(x+.48,15.72,36.815),(x+.48,16.65,36.815),(x-.48,16.65,36.815)],4)
for side in (-1,1):
    for z in (28,29.6,31.2,32.8,34.2):
        quad('SPRUANCE_side_glazing',[(side*6.84,15.73,z-.52),(side*6.84,15.73,z+.52),(side*6.75,16.65,z+.52),(side*6.75,16.65,z-.52)],4)
    platform('bridge_wing',side*6.52,14.82,25.5,2.85,5.25)
    box('SPRUANCE_wing_solid_front',(side*6.52,15.26,28.05),(2.85,.85,.14),0)
    beam('SPRUANCE_bridge_wing_bracket',(side*5.8,12.8,25.5),(side*7.8,14.75,25.5),.11,0,n=4)
    for y in (10.8,14.65):box('SPRUANCE_bridge_seam',(side*6.79,y,31.8),(.022,.045,8.4),6)

# Hangar: broad double doors, lower side galleries and a smaller upper house.
house('mid_house',-7,6.17,10.8,11.7,15.2)
house('hangar',-24.5,6.05,14.35,14.2,23,.35)
house('hangar_roof_house',-25,14.35,16.8,8.1,10.8,.25)
for x in (-3.55,3.55):
    box('SPRUANCE_hangar_door',(x,9.42,-36.035),(6.25,6.28,.05),6)
    for yy in (6.6,7.35,8.1,8.85,9.6,10.35,11.1,11.85,12.6):
        box('SPRUANCE_hangar_door_slat',(x,yy,-36.07),(6.18,.045,.03),1)
box('SPRUANCE_hangar_center_pillar',(0,9.4,-36.14),(.42,6.5,.22),0)
for x in (-2.8,-1.4,0,1.4,2.8):box('SPRUANCE_flight_control_window',(x,15.8,-30.415),(.85,.60,.035),4)
for side in (-1,1):
    platform('hangar_gallery',side*6.45,14.40,-27.4,1.5,16.0)
    # Side service recess framed by columns and the elevated gallery.
    box('SPRUANCE_service_recess',(side*7.12,10.4,-22),(.022,3.9,9.0),6)
    for z in (-26,-22,-18):box('SPRUANCE_gallery_column',(side*7.20,10.3,z),(.20,7.8,.20),0)
    for z in (-33,-30):box('SPRUANCE_hangar_side_vent',(side*7.12,12.2,z),(.025,1.5,1.8),10)

# Gas-turbine uptake groups: broad intake shoulders, short narrower uptake,
# rectangular dark open exhaust mouths. No four tall closed plumbing pipes.
for z,base,upper in [(11.1,11.15,22.3),(-13.1,10.8,22.6)]:
    house('uptake_intake_base',z,base,18.3,9.0,9.8,.45)
    taper('SPRUANCE_uptake_shoulders',0,z,18.3,19.2,9.0,9.8,6.4,6.6,0)
    house('uptake_neck',z,19.2,upper,6.4,6.6,.20)
    box('SPRUANCE_soot_crown',(0,upper-.16,z),(6.52,.42,6.72),6)
    # Two broad flue mouths separated by a longitudinal centre divider.
    for x in (-1.55,1.55):
        box('SPRUANCE_exhaust_dark_mouth',(x,upper+.08,z),(2.75,.06,5.92),5)
    for x in (-3.24,0,3.24):box('SPRUANCE_flue_lip',(x,upper+.18,z),(.12,.25,6.68),6)
    for zz in (z-3.28,z+3.28):box('SPRUANCE_flue_rim',(0,upper+.18,zz),(6.55,.25,.13),6)
    for side in (-1,1):
        for dz in (-2.5,2.5):box('SPRUANCE_turbine_intake',(side*4.52,15.2,z+dz),(.035,4.5,3.5),10)
        platform('uptake_catwalk',side*4.78,18.34,z,1.15,9.8)
        beam('SPRUANCE_stack_service_pipe',(side*3.8,11.2,z-3.7),(side*3.8,18.4,z-3.7),.13,0,n=6)

# Fore mast is a broad tripod with offset sensor platforms; the aft mast is
# shorter, more compact, and carries an angled lattice search antenna.
def lattice_mast(z,base,top,fore):
    feet=[(-2.7,z+1.5),(2.7,z+1.5),(0,z-3.2)]
    apex=[(-.78,z+.52),(.78,z+.52),(0,z-.9)]
    for (x,zz),(tx,tz) in zip(feet,apex):
        beam('SPRUANCE_mast_primary_leg',(x,base,zz),(tx,top,tz),.16,0,n=5)
    levels=5
    def at(i,t):return (feet[i][0]*(1-t)+apex[i][0]*t,base+(top-base)*t,feet[i][1]*(1-t)+apex[i][1]*t)
    for k in range(levels):
        for i in range(3):
            j=(i+1)%3
            beam('SPRUANCE_mast_diagonal',at(i,k/levels),at(j,(k+1)/levels),.072,0,n=3)
            beam('SPRUANCE_mast_transom',at(i,(k+1)/levels),at(j,(k+1)/levels),.07,0,n=3)
    # Open Y-shaped yard: no repeated solid shelf silhouette.
    yard=9.7 if fore else 9.0
    for s in (-1,1):
        beam('SPRUANCE_Y_yard',(0,top-3,z),(s*yard/2,top+.2,z),.105,0,n=4)
        beam('SPRUANCE_Y_yard_upper',(0,top+.2,z),(s*yard/2,top+.2,z),.10,0,n=4)
        for xx in (s*yard/2,s*yard/3):beam('SPRUANCE_yard_aerial',(xx,top+.2,z),(xx,top+2.1,z),.035,1,n=3)
    platform('mast_small_crown',0,top+.2,z,2.1,2.0)
    beam('SPRUANCE_masthead',(0,top,z),(0,top+(6 if fore else 4.5),z),.095,1,n=6,r2=.045)
    beam('SPRUANCE_masthead_crossarm',(-1.4,top+3.5,z),(1.4,top+3.5,z),.055,0,n=3)
    if fore:
        platform('fore_sensor_balcony',-1.4,23.3,z+1.6,4.8,2.8)
        platform('fore_radar_balcony',1.1,28.0,z-.4,4.1,2.4)
        beam('SPRUANCE_balcony_brace',(-.5,20.1,z),(-3.6,23.25,z+1.6),.09,0,n=3)
        o=sphere('SPRUANCE_mast_radome',(-2.65,24.3,z+1.65),.9,1)
        for p in o.data.polygons:p.use_smooth=True
        beam('SPRUANCE_navigation_scanner',(-3.8,26.3,z+1.7),(-.8,26.3,z+1.7),.10,1,n=4)
    else:platform('aft_radar_balcony',0,25.5,z,3.2,2.5)
    # A narrow ladder only; avoid a solid flat strip through the lattice.
    for s in (-1,1):beam('SPRUANCE_mast_ladder_rail',(s*.25,base,z+1),(s*.25,top,z+.6),.03,6,n=3)
    for k in range(12):
        y=base+(top-base)*k/12;zz=z+1-.4*k/12
        beam('SPRUANCE_mast_ladder_rung',(-.25,y,zz),(.25,y,zz),.022,6,n=3)

lattice_mast(25.3,11.2,33.0,True)
lattice_mast(-4.8,10.8,31.1,False)
def radar(z,y,w,h,angle):
    start=set(hull.objects)
    beam('SPRUANCE_radar_pedestal',(0,y-1.3,z),(0,y,z),.20,0,n=8)
    # Shallow curved lattice dish with solid rim, visibly curved in top view.
    for j in range(9):
        x=-w/2+w*j/8;zz=z+.65*(x/(w/2))**2
        beam('SPRUANCE_radar_grid',(x,y,zz),(x,y+h,zz),.035,6,n=3)
    for yy in (y,y+h*.5,y+h):
        for j in range(8):
            a=-w/2+w*j/8;b=-w/2+w*(j+1)/8
            beam('SPRUANCE_radar_rim',(a,yy,z+.65*(a/(w/2))**2),(b,yy,z+.65*(b/(w/2))**2),.045,6,n=3)
    center=G((0,y,z));tr=Matrix.Translation(center)@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-center)
    for ob in set(hull.objects)-start:ob.matrix_world=tr@ob.matrix_world
radar(25.1,28.3,4.5,1.8,.35)
radar(-4.8,26.0,5.5,2.5,-.55)
for z,y in [(32.1,17.2),(-25,16.85)]:
    beam('SPRUANCE_director_base',(0,y,z),(0,y+1.25,z),.6,0,n=10)
    o=sphere('SPRUANCE_director',(0,y+1.75,z),.92,1)
    for p in o.data.polygons:p.use_smooth=True

# Midships working deck: intake grilles, cable trunks, davits, deck lockers.
for side in (-1,1):
    for z in (19,3.2,-29):
        box('SPRUANCE_equipment_locker',(side*5.4,12.0 if z>0 else 15.05,z),(1.2,1.7,1.5),1)
    for z in (-8.5,-11.5):
        beam('SPRUANCE_boat_davit',(side*5.1,7.5,z),(side*5.1,11.9,z),.12,0,n=4)
        beam('SPRUANCE_boat_davit_arm',(side*5.1,11.9,z),(side*7.25,11.4,z),.10,0,n=4)
        beam('SPRUANCE_davit_wire',(side*7.25,11.4,z),(side*7.25,8.3,z),.022,6,n=3)
    for z in (14,20):
        box('SPRUANCE_deckhouse_external_trunk',(side*6.87,9.2,z),(.30,3.8,.60),1)
    # Stair treads and diagonal stringers give the stepped decks scale.
    for z0,y0 in [(20,11.2),(-31,6.2)]:
        for j in range(7):box('SPRUANCE_stair',(side*6.5,y0+j*.43,z0+j*.4),(1.0,.12,.48),6)
        for dx in (-.5,.5):beam('SPRUANCE_stair_handrail',(side*6.5+dx,y0+.9,z0),(side*6.5+dx,y0+3.5,z0+2.4),.028,1,n=3)
