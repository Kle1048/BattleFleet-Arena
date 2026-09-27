"""One-time V1 source migration. Run in Blender with WRITE_SOURCE_MIGRATION=True.

Only five explicit active source files are in scope. Historical backups and the
open scene are untouched. The approved canonical GLBs' derived metadata is used
once to migrate marker transforms; it is never read by normal Blender export.
"""
import bpy
import hashlib
import json
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
CASES = [
    ('gepard/gepard_p6122.blend', 'gepard', 60.016 / 57.6, 'GEPARD'),
    ('gepard/weathering-checkpoint.blend', 'gepard', 60.016 / 57.6, 'GEPARD'),
    ('spruance/spruance_dd963.blend', 'spruance', 120 / 171.7, 'SPRUANCE'),
    ('spruance/spruance_geometry.blend', 'spruance', 120 / 171.7, 'SPRUANCE'),
    ('spruance/weathering-checkpoint.blend', 'spruance', 120 / 171.7, 'SPRUANCE'),
]
metadata = json.loads((ROOT / 'shared/src/content/generatedModelMetadata.json').read_text())
basis = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
report = []
for relative, model_id, factor, prefix in CASES:
    path = ROOT / 'assets/blender' / relative
    original_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    with bpy.data.libraries.load(str(path), link=False) as (available, loaded):
        assert len(available.scenes) == 1, relative
        loaded.scenes = list(available.scenes)
    scene = loaded.scenes[0]
    scene.view_layers[0].update()
    geometry_before = [(o.name, o.data.as_pointer(), tuple(v for row in o.matrix_world for v in row))
                       for o in scene.objects if o.type == 'MESH']
    marker_collection = [c for c in scene.collection.children if c.name.startswith(prefix + '_SOCKETS')]
    assert len(marker_collection) == 1
    definitions = {**{'SOCKET_' + k: v for k, v in metadata[model_id]['sockets'].items()},
                   **{'RAIL_' + k: v for k, v in metadata[model_id]['rails'].items()},
                   'bf_wake': metadata[model_id]['effects']['wake']}
    updated = []
    for name, transform in definitions.items():
        found = [o for o in scene.objects if o.get('export_name', o.name) == name]
        assert len(found) <= 1, (relative, name)
        p, e = transform['position'], transform['eulerRad']
        location = basis @ Vector((p['x'] / factor, p['y'] / factor, p['z'] / factor))
        if found:
            obj = found[0]
            assert obj.type == 'EMPTY' and not obj.parent
            assert (obj.matrix_world.translation - location).length < .001, (relative, name, 'unexpected author edit')
        else:
            assert name == 'bf_wake', (relative, name, 'missing original socket')
            obj = bpy.data.objects.new(name, None)
            marker_collection[0].objects.link(obj)
            obj.empty_display_type = 'ARROWS'
        rotation = Matrix.Identity(4)
        for axis in ('X', 'Y', 'Z'):
            rotation = rotation @ Matrix.Rotation(e[axis.lower()], 4, axis)
        obj.matrix_world = Matrix.Translation(location) @ basis @ rotation @ basis.inverted()
        obj['export_name'] = name
        updated.append(name)
    scene['bfa_model_id'] = model_id
    scene['bfa_metres_per_unit'] = factor
    scene['bfa_marker_contract'] = 2
    for collection in scene.collection.children:
        if collection.name.startswith((prefix + '_HULL', prefix + '_SOCKETS')):
            collection['bfa_model_id'] = model_id
        if collection.name.startswith(prefix + '_TEMPLATE_'):
            key = collection.name.split('_TEMPLATE_', 1)[1].split('.')[0]
            collection['bfa_model_id'] = model_id + '_' + key
    assert geometry_before == [(o.name, o.data.as_pointer(), tuple(v for row in o.matrix_world for v in row))
                               for o in scene.objects if o.type == 'MESH'], 'Geometry must not change'
    if globals().get('WRITE_SOURCE_MIGRATION', False):
        assert hashlib.sha256(path.read_bytes()).hexdigest() == original_hash, 'Source changed during migration'
        # Blender writes a separate verified artifact first; publication touches only the named source file.
        candidate = path.with_name(path.stem + '.v2-candidate.blend')
        bpy.data.libraries.write(str(candidate), {scene}, fake_user=True)
        with bpy.data.libraries.load(str(candidate), link=False) as (check, unused):
            assert check.scenes == [scene.name]
        candidate.replace(path)
    report.append({'file': relative, 'markers': updated, 'written': bool(globals().get('WRITE_SOURCE_MIGRATION', False)),
                   'scene': scene.name, 'meshCount': len(geometry_before)})
    # The copied scene is deliberately kept available for inspection/export; no existing scene is altered.
result = {'passed': True, 'sources': report}
