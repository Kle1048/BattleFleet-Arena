"""Assemble canonical runtime assets in Blender using only imported model markers."""
import json
from mathutils import Matrix


def assemble_runtime_ship(root, class_id, load):
    profile = json.loads((root / 'shared/src/data/ships' / (class_id + '.json')).read_text())
    catalog = json.loads((root / 'shared/src/content/modelCatalog.json').read_text())
    assets = root / 'client/public/assets'
    hull = load(assets / catalog[profile['hullGltfId']]['file'], Matrix.Identity(4))
    # Blender may suffix imported object names when the source scene is still open.
    markers = {}
    for obj in hull:
        name = obj.get('export_name', obj.name.rsplit('.', 1)[0] if obj.name[-3:].isdigit() else obj.name)
        if name.startswith(('SOCKET_', 'RAIL_')):
            if name in markers:
                raise ValueError('Duplicate imported marker: ' + name)
            markers[name] = obj.matrix_world.copy()
    for slot in profile['mountSlots']:
        equipment = profile.get('defaultLoadout', {}).get(slot['id'])
        if equipment:
            load(assets / catalog[equipment['modelId']]['file'], markers['SOCKET_' + slot['id']])
    for rail in profile.get('fixedSeaSkimmerLaunchers', []):
        load(assets / catalog[rail['equipment']['modelId']]['file'], markers['RAIL_' + rail['id']])
