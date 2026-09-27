"""Call with SPRUANCE_STAGE: mk45/phalanx/seasparrow/harpoon/hull/publish."""
import bpy,json,math
from pathlib import Path
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
    for col in templates.values():
        col.hide_viewport=False;col.hide_render=False
    publish_ns={}
    exec(compile((ns['ROOT']/'scripts/blender/canonical_publish.py').read_text(encoding='utf-8'),'canonical_publish','exec'),publish_ns)
    publish_ns['publish_models'](ns['ROOT'],OUT,ns['export'],
        [('spruance',list(ns['hull'].objects)+list(ns['helpers'].objects))]+
        [('spruance_'+key,list(col.objects)) for key,col in templates.items()],
        ns['GAME_METRES_PER_UNIT'])
    for col in templates.values():
        col.hide_viewport=True;col.hide_render=True
    s['assembled_triangles']=ns['total'];s['runtime_hull_id']='spruance'
    bpy.data.libraries.write(str(OUT/'spruance_dd963.blend'),{s},fake_user=True)
    result={'scene':s.name,'assembled_triangles':ns['total'],'exported':True}
