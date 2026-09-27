"""Checkpointed MCP workflow. Caller supplies WEATHER_STAGE.

init -> artillery -> pdms -> exocet -> hull -> finalize
Each part is independently baked and checkpointed, with runtime exports held
back until all four parts have passed. Original scenes remain untouched.
"""
import bpy
from pathlib import Path
root=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
stage=WEATHER_STAGE
if stage=='init':
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.shading.type='SOLID'
    ns={'ENABLE_WEATHERING':True}
    source=(root/'scripts/blender/create_gepard_asset.py').read_text(encoding='utf-8')
    prefix=source.split('# Explicit opt-in while the bake pipeline')[0]
    exec(compile(prefix,'gepard_geometry_prepare','exec'),ns)
    exec(compile((root/'scripts/blender/gepard_weathering_materials.py').read_text(encoding='utf-8'),'weathering_materials','exec'),ns)
    bpy.app.driver_namespace['gepard_weathering_build']=ns
    bpy.data.libraries.write(str(ns['OUT']/'weathering-checkpoint.blend'),{ns['scene']},fake_user=True)
    result={'stage':stage,'scene':ns['scene'].name,'runtime_exports_unchanged':True}
else:
    ns=bpy.app.driver_namespace['gepard_weathering_build']
    bpy.context.window.scene=ns['scene']
    args=[ns[k] for k in ('hull','templates','weapons','slots','rails','instance')]
    if stage=='finalize':
        import json
        completed={r['part'] for r in json.loads(ns['scene']['weathering_parts'])}
        assert completed=={'hull','artillery','pdms','exocet'},completed
        ns['weather_gepard'](*args,part_keys=[],finalize=True)
        source=(root/'scripts/blender/create_gepard_asset.py').read_text(encoding='utf-8')
        suffix='def tris(col):'+source.split('def tris(col):',1)[1]
        exec(compile(suffix,'gepard_export_finalize','exec'),ns)
        result=ns['result']
    else:
        assert stage in ('hull','artillery','pdms','exocet')
        records=ns['weather_gepard'](*args,part_keys=[stage],finalize=False)
        bpy.data.libraries.write(str(ns['OUT']/'weathering-checkpoint.blend'),{ns['scene']},fake_user=True)
        result={'stage':stage,'completed':records,'runtime_exports_unchanged':True}
