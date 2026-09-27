"""Dimensional cross-check against independently read landmarks in the user sheet.

Not an automatic claim of photogrammetric accuracy: contours are also inspected
in reference-comparison.html using the reimported, rendered runtime GLBs.
"""
import json
import hashlib
from pathlib import Path

OUT=Path(__file__).resolve().parents[2]/'assets/blender/f124'
bounds=json.loads((OUT/'component-bounds-blender.json').read_text(encoding='utf-8'))
profile=json.loads((OUT/'f124.profile.json').read_text(encoding='utf-8'))
SCALE=488/143

def component(prefix):
    rows=[v for k,v in bounds.items() if k==prefix or k.startswith(prefix+'.')]
    assert len(rows)==1,(prefix,len(rows))
    b=rows[0]
    return {'xmin':b['min'][0],'xmax':b['max'][0],
            'ymin':b['min'][2],'ymax':b['max'][2],
            'zmin':-b['max'][1],'zmax':-b['min'][1]}

def zcenter(prefix):
    b=component(prefix); return (b['zmin']+b['zmax'])/2

# Coordinates are read on the supplied 500x328 sheet, not generated from the model.
# 3px ~= 0.88m: appropriate to its blurred/antialiased contours, not engineering tolerances.
targets=[
    ('APAR center',297,zcenter('MESH_APAR_radar_housing'),3),
    ('SMART-L pedestal center',163,zcenter('MESH_SMARTL_pedestal'),3),
    ('Twin funnel center',222,zcenter('MESH_funnel_port'),4),
    ('Signal mast center',240,zcenter('MESH_signal_mast'),3),
    ('Bridge roof forward edge',342,component('MESH_bridge_roof')['zmax'],4),
    ('Hangar aft edge',100,component('MESH_hangar')['zmin'],3),
    ('VLS center',365,zcenter('MESH_VLS_frame'),3),
]
for sid,target in [('main_fwd',423),('ram_fwd',394),('ram_aft',120)]:
    slot=next(s for s in profile['mountSlots'] if s['id']==sid)
    targets.append((sid,target,slot['socket']['position']['z'],3))
checks=[]
for label,pixel,z,tol in targets:
    actual=6+(z+71.5)*SCALE
    checks.append({'feature':label,'reference_x_px':pixel,'model_x_px':round(actual,2),
                   'error_px':round(abs(actual-pixel),2),'tolerance_px':tol,
                   'pass':abs(actual-pixel)<=tol})
for label,prefix,pixel,tol in [
    ('Main mast tip','MESH_mainmast',111,3),
    ('APAR housing top','MESH_APAR_radar_housing',131,4),
    ('Funnel rim','MESH_funnel_rim_port',168,3),
    ('Bridge roof','MESH_bridge_roof',181,3),
    ('Hangar roof','MESH_hangar',190,3),
    ('Signal mast tip','MESH_signal_mast',143,3),
]:
    actual=230-component(prefix)['ymax']*SCALE
    checks.append({'feature':label,'reference_y_px':pixel,'model_y_px':round(actual,2),
                   'error_px':round(abs(actual-pixel),2),'tolerance_px':tol,
                   'pass':abs(actual-pixel)<=tol})

port=component('MESH_funnel_port'); starboard=component('MESH_funnel_starboard')
assert port['xmax'] < -1.7 and starboard['xmin'] > 1.7
hatches=[v for k,v in bounds.items() if k.startswith('MESH_VLS_hatch')]
xs={round((b['min'][0]+b['max'][0])/2,3) for b in hatches}
zs={round(-(b['min'][1]+b['max'][1])/2,3) for b in hatches}
assert len(hatches)==32 and len(xs)==8 and len(zs)==4,'Transverse VLS layout'
report={'status':'pass' if all(c['pass'] for c in checks) else 'fail',
        'reference_sha256':hashlib.sha256((OUT/'reference-user.png').read_bytes()).hexdigest(),
        'method':'Manual landmarks + dimensional checks; full silhouette/top-view overlay inspected separately.',
        'source_resolution':[500,328],'side_scale_pixels_per_metre':SCALE,
        'checks':checks,'funnel_body_gap_metres':round(starboard['xmin']-port['xmax'],3),
        'vls_cells_across_beam':len(xs),'vls_cells_along_length':len(zs)}
(OUT/'reference-fit-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
assert report['status']=='pass'
