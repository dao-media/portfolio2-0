"""
Export apple-tree runtime GLB from masters/apple-tree OBJ.

Reads masters only (OBJ + textures); writes a temp MTL with map_Kd wired.
Writes public/assets/models/apple-tree/runtime/apple-tree.glb.
Never overwrites masters.

Source OBJ is Blender Y-up, units ≈ meters (~8 m native height).

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/export-apple-tree-runtime.py
"""
from __future__ import annotations

import os
import shutil
import tempfile

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_DIR = os.path.join(ROOT, "masters/apple-tree")
OUT_DIR = os.path.join(ROOT, "public/assets/models/apple-tree/runtime")
OBJ_NAME = "apple_tree.obj"
MTL_NAME = "apple_tree.mtl"

# Working MTL with texture paths (masters MTL has no map_Kd).
WORKING_MTL = """# export-apple-tree-runtime — temp MTL; masters untouched.
newmtl apple
Ns 225.000000
Ka 1.000000 1.000000 1.000000
Kd 1.000000 1.000000 1.000000
Ks 0.500000 0.500000 0.500000
Ke 0.0 0.0 0.0
Ni 1.000000
d 1.000000
illum 2
map_Kd apple_texture_2.jpg

newmtl bark
Ns 225.000000
Ka 1.000000 1.000000 1.000000
Kd 1.000000 1.000000 1.000000
Ks 0.000000 0.000000 0.000000
Ke 0.0 0.0 0.0
Ni 1.000000
d 1.000000
illum 1
map_Kd apple_tree_bark.jpg

newmtl leaf
Ns 225.000000
Ka 1.000000 1.000000 1.000000
Kd 1.000000 1.000000 1.000000
Ks 0.085271 0.085271 0.085271
Ke 0.0 0.0 0.0
Ni 1.000000
d 1.000000
illum 2
map_Kd leaf.jpg
"""


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def prep_obj():
    tmp = tempfile.mkdtemp(prefix="apple-tree-export-")
    shutil.copy2(os.path.join(SRC_DIR, OBJ_NAME), os.path.join(tmp, OBJ_NAME))
    with open(os.path.join(tmp, MTL_NAME), "w", encoding="utf-8") as f:
        f.write(WORKING_MTL)
    for name in os.listdir(SRC_DIR):
        if name.lower().endswith((".png", ".jpg", ".jpeg")):
            shutil.copy2(os.path.join(SRC_DIR, name), os.path.join(tmp, name))
    return os.path.join(tmp, OBJ_NAME), tmp


def import_obj(path):
    # Blender-authored OBJ: Y-up height (verts ~0..8 on Y).
    bpy.ops.wm.obj_import(
        filepath=path,
        forward_axis="NEGATIVE_Z",
        up_axis="Y",
        use_split_objects=True,
        use_split_groups=True,
    )


def meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def scene_bounds():
    mins = []
    maxs = []
    for obj in meshes():
        mat = obj.matrix_world
        coords = [mat @ v.co for v in obj.data.vertices] if obj.data else [mat.translation]
        if not coords:
            continue
        xs = [c.x for c in coords]
        ys = [c.y for c in coords]
        zs = [c.z for c in coords]
        mins.append(Vector((min(xs), min(ys), min(zs))))
        maxs.append(Vector((max(xs), max(ys), max(zs))))
    if not mins:
        zero = Vector((0, 0, 0))
        return zero, zero
    return Vector(
        (min(v.x for v in mins), min(v.y for v in mins), min(v.z for v in mins))
    ), Vector(
        (max(v.x for v in maxs), max(v.y for v in maxs), max(v.z for v in maxs))
    )


def apply_all():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes():
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    if meshes():
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def strip_bump_keep_maps():
    """OBJ bump often imports as height → bad glTF normals; leave color maps."""
    for mat in bpy.data.materials:
        if not mat or not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        principled = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not principled:
            continue
        normal_in = principled.inputs.get("Normal")
        if normal_in and normal_in.is_linked:
            for link in list(normal_in.links):
                links.remove(link)
            print(f"[apple-tree-export] stripped Normal input on {mat.name}")
        for key in ("Transmission Weight", "Transmission"):
            sock = principled.inputs.get(key)
            if sock is not None and hasattr(sock, "default_value"):
                sock.default_value = 0.0


def shade_smooth_bark():
    """Smooth bark/trunk/branch/apple. Leave leaf cards flat."""
    for obj in meshes():
        name = (obj.name or "").lower()
        mat_names = " ".join(s.name.lower() for s in (obj.data.materials or []) if s)
        tag = f"{name} {mat_names}"
        if "leaf" in tag:
            for poly in obj.data.polygons:
                poly.use_smooth = False
            print(f"[apple-tree-export] flat leaf {obj.name}")
            continue
        for poly in obj.data.polygons:
            poly.use_smooth = True
        if hasattr(obj.data, "has_custom_normals") and obj.data.has_custom_normals:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
            obj.select_set(False)
        print(f"[apple-tree-export] smooth {obj.name}")


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes():
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


def main():
    reset_scene()
    obj_path, tmp = prep_obj()
    try:
        import_obj(obj_path)
        # Already meters — no cm→m scale.
        bpy.context.view_layer.update()
        apply_all()

        mn, mx = scene_bounds()
        size = mx - mn
        print(
            f"[apple-tree-export] raw bounds: min={tuple(round(v, 4) for v in mn)} "
            f"max={tuple(round(v, 4) for v in mx)} size={tuple(round(v, 4) for v in size)}"
        )

        # wm.obj_import with up_axis=Y rotates into Blender Z-up — seat on Z.
        cx = (mn.x + mx.x) * 0.5
        cy = (mn.y + mx.y) * 0.5
        for obj in meshes():
            obj.location.x -= cx
            obj.location.y -= cy
            obj.location.z -= mn.z
        bpy.context.view_layer.update()
        apply_all()

        strip_bump_keep_maps()
        shade_smooth_bark()

        mn, mx = scene_bounds()
        size = mx - mn
        print(
            f"[apple-tree-export] seated (Blender Z-up): min={tuple(round(v, 4) for v in mn)} "
            f"max={tuple(round(v, 4) for v in mx)} size={tuple(round(v, 4) for v in size)}"
        )
        if size.z + 1e-3 < max(size.x, size.y) * 0.35:
            print(
                "[apple-tree-export] WARN: Z height looks collapsed — check up_axis. "
                f"size=({size.x:.3f},{size.y:.3f},{size.z:.3f})"
            )

        out = os.path.join(OUT_DIR, "apple-tree.glb")
        export_glb(out)
        print(f"[apple-tree-export] wrote {out} ({os.path.getsize(out)} bytes)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
