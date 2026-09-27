"""Headless clean-material build. Does not overwrite existing source .blend files.

Runs only the geometry prefix of each existing builder, stopping before its
first report write; all material assets/exports go to assets/blender/clean.
Publish separately with scripts/models/publishCleanModels.ts after validation.
Usage: blender --background --factory-startup --python scripts/blender/build_clean_ships.py
"""
import ast
import bpy
import json
import runpy
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
if not bpy.app.background:
    raise RuntimeError('Run in a separate background Blender process; never reset the interactive scene')
OUT = ROOT / 'assets/blender/clean'
OUT.mkdir(parents=True, exist_ok=True)
helpers = runpy.run_path(str(ROOT / 'scripts/blender/clean_ship_materials.py'))
export = runpy.run_path(str(ROOT / 'scripts/blender/canonical_publish.py'))['export']
manifest = []

for slug, hull_id in [('gepard', 'gepard'), ('spruance', 'spruance'), ('slava', 'cruiser')]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    file = ROOT / ('scripts/blender/create_' + slug + '_asset.py')
    tree = ast.parse(file.read_text(encoding='utf-8'))
    prefix = []
    for statement in tree.body:
        if (isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call)
                and isinstance(statement.value.func, ast.Attribute) and statement.value.func.attr == 'write_text'):
            break
        prefix.append(statement)
    else:
        raise ValueError('Geometry/report boundary changed: ' + slug)
    ns = {'__file__': str(file)}
    exec(compile(ast.Module(body=prefix, type_ignores=[]), str(file), 'exec'), ns)
    if 'join' not in ns:
        join = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'join')
        exec(compile(ast.Module(body=[join], type_ignores=[]), str(file), 'exec'), ns)
    scene = ns['scene']; hull = ns['hull']; templates = ns['templates']
    records = []
    for key, collection in [('hull', hull), *templates.items()]:
        collection.hide_render = False; collection.hide_viewport = False
        ns['join'](collection)
        ob = next(o for o in collection.objects if o.type == 'MESH')
        records.append(helpers['bake_clean_part'](ob, slug, key, OUT / slug / 'textures'))
        model_id = hull_id if key == 'hull' else hull_id + '_' + key
        collection['bfa_model_id'] = model_id
        objects = list(collection.objects) + (list(ns['helpers'].objects) if key == 'hull' else [])
        target = OUT / (model_id + '_source.glb')
        export(target, objects)
        manifest.append({'modelId': model_id, 'file': target.name, 'metresPerUnit': ns['GAME_METRES_PER_UNIT']})
    ns['helpers']['bfa_model_id'] = hull_id
    for ob in list(ns['weapons'].objects): bpy.data.objects.remove(ob, do_unlink=True)
    for position, yaw, key in [*ns['slots'].values(), *ns['rails'].values()]: ns['instance'](key, position, yaw)
    for collection in templates.values(): collection.hide_render = True; collection.hide_viewport = True
    scene['material_style'] = 'clean-colour-v1'
    scene['weathering_parts'] = json.dumps(records)
    # A small neutral material-review scene, never exported into game GLBs.
    world = bpy.data.worlds.new('CleanReviewWorld'); world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.32,.40,.49,1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .8; scene.world = world
    length = ns['LENGTH']
    camera = bpy.data.objects.new('CleanReviewCamera', bpy.data.cameras.new('CleanReviewCamera'))
    ns['studio'].objects.link(camera)
    camera.location = Vector((-length*.75,-length*.85,length*.55))
    camera.rotation_euler = (Vector((0,0,length*.06))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = length*1.25; scene.camera = camera
    light = bpy.data.objects.new('CleanReviewSun', bpy.data.lights.new('CleanReviewSun','SUN'))
    ns['studio'].objects.link(light); light.rotation_euler = (.4,-.5,-.6); light.data.energy = 2.5
    scene.render.engine = 'BLENDER_EEVEE'; scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 1280; scene.render.resolution_y = 800; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(OUT / slug / 'clean-preview.png')
    bpy.data.libraries.write(str(OUT / slug / 'clean-source.blend'), {scene}, fake_user=True)
    bpy.ops.render.render(write_still=True)
    (OUT / slug / 'material-validation.json').write_text(json.dumps(records, indent=2))
    print('CLEAN_MATERIAL_BUILD', slug, records, flush=True)

(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
