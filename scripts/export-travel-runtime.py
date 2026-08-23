"""
Export derived travel-pack + T-rex GLBs for the stage.

Reads source OBJs/PNGs and writes only to public/assets/models/**/runtime/.
Never overwrites masters.

After this script, compress textures (do not run gltf-transform `optimize`):

  npx @gltf-transform/cli resize runtime.glb resized.glb --width 1024 --height 1024
  npx @gltf-transform/cli webp resized.glb runtime.glb --quality 86

Skip Draco until the stage ships a DRACOLoader + decoder.
"""
from __future__ import annotations

import math
import os
import shutil
import tempfile

import bpy
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PACK_OPEN_SRC = os.path.join(ROOT, "masters/travel-backpack-open/travel-backpack")
PACK_CLOSED_SRC = os.path.join(ROOT, "masters/travel-backpack-closed/Travel Pack")
PACK_EXTRAS = os.path.join(ROOT, "masters/travel-backpack-open/Extras")
REX_SRC = os.path.join(ROOT, "public/assets/models/t-rex")
PACK_OUT_DIR = os.path.join(ROOT, "public/assets/models/travel-pack/runtime")
REX_OUT_DIR = os.path.join(ROOT, "public/assets/models/t-rex/runtime")
TEX_SIZE = 1024
PACK_TEX_SIZE = 2048
CM_TO_M = 0.01


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_obj(path):
    bpy.ops.wm.obj_import(
        filepath=path,
        forward_axis="NEGATIVE_Z",
        up_axis="Y",
        use_split_objects=True,
        use_split_groups=True,
    )


def prep_obj(src_dir, obj_name, mtl_name, expected_mtllib):
    tmp = tempfile.mkdtemp(prefix="travel-export-")
    shutil.copy2(os.path.join(src_dir, obj_name), os.path.join(tmp, obj_name))
    shutil.copy2(os.path.join(src_dir, mtl_name), os.path.join(tmp, expected_mtllib))
    for name in os.listdir(src_dir):
        if name.lower().endswith((".png", ".jpg", ".jpeg")):
            shutil.copy2(os.path.join(src_dir, name), os.path.join(tmp, name))
    return os.path.join(tmp, obj_name), tmp


def meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def world_minmax(obj):
    if obj.type != "MESH" or not obj.data:
        loc = obj.matrix_world.translation
        return loc.copy(), loc.copy()
    mat = obj.matrix_world
    coords = [mat @ v.co for v in obj.data.vertices]
    if not coords:
        loc = obj.matrix_world.translation
        return loc.copy(), loc.copy()
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def world_centroid(obj):
    if obj.type != "MESH" or not obj.data or not obj.data.vertices:
        return obj.matrix_world.translation.copy()
    mat = obj.matrix_world
    acc = Vector((0, 0, 0))
    verts = obj.data.vertices
    for v in verts:
        acc += mat @ v.co
    return acc / len(verts)


def combined_minmax(objects):
    mesh_objs = [obj for obj in objects if obj.type == "MESH" and obj.data]
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in mesh_objs:
        a, b = world_minmax(obj)
        lo.x, lo.y, lo.z = min(lo.x, a.x), min(lo.y, a.y), min(lo.z, a.z)
        hi.x, hi.y, hi.z = max(hi.x, b.x), max(hi.y, b.y), max(hi.z, b.z)
    return lo, hi


def load_image(path, size=TEX_SIZE, non_color=False):
    img = bpy.data.images.load(path)
    if img.size[0] > size or img.size[1] > size:
        img.scale(size, size)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def make_pbr(name, color, *, albedo=None, normal=None, roughness_tex=None, roughness=0.45, metalness=0.04):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metalness
    if albedo:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = albedo
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if roughness_tex:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = roughness_tex
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])
    if normal:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = normal
        nrm = nt.nodes.new("ShaderNodeNormalMap")
        nrm.inputs["Strength"].default_value = 1.0
        nt.links.new(tex.outputs["Color"], nrm.inputs["Color"])
        nt.links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def assign_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def origin_to_world(obj, world_co):
    bpy.context.scene.cursor.location = world_co
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def origin_to_geometry(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")


def apply_scale_rot(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def parent_keep(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def split_lid(obj, z_cut):
    """Separate verts above z_cut into a new object. Returns lid or None."""
    if obj.type != "MESH" or not obj.data.vertices:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")

    mat = obj.matrix_world
    selected = 0
    for v in obj.data.vertices:
        world = mat @ v.co
        v.select = world.z >= z_cut
        if v.select:
            selected += 1
    total = len(obj.data.vertices)
    if selected < max(8, int(total * 0.04)) or selected > int(total * 0.62):
        for v in obj.data.vertices:
            v.select = False
        return None

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")

    lid = None
    for other in bpy.context.selected_objects:
        if other != obj and other.type == "MESH":
            lid = other
    return lid


def export_glb(path, objects):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
        for child in obj.children_recursive:
            child.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
        export_morph=True,
        export_morph_normal=True,
    )
    print(f"exported {path} ({os.path.getsize(path) / 1024 / 1024:.2f} MB)")


def first_vert_uvs(obj):
    """One UV per vertex from the first loop that uses it."""
    n = len(obj.data.vertices)
    out = [None] * n
    uv_layer = obj.data.uv_layers.active
    if not uv_layer:
        return out
    data = uv_layer.data
    for li, loop in enumerate(obj.data.loops):
        vi = loop.vertex_index
        if out[vi] is None:
            out[vi] = data[li].uv.copy()
    return out


def world_positions(obj):
    mat = obj.matrix_world
    return [mat @ v.co for v in obj.data.vertices]


def kabsch(src, dst):
    """Return (R, t) such that dst ≈ R @ src + t. src/dst are lists of Vector."""
    n = len(src)
    if n < 3:
        return Matrix.Identity(3), Vector((0, 0, 0))
    import numpy as np

    S = np.array([[a.x, a.y, a.z] for a in src])
    D = np.array([[b.x, b.y, b.z] for b in dst])
    cs = S.mean(axis=0)
    cd = D.mean(axis=0)
    H = (S - cs).T @ (D - cd)
    U, _S, Vt = np.linalg.svd(H)
    Rnp = Vt.T @ U.T
    if np.linalg.det(Rnp) < 0:
        Vt[-1] *= -1
        Rnp = Vt.T @ U.T
    R = Matrix((
        (float(Rnp[0, 0]), float(Rnp[0, 1]), float(Rnp[0, 2])),
        (float(Rnp[1, 0]), float(Rnp[1, 1]), float(Rnp[1, 2])),
        (float(Rnp[2, 0]), float(Rnp[2, 1]), float(Rnp[2, 2])),
    ))
    tvec = cd - (Rnp @ cs)
    t = Vector((float(tvec[0]), float(tvec[1]), float(tvec[2])))
    return R, t


def add_closed_shape_key(open_obj, closed_obj):
    """UV-correspond the closed pose onto the open mesh as a 'closed' shape key."""
    open_uvs = first_vert_uvs(open_obj)
    closed_uvs = first_vert_uvs(closed_obj)
    closed_world = world_positions(closed_obj)
    open_world = world_positions(open_obj)

    tree = KDTree(len(closed_obj.data.vertices))
    for i, uv in enumerate(closed_uvs):
        if uv is None:
            tree.insert((0.0, 0.0, float(i)), i)
        else:
            tree.insert((uv.x, uv.y, 0.0), i)
    tree.balance()

    mapped = []
    body_src = []
    body_dst = []
    for i, uv in enumerate(open_uvs):
        if uv is None:
            co = closed_world[min(i, len(closed_world) - 1)]
        else:
            _co, idx, dist = tree.find((uv.x, uv.y, 0.0))
            co = closed_world[idx]
            if dist < 0.02:
                delta = (open_world[i] - co).length
                if delta < 8.0:
                    body_src.append(co)
                    body_dst.append(open_world[i])
        mapped.append(co)

    R, t = kabsch(body_src, body_dst) if len(body_src) >= 32 else (Matrix.Identity(3), Vector((0, 0, 0)))
    inv = open_obj.matrix_world.inverted()
    if open_obj.data.shape_keys is None:
        open_obj.shape_key_add(name="Basis")
    sk = open_obj.shape_key_add(name="closed")
    for i, co in enumerate(mapped):
        sk.data[i].co = inv @ (R @ co + t)
    print(
        f"shape key {open_obj.name}: {len(mapped)} verts, "
        f"body anchors {len(body_src)}"
    )


def shade_smooth_obj(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()


def build_pack():
    """Open backpack as basis, closed pose as a morph target. Zoom drives the morph."""
    reset_scene()

    closed_path, tmp_c = prep_obj(
        PACK_CLOSED_SRC,
        "Travel pack.obj",
        "Travel pack.mtl",
        "Travel_Backpack_Standing_01_002.mtl",
    )
    import_obj(closed_path)
    closed_meshes = {len(obj.data.vertices): obj for obj in meshes()}
    for obj in closed_meshes.values():
        obj.name = "closed-" + obj.name

    open_path, tmp_o = prep_obj(
        PACK_OPEN_SRC,
        "Travel_Backpack_Standing_02_002.obj",
        "Travel_Backpack_Standing_02_002.mtl",
        "Travel_Backpack_Standing_02_002.mtl",
    )
    import_obj(open_path)
    open_meshes = [
        obj for obj in meshes() if not obj.name.startswith("closed-")
    ]

    for obj in open_meshes:
        origin_to_geometry(obj)
        partner = closed_meshes.get(len(obj.data.vertices))
        if not partner:
            print("no closed partner for", obj.name, len(obj.data.vertices))
            continue
        add_closed_shape_key(obj, partner)

    for obj in list(closed_meshes.values()):
        bpy.data.objects.remove(obj, do_unlink=True)

    composite = load_image(
        os.path.join(PACK_OPEN_SRC, "Map__59_Composite.png"),
        size=PACK_TEX_SIZE,
    )
    bag_normal = load_image(
        os.path.join(PACK_EXTRAS, "Travel_bag_Normal.png"),
        size=PACK_TEX_SIZE,
        non_color=True,
    )

    shell_mat = make_pbr(
        "pack_shell",
        (0.42, 0.28, 0.16),
        albedo=composite,
        normal=bag_normal,
        roughness=0.46,
        metalness=0.03,
    )
    hardware_mat = make_pbr(
        "pack_hardware",
        (0.18, 0.16, 0.14),
        albedo=composite,
        roughness=0.34,
        metalness=0.28,
    )
    lining_mat = make_pbr(
        "pack_lining",
        (0.16, 0.22, 0.20),
        albedo=composite,
        roughness=0.62,
        metalness=0.0,
    )

    pack_meshes = [obj for obj in meshes()]
    for obj in pack_meshes:
        n = len(obj.data.vertices)
        if n == 41967:
            assign_mat(obj, hardware_mat)
            obj.name = "pack-hardware"
        elif n == 8045:
            assign_mat(obj, lining_mat)
            obj.name = "pack-lining"
        else:
            assign_mat(obj, shell_mat)
            obj.name = "pack-shell"
        shade_smooth_obj(obj)

    root = bpy.data.objects.new("travel-pack-root", None)
    bpy.context.scene.collection.objects.link(root)
    for obj in pack_meshes:
        parent_keep(obj, root)

    root.scale = (CM_TO_M, CM_TO_M, CM_TO_M)
    bpy.context.view_layer.update()
    lo, hi = combined_minmax([root] + list(root.children_recursive))
    root.location.z -= lo.z
    bpy.context.view_layer.update()

    export_glb(os.path.join(PACK_OUT_DIR, "travel-pack.glb"), [root])
    shutil.rmtree(tmp_c, ignore_errors=True)
    shutil.rmtree(tmp_o, ignore_errors=True)
    print("pack meshes", [o.name for o in pack_meshes])


def cli_targets():
    import sys
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return ["pack", "rex"]


def nearest_vert_world(obj, target):
    mat = obj.matrix_world
    best = None
    best_d = 1e18
    for v in obj.data.vertices:
        w = mat @ v.co
        d = (w - target).length_squared
        if d < best_d:
            best_d = d
            best = w
    return best if best is not None else obj.matrix_world.translation.copy()


def orient_rex(parts):
    """Rotate unparented bones so toes sit down (+Z up) and the head faces +Y."""
    toes = [o for o in parts if "toe" in o.name.lower()]
    head = next((o for o in parts if o.name == "Barebone_dino_head_pivot"), None)
    pelvis = next((o for o in parts if o.name == "Barebone_pelvis_pivot"), None)
    if not (toes and head and pelvis):
        return
    toe_c = Vector((0, 0, 0))
    for t in toes:
        toe_c += world_centroid(t)
    toe_c /= len(toes)
    pelvis_c = world_centroid(pelvis)
    head_c = world_centroid(head)
    up = pelvis_c - toe_c
    if up.length < 1e-4:
        up = Vector((0, 0, 1))
    up.normalize()
    fwd = head_c - pelvis_c
    fwd = fwd - up * fwd.dot(up)
    if fwd.length < 1e-4:
        fwd = Vector((0, 1, 0))
    fwd.normalize()
    x_axis = fwd.cross(up)
    if x_axis.length < 1e-4:
        x_axis = Vector((1, 0, 0))
    x_axis.normalize()
    y_axis = up.cross(x_axis)
    y_axis.normalize()
    basis = Matrix((
        (x_axis.x, y_axis.x, up.x, 0),
        (x_axis.y, y_axis.y, up.y, 0),
        (x_axis.z, y_axis.z, up.z, 0),
        (0, 0, 0, 1),
    ))
    rot = basis.inverted()
    for obj in parts:
        obj.matrix_world = rot @ obj.matrix_world
    bpy.context.view_layer.update()


def build_rex():
    reset_scene()
    obj_path, tmp = prep_obj(
        REX_SRC,
        "t-rex.obj",
        "t-rex.mtl",
        "Dinosaur_T-rex_Bones_2.mtl",
    )
    import_obj(obj_path)

    diff = load_image(os.path.join(REX_SRC, "Barebone_map_diff.png"))
    bump_body = load_image(os.path.join(REX_SRC, "Barebone_map_bump_body.png"), non_color=True)
    bump_head = load_image(os.path.join(REX_SRC, "Barebone_map_bump_head.png"), non_color=True)

    body_mat = make_pbr(
        "rex_body",
        (0.72, 0.64, 0.52),
        albedo=diff,
        normal=bump_body,
        roughness=0.42,
        metalness=0.08,
    )
    head_mat = make_pbr(
        "rex_head",
        (0.74, 0.66, 0.54),
        albedo=diff,
        normal=bump_head,
        roughness=0.38,
        metalness=0.08,
    )

    parts = meshes()
    for obj in parts:
        mats = [s.material.name if s.material else "" for s in obj.material_slots]
        if any("head" in (m or "").lower() for m in mats) or "head" in obj.name.lower() or "tooth" in obj.name.lower():
            assign_mat(obj, head_mat)
        else:
            assign_mat(obj, body_mat)

    orient_rex(parts)

    pelvis = next((o for o in parts if o.name == "Barebone_pelvis_pivot"), None)
    attract = world_centroid(pelvis) if pelvis else Vector((0, 0, 0))
    for obj in parts:
        joint = nearest_vert_world(obj, attract)
        origin_to_world(obj, joint)

    root = bpy.data.objects.new("rex-root", None)
    bpy.context.scene.collection.objects.link(root)
    for obj in parts:
        parent_keep(obj, root)

    root.scale = (CM_TO_M, CM_TO_M, CM_TO_M)
    bpy.context.view_layer.update()
    lo, hi = combined_minmax([root] + list(root.children_recursive))
    root.location.z -= lo.z
    bpy.context.view_layer.update()

    export_glb(os.path.join(REX_OUT_DIR, "t-rex.glb"), [root])
    shutil.rmtree(tmp, ignore_errors=True)
    print("rex bones", sorted(o.name for o in parts))


def main():
    targets = cli_targets()
    try:
        if "pack" in targets:
            build_pack()
        if "rex" in targets:
            build_rex()
    except Exception:
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
