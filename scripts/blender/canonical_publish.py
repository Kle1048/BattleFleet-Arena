"""Bridge from Blender's metric source scene to the canonical game exporter.

No socket/profile JSON is authored here. Node validates the exported GLBs and
derives shared metadata. argv lists (never a shell) keep paths literal.
"""
import shutil
import bpy
import json
import subprocess
from pathlib import Path

def export(path,objects):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in objects if o.type=='MESH')
    renamed=[]
    for ob in objects:
        desired=ob.get('export_name')
        if desired and ob.name!=desired:
            conflict=bpy.data.objects.get(desired)
            if conflict:old=conflict.name; conflict.name='RESERVED_'+old; renamed.append((conflict,old))
            old=ob.name; ob.name=desired; renamed.append((ob,old))
    try:bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,
                                export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_extras=True)
    finally:
        for ob,old in reversed(renamed): ob.name=old


def publish_models(root, out, export, models, metres_per_unit=1):
    """models: (catalog ID, source objects); one explicit unit conversion per batch."""
    root, out = Path(root), Path(out)
    catalog = json.loads((root / 'shared/src/content/modelCatalog.json').read_text())
    if any(model_id not in catalog for model_id, objects in models):
        raise ValueError('Unknown catalog model ID; register the model before publishing')
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node.js must be on PATH to publish canonical models')
    staged = []
    for model_id, objects in models:
        source = out / (model_id + '_source.glb')
        export(source, objects)
        staged.append((model_id, source))
    for model_id, source in staged:
        subprocess.run([node, '--conditions=bfa-source', '--import', 'tsx',
                        str(root / 'scripts/models/exportModel.ts'), model_id,
                        str(source), str(metres_per_unit)], cwd=root, check=True)
    subprocess.run([node, '--conditions=bfa-source', '--import', 'tsx',
                    str(root / 'scripts/models/buildModelMetadata.ts'), '--write'],
                   cwd=root, check=True)
