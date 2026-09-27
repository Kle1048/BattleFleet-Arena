"""Call with SPRUANCE_STAGE: mk45/phalanx/seasparrow/harpoon/hull/publish."""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix
ns=bpy.app.driver_namespace['spruance_build'];s=ns['scene'];bpy.context.window.scene=s
stage=SPRUANCE_STAGE;OUT=ns['OUT'];PUB=ns['PUB'];templates=ns['templates']
args=[ns[k] for k in ('hull','templates','weapons','slots','rails','instance')]
if stage!='publish':
    assert stage in ('hull','mk45','phalanx','seasparrow','harpoon')
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.shading.type='SOLID'
    col=ns['hull'] if stage=='hull' else templates[stage]
    col.hide_viewport=False;col.hide_render=False
    records=ns['weather_gepard'](*args,part_keys=[stage],finalize=False)
    if stage!='hull':col.hide_viewport=True;col.hide_render=True
    bpy.data.libraries.write(str(OUT/'weathering-checkpoint.blend'),{s},fake_user=True)
    result={'stage':stage,'completed':records,'not_yet_published':True}
else:
    records=json.loads(s['weathering_parts']);assert {r['part'] for r in records}=={'hull','mk45','phalanx','seasparrow','harpoon'}
    ns['weather_gepard'](*args,part_keys=[],finalize=True)
    export=ns['export']
    export(PUB/'ships/hull_spruance.glb',list(ns['hull'].objects)+list(ns['helpers'].objects))
    for key,col in templates.items():
        col.hide_viewport=False;col.hide_render=False
        obs=list(col.objects);export(OUT/('mount_spruance_'+key+'_metric.glb'),obs)
        saved={o:o.matrix_world.copy() for o in obs}
        factor=ns['PREPARE']/(1 if key=='harpoon' else 100)
        for o in obs:o.matrix_world=Matrix.Scale(factor,4)@o.matrix_world
        export(PUB/('systems/mount_spruance_'+key+'.glb'),obs)
        for o,m in saved.items():o.matrix_world=m
        col.hide_viewport=True;col.hide_render=True
    def socket(p,yaw=0):return {'position':dict(zip(('x','y','z'),p)),'eulerRad':{'x':0,'y':yaw,'z':0}}
    profile=json.loads((OUT/'backup/destroyer.json').read_text());profile['labelDe']='Spruance-Klasse';profile['hullGltfId']='spruance'
    profile['clientVisualTuningDefaults'].update({'gltfHullYOffset':-ns['KEEL']*ns['PREPARE'],'gltfHullOffsetX':0,'gltfHullOffsetZ':0,'shipPivotLocalZ':0,'wakeSpawnLocalZ':0})
    registry={sid:socket(p) for sid,(p,yaw,key) in ns['slots'].items()}
    for rail in profile['fixedSeaSkimmerLaunchers']:
        p,yaw,key=ns['rails'][rail['id']];rail['socket']=socket(p,yaw)
    (OUT/'destroyer.profile.json').write_text(json.dumps(profile,indent=2))
    (OUT/'destroyer.mountSockets.json').write_text(json.dumps(registry,indent=2))
    s['assembled_triangles']=ns['total'];s['runtime_hull_id']='spruance'
    bpy.data.libraries.write(str(OUT/'spruance_dd963.blend'),{s},fake_user=True)
    result={'scene':s.name,'assembled_triangles':ns['total'],'exported':True}
