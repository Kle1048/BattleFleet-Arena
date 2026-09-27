"""SLAVA_STAGE = artillery/ciws/sam/ssm/hull/publish; checkpoint every bake."""
import bpy,json
ns=bpy.app.driver_namespace['slava_build'];s=ns['scene'];bpy.context.window.scene=s
OUT=ns['OUT'];stage=SLAVA_STAGE;templates=ns['templates']
args=[ns[k] for k in ('hull','templates','weapons','slots','rails','instance')]
if stage!='publish':
    assert stage in ('hull','artillery','ciws','sam','ssm')
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.shading.type='SOLID'
    col=ns['hull'] if stage=='hull' else templates[stage]
    col.hide_render=False;col.hide_viewport=False
    records=ns['weather_gepard'](*args,part_keys=[stage],finalize=False)
    if stage!='hull':col.hide_render=True;col.hide_viewport=True
    bpy.data.libraries.write(str(OUT/'weathering-checkpoint.blend'),{s},fake_user=True)
    result={'stage':stage,'completed_parts':[r['part'] for r in records]}
else:
    records=json.loads(s['weathering_parts']);assert {r['part'] for r in records}=={'hull','artillery','ciws','sam','ssm'}
    ns['weather_gepard'](*args,part_keys=[],finalize=True)
    for col in templates.values():col.hide_render=False;col.hide_viewport=False
    ns['publish_models'](ns['ROOT'],OUT,ns['export'],
        [('cruiser',list(ns['hull'].objects)+list(ns['helpers'].objects))]+
        [('cruiser_'+key,list(col.objects)) for key,col in templates.items()],ns['GAME_METRES_PER_UNIT'])
    for col in templates.values():col.hide_render=True;col.hide_viewport=True
    bpy.data.libraries.write(str(OUT/'slava_source.blend'),{s},fake_user=True)
    result={'exported':True,'triangles':ns['total'],'scene':s.name,'metres_per_author_unit':ns['GAME_METRES_PER_UNIT']}
