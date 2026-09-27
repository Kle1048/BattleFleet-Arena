"""Run inside Blender: validate canonical import/assembly and the publishing bridge.

Creates one temporary QA scene, then removes only the objects it created. Does
not save or modify existing source scenes, runtime assets or generated metadata.
"""
import bpy
import json
import runpy
from pathlib import Path
from mathutils import Matrix, Vector
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
previous_scene = bpy.context.window.scene
before_objects = set(bpy.data.objects)
qa = bpy.data.scenes.new('CanonicalPipeline_QA')
bpy.context.window.scene = qa
metadata = json.loads((ROOT / 'shared/src/content/generatedModelMetadata.json').read_text())
assembly = runpy.run_path(str(ROOT / 'scripts/blender/canonical_roundtrip.py'))['assemble_runtime_ship']
records = []
try:
    for class_id in ('fac', 'destroyer', 'cruiser'):
        loaded = []

        def load(path, transform):
            before = set(qa.objects)
            bpy.ops.import_scene.gltf(filepath=str(path))
            imported = set(qa.objects) - before
            for obj in imported:
                if obj.parent not in imported:
                    obj.matrix_world = transform @ obj.matrix_world
            bpy.context.view_layer.update()
            loaded.append((path, imported))
            return imported

        assembly(ROOT, class_id, load)
        profile = json.loads((ROOT / 'shared/src/data/ships' / (class_id + '.json')).read_text())
        hull_markers = metadata[profile['hullGltfId']]
        installations = [(hull_markers['sockets'][slot['id']], profile['defaultLoadout'][slot['id']])
                         for slot in profile['mountSlots'] if slot['id'] in profile['defaultLoadout']]
        installations += [(hull_markers['rails'][rail['id']], rail['equipment'])
                          for rail in profile.get('fixedSeaSkimmerLaunchers', [])]
        # Independently reconstruct the model-space matrices (glTF XYZ Euler).
        basis = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        for (socket, equipment), (_, imported) in zip(installations, loaded[1:]):
            p, e = socket['position'], socket['eulerRad']
            socket_matrix = Matrix.Translation(Vector((p['x'], p['y'], p['z'])))
            for axis in ('X', 'Y', 'Z'):
                socket_matrix = socket_matrix @ Matrix.Rotation(e[axis.lower()], 4, axis)
            muzzle = metadata[equipment['modelId']]['effects']['muzzle']['position']
            expected = basis @ socket_matrix @ Vector((muzzle['x'], muzzle['y'], muzzle['z']))
            matches = [obj for obj in imported if obj.get('export_name', obj.name.split('.')[0]) == 'bf_muzzle']
            assert len(matches) == 1
            error = (matches[0].matrix_world.translation - expected).length
            assert error < 0.0001, (class_id, equipment['modelId'], error)
        assert len(loaded) == len(installations) + 1
        records.append({'class': class_id, 'mounts': len(installations), 'muzzleAgreement': True})

    bridge = runpy.run_path(str(ROOT / 'scripts/blender/canonical_publish.py'))['publish_models']
    exports = []
    # No publication in a QA run: assert literal argv, shared conversion and metadata build.
    with patch('shutil.which', return_value='node'), patch('subprocess.run') as run:
        bridge(ROOT, ROOT / 'assets/blender/gepard', lambda *args: exports.append(args),
               [('gepard', ['hull']), ('gepard_artillery', ['weapon'])], 60.016 / 57.6)
        assert len(exports) == 2 and run.call_count == 3
        assert run.call_args_list[0].args[0][-3:] == ['gepard', str(exports[0][0]), str(60.016 / 57.6)]
        assert run.call_args_list[1].args[0][-1] == str(60.016 / 57.6)
        assert run.call_args_list[-1].args[0][-1] == '--write'
        assert all(call.kwargs == {'cwd': ROOT, 'check': True} for call in run.call_args_list)
    result = {'passed': True, 'imports': records, 'publishBridge': 'argv and batch conversion verified'}
finally:
    bpy.context.window.scene = previous_scene
    for obj in set(bpy.data.objects) - before_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(qa)
