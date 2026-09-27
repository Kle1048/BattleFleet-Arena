"""Clean native Blender paint, baked to one small colour map; no weather layers.

Uses existing source UV tile semantics so geometry, windows and mesh lettering
are preserved. Never derives colours by filtering the old weathered bitmaps.
"""
import bpy
import math
import json
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parents[2] / 'shared/src/content/modelMaterialPolicy.json').read_text())
HULL_TEXTURE_SIZE = POLICY['hullTextureSize']
MOUNT_TEXTURE_SIZE = POLICY['mountTextureSize']


def make_clean_paint(name, slug):
    # sRGB palette, top row first: paint/light paint/deck/blue-grey;
    # glazing/rubber/machinery/red; white/yellow/vents/grey; deck/trim.
    palette = [(.52,.58,.59), (.72,.76,.75), (.29,.35,.37), (.48,.55,.57),
               (.075,.14,.17), (.12,.14,.15), (.37,.42,.43), (.52,.20,.15),
               (.87,.87,.81), (.86,.65,.18), (.19,.26,.29), (.50,.57,.59),
               (.27,.33,.35), (.66,.71,.70), (.36,.42,.43), (.48,.55,.57)]
    if slug in ('spruance', 'slava'): palette[2] = (.24,.28,.30)
    if slug == 'slava': palette[12] = (.49,.28,.20)
    def linear(c):
        return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    n, links = mat.node_tree.nodes, mat.node_tree.links
    n.clear()
    uv = n.new('ShaderNodeUVMap'); uv.uv_map = 'SourceAtlas'
    sep = n.new('ShaderNodeSeparateXYZ'); links.new(uv.outputs[0], sep.inputs[0])
    def op(kind, a, b=None):
        node = n.new('ShaderNodeMath'); node.operation = kind
        for i, value in enumerate((a, b)):
            if value is None: continue
            if isinstance(value, (int, float)): node.inputs[i].default_value = value
            else: links.new(value, node.inputs[i])
        return node.outputs[0]
    x = op('MINIMUM', op('MAXIMUM', op('FLOOR', op('MULTIPLY', sep.outputs['X'], 4)), 0), 3)
    y = op('MINIMUM', op('MAXIMUM', op('FLOOR', op('MULTIPLY', sep.outputs['Y'], 4)), 0), 3)
    tile = op('ADD', x, op('MULTIPLY', op('SUBTRACT', 3, y), 4))
    ramp = n.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    elements = ramp.color_ramp.elements
    # Configure the two existing stops before inserting the intermediate stops.
    elements[0].position = 0; elements[1].position = 15 / 16
    elements[0].color = (*map(linear, palette[0]), 1)
    elements[1].color = (*map(linear, palette[15]), 1)
    for i in range(1, 15): elements.new(i / 16).color = (*map(linear, palette[i]), 1)
    links.new(op('DIVIDE', op('ADD', tile, .1), 16), ramp.inputs[0])
    # Vent slats are markings, not noisy surface wear.
    vent = op('LESS_THAN', op('ABSOLUTE', op('SUBTRACT', tile, 10)), .1)
    stripe = op('LESS_THAN', op('FRACT', op('MULTIPLY', sep.outputs['Y'], 64)), .25)
    mix = n.new('ShaderNodeMixRGB')
    links.new(op('MULTIPLY', vent, stripe), mix.inputs[0])
    links.new(ramp.outputs['Color'], mix.inputs[1]); mix.inputs[2].default_value = (.14,.19,.20,1)
    bs = n.new('ShaderNodeBsdfPrincipled'); bs.inputs['Roughness'].default_value = POLICY['roughness']
    bs.inputs['Metallic'].default_value = POLICY['metallic']
    links.new(mix.outputs[0], bs.inputs['Base Color'])
    output = n.new('ShaderNodeOutputMaterial'); links.new(bs.outputs[0], output.inputs[0])
    return mat


def bake_clean_part(ob, slug, key, directory):
    """Input is authoring geometry with original palette UVs, not baked UVs."""
    baked_material = any(mat and ('_Clean_' in mat.name or '_SeaService_' in mat.name)
                         for mat in ob.data.materials)
    if baked_material or ob.get('bfa_clean_baked') or 'SourceAtlas' in ob.data.uv_layers or 'CleanBake' in ob.data.uv_layers:
        raise ValueError('Clean bake requires fresh source UVs')
    ob.data.calc_loop_triangles(); triangles = len(ob.data.loop_triangles)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    ob.data.uv_layers.active.name = 'SourceAtlas'
    ob.data.uv_layers.new(name='CleanBake')
    ob.data.uv_layers.active_index = len(ob.data.uv_layers) - 1
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.008, area_weight=1, correct_aspect=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.data.uv_layers['CleanBake'].active_render = True
    material = make_clean_paint(slug.title() + '_Clean_' + key, slug)
    ob.data.materials.clear(); ob.data.materials.append(material)
    for face in ob.data.polygons: face.material_index = 0
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bs = nodes.get('Principled BSDF'); output = nodes.get('Material Output')
    colour = bs.inputs['Base Color'].links[0].from_socket
    emission = nodes.new('ShaderNodeEmission')
    links.new(colour, emission.inputs['Color']); links.new(emission.outputs[0], output.inputs[0])
    size = HULL_TEXTURE_SIZE if key == 'hull' else MOUNT_TEXTURE_SIZE
    image = bpy.data.images.new(slug + '_clean_' + key, width=size, height=size, alpha=False)
    target = nodes.new('ShaderNodeTexImage'); target.image = image; nodes.active = target
    scene = bpy.context.scene; old_engine = scene.render.engine
    try:
        scene.render.engine = 'CYCLES'; scene.cycles.samples = 1; scene.cycles.device = 'CPU'
        scene.render.bake.margin = 4 if key == 'hull' else 2
        bpy.ops.object.bake(type='EMIT', uv_layer='CleanBake')
    finally:
        scene.render.engine = old_engine
    directory.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(directory / (slug + '_' + key + '_basecolor.png'))
    image.file_format = 'PNG'; image.save(); image.pack()
    nodes.clear()
    bs = nodes.new('ShaderNodeBsdfPrincipled'); bs.inputs['Metallic'].default_value = POLICY['metallic']
    bs.inputs['Roughness'].default_value = POLICY['roughness']
    target = nodes.new('ShaderNodeTexImage'); target.image = image
    links.new(target.outputs['Color'], bs.inputs['Base Color'])
    output = nodes.new('ShaderNodeOutputMaterial'); links.new(bs.outputs[0], output.inputs[0])
    for name in [uv.name for uv in ob.data.uv_layers if uv.name != 'CleanBake']:
        ob.data.uv_layers.remove(ob.data.uv_layers[name])
    ob.data.uv_layers.active.name = 'UVMap'
    ob['bfa_clean_baked'] = True
    ob.data.calc_loop_triangles(); assert len(ob.data.loop_triangles) == triangles
    return {'part': key, 'triangles': triangles, 'texture_resolution': size,
            'maps': ['basecolor'], 'rust_patches': 0}
