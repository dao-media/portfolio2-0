/**
 * Rebuild desert-giza runtime from masters/Desert/Alternative/Sand Dunes
 * (masters untouched). Emits public/assets/models/desert-giza/runtime/desert-giza.glb
 *
 * Run: node scripts/rebuild-desert-sand-dunes-runtime.mjs
 */
import { spawnSync } from "child_process";
import {
  mkdirSync,
  existsSync,
  writeFileSync,
  rmSync,
  copyFileSync
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";
const WORK = join(ROOT, "tmp/sand-dunes-rebuild");
const OBJ = join(
  ROOT,
  "masters/Desert/Alternative/Sand Dunes/[OBJ] Sand_Cross_Sections_02/Sand_Cross_Sections_02.obj"
);
const DIFFUSE = join(
  ROOT,
  "masters/Desert/Alternative/Sand Dunes/Extras/Sand_Section_02_BaseColor.png"
);
const OUT_DIR = join(ROOT, "public/assets/models/desert-giza/runtime");

function run(cmd, args, opts = {}) {
  console.log(">", cmd, args.join(" "));
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

for (const p of [OBJ, DIFFUSE, BLENDER]) {
  if (!existsSync(p)) throw new Error(`missing: ${p}`);
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// Copy diffuse next to a working OBJ so Blender can find textures if needed.
const workObjDir = join(WORK, "obj");
mkdirSync(workObjDir, { recursive: true });
copyFileSync(OBJ, join(workObjDir, "Sand_Cross_Sections_02.obj"));
copyFileSync(
  join(dirname(OBJ), "Sand_Cross_Sections_02.mtl"),
  join(workObjDir, "Sand_Cross_Sections_02.mtl")
);
copyFileSync(DIFFUSE, join(workObjDir, "Sand_Section_02_BaseColor.png"));

const blenderPy = join(WORK, "build_desert.py");
writeFileSync(
  blenderPy,
  `
import bpy
from pathlib import Path
from mathutils import Vector
import math

WORK = Path(r"${WORK}")
OBJ = WORK / "obj" / "Sand_Cross_Sections_02.obj"
DIFFUSE = WORK / "obj" / "Sand_Section_02_BaseColor.png"
OUT = WORK / "desert-yup.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(
    filepath=str(OBJ),
    directory=str(OBJ.parent),
    forward_axis="NEGATIVE_Z",
    up_axis="Y",
    use_split_objects=False,
    use_split_groups=False,
)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
assert meshes, "no mesh"
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# Ensure thinnest axis is height (Y). After import size was ~120,120,30 on XYZ.
bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
mn = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
mx = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
size = mx - mn
axes = sorted([(size.x, 0), (size.y, 1), (size.z, 2)])
thin_axis = axes[0][1]
# If thin is not Y (1), rotate so thin → Y
if thin_axis == 0:
    obj.rotation_euler[2] = math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.rotation_euler[0] = -math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
elif thin_axis == 2:
    obj.rotation_euler[0] = -math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
mn = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
mx = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
size = mx - mn
# Footprint target ~36 m so portal seating can use ~1× scale
target = 36.0
s = target / max(size.x, size.z, 1e-6)
obj.scale = (s, s, s)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
mn = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
mx = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
center = (mn + mx) * 0.5
obj.location -= Vector((center.x, mn.y, center.z))
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

# Bind BaseColor
img = bpy.data.images.load(str(DIFFUSE))
img.colorspace_settings.name = "sRGB"
mat = bpy.data.materials.new("SandDunes")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
bsdf.inputs["Roughness"].default_value = 0.92
bsdf.inputs["Metallic"].default_value = 0.0
obj.data.materials.clear()
obj.data.materials.append(mat)

# Soft decimate if dense
if len(obj.data.polygons) > 20000:
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = 16000 / len(obj.data.polygons)
    bpy.ops.object.modifier_apply(modifier=mod.name)

# Downscale texture for web
if img.size[0] > 1024 or img.size[1] > 1024:
    img.scale(1024, 1024)

bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB")
print("wrote", OUT, "faces", len(obj.data.polygons))
bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
mn = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
mx = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
print("final size", (mx - mn)[:])
`
);

run(BLENDER, ["--background", "--python", blenderPy]);

run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "webp",
  join(WORK, "desert-yup.glb"),
  join(WORK, "desert-webp.glb"),
  "--quality",
  "82"
]);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "meshopt",
  join(WORK, "desert-webp.glb"),
  join(OUT_DIR, "desert-giza.glb")
]);

console.log("OK", join(OUT_DIR, "desert-giza.glb"));
