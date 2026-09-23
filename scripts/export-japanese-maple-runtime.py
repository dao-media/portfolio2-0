"""
Export japanese-maple runtime GLB from masters/japanese-maple OBJ.

Reads masters only; writes public/assets/models/japanese-maple/runtime/japanese-maple.glb.
Never overwrites masters.

Guruware/3ds Max OBJ is Z-up (pot footprint in XY, height in Z). Import with
up_axis=Z so the trunk stands in Blender; glTF export converts to Y-up for Three.

Bump maps in the MTL are height atlases — do not let them become glTF normals
(that reads as crawling black checkers under MeshStandard). Export materials
without bump→normal; BustVignette also strips any leftover normalMap.

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/export-japanese-maple-runtime.py
"""
from __future__ import annotations

import os
import shutil
import tempfile

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_DIR = os.path.join(ROOT, "masters/japanese-maple")
OUT_DIR = os.path.join(ROOT, "public/assets/models/japanese-maple/runtime")
OBJ_NAME = "VP Japanese Maple v1.obj"
MTL_NAME = "VP Japanese Maple v1.mtl"
CM_TO_M = 0.01


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def prep_obj():
    tmp = tempfile.mkdtemp(prefix="maple-export-")
    shutil.copy2(os.path.join(SRC_DIR, OBJ_NAME), os.path.join(tmp, OBJ_NAME))
    shutil.copy2(os.path.join(SRC_DIR, MTL_NAME), os.path.join(tmp, MTL_NAME))
    for name in os.listdir(SRC_DIR):
        if name.lower().endswith((".png", ".jpg", ".jpeg")):
            shutil.copy2(os.path.join(SRC_DIR, name), os.path.join(tmp, name))
    return os.path.join(tmp, OBJ_NAME), tmp


def import_obj(path):
    # Master OBJ is Z-up (3ds Max). Wrong up_axis=Y lays the tree on its side.
    bpy.ops.wm.obj_import(
        filepath=path,
        forward_axis="Y",
        up_axis="Z",
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


def strip_bump_and_transmission():
    """MTL map_bump height maps must not ship as glTF normals; kill transmission."""
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
            print(f"[maple-export] stripped Normal input on material {mat.name}")
        # Blender→glTF was shipping Transmission=1 (glass leaves/pot under neon).
        for key in ("Transmission Weight", "Transmission"):
            sock = principled.inputs.get(key)
            if sock is not None and hasattr(sock, "default_value"):
                sock.default_value = 0.0
        print(f"[maple-export] transmission=0 on material {mat.name}")


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

        # cm → m (scale only — do not bake the authored world offset via location*=)
        for obj in meshes():
            obj.scale *= CM_TO_M
        bpy.context.view_layer.update()
        apply_all()

        # Blender Z-up: center X/Y, seat bottom on Z=0. glTF export → Y-up.
        mn, mx = scene_bounds()
        cx = (mn.x + mx.x) * 0.5
        cy = (mn.y + mx.y) * 0.5
        for obj in meshes():
            obj.location.x -= cx
            obj.location.y -= cy
            obj.location.z -= mn.z
        bpy.context.view_layer.update()
        apply_all()

        strip_bump_and_transmission()

        mn, mx = scene_bounds()
        size = mx - mn
        print(
            f"[maple-export] seated m (Blender Z-up): min={tuple(round(v, 4) for v in mn)} "
            f"max={tuple(round(v, 4) for v in mx)} size={tuple(round(v, 4) for v in size)}"
        )
        if (size.z + 1e-3 < Math.max(size.x, size.y) * 0.35) {
            print(
                "[maple-export] WARN: Z height looks collapsed — check up_axis. "
                f"size=({size.x:.3f},{size.y:.3f},{size.z:.3f})"
            )
        }

        out = os.path.join(OUT_DIR, "japanese-maple.glb")
        export_glb(out)
        print(f"[maple-export] wrote {out} ({os.path.getsize(out)} bytes)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
