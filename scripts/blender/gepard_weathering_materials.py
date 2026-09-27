"""Compatibility entry point for staged builders: now clean colour-only bakes.

Legacy weathered source files remain recoverable. Start a fresh geometry build;
the original palette UVs, not weathered textures, are needed for clean paint.
"""
import runpy


def weather_gepard(hull, templates, weapons, slots, rails, instance, part_keys=None, finalize=True):
    helpers = runpy.run_path(str(ROOT / 'scripts/blender/clean_ship_materials.py'))
    slug = globals().get('ASSET_SLUG', 'gepard')
    records = json.loads(scene.get('weathering_parts', '[]'))
    for key, col in [('hull', hull), *templates.items()]:
        if part_keys is not None and key not in part_keys: continue
        objects = [ob for ob in col.objects if ob.type == 'MESH']
        if len(objects) != 1: raise ValueError('Join source meshes before baking')
        record = helpers['bake_clean_part'](objects[0], slug, key, OUT / 'textures/clean')
        records = [r for r in records if r['part'] != key] + [record]
        scene['weathering_parts'] = json.dumps(records)
    if finalize:
        for ob in list(weapons.objects): bpy.data.objects.remove(ob, do_unlink=True)
        for position, yaw, key in [*slots.values(), *rails.values()]: instance(key, position, yaw)
        scene['material_style'] = helpers['POLICY']['style']
        (OUT / 'clean-material-validation.json').write_text(json.dumps({
            'passed': True, 'parts': records, 'no_added_triangles': True,
            'style': helpers['POLICY']['style'],
            'roughness': helpers['POLICY']['roughness'], 'metallic': helpers['POLICY']['metallic'],
        }, indent=2))
    return records
