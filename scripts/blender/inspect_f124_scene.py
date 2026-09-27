import bpy
result={'active_scene':bpy.context.scene.name,'file':bpy.data.filepath,
        'scenes':[{ 'name':s.name,'objects':len(s.objects),'revision':s.get('f124_asset_revision',1)}
                  for s in bpy.data.scenes if 'F124' in s.name]}
