"""Normal Blender export: run this script on a model source scene.

Scene custom property bfa_metres_per_unit defines author units. Collections with
bfa_model_id are exported (multiple collections may belong to the same model).
Presentation/preview collections are not tagged and are never published.
"""
import bpy
import runpy
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
scene = bpy.context.scene
if scene.get('bfa_marker_contract') != 2:
    raise ValueError('Source scene needs the V2 model-marker contract before publication')
factor = float(scene.get('bfa_metres_per_unit', 1))
models = {}
visibility = []
for collection in scene.collection.children:
    model_id = collection.get('bfa_model_id')
    if not model_id:
        continue
    visibility.append((collection, collection.hide_viewport, collection.hide_render))
    collection.hide_viewport = False
    collection.hide_render = False
    models.setdefault(model_id, set()).update(collection.all_objects)
if not models:
    raise ValueError('No model collections tagged with bfa_model_id')
helpers = runpy.run_path(str(ROOT / 'scripts/blender/canonical_publish.py'))
try:
    with tempfile.TemporaryDirectory(prefix='battlefleet-export-') as staging:
        helpers['publish_models'](ROOT, staging, helpers['export'],
                                  [(model_id, sorted(objects, key=lambda o: o.name)) for model_id, objects in models.items()], factor)
finally:
    for collection, viewport, render in visibility:
        collection.hide_viewport, collection.hide_render = viewport, render
result = {'passed': True, 'scene': scene.name, 'models': sorted(models), 'metresPerUnit': factor}
