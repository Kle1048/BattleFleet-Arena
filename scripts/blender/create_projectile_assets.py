"""Reference-inspired cosmetic projectiles; no flight/weapon simulation data.

Creates an isolated scene, GLB interchange files and the same evaluated mesh as
compact runtime JSON (one vertex-colour material/draw call, no async spawn IO).
Run through the Blender bridge. Existing ship scenes are not modified.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(r'C:\Users\Kleme\AI-Projects\BattleFleet-Arena')
OUT = ROOT / 'assets/blender/projectiles'
RUNTIME = ROOT / 'client/src/game/effects/projectile-assets'
PUBLIC = ROOT / 'client/public/assets/projectiles'
for directory in (OUT, RUNTIME, PUBLIC):
    directory.mkdir(parents=True, exist_ok=True)
assert bpy.context.mode == 'OBJECT', 'Leave edit mode before building assets'
scene = bpy.data.scenes.new('Projectile_Reference_Assets')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene['description'] = 'Reference-inspired Exocet MM38 / Sea Sparrow / RAM. Visual proportions, not engineering models.'
models = bpy.data.collections.new('PROJECTILE_MODELS')
scene.collection.children.link(models)
presentation = bpy.data.collections.new('PROJECTILE_PRESENTATION')
scene.collection.children.link(presentation)

# Input space matches runtime: Y up, +Z nose. Blender conversion is proper rotation.
def B(v):
    return (v[0], -v[2], v[1])

def linear(rgb):
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb)

GREY = linear((.43, .46, .45))
WHITE = linear((.83, .85, .82))
NOSE = linear((.90, .91, .85))
DARK = linear((.17, .20, .21))
BLUE = linear((.12, .24, .30))
BAND = linear((.60, .48, .30))

material = bpy.data.materials.new('Projectile_PaintedMetal_VertexColour')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .64
bsdf.inputs['Metallic'].default_value = .15
col = material.node_tree.nodes.new('ShaderNodeVertexColor')
col.layer_name = 'Color'
material.node_tree.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])

class Builder:
    def __init__(self):
        self.vertices, self.faces, self.colors, self.smooth = [], [], [], []

    def mesh(self, vertices, faces, color, smooth=False):
        off = len(self.vertices)
        self.vertices.extend(B(v) for v in vertices)
        for face in faces:
            self.faces.append(tuple(off + i for i in face))
            self.colors.append(color)
            self.smooth.append(smooth)

    def lathe(self, rings, colors, sides=12, caps=True, offset=(0,0,0)):
        vertices = [(math.cos(a * math.tau / sides) * r + offset[0], math.sin(a * math.tau / sides) * r + offset[1], z + offset[2])
                    for z, r in rings for a in range(sides)]
        for row in range(len(rings) - 1):
            faces = [(row*sides+a, row*sides+(a+1)%sides,
                      (row+1)*sides+(a+1)%sides, (row+1)*sides+a) for a in range(sides)]
            self.mesh(vertices, faces, colors[min(row, len(colors)-1)], True)
        if caps:
            self.mesh(vertices, [tuple(reversed(range(sides))),
                                tuple((len(rings)-1)*sides+a for a in range(sides))], DARK)

    def fins(self, polygon, color, thickness=.014):
        # Four closed thin swept plates; polygon contains (axial position, radius).
        for a in range(4):
            angle = a * math.pi/2 + math.pi/4
            u = Vector((math.cos(angle), math.sin(angle), 0))
            v = Vector((-math.sin(angle), math.cos(angle), 0))
            vertices = [tuple(u*r + v*(sign*thickness/2) + Vector((0, 0, z)))
                        for sign in (-1, 1) for z, r in polygon]
            n = len(polygon)
            faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
            faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
            self.mesh(vertices, faces, color)

    def finish(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for poly, rgb, smooth in zip(mesh.polygons, self.colors, self.smooth):
            poly.use_smooth = smooth
            for li in poly.loop_indices:
                color.data[li].color = (*rgb, 1)
        bm = bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh); bm.free(); mesh.update()
        obj = bpy.data.objects.new(name, mesh); models.objects.link(obj)
        mesh.materials.append(material)
        return obj

def build_exocet():
    b = Builder()
    # Approximate visual envelope: long dark body, short light ogive.
    b.lathe([(-2.60,.145),(-2.49,.173),(-1.92,.173),(-1.86,.178),
             (-1.81,.173),(.15,.173),(.19,.177),(.23,.173),(1.62,.173),
             (1.76,.17),(1.99,.146),(2.22,.105),(2.44,.052),(2.60,.002)],
            [DARK,GREY,DARK,GREY,GREY,DARK,GREY,GREY,NOSE,NOSE,NOSE,NOSE,NOSE])
    b.fins([(.24,.167),(-.63,.53),(-1.20,.53),(-1.02,.167)], GREY)
    b.fins([(-1.98,.164),(-2.39,.31),(-2.57,.31),(-2.51,.155)], GREY, .012)
    b.lathe([(-2.608,.105),(-2.60,.14),(-2.51,.14)], [DARK,GREY], caps=False)
    obj = b.finish('SSM_Exocet_MM38')
    obj['reference'] = 'User images 1 and 2; simplified MM38 silhouette'
    return obj

def build_sparrow():
    b = Builder()
    b.lathe([(-1.825,.088),(-1.76,.105),(-1.27,.105),(-1.22,.108),
             (-1.17,.105),(-.26,.105),(.27,.105),(.32,.108),(.36,.105),
             (1.24,.105),(1.40,.097),(1.57,.070),(1.72,.035),(1.825,.002)],
            [DARK,WHITE,BAND,WHITE,WHITE,BLUE,BAND,WHITE,WHITE,NOSE,NOSE,NOSE,NOSE])
    b.fins([(.35,.101),(-.13,.49),(-.42,.49),(-.42,.101)], WHITE, .010)
    b.fins([(-1.20,.10),(-1.51,.34),(-1.80,.34),(-1.80,.09)], GREY, .010)
    # Dark longitudinal service fairings around the forward section.
    b.fins([(1.19,.104),(1.16,.123),(.49,.123),(.45,.104)], DARK, .018)
    b.lathe([(-1.83,.062),(-1.825,.084),(-1.74,.084)], [DARK,GREY], caps=False)
    obj = b.finish('SAM_Sea_Sparrow')
    obj['reference'] = 'User image 3; simplified Sea Sparrow silhouette'
    return obj

def build_ram():
    b = Builder()
    # Flight photo defines the slender complete round; close-up defines the
    # bulbous dark seeker and the two characteristic forward side antennae.
    metal = linear((.55,.57,.53))
    b.lathe([(-1.405,.045),(-1.38,.063),(-1.20,.063),(-1.16,.067),
             (-1.12,.063),(-.20,.063),(-.16,.067),(-.12,.063),(.02,.063),
             (.07,.065),(.30,.065),(.35,.070),(.47,.079),(.98,.079),
             (1.12,.085),(1.21,.085),(1.29,.073),(1.35,.049),(1.39,.018),(1.40,.002)],
            [DARK,WHITE,metal,WHITE,WHITE,DARK,WHITE,BAND,WHITE,BLUE,BAND,WHITE,WHITE,metal,DARK,DARK,DARK,DARK,DARK])
    b.fins([(.76,.075),(.66,.18),(.51,.18),(.49,.077)], GREY, .008)
    b.fins([(-1.04,.061),(-1.12,.23),(-1.31,.23),(-1.32,.061)], WHITE, .010)
    # Low-sided closed rods, no costly cylinders or animated joints.
    for sign in (-1,1):
        b.lathe([(.72,.015),(1.30,.015),(1.36,.011),(1.38,.002)],
                [metal,DARK,DARK], sides=6, offset=(sign*.106,0,0))
    b.lathe([(-1.414,.032),(-1.405,.049),(-1.36,.049)], [DARK,metal], caps=False)
    obj = b.finish('PD_RAM')
    obj['reference'] = 'User RAM close-up and launch photo; simplified visual asset'
    return obj

# Subset build permits adding PD without republishing the existing SAM/SSM.
kinds = globals().get('PROJECTILE_KINDS', ('ssm','sam','pd'))
builders = {'ssm': build_exocet, 'sam': build_sparrow, 'pd': build_ram}
objects = {kind: builders[kind]() for kind in kinds}
filenames = {'ssm':'ssm_exocet_mm38.glb','sam':'sam_sea_sparrow.glb','pd':'pd_ram.glb'}
stem = 'ram' if tuple(kinds) == ('pd',) else 'projectiles'
stats = {}
for kind, obj in objects.items():
    mesh = obj.data
    mesh.calc_loop_triangles()
    color = mesh.color_attributes['Color']
    positions, normals, colors = [], [], []
    # Same evaluated triangles and corner colours as GLB; convert to Y-up +Z.
    for tri in mesh.loop_triangles:
        for li in tri.loops:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            n = mesh.corner_normals[li].vector
            positions.extend(round(c, 6) for c in (v.x, v.z, -v.y))
            normals.extend(round(c, 6) for c in (n.x, n.z, -n.y))
            colors.extend(round(c, 6) for c in color.data[li].color[:3])
    length = max(positions[2::3]) - min(positions[2::3])
    data = {'name': obj.name, 'forward': '+Z', 'up': '+Y', 'length': length,
            'positions': positions, 'normals': normals, 'colors': colors}
    (RUNTIME / (kind+'.json')).write_text(json.dumps(data, separators=(',',':')), encoding='utf-8')
    assert len(mesh.loop_triangles) < 1000
    # Only explicitly selected asset objects enter the interchange export.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    anchors = []
    for name, z in [('nose', max(positions[2::3])), ('exhaust', min(positions[2::3]))]:
        anchor = bpy.data.objects.new('projectile_'+name, None)
        models.objects.link(anchor); anchor.location = B((0,0,z)); anchor.select_set(True)
        anchors.append(anchor)
    filename = filenames[kind]
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/filename), export_format='GLB', use_selection=True, use_active_scene=True,
                              export_yup=True, export_materials='EXPORT', export_extras=True)
    for anchor in anchors: anchor.hide_render = True; anchor.hide_set(True)
    stats[kind] = {'name': obj.name, 'triangles': len(mesh.loop_triangles), 'length': length,
                   'glb': str(PUBLIC/filename), 'runtime': str(RUNTIME/(kind+'.json'))}

# Keep originals at their export origin, use linked duplicates for the presentation.
models.hide_render = True
for index, (kind, obj) in enumerate(objects.items()):
    preview = obj.copy(); preview.data = obj.data
    presentation.objects.link(preview)
    preview.rotation_euler.z = math.pi/2
    preview.location = (0, (len(objects)-1)*.85-index*1.7, 0)
    preview.name = 'Preview_'+obj.name

world = bpy.data.worlds.new('Projectile_Studio')
world.use_nodes = True; world.node_tree.nodes['Background'].inputs[0].default_value = (.11,.16,.21,1)
world.node_tree.nodes['Background'].inputs[1].default_value = .65; scene.world = world
for name, pos, power, size in [('Key',(1,-3,6),900,6),('Fill',(-3,2,3),600,5),('Rim',(2,4,4),950,4)]:
    ld=bpy.data.lights.new('Projectile_'+name,'AREA'); ld.energy=power; ld.shape='DISK'; ld.size=size
    light=bpy.data.objects.new(ld.name,ld); presentation.objects.link(light); light.location=pos
    light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Projectile_Overview'); camdata.type='ORTHO'; camdata.ortho_scale=3.7 if stem=='ram' else 8.0
cam=bpy.data.objects.new(camdata.name,camdata); presentation.objects.link(cam)
cam.location=(3,-5,7); cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler(); scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
scene.render.resolution_x=1600; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(OUT/(stem+'_preview.png'))
bpy.ops.render.render(write_still=True)
scene['triangle_counts']=json.dumps(stats)
bpy.data.libraries.write(str(OUT/(stem+'.blend')), {scene}, fake_user=True, compress=True)
(OUT/(stem+'-validation.json')).write_text(json.dumps(stats, indent=2), encoding='utf-8')
result=stats
