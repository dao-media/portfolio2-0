"""
Export lawn-grass-stump runtime GLB for Bust stop only.

Reads masters/lawn-grass-stump (OBJ + textures + Extras mask).
Writes public/assets/models/lawn-grass-stump/runtime/lawn-grass-stump.glb.
Never overwrites masters.

Keeps Grass_ground + Object001 (meshed lawn + stump). Drops billboard
prototype cards. cm→m, seated, scaled, **cropped to a circle**, mild
decimate (fidelity over extreme cull). Ground gets a clean disc mesh.

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/export-lawn-grass-stump-runtime.py
"""
from __future__ import annotations

import math
import os
import shutil
import tempfile

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_DIR = os.path.join(ROOT, "masters/lawn-grass-stump/[OBJ] Grass_meshed_obj")
EXTRAS = os.path.join(ROOT, "masters/lawn-grass-stump/Extras")
OUT_DIR = os.path.join(ROOT, "public/assets/models/lawn-grass-stump/runtime")
OBJ_NAME = "Grass_meshed_obj.obj"
MTL_NAME = "Grass_meshed_obj.mtl"
CM_TO_M = 0.01
# Cover bust (0,0) + neon (2.2,0.85) + apple (3.17,-3.25) with soft margin.
GRASS_PATCH_DIAMETER = 12.0
GRASS_PATCH_RADIUS = GRASS_PATCH_DIAMETER * 0.5
# After circular crop, keep most blade detail (was 0.16 → jagged cards).
DECIMATE_RATIO = 0.55
KEEP_NAMES = {"grass_ground", "object001"}


def irregular_radius(angle: float, base: float = GRASS_PATCH_RADIUS) -> float:
    """Mild organic lawn outline — subtle lobes, not a jagged blob."""
    a = angle
    wobble = (
        0.055 * math.sin(3.0 * a + 0.40)
        + 0.04 * math.sin(5.0 * a - 1.10)
        + 0.025 * math.sin(7.0 * a + 2.30)
        + 0.02 * math.sin(2.0 * a + 0.85)
    )
    # ~0.93–1.06 × base — gently irregular.
    return base * max(0.93, min(1.06, 1.0 + wobble))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def patch_mtl(src_mtl: str, dst_mtl: str) -> None:
    """Add ground alpha mask; leave masters MTL untouched."""
    with open(src_mtl, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    if "Ground_grass_mask.jpg" not in text:
        text = text.replace(
            "bump Ground_grass_bump.jpg\n",
            "bump Ground_grass_bump.jpg\n\tmap_d Ground_grass_mask.jpg\n",
            1,
        )
    with open(dst_mtl, "w", encoding="utf-8") as f:
        f.write(text)


def prep_obj():
    tmp = tempfile.mkdtemp(prefix="lawn-grass-export-")
    shutil.copy2(os.path.join(SRC_DIR, OBJ_NAME), os.path.join(tmp, OBJ_NAME))
    patch_mtl(os.path.join(SRC_DIR, MTL_NAME), os.path.join(tmp, MTL_NAME))
    for name in os.listdir(SRC_DIR):
        if name.lower().endswith((".png", ".jpg", ".jpeg")):
            shutil.copy2(os.path.join(SRC_DIR, name), os.path.join(tmp, name))
    mask = os.path.join(EXTRAS, "Ground_grass_mask.jpg")
    if os.path.isfile(mask):
        shutil.copy2(mask, os.path.join(tmp, "Ground_grass_mask.jpg"))
    return os.path.join(tmp, OBJ_NAME), tmp


def import_obj(path):
    # 3ds Max OBJ — Y-up height.
    bpy.ops.wm.obj_import(
        filepath=path,
        forward_axis="Z",
        up_axis="Y",
        use_split_objects=True,
        use_split_groups=True,
    )


def meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def drop_prototypes():
    for obj in list(meshes()):
        key = (obj.name or "").split(".")[0].lower()
        if key not in KEEP_NAMES:
            print(f"[lawn-grass-export] drop prototype {obj.name}")
            bpy.data.objects.remove(obj, do_unlink=True)


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


def pack_rgba_from_masks():
    """
    Bake map_d masks into base-color A and force CLIP.
    Prevents texture pipelines from dropping opacity (→ opaque square cards).
    """
    for mat in bpy.data.materials:
        if not mat or not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        principled = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not principled:
            continue

        color_tex = None
        alpha_tex = None
        base_in = principled.inputs.get("Base Color")
        alpha_in = principled.inputs.get("Alpha")
        if base_in and base_in.is_linked:
            src = base_in.links[0].from_node
            if src.type == "TEX_IMAGE":
                color_tex = src
        if alpha_in and alpha_in.is_linked:
            src = alpha_in.links[0].from_node
            if src.type == "TEX_IMAGE":
                alpha_tex = src
        if alpha_tex is None:
            for n in nodes:
                if n.type != "TEX_IMAGE" or not n.image:
                    continue
                name = (n.image.name or n.image.filepath or "").lower()
                if "mask" in name:
                    alpha_tex = n
                    break

        if not color_tex or not color_tex.image:
            continue

        color_img = color_tex.image
        w, h = color_img.size
        if w < 1 or h < 1:
            continue

        # Flatten color to w×h RGBA float buffer.
        color_work = color_img.copy()
        color_work.scale(w, h)
        color_buf = list(color_work.pixels)

        if alpha_tex and alpha_tex.image:
            mask_work = alpha_tex.image.copy()
            mask_work.scale(w, h)
            mask_buf = list(mask_work.pixels)
            for i in range(0, len(color_buf), 4):
                # Grayscale mask → alpha
                color_buf[i + 3] = max(mask_buf[i], mask_buf[i + 1], mask_buf[i + 2])

        packed_img = bpy.data.images.new(
            name=f"{mat.name}_rgba",
            width=w,
            height=h,
            alpha=True,
            float_buffer=False,
        )
        packed_img.pixels = color_buf
        packed_img.file_format = "PNG"

        for link in list(base_in.links):
            links.remove(link)
        if alpha_in:
            for link in list(alpha_in.links):
                links.remove(link)

        tex = nodes.new("ShaderNodeTexImage")
        tex.image = packed_img
        tex.location = (-400, 200)
        links.new(tex.outputs["Color"], base_in)
        if alpha_in:
            links.new(tex.outputs["Alpha"], alpha_in)

        mat.blend_method = "CLIP"
        if hasattr(mat, "alpha_threshold"):
            mat.alpha_threshold = 0.35
        print(f"[lawn-grass-export] packed RGBA+CLIP for {mat.name} ({w}x{h})")


def strip_height_bump():
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
            print(f"[lawn-grass-export] stripped Normal on {mat.name}")


def ensure_ground_alpha():
    """Force ground material to use soft mask if import missed map_d."""
    mask_path = None
    for img in bpy.data.images:
        if img.filepath and "Ground_grass_mask" in (img.filepath or img.name):
            mask_path = img
            break
        if "Ground_grass_mask" in (img.name or ""):
            mask_path = img
            break
    for mat in bpy.data.materials:
        if not mat or "ground" not in (mat.name or "").lower():
            continue
        if not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        principled = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not principled:
            continue
        alpha_in = principled.inputs.get("Alpha")
        if alpha_in and alpha_in.is_linked:
            mat.blend_method = "HASHED"
            print(f"[lawn-grass-export] ground alpha already linked on {mat.name}")
            continue
        if mask_path is None:
            continue
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = mask_path
        tex.image.colorspace_settings.name = "Non-Color"
        links.new(tex.outputs["Color"], alpha_in)
        mat.blend_method = "HASHED"
        print(f"[lawn-grass-export] wired ground alpha mask on {mat.name}")


def crop_meshes_to_irregular(base_radius: float):
    """Delete verts outside an organic (multi-harmonic) lawn outline."""
    for obj in list(meshes()):
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        doomed = []
        for v in bm.verts:
            x, y = v.co.x, v.co.y
            dist = math.hypot(x, y)
            if dist < 1e-8:
                continue
            limit = irregular_radius(math.atan2(y, x), base_radius)
            if dist > limit:
                doomed.append(v)
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="VERTS")
        bmesh.ops.delete(
            bm,
            geom=[e for e in bm.edges if not e.link_faces],
            context="EDGES",
        )
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        print(
            f"[lawn-grass-export] irregular-crop {obj.name} → "
            f"{len(mesh.vertices)} verts / {len(mesh.polygons)} faces"
        )


def replace_ground_with_irregular(base_radius: float, segments: int = 128):
    """Filled irregular lawn pad (organic silhouette, not a perfect disc)."""
    ground_mat = None
    for obj in list(meshes()):
        if "ground" not in (obj.name or "").lower():
            continue
        if obj.data.materials:
            ground_mat = obj.data.materials[0]
        bpy.data.objects.remove(obj, do_unlink=True)

    mesh = bpy.data.meshes.new("Grass_ground_pad")
    verts = [(0.0, 0.0, 0.002)]
    uvs = [(0.5, 0.5)]
    for i in range(segments):
        a = (i / segments) * math.tau
        r = irregular_radius(a, base_radius)
        x = math.cos(a) * r
        y = math.sin(a) * r
        verts.append((x, y, 0.002))
        # UV still maps from unit circle so albedo stays centered.
        uvs.append((0.5 + 0.5 * math.cos(a), 0.5 + 0.5 * math.sin(a)))
    faces = [(0, i + 1, ((i + 1) % segments) + 1) for i in range(segments)]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            uv_layer.data[li].uv = uvs[vi]

    disc = bpy.data.objects.new("Grass_ground", mesh)
    bpy.context.scene.collection.objects.link(disc)
    if ground_mat:
        mesh.materials.append(ground_mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    print(f"[lawn-grass-export] irregular ground segs={segments} base_r={base_radius}")


def decimate_object001():
    for obj in meshes():
        if "object001" not in (obj.name or "").lower():
            continue
        before = len(obj.data.polygons)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
        mod.ratio = DECIMATE_RATIO
        bpy.ops.object.modifier_apply(modifier=mod.name)
        # Smooth blade silhouette — jagged flat cards look low-poly.
        for poly in obj.data.polygons:
            poly.use_smooth = True
        if hasattr(obj.data, "use_auto_smooth"):
            obj.data.use_auto_smooth = True
        print(
            f"[lawn-grass-export] decimated {obj.name} {before} → "
            f"{len(obj.data.polygons)} faces (ratio {DECIMATE_RATIO})"
        )


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
        drop_prototypes()

        for obj in meshes():
            obj.scale *= CM_TO_M
        bpy.context.view_layer.update()
        apply_all()

        mn, mx = scene_bounds()
        print(
            f"[lawn-grass-export] raw m: min={tuple(round(v, 3) for v in mn)} "
            f"max={tuple(round(v, 3) for v in mx)}"
        )

        # After Y-up import, Blender is Z-up — seat on Z.
        cx = (mn.x + mx.x) * 0.5
        cy = (mn.y + mx.y) * 0.5
        for obj in meshes():
            obj.location.x -= cx
            obj.location.y -= cy
            obj.location.z -= mn.z
        bpy.context.view_layer.update()
        apply_all()

        mn, mx = scene_bounds()
        size = mx - mn
        # Scale X and Y independently so the footprint is a square that
        # fully contains the circle. Using max(span) alone left the short
        # axis ~9 m inside a r=6 disc → flat front/back chords.
        if size.x > 1e-6 and size.y > 1e-6:
            s_x = GRASS_PATCH_DIAMETER / size.x
            s_y = GRASS_PATCH_DIAMETER / size.y
            target_h = 1.75
            s_z = (target_h / size.z) if size.z > 1e-6 else min(s_x, s_y)
            for obj in meshes():
                obj.scale.x *= s_x
                obj.scale.y *= s_y
                obj.scale.z *= s_z
            bpy.context.view_layer.update()
            apply_all()
            mn, mx = scene_bounds()
            for obj in meshes():
                obj.location.z -= mn.z
            bpy.context.view_layer.update()
            apply_all()
            print(
                f"[lawn-grass-export] scaled X×{s_x:.4f} Y×{s_y:.4f} Z×{s_z:.4f} "
                f"→ square {GRASS_PATCH_DIAMETER} m, height ~{target_h} m"
            )

        # Organic patch — irregular crop + lobed ground pad.
        crop_meshes_to_irregular(GRASS_PATCH_RADIUS)
        replace_ground_with_irregular(GRASS_PATCH_RADIUS, segments=128)

        strip_height_bump()
        ensure_ground_alpha()
        pack_rgba_from_masks()
        decimate_object001()

        mn, mx = scene_bounds()
        size = mx - mn
        print(
            f"[lawn-grass-export] seated: min={tuple(round(v, 3) for v in mn)} "
            f"max={tuple(round(v, 3) for v in mx)} size={tuple(round(v, 3) for v in size)}"
        )

        out = os.path.join(OUT_DIR, "lawn-grass-stump.glb")
        export_glb(out)
        print(f"[lawn-grass-export] wrote {out} ({os.path.getsize(out)} bytes)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
