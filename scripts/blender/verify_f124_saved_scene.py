import bpy
import json
from pathlib import Path

out=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena\assets\blender\f124')
source=max((s for s in bpy.data.scenes if s.name.startswith('F124_Hessen_Asset')),
           key=lambda s:(s.get('f124_asset_revision',1),s.name))
with bpy.data.libraries.load(str(out/'f124_hessen.blend'),link=False) as (data_from,data_to):
    saved_scenes=list(data_from.scenes)
    saved_images=list(data_from.images)
assert saved_scenes==[source.name],saved_scenes
assert len(saved_images)==4,saved_images
images=set()
for ob in source.objects:
    if ob.type=='MESH':
        for mat in ob.data.materials:
            if mat and mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type=='TEX_IMAGE' and node.image: images.add(node.image)
assert len(images)==4
assert all(i.packed_file for i in images),'Source textures must be packed'
report={'status':'pass','saved_scenes':saved_scenes,'saved_image_count':len(saved_images),
        'source_revision':source.get('f124_asset_revision'),'all_source_textures_packed':True}
(out/'saved-scene-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.context.window.scene=source
result=report
