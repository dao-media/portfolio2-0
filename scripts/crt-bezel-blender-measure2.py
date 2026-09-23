"""Robust screen-local bezel opening measure + 1cm-inset rounded content plane."""
from __future__ import annotations

import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GLB = os.path.join(ROOT, "public/assets/models/pc-source/pc-from-source.glb")
OUT_DIR = os.path.join(ROOT, "tmp/crt-bezel")
OUT_GLB = os.path.join(ROOT, "public/assets/models/pc-source/crt-content-plane.glb")
OUT_JS = os.path.join(ROOT, "src/scene/vignettes/crtBezelOpening.js")
INSET_M = 0.01
CORNER_R = 0.012


def v3(x, y, z):
    return Vector((float(x), float(y), float(z)))


def dot(a: Vector, b: Vector) -> float:
    return float(a.x * b.x + a.y * b.y + a.z * b.z)


def cross(a: Vector, b: Vector) -> Vector:
    return v3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
    )


def pct(vals, q):
    if not vals:
        return None
    s = sorted(vals)
    return s[min(len(s) - 1, max(0, int(q * (len(s) - 1))))]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    src = bpy.data.objects.get("pc")
    if not src:
        raise SystemExit("no pc mesh")

    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = {}
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        mats = [s.material.name for s in o.material_slots if s.material]
        if len(mats) == 1:
            parts[mats[0]] = o
            print("part", mats[0], len(o.data.vertices))

    bezel, screen = parts["pc_2"], parts["pc_3"]
    inv = screen.matrix_world.inverted()

    s_local = [v.co.copy() for v in screen.data.vertices]
    n = v3(0, 0, 0)
    for poly in screen.data.polygons:
        nn = poly.normal
        n += v3(nn.x, nn.y, nn.z) * max(poly.area, 1e-12)
    n.normalize()
    if n.z < 0:
        n = -n

    right = cross(v3(0, 1, 0), n)
    if right.length < 1e-6:
        right = cross(v3(1, 0, 0), n)
    right.normalize()
    up = cross(n, right)
    up.normalize()

    center = v3(0, 0, 0)
    for p in s_local:
        center += p
    center /= len(s_local)

    def proj(p):
        d = p - center
        return dot(d, right), dot(d, up), dot(d, n)

    suv = [proj(p) for p in s_local]
    sUMin, sUMax = min(p[0] for p in suv), max(p[0] for p in suv)
    sVMin, sVMax = min(p[1] for p in suv), max(p[1] for p in suv)
    sDMin, sDMax = min(p[2] for p in suv), max(p[2] for p in suv)

    b_local = [inv @ (bezel.matrix_world @ v.co) for v in bezel.data.vertices]
    buv = [proj(p) for p in b_local]

    rings = {}
    chosen = None
    for depth_lo, depth_hi, label in (
        (sDMax - 0.01, sDMax + 0.08, "front0_8"),
        (sDMax - 0.02, sDMax + 0.05, "front0_5"),
        (sDMin - 0.03, sDMax + 0.03, "screen_band"),
        (-0.08, 0.18, "broad"),
    ):
        pool = [p for p in buv if depth_lo <= p[2] <= depth_hi]
        best = None
        for near in (0.008, 0.012, 0.016, 0.022, 0.03, 0.04, 0.055, 0.08, 0.12):
            R = [
                p[0]
                for p in pool
                if sUMax < p[0] <= sUMax + near
                and sVMin - near * 0.7 <= p[1] <= sVMax + near * 0.7
            ]
            L = [
                p[0]
                for p in pool
                if sUMin - near <= p[0] < sUMin
                and sVMin - near * 0.7 <= p[1] <= sVMax + near * 0.7
            ]
            T = [
                p[1]
                for p in pool
                if sVMax < p[1] <= sVMax + near
                and sUMin - near * 0.7 <= p[0] <= sUMax + near * 0.7
            ]
            B = [
                p[1]
                for p in pool
                if sVMin - near <= p[1] < sVMin
                and sUMin - near * 0.7 <= p[0] <= sUMax + near * 0.7
            ]
            if min(len(R), len(L), len(T), len(B)) < 4:
                continue
            ru, lu, tv, bv = pct(R, 0.08), pct(L, 0.92), pct(T, 0.08), pct(B, 0.92)
            if None in (ru, lu, tv, bv):
                continue
            w, h = ru - lu, tv - bv
            aspect = w / max(h, 1e-8)
            # CRT glass hole should be landscape ~1.2–1.45
            if not (1.15 <= aspect <= 1.5 and w > 0.2 and h > 0.14):
                continue
            cand = {
                "near": near,
                "width": w,
                "height": h,
                "aspect": aspect,
                "uMin": lu,
                "uMax": ru,
                "vMin": bv,
                "vMax": tv,
                "inset": {
                    "L": sUMin - lu,
                    "R": ru - sUMax,
                    "B": sVMin - bv,
                    "T": tv - sVMax,
                },
                "counts": {"R": len(R), "L": len(L), "T": len(T), "B": len(B)},
            }
            # Prefer smallest near that still looks like a hole (true inner lip)
            best = cand
            break
        rings[label] = {"pool": len(pool), "best": best}
        if best and chosen is None:
            chosen = {"band": label, **best}

    # Fallback: phosphor AABB expanded by 1.5 cm (visual recess) if no clean lip
    if chosen is None:
        pad = 0.015
        chosen = {
            "band": "fallback-phosphor+1.5cm",
            "near": pad,
            "width": (sUMax - sUMin) + 2 * pad,
            "height": (sVMax - sVMin) + 2 * pad,
            "aspect": ((sUMax - sUMin) + 2 * pad) / ((sVMax - sVMin) + 2 * pad),
            "uMin": sUMin - pad,
            "uMax": sUMax + pad,
            "vMin": sVMin - pad,
            "vMax": sVMax + pad,
            "inset": {"L": pad, "R": pad, "B": pad, "T": pad},
            "counts": {},
        }

    u_min, u_max = chosen["uMin"], chosen["uMax"]
    v_min, v_max = chosen["vMin"], chosen["vMax"]

    # 1 cm inset content
    c_u_min, c_u_max = u_min + INSET_M, u_max - INSET_M
    c_v_min, c_v_max = v_min + INSET_M, v_max - INSET_M
    content_w = c_u_max - c_u_min
    content_h = c_v_max - c_v_min
    if content_w < 0.08 or content_h < 0.06:
        raise SystemExit(f"content too small {content_w}x{content_h}")

    center_u = 0.5 * (c_u_min + c_u_max)
    center_v = 0.5 * (c_v_min + c_v_max)
    content_d = 0.0015
    content_center_local = center + right * center_u + up * center_v + n * content_d
    content_center_world = screen.matrix_world @ content_center_local

    # Basis in WORLD for Three parenting notes
    m3 = screen.matrix_world.to_3x3()
    right_w = (m3 @ right).normalized()
    up_w = (m3 @ up).normalized()
    n_w = (m3 @ n).normalized()

    # Build rounded rect in screen LOCAL, then set matrix_world from screen
    corner_r = min(CORNER_R, content_w * 0.18, content_h * 0.18)
    bm = bmesh.new()
    hw, hh = content_w * 0.5, content_h * 0.5
    r = corner_r
    segs = 8
    pts = []

    def arc(cx, cy, a0, a1):
        for i in range(segs + 1):
            t = a0 + (a1 - a0) * (i / segs)
            pts.append(v3(cx + r * math.cos(t), cy + r * math.sin(t), 0))

    arc(-hw + r, -hh + r, math.pi, math.pi * 1.5)
    arc(hw - r, -hh + r, math.pi * 1.5, math.pi * 2)
    arc(hw - r, hh - r, 0, math.pi * 0.5)
    arc(-hw + r, hh - r, math.pi * 0.5, math.pi)

    # Convert XY plane points into screen-local (right/up/n frame at content center)
    verts = []
    for p in pts:
        loc = content_center_local + right * p.x + up * p.y
        verts.append(bm.verts.new(loc))
    bm.faces.new(verts)
    bm.normal_update()

    mesh = bpy.data.meshes.new("GEO-crt-content-plane")
    bm.to_mesh(mesh)
    bm.free()
    plane = bpy.data.objects.new("GEO-crt-content-plane", mesh)
    bpy.context.collection.objects.link(plane)
    plane.matrix_world = screen.matrix_world.copy()

    # UVs
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            # recover local uv from position relative to content center in screen space
            co = mesh.vertices[vi].co
            d = co - content_center_local
            uu = (dot(d, right) + hw) / content_w
            vv = (dot(d, up) + hh) / content_h
            uv.data[li].uv = (uu, vv)

    mat = bpy.data.materials.new("MAT-crt-content")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.01, 0.01, 0.01, 1)
        bsdf.inputs["Emission Color"].default_value = (0.2, 0.2, 0.22, 1)
        bsdf.inputs["Emission Strength"].default_value = 2.0
        bsdf.inputs["Roughness"].default_value = 1.0
    mesh.materials.append(mat)

    # Parent visually under screen for the working blend
    plane.parent = screen

    # Export only the content plane (apply parent for export)
    bpy.ops.object.select_all(action="DESELECT")
    # Duplicate world-baked copy for export
    plane_export = plane.copy()
    plane_export.data = plane.data.copy()
    bpy.context.collection.objects.link(plane_export)
    plane_export.parent = None
    plane_export.matrix_world = screen.matrix_world @ Matrix.Identity(4)
    # bake verts to world then clear transform... simpler: export with parent selected via depsgraph
    # Just export plane with matrix_world already = screen.matrix_world and local verts in screen space
    plane_export.select_set(True)
    bpy.context.view_layer.objects.active = plane_export
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
    )

    blend_path = os.path.join(OUT_DIR, "crt-bezel-content.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    aspect = content_w / content_h
    canvas_w = 1024
    canvas_h = max(1, round(canvas_w / aspect))

    # Numbers for Three: SCREEN-LOCAL (same space as Three mesh geometry after load)
    measure = {
        "method": chosen.get("band"),
        "inset_m": INSET_M,
        "corner_radius_m": corner_r,
        "opening": {
            "uMin": u_min,
            "uMax": u_max,
            "vMin": v_min,
            "vMax": v_max,
            "width": u_max - u_min,
            "height": v_max - v_min,
            "aspect": (u_max - u_min) / (v_max - v_min),
        },
        "content": {
            "width": content_w,
            "height": content_h,
            "aspect": aspect,
            "centerU": center_u,
            "centerV": center_v,
            "depth": content_d,
            "cornerRadius": corner_r,
            "canvasWidth": canvas_w,
            "canvasHeight": canvas_h,
        },
        "screen": {
            "uMin": sUMin,
            "uMax": sUMax,
            "vMin": sVMin,
            "vMax": sVMax,
            "width": sUMax - sUMin,
            "height": sVMax - sVMin,
            "aspect": (sUMax - sUMin) / (sVMax - sVMin),
        },
        "chosen": chosen,
        "rings": rings,
        "basis_local": {
            "center": [center.x, center.y, center.z],
            "normal": [n.x, n.y, n.z],
            "right": [right.x, right.y, right.z],
            "up": [up.x, up.y, up.z],
        },
    }

    with open(os.path.join(OUT_DIR, "bezel-opening.json"), "w") as f:
        json.dump(measure, f, indent=2)

    # Runtime module — SCREEN LOCAL offsets used by DesktopVignette
    with open(OUT_JS, "w") as f:
        f.write(
            "/**\n"
            " * CRT bezel opening + content plane — measured in Blender from pc-from-source.glb\n"
            " * (`scripts/crt-bezel-blender-measure2.py`). Screen-local UV plane basis.\n"
            " * Content is the bezel opening inset 1 cm with slight rounded corners.\n"
            " */\n"
            f"export const CRT_CONTENT_INSET_M = {INSET_M};\n"
            f"export const CRT_CONTENT_CORNER_R_M = {corner_r};\n"
            "export const CRT_CONTENT_PLANE = Object.freeze({\n"
            f"  width: {content_w},\n"
            f"  height: {content_h},\n"
            f"  aspect: {aspect},\n"
            f"  centerU: {center_u},\n"
            f"  centerV: {center_v},\n"
            f"  depth: {content_d},\n"
            f"  cornerRadius: {corner_r},\n"
            f"  canvasWidth: {canvas_w},\n"
            f"  canvasHeight: {canvas_h},\n"
            "});\n"
            f'export const CRT_CONTENT_PLANE_URL = "/assets/models/pc-source/crt-content-plane.glb";\n'
        )

    print(json.dumps(measure, indent=2))
    print("WROTE", OUT_GLB, os.path.getsize(OUT_GLB))
    print("WROTE", OUT_JS)
    print("WROTE", blend_path)


if __name__ == "__main__":
    main()
