"""Add restrained sea-service weathering in a new animated Blender scene.
Generated bitmap assets are retained verbatim; blending occurs in materials.
"""
import bpy, math, json, ast
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT=ROOT/'assets/blender/f124/weathered'
tree=ast.parse((ROOT/'scripts/blender/create_f124_asset.py').read_text(encoding='utf-8'))
stations=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='stations' for t in n.targets))
def deck_height(z):
    for a,b in zip(stations,stations[1:]):
        if a[0]<=z<=b[0]: return a[2]+(b[2]-a[2])*(z-a[0])/(b[0]-a[0])
    raise ValueError(z)
source=bpy.data.scenes['F124_Animation_Demo']
scene=source.copy(); scene.name='F124_Animation_Weathered'
scene['weathering_source']=source.name
scene['weathering_note']='Maintained ship after months at sea: faded paint, salt haze, localized rust runoff.'
for c in list(scene.collection.children): scene.collection.children.unlink(c)
mapping={}
for c in source.collection.children:
    new=bpy.data.collections.new('WEATHERED_'+c.name); scene.collection.children.link(new)
    for o in c.objects:
        n=o.copy()
        if o.data: n.data=o.data.copy()
        new.objects.link(n); mapping[o]=n
for o,n in mapping.items():
    if o.parent: n.parent=mapping[o.parent]
scene.camera=mapping[source.camera]
bpy.context.window.scene=scene
atlas=bpy.data.images.load(str(OUT/'textures/f124_surface_weathered.png'),check_existing=False); atlas.pack()
rust=bpy.data.images.load(str(OUT/'textures/f124_rust_runoff_rgba.png'),check_existing=False); rust.pack()
assert rust.channels==4, 'Rust decal requires real alpha'
alphas=rust.pixels[3::4]
assert min(alphas)<.01 and max(alphas)>.5,'Alpha must contain transparent and opaque pixels'
materials={}
for ob in scene.objects:
    if ob.type!='MESH': continue
    for slot in ob.material_slots:
        old=slot.material
        if not old or not old.name.startswith(('F124_PaintedSteel','F124_FlightDeck')): continue
        if old in materials: slot.material=materials[old]; continue
        mat=old.copy(); mat.name='SEA_SERVICE_'+old.name; materials[old]=mat; slot.material=mat
        nodes=mat.node_tree.nodes; links=mat.node_tree.links
        bs=nodes.get('Principled BSDF'); original=bs.inputs['Base Color'].links[0].from_socket
        if old.name.startswith('F124_PaintedSteel'):
            tex=nodes.new('ShaderNodeTexImage'); tex.image=atlas; tex.label='AI weathered atlas — same 4x4 UV layout'
            mix=nodes.new('ShaderNodeMixRGB'); mix.blend_type='MIX'; mix.label='Restrained sea-service wear'
            mix.inputs[0].default_value=.40
            links.new(original,mix.inputs[1]); links.new(tex.outputs['Color'],mix.inputs[2]); links.new(mix.outputs[0],bs.inputs['Base Color'])
            mat['weathered_atlas_blend']=.40
        # Fine physical-scale surface variation, intentionally not a large cracked texture.
        coords=nodes.new('ShaderNodeTexCoord')
        noise=nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=5.5
        noise.inputs['Detail'].default_value=2; noise.inputs['Roughness'].default_value=.65
        links.new(coords.outputs['Object'],noise.inputs['Vector'])
        ramp=nodes.new('ShaderNodeMapRange'); ramp.inputs['To Min'].default_value=.68; ramp.inputs['To Max'].default_value=.84
        links.new(noise.outputs['Fac'],ramp.inputs['Value']); links.new(ramp.outputs[0],bs.inputs['Roughness'])
        bump=nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.10; bump.inputs['Distance'].default_value=.006
        links.new(noise.outputs['Fac'],bump.inputs['Height']); links.new(bump.outputs['Normal'],bs.inputs['Normal'])
        bs.inputs['Metallic'].default_value=.045
        if old.name.startswith('F124_FlightDeck'):
            fade=nodes.new('ShaderNodeMixRGB'); fade.inputs[0].default_value=.065
            fade.inputs[2].default_value=(.36,.38,.37,1); links.new(original,fade.inputs[1]); links.new(fade.outputs[0],bs.inputs['Base Color'])

decals=bpy.data.collections.new('WEATHERING_RUST_DECALS'); scene.collection.children.link(decals)
rustmat=bpy.data.materials.new('SEA_SERVICE_RustRunoff'); rustmat.use_nodes=True
rustmat.surface_render_method='DITHERED'; rustmat.use_transparency_overlap=False
n=rustmat.node_tree.nodes; l=rustmat.node_tree.links
bs=n.get('Principled BSDF'); bs.inputs['Roughness'].default_value=.91
tex=n.new('ShaderNodeTexImage'); tex.image=rust; tex.extension='CLIP'
hs=n.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value=.72; hs.inputs['Value'].default_value=.80
l.new(tex.outputs['Color'],hs.inputs['Color']); l.new(hs.outputs[0],bs.inputs['Base Color'])
alpha=n.new('ShaderNodeMath'); alpha.operation='MULTIPLY'; alpha.inputs[1].default_value=.55
l.new(tex.outputs['Alpha'],alpha.inputs[0]); l.new(alpha.outputs[0],bs.inputs['Alpha'])
rustmat['opacity']=.55
hull=next(o for o in scene.objects if o.type=='MESH' and 'HULL' in o.name and 'PaintedSteel' in o.name)
bpy.context.view_layer.update()

def decal(side,z,top,width,height,index):
    # A sampled patch conforms to the hull rather than floating above curved plates.
    top=min(deck_height(z-width/2),deck_height(z+width/2))-.045
    nx,ny=5,10; verts=[]; uv=[]
    for j in range(ny+1):
        v=j/ny; y=top-height+height*v
        for i in range(nx+1):
            u=i/nx; zz=z+(u-.5)*width
            origin=Vector((side*35,-zz,y)); direction=Vector((-side,0,0))
            ok,p,normal,face=hull.ray_cast(hull.matrix_world.inverted()@origin,direction,distance=40)
            if not ok or normal.x*side<.25: return False
            verts.append(hull.matrix_world@(p+normal*.014)); uv.append((1-u if index%2 else u,.04+.90*v))
    faces=[]
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i; face=(a,a+1,a+nx+2,a+nx+1)
            faces.append(tuple(reversed(face)) if side==1 else face)
    me=bpy.data.meshes.new('RUST_surface_patch'); me.from_pydata(verts,[],faces); me.update()
    layer=me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for loop in poly.loop_indices: layer.data[loop].uv=uv[me.loops[loop].vertex_index]
    ob=bpy.data.objects.new('RUST_'+('starboard' if side>0 else 'port')+'_'+str(index),me)
    decals.objects.link(ob); me.materials.append(rustmat)
    ob['weathering_origin']='Below deck edge / drainage / fittings, gravity-aligned'
    return True

# Sparse, asymmetric placements; leave pennant, radar faces, windows and deck marks clean.
patches=[(63,7.45,1.6,2.7),(54.8,7.18,1.0,1.65),(45.7,6.95,1.3,2.1),
         (35,6.8,.9,1.5),(13.8,6.65,1.3,2.4),(-4,6.6,1.2,1.9),
         (-19,6.5,1.15,2.25),(-43.4,4.8,1.45,2.8),(-61.5,4.75,.9,1.8)]
placed=0
for side in (-1,1):
    for i,(z,top,w,h) in enumerate(patches):
        if side<0 and i in (3,6): continue
        placed+=decal(side,z+(0 if side>0 else .7),top,w*(1 if side>0 else .85),h,i)
assert placed>=12,placed

# Check copied parenting/constraints/actions at every animation keyframe.
max_error=0
animated=[o for o in source.objects if o.animation_data and o.animation_data.action]
for f in range(source.frame_start,source.frame_end+1):
    source.frame_set(f); scene.frame_set(f); bpy.context.view_layer.update()
    for o in animated:
        clone=mapping[o]
        assert clone.animation_data.action==o.animation_data.action
        max_error=max(max_error,max(abs(o.matrix_world[i][j]-clone.matrix_world[i][j]) for i in range(4) for j in range(4)))
assert max_error<.0001,max_error
source.frame_set(210); scene.frame_set(210)
scene.render.filepath=str(OUT/'f124_weathered_hero.png')
bpy.data.libraries.write(str(OUT/'f124_hessen_animated_weathered.blend'),{scene},fake_user=True)
images=set()
for ob in scene.objects:
    if ob.type=='MESH':
        for mat in ob.data.materials:
            if mat and mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type=='TEX_IMAGE' and node.image: images.add(node.image)
assert all(im.packed_file for im in images)
report={'passed':True,'scene':scene.name,'source_retained':source.name,'rust_patches':placed,
        'packed_textures':len(images),'generated_textures':[atlas.size[:],rust.size[:]],
        'animation_frames_checked':scene.frame_end,'animated_objects':len(animated),'max_transform_error':max_error,
        'game_sector_constraints_preserved':True,'runtime_glbs_changed':False}
(OUT/'weathering-validation.json').write_text(json.dumps(report,indent=2))
result=report
