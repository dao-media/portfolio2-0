"""Inspect travel-pack + T-rex OBJs in Blender. Does not write source files."""
import bpy
import json
import math
import os
import shutil
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PACK_DIR = os.path.join(ROOT, "public/assets/models/travel-pack/Travel Pack")
REX_DIR = os.path.join(ROOT, "public/assets/models/t-rex")
OUT = os.path.join(tempfile.gettempdir(), "travel-asset-inspect.json")

bpy.ops.wm.read_factory_settings(use_empty=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.objects):
        for item in list(block):
            block.remove(item)


def import_obj(path):
    bpy.ops.wm.obj_import(
        filepath=path,
        forward_axis="NEGATIVE_Z",
        up_axis="Y",
    )


def object_info(obj):
    bbox = [list(v) for v in obj.bound_box]
    xs = [v[0] for v in bbox]
    ys = [v[1] for v in bbox]
    zs = [v[2] for v in bbox]
    size = [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)]
    loc = list(obj.location)
    info = {
        "name": obj.name,
        "type": obj.type,
        "location": loc,
        "dimensions": list(obj.dimensions),
        "bbox_size": size,
        "verts": len(obj.data.vertices) if obj.type == "MESH" else 0,
        "faces": len(obj.data.polygons) if obj.type == "MESH" else 0,
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "parent": obj.parent.name if obj.parent else None,
    }
    if obj.type == "MESH" and obj.data.vertices:
        world = obj.matrix_world
        coords = [world @ v.co for v in obj.data.vertices]
        info["world_min"] = [
            min(c.x for c in coords),
            min(c.y for c in coords),
            min(c.z for c in coords),
        ]
        info["world_max"] = [
            max(c.x for c in coords),
            max(c.y for c in coords),
            max(c.z for c in coords),
        ]
    return info


def inspect_dir(label, src_dir, obj_name, mtl_name, expected_mtllib):
    clear_scene()
    with tempfile.TemporaryDirectory() as tmp:
        obj_src = os.path.join(src_dir, obj_name)
        mtl_src = os.path.join(src_dir, mtl_name)
        obj_dst = os.path.join(tmp, obj_name)
        shutil.copy2(obj_src, obj_dst)
        if os.path.isfile(mtl_src):
            shutil.copy2(mtl_src, os.path.join(tmp, expected_mtllib))
        for name in os.listdir(src_dir):
            if name.lower().endswith((".png", ".jpg", ".jpeg")):
                shutil.copy2(os.path.join(src_dir, name), os.path.join(tmp, name))
        import_obj(obj_dst)
        objects = [object_info(o) for o in bpy.context.scene.objects if o.type == "MESH"]
        materials = []
        for mat in bpy.data.materials:
            node_types = []
            images = []
            if mat.use_nodes:
                for node in mat.node_tree.nodes:
                    node_types.append(node.type)
                    if node.type == "TEX_IMAGE" and node.image:
                        images.append(node.image.name)
            materials.append({"name": mat.name, "nodes": node_types, "images": images})
        return {
            "label": label,
            "object_count": len(objects),
            "objects": objects,
            "materials": materials,
        }


report = {
    "pack": inspect_dir(
        "pack",
        PACK_DIR,
        "Travel pack.obj",
        "Travel pack.mtl",
        "Travel_Backpack_Standing_01_002.mtl",
    ),
    "rex": inspect_dir(
        "rex",
        REX_DIR,
        "t-rex.obj",
        "t-rex.mtl",
        "Dinosaur_T-rex_Bones_2.mtl",
    ),
}

with open(OUT, "w") as f:
    json.dump(report, f, indent=2)
print("wrote", OUT)
print("pack objects", report["pack"]["object_count"])
print("rex objects", report["rex"]["object_count"])
for obj in report["pack"]["objects"]:
    print("PACK", obj["name"], "faces", obj["faces"], "dim", [round(x, 3) for x in obj["dimensions"]], "mats", obj["materials"])
