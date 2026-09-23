"""Measure CRT bezel opening in Blender and author a 1cm-inset rounded content plane.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/crt-bezel-blender-measure.py
"""
from __future__ import annotations

import json
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GLB = os.path.join(ROOT, "public/assets/models/pc-source/pc-from-source.glb")
OUT_DIR = os.path.join(ROOT, "tmp/crt-bezel")
OUT_GLB = os.path.join(ROOT, "public/assets/models/pc-source/crt-content-plane.glb")
INSET_M = 0.01  # 1 cm inward from measured bezel opening
CORNER_R = 0.012  # slight rounded corners


def die(msg: str) -> None:
    print("ERROR:", msg, file=sys.stderr)
    raise SystemExit(2)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)

    src = bpy.data.objects.get("pc")
    if not src or src.type != "MESH":
        die("expected single mesh 'pc' after glTF import")

    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts: dict[str, bpy.types.Object] = {}
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        mats = [s.material.name for s in obj.material_slots if s.material]
        if len(mats) == 1:
            parts[mats[0]] = obj
            print(f"part {obj.name} mat={mats[0]} verts={len(obj.data.vertices)}")

    bezel = parts.get("pc_2")
    screen = parts.get("pc_3")
    if not bezel or not screen:
        die(f"missing pc_2/pc_3 parts; have {list(parts)}")

    # --- basis from screen (phosphor) ---
    mw_s = screen.matrix_world
    s_world = [mw_s @ v.co for v in screen.data.vertices]
    center = sum(s_world, Vector((0, 0, 0))) / max(len(s_world), 1)

    n = Vector((0, 0, 0))
    m3 = mw_s.to_3x3()
    for poly in screen.data.polygons:
        n += (m3 @ poly.normal) * max(poly.area, 1e-12)
    if n.length < 1e-8:
        die("screen normal failed")
    n.normalize()
    if n.z < 0:
        n.negate()

    up_hint = Vector((0.0, 1.0, 0.0))
    right = up_hint.cross(n)
    if right.length < 1e-6:
        right = Vector((1.0, 0.0, 0.0)).cross(n)
    right.normalize()
    up = n.cross(right)
    up.normalize()

    def project(p: Vector) -> tuple[float, float, float]:
        d = p - center
        return float(d.dot(right)), float(d.dot(up)), float(d.dot(n))

    s_uv = [project(p) for p in s_world]
    s_u = [p[0] for p in s_uv]
    s_v = [p[1] for p in s_uv]
    s_d = [p[2] for p in s_uv]
    s_u_min, s_u_max = min(s_u), max(s_u)
    s_v_min, s_v_max = min(s_v), max(s_v)
    s_d_min, s_d_max = min(s_d), max(s_d)

    # --- raycast from phosphor rim to INNER bezel lip ---
    deps = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(bezel, deps)
    inv_b = bezel.matrix_world.inverted()

    def ray_hit(origin: Vector, direction: Vector, max_dist: float = 0.25):
        o = inv_b @ origin
        d = inv_b.to_3x3() @ direction
        if d.length < 1e-9:
            return None
        d.normalize()
        hit = bvh.ray_cast(o, d, max_dist)
        if hit[0] is None:
            return None
        return bezel.matrix_world @ hit[0]

    eps = 0.001
    ray_hits: dict[str, dict | None] = {}
    for name, u0, v0, direction in (
        ("right", s_u_max + eps, 0.0, right),
        ("left", s_u_min - eps, 0.0, -right),
        ("top", 0.0, s_v_max + eps, up),
        ("bot", 0.0, s_v_min - eps, -up),
    ):
        found = None
        for dd in (0.002, 0.015, 0.04, 0.07, 0.0, -0.01):
            origin = center + n * (s_d_max + dd) + right * u0 + up * v0
            h = ray_hit(origin, direction, 0.3)
            if h is None:
                continue
            uu, vv, dd2 = project(h)
            found = {
                "u": uu,
                "v": vv,
                "d": dd2,
                "dist": float((h - origin).length),
                "world": [h.x, h.y, h.z],
            }
            break
        ray_hits[name] = found

    # Near-lip vertex search (≤4 cm outside phosphor) — rejects outer chassis
    b_world = [bezel.matrix_world @ v.co for v in bezel.data.vertices]
    b_uv = [project(p) for p in b_world]
    front = [p for p in b_uv if p[2] > s_d_max - 0.04]
    near = 0.045

    def pct(vals: list[float], q: float):
        if not vals:
            return None
        s = sorted(vals)
        return s[min(len(s) - 1, max(0, int(q * (len(s) - 1))))]

    right_n = [
        p
        for p in front
        if s_u_max < p[0] < s_u_max + near and s_v_min - 0.05 < p[1] < s_v_max + 0.05
    ]
    left_n = [
        p
        for p in front
        if s_u_min - near < p[0] < s_u_min and s_v_min - 0.05 < p[1] < s_v_max + 0.05
    ]
    top_n = [
        p
        for p in front
        if s_v_max < p[1] < s_v_max + near and s_u_min - 0.05 < p[0] < s_u_max + 0.05
    ]
    bot_n = [
        p
        for p in front
        if s_v_min - near < p[1] < s_v_min and s_u_min - 0.05 < p[0] < s_u_max + 0.05
    ]

    lip_near = {
        "rightU": pct([p[0] for p in right_n], 0.12),
        "leftU": pct([p[0] for p in left_n], 0.88),
        "topV": pct([p[1] for p in top_n], 0.12),
        "botV": pct([p[1] for p in bot_n], 0.88),
        "counts": {
            "r": len(right_n),
            "l": len(left_n),
            "t": len(top_n),
            "b": len(bot_n),
        },
    }

    # Prefer ray hits when available; fall back to near lips; finally phosphor+pad
    def side(val_ray, val_lip, fallback, outward_sign):
        if val_ray is not None:
            return val_ray
        if val_lip is not None:
            return val_lip
        return fallback + outward_sign * 0.015

    u_max = side(
        ray_hits["right"]["u"] if ray_hits["right"] else None,
        lip_near["rightU"],
        s_u_max,
        +1,
    )
    u_min = side(
        ray_hits["left"]["u"] if ray_hits["left"] else None,
        lip_near["leftU"],
        s_u_min,
        -1,
    )
    v_max = side(
        ray_hits["top"]["v"] if ray_hits["top"] else None,
        lip_near["topV"],
        s_v_max,
        +1,
    )
    v_min = side(
        ray_hits["bot"]["v"] if ray_hits["bot"] else None,
        lip_near["botV"],
        s_v_min,
        -1,
    )

    opening_w = u_max - u_min
    opening_h = v_max - v_min

    # Content = opening inset 1 cm each side
    c_u_min = u_min + INSET_M
    c_u_max = u_max - INSET_M
    c_v_min = v_min + INSET_M
    c_v_max = v_max - INSET_M
    content_w = c_u_max - c_u_min
    content_h = c_v_max - c_v_min
    if content_w < 0.05 or content_h < 0.05:
        die(f"content too small after inset: {content_w}×{content_h}")

    center_u = 0.5 * (c_u_min + c_u_max)
    center_v = 0.5 * (c_v_min + c_v_max)
    # Sit just in front of phosphor rim plane, behind typical glass offset (~6 mm)
    content_d = 0.0015
    content_center = center + right * center_u + up * center_v + n * content_d

    # --- build rounded-rect plane in Blender ---
    # Create in XY then transform into screen basis
    corner_r = min(CORNER_R, content_w * 0.2, content_h * 0.2)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    plane = bpy.context.active_object
    plane.name = "GEO-crt-content-plane"
    # Scale to content size (plane is 2×2 by default size=2... size=1 → 1×1)
    plane.scale = (content_w, content_h, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Bevel corners via inset+bevel on boundary, or use bmesh rounded rect
    bm = bmesh.new()
    bm.from_mesh(plane.data)
    bmesh.ops.delete(bm, geom=bm.faces[:] + bm.edges[:] + bm.verts[:], context="VERTS")

    # Build rounded rect outline in local XY (centered)
    hw, hh = content_w * 0.5, content_h * 0.5
    r = corner_r
    segs = 6
    pts: list[Vector] = []

    def arc(cx, cy, a0, a1):
        for i in range(segs + 1):
            t = a0 + (a1 - a0) * (i / segs)
            pts.append(Vector((cx + r * __import__("math").cos(t), cy + r * __import__("math").sin(t), 0)))

    import math

    # CCW: bottom-left arc → bottom → BR → right → TR → top → TL → left
    arc(-hw + r, -hh + r, math.pi, math.pi * 1.5)
    arc(hw - r, -hh + r, math.pi * 1.5, math.pi * 2)
    arc(hw - r, hh - r, 0, math.pi * 0.5)
    arc(-hw + r, hh - r, math.pi * 0.5, math.pi)

    verts = [bm.verts.new(p) for p in pts]
    bm.faces.new(verts)
    bm.normal_update()
    bm.to_mesh(plane.data)
    bm.free()
    plane.data.update()

    # UV 0–1 over the rect
    uv = plane.data.uv_layers.new(name="UVMap") if not plane.data.uv_layers else plane.data.uv_layers[0]
    for poly in plane.data.polygons:
        for li in poly.loop_indices:
            vi = plane.data.loops[li].vertex_index
            co = plane.data.vertices[vi].co
            u = (co.x + hw) / max(content_w, 1e-8)
            v = (co.y + hh) / max(content_h, 1e-8)
            uv.data[li].uv = (u, v)

    # Orient: local +Z → screen normal, +X → right, +Y → up
    # Build rotation matrix from basis
    from mathutils import Matrix

    rot = Matrix((right, up, n)).transposed().to_4x4()
    # Columns of transposed row-basis = basis vectors as columns... 
    # Matrix((right, up, n)) as rows means row0=right. We want columns = right, up, n.
    rot = Matrix(
        (
            (right.x, up.x, n.x, 0),
            (right.y, up.y, n.y, 0),
            (right.z, up.z, n.z, 0),
            (0, 0, 0, 1),
        )
    )
    plane.matrix_world = Matrix.Translation(content_center) @ rot

    # Black emissive-ish material for preview
    mat = bpy.data.materials.new("MAT-crt-content")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
        bsdf.inputs["Emission Color"].default_value = (0.15, 0.15, 0.18, 1)
        bsdf.inputs["Emission Strength"].default_value = 1.0
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Metallic"].default_value = 0.0
    plane.data.materials.append(mat)

    # Hide other parts for a clean export of just the content plane companion
    for obj in list(bpy.data.objects):
        if obj != plane and obj.type == "MESH":
            obj.hide_render = True
            obj.hide_viewport = True

    # Export companion GLB (content plane only)
    bpy.ops.object.select_all(action="DESELECT")
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
    )

    # Also save a .blend working copy (not masters)
    blend_path = os.path.join(OUT_DIR, "crt-bezel-content.blend")
    # Unhide for blend save
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.hide_viewport = False
            obj.hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    aspect = content_w / max(content_h, 1e-8)
    canvas_w = 1024
    canvas_h = max(1, round(canvas_w / aspect))

    # Screen-local numbers (center at phosphor centroid, basis right/up/normal)
    measure = {
        "method": "blender-raycast+near-lip; content = opening inset 1cm; rounded corners",
        "inset_m": INSET_M,
        "corner_radius_m": corner_r,
        "opening_m": {
            "uMin": u_min,
            "uMax": u_max,
            "vMin": v_min,
            "vMax": v_max,
            "width": opening_w,
            "height": opening_h,
            "aspect": opening_w / max(opening_h, 1e-8),
        },
        "content_m": {
            "uMin": c_u_min,
            "uMax": c_u_max,
            "vMin": c_v_min,
            "vMax": c_v_max,
            "width": content_w,
            "height": content_h,
            "aspect": aspect,
            "centerU": center_u,
            "centerV": center_v,
            "depth": content_d,
            "canvasWidth": canvas_w,
            "canvasHeight": canvas_h,
        },
        "screen_aabb_m": {
            "uMin": s_u_min,
            "uMax": s_u_max,
            "vMin": s_v_min,
            "vMax": s_v_max,
            "width": s_u_max - s_u_min,
            "height": s_v_max - s_v_min,
            "dMin": s_d_min,
            "dMax": s_d_max,
        },
        "inset_vs_screen": {
            "left": s_u_min - u_min,
            "right": u_max - s_u_max,
            "bot": s_v_min - v_min,
            "top": v_max - s_v_max,
        },
        "basis_world": {
            "center": [center.x, center.y, center.z],
            "normal": [n.x, n.y, n.z],
            "right": [right.x, right.y, right.z],
            "up": [up.x, up.y, up.z],
        },
        "content_center_world": [content_center.x, content_center.y, content_center.z],
        "ray_hits": ray_hits,
        "lip_near": lip_near,
        "outputs": {"glb": OUT_GLB, "blend": blend_path},
    }

    json_path = os.path.join(OUT_DIR, "bezel-opening.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(measure, f, indent=2)

    # Runtime constants snippet for Three
    constants_path = os.path.join(OUT_DIR, "crtBezelOpening.generated.js")
    with open(constants_path, "w", encoding="utf-8") as f:
        f.write(
            "/** Auto-generated by scripts/crt-bezel-blender-measure.py — do not hand-edit. */\n"
            f"export const CRT_BEZEL_OPENING = {json.dumps(measure['opening_m'], indent=2)};\n"
            f"export const CRT_CONTENT_PLANE = {json.dumps(measure['content_m'], indent=2)};\n"
            f"export const CRT_CONTENT_INSET_M = {INSET_M};\n"
            f"export const CRT_CONTENT_CORNER_R_M = {corner_r};\n"
            f'export const CRT_CONTENT_PLANE_URL = "/assets/models/pc-source/crt-content-plane.glb";\n'
        )

    print(json.dumps(measure, indent=2))
    print("WROTE", json_path)
    print("WROTE", OUT_GLB, "bytes", os.path.getsize(OUT_GLB) if os.path.exists(OUT_GLB) else 0)
    print("WROTE", blend_path)


if __name__ == "__main__":
    main()
