import math
import os

import bpy
from mathutils import Vector


ROOT = r"C:\Users\Kleme\AI-Projects\BattleFleet-Arena"
HULL_GLB = os.path.join(ROOT, "client", "public", "assets", "ships", "example_destroyer_hull.glb")
MOUNT_GLB = os.path.join(ROOT, "client", "public", "assets", "systems", "example_artillery_turret.glb")
BLEND_PATH = os.path.join(ROOT, "assets", "blender", "example_destroyer_scene.blend")
PREVIEW_PATH = os.path.join(ROOT, "assets", "blender", "example_destroyer_preview.png")


def ensure_dir(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)


def remove_all():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection" and collection.users == 0:
            bpy.data.collections.remove(collection)


def collection(name):
    existing = bpy.data.collections.get(name)
    if existing:
        return existing
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def move_to(obj, target):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


def set_input(node, name, value):
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def procedural_material(name, colors, scale, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    noise = nodes.new("ShaderNodeTexNoise")
    ramp = nodes.new("ShaderNodeValToRGB")
    bump = nodes.new("ShaderNodeBump")

    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.65
    ramp.color_ramp.elements[0].color = (*colors[0], 1.0)
    ramp.color_ramp.elements[1].color = (*colors[1], 1.0)
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.08
    set_input(shader, "Metallic", metallic)
    set_input(shader, "Roughness", roughness)

    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    output.location = (420, 0)
    shader.location = (160, 0)
    ramp.location = (-80, 80)
    noise.location = (-300, 80)
    bump.location = (-80, -120)
    return mat


def simple_material(name, color, metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    set_input(shader, "Base Color", (*color, 1.0))
    set_input(shader, "Metallic", metallic)
    set_input(shader, "Roughness", roughness)
    if emission:
        set_input(shader, "Emission Color", (*emission, 1.0))
        set_input(shader, "Emission Strength", 2.0)
    return mat


def apply_bevel(obj, amount=0.12, segments=3):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("BEVEL_soft_edges", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def box(name, dimensions, location, target, material, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to(obj, target)
    obj.data.materials.append(material)
    if bevel:
        apply_bevel(obj, bevel)
    return obj


def cylinder(name, radius, depth, location, target, material, vertices=16, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation or (0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    move_to(obj, target)
    obj.data.materials.append(material)
    apply_bevel(obj, min(radius * 0.18, 0.08), 2)
    return obj


def hull_mesh(target, material):
    sections = [(-14.0, 1.8), (-10.0, 2.55), (5.5, 2.55), (11.0, 2.05), (14.0, 0.65)]
    verts = []
    for z, half_width in sections:
        verts.extend([
            (-half_width, 0.0, z),
            (half_width, 0.0, z),
            (half_width * 0.92, 1.35, z),
            (-half_width * 0.92, 1.35, z),
        ])
    faces = []
    for i in range(len(sections) - 1):
        a = i * 4
        b = (i + 1) * 4
        faces.extend([
            (a + 0, b + 0, b + 1, a + 1),
            (a + 3, a + 2, b + 2, b + 3),
            (a + 0, a + 3, b + 3, b + 0),
            (a + 1, b + 1, b + 2, a + 2),
        ])
    faces.extend([(0, 1, 2, 3), ((len(sections) - 1) * 4 + 0, (len(sections) - 1) * 4 + 3, (len(sections) - 1) * 4 + 2, (len(sections) - 1) * 4 + 1)])
    mesh = bpy.data.meshes.new("MESH_hull_main_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("MESH_hull_main", mesh)
    target.objects.link(obj)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("BEVEL_hull_edges", "BEVEL")
    bevel.width = 0.16
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return obj


def create_turret(target, name, location, materials):
    metal, dark = materials
    base = cylinder(name + "_base", 0.95, 0.42, (location[0], location[1] + 0.21, location[2]), target, metal, 20)
    housing = box(name + "_housing", (1.35, 0.72, 1.25), (location[0], location[1] + 0.67, location[2]), target, metal, 0.12)
    barrel = cylinder(name + "_barrel", 0.16, 2.8, (location[0], location[1] + 0.78, location[2] + 1.2), target, dark, 12)
    return [base, housing, barrel]


def empty(name, location, target):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.75
    obj.location = location
    target.objects.link(obj)
    return obj


def select_collection_meshes(target):
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [obj for obj in target.objects if obj.type == "MESH" and not obj.hide_render]
    for obj in meshes:
        obj.select_set(True)
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]


def export_collection(target, path):
    select_collection_meshes(target)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True)
    bpy.ops.object.select_all(action="DESELECT")


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_preview(hull_collection, mount_collection):
    preview = collection("PREVIEW_ONLY")
    water = simple_material("MAT_preview_water", (0.015, 0.08, 0.13), metallic=0.05, roughness=0.22)
    plane = box("PREVIEW_water_plane", (70.0, 0.12, 70.0), (0.0, -0.16, 0.0), preview, water, bevel=0.0)
    plane.hide_render = False

    bpy.ops.object.camera_add(location=(24.0, 25.0, -27.0))
    camera = bpy.context.object
    camera.name = "PREVIEW_camera"
    move_to(camera, preview)
    camera.data.lens = 52
    look_at(camera, (0.0, 1.0, 1.0))
    bpy.context.scene.camera = camera

    for name, location, energy, size in [
        ("PREVIEW_key", (8.0, 28.0, -8.0), 1300.0, 8.0),
        ("PREVIEW_fill", (-16.0, 16.0, 12.0), 900.0, 10.0),
        ("PREVIEW_rim", (4.0, 10.0, 22.0), 1100.0, 7.0),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        move_to(light, preview)
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0.0, 0.0, 1.0))

    world = bpy.context.scene.world
    world.color = (0.005, 0.01, 0.02)
    scene = bpy.context.scene
    # Blender 5.2 exposes the Eevee engine under this enum in the installed build.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = PREVIEW_PATH
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)


def main():
    for path in (HULL_GLB, MOUNT_GLB, BLEND_PATH, PREVIEW_PATH):
        ensure_dir(path)
    remove_all()

    hull = collection("HULL")
    mounts = collection("MOUNTS_REF")
    mount_asset = collection("MOUNT_ASSET")
    helpers = collection("HELPERS")

    hull_mat = procedural_material("MAT_hull_navy", ((0.025, 0.07, 0.12), (0.08, 0.18, 0.28)), 3.8, 0.72, 0.3)
    deck_mat = procedural_material("MAT_deck_bluegray", ((0.11, 0.14, 0.16), (0.22, 0.26, 0.27)), 7.0, 0.5, 0.38)
    metal_mat = procedural_material("MAT_mount_metal", ((0.12, 0.14, 0.15), (0.32, 0.34, 0.33)), 5.0, 0.82, 0.24)
    dark_mat = simple_material("MAT_barrel_dark", (0.018, 0.022, 0.024), metallic=0.9, roughness=0.22)
    accent_mat = simple_material("MAT_accent_red", (0.35, 0.018, 0.012), metallic=0.35, roughness=0.32)

    hull_mesh(hull, hull_mat)
    box("MESH_deck", (4.85, 0.25, 25.5), (0.0, 1.48, 0.0), hull, deck_mat, 0.1)
    box("MESH_hull_bow_deck", (2.35, 0.18, 3.6), (0.0, 1.68, 11.2), hull, deck_mat, 0.08)
    box("MESH_superstructure", (3.05, 1.45, 5.4), (0.0, 2.15, -0.7), hull, deck_mat, 0.16)
    box("MESH_command_tower", (2.2, 1.6, 2.6), (0.0, 3.68, 1.3), hull, hull_mat, 0.14)
    box("MESH_bridge_windows", (2.24, 0.28, 1.15), (0.0, 3.45, 2.25), hull, accent_mat, 0.04)
    cylinder("MESH_mast", 0.12, 5.0, (0.0, 6.0, -1.0), hull, dark_mat, 12)
    box("MESH_radar", (2.0, 0.12, 0.35), (0.0, 8.55, -1.0), hull, metal_mat, 0.04)
    box("MESH_aft_deckhouse", (2.4, 0.75, 2.0), (0.0, 2.0, -7.3), hull, deck_mat, 0.1)

    socket_positions = {
        "SOCKET_main_fwd": (0.0, 1.75, 8.2),
        "SOCKET_main_aft": (0.0, 1.75, -6.0),
        "SOCKET_ciws_fwd": (0.0, 3.0, 4.0),
    }
    for name, location in socket_positions.items():
        empty(name, location, helpers)

    create_turret(mount_asset, "MOUNT_artillery_template", (0.0, 0.0, 0.0), (metal_mat, dark_mat))
    create_turret(mounts, "MOUNTREF_main_fwd", socket_positions["SOCKET_main_fwd"], (metal_mat, dark_mat))
    create_turret(mounts, "MOUNTREF_main_aft", socket_positions["SOCKET_main_aft"], (metal_mat, dark_mat))
    create_turret(mounts, "MOUNTREF_ciws_fwd", socket_positions["SOCKET_ciws_fwd"], (metal_mat, dark_mat))

    export_collection(hull, HULL_GLB)
    export_collection(mount_asset, MOUNT_GLB)
    render_preview(hull, mounts)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

    result = {
        "status": "ok",
        "hull_glb": HULL_GLB,
        "mount_glb": MOUNT_GLB,
        "blend": BLEND_PATH,
        "preview": PREVIEW_PATH,
        "sockets": socket_positions,
        "materials": [hull_mat.name, deck_mat.name, metal_mat.name, dark_mat.name, accent_mat.name],
    }
    return result


result = main()
