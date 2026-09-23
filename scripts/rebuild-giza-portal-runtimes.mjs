/**
 * Build Giza portal runtimes from masters/ (untouched).
 * Emits:
 *   public/assets/textures/skybox-day/equirect.webp
 *   public/assets/models/desert-giza/runtime/desert-giza.glb
 *   public/assets/models/giza-pyramids/runtime/giza-pyramids.glb
 *
 * Run: node scripts/rebuild-giza-portal-runtimes.mjs
 */
import { spawnSync } from "child_process";
import {
  mkdirSync,
  existsSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  statSync
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";
const WORK = join(ROOT, "tmp/giza-portal-rebuild");
const GIZA_ZIP = join(
  ROOT,
  "masters/Pyramids/giza-pyramids-ensemble-2026-09-01-06-06-14-utc.zip"
);
const DESERT_MASTER = join(ROOT, "masters/Desert/hot_desert_biome_-_terrain.glb");
const SKY_MASTER = join(ROOT, "masters/SkyBox Day/free_-_skybox_savanna.glb");

const TEX_DIR = join(ROOT, "public/assets/textures/skybox-day");
const DESERT_DIR = join(ROOT, "public/assets/models/desert-giza/runtime");
const PYR_DIR = join(ROOT, "public/assets/models/giza-pyramids/runtime");

function run(cmd, args, opts = {}) {
  console.log(">", cmd, args.join(" "));
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

for (const p of [DESERT_MASTER, SKY_MASTER, GIZA_ZIP, BLENDER]) {
  if (!existsSync(p)) throw new Error(`missing: ${p}`);
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(TEX_DIR, { recursive: true });
mkdirSync(DESERT_DIR, { recursive: true });
mkdirSync(PYR_DIR, { recursive: true });

const extract = join(WORK, "giza-extract");
mkdirSync(extract, { recursive: true });
run("unzip", ["-o", GIZA_ZIP, "-d", extract]);

const blenderPy = join(WORK, "build_assets.py");
writeFileSync(
  blenderPy,
  `
import bpy
from pathlib import Path
from mathutils import Vector
import math

ROOT = Path(r"${ROOT}")
WORK = Path(r"${WORK}")
EXTRACT = Path(r"${extract}")

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

# ---- Day sky equirect ----
clear()
bpy.ops.import_scene.gltf(filepath=str(ROOT / "masters/SkyBox Day/free_-_skybox_savanna.glb"))
imgs = [img for img in bpy.data.images if img.size[0] > 0 and img.size[1] > 0]
imgs.sort(key=lambda i: i.size[0] * i.size[1], reverse=True)
assert imgs, "no day sky images"
img = imgs[0]
png = WORK / "skybox-day-equirect.png"
img.filepath_raw = str(png)
img.file_format = "PNG"
img.save()
print("wrote", png)

# ---- Desert: decimate + Y-up ----
clear()
bpy.ops.import_scene.gltf(filepath=str(ROOT / "masters/Desert/hot_desert_biome_-_terrain.glb"))
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
# Sketchfab sheet is XY / Z-thin → rotate to Y-up
obj.rotation_euler[0] = -math.pi / 2
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
min_v = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
max_v = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
size = max_v - min_v
target = 120.0
s = target / max(size.x, size.z, 1e-6)
obj.scale = (s, s, s)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
min_v = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
max_v = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
center = (min_v + max_v) * 0.5
obj.location -= Vector((center.x, min_v.y, center.z))
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
mod = obj.modifiers.new("Decimate", "DECIMATE")
mod.ratio = min(1.0, 12000 / max(len(obj.data.polygons), 1))
bpy.ops.object.modifier_apply(modifier=mod.name)
for img in bpy.data.images:
    if img.size[0] > 1024:
        img.scale(1024, 1024)
desert_out = WORK / "desert-yup.glb"
bpy.ops.export_scene.gltf(filepath=str(desert_out), export_format="GLB")
print("wrote", desert_out)

# ---- Giza pyramids ----
clear()
obj_dir = EXTRACT / "[OBJ] Pyramids"
bpy.ops.wm.obj_import(
    filepath=str(obj_dir / "Pyramids.obj"),
    directory=str(obj_dir),
    forward_axis="NEGATIVE_Z",
    up_axis="Y",
    use_split_objects=False,
    use_split_groups=False,
)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
# Tip is along +X after OBJ import (not Y). Rotate +Z so tip → Blender Z,
# then glTF export maps Z-up → Y-up. (Wrong +X tip left bases as vertical walls.)
obj.rotation_euler[2] = math.pi / 2
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
min_v = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
max_v = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
size = max_v - min_v
s = 90.0 / max(size.z, 1e-6)
obj.scale = (s, s, s)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
min_v = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
max_v = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
center = (min_v + max_v) * 0.5
obj.location -= Vector((center.x, center.y, min_v.z))
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
for img in bpy.data.images:
    w, h = img.size[0], img.size[1]
    if w > 2048 or h > 2048:
        img.scale(min(w, 2048), min(h, 2048))
pyr_out = WORK / "pyramids-yup.glb"
bpy.ops.export_scene.gltf(filepath=str(pyr_out), export_format="GLB")
print("wrote", pyr_out)
print("DONE")
`
);

run(BLENDER, ["--background", "--python", blenderPy]);

run("cwebp", [
  "-q",
  "88",
  "-m",
  "6",
  join(WORK, "skybox-day-equirect.png"),
  "-o",
  join(TEX_DIR, "equirect.webp")
]);

run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "webp",
  join(WORK, "desert-yup.glb"),
  join(WORK, "desert-webp.glb"),
  "--quality",
  "80"
]);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "meshopt",
  join(WORK, "desert-webp.glb"),
  join(DESERT_DIR, "desert-giza.glb")
]);

run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "webp",
  join(WORK, "pyramids-yup.glb"),
  join(WORK, "pyramids-webp.glb"),
  "--quality",
  "82"
]);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "meshopt",
  join(WORK, "pyramids-webp.glb"),
  join(PYR_DIR, "giza-pyramids.glb")
]);

for (const f of [
  join(TEX_DIR, "equirect.webp"),
  join(DESERT_DIR, "desert-giza.glb"),
  join(PYR_DIR, "giza-pyramids.glb")
]) {
  console.log(f, (statSync(f).size / 1024).toFixed(1), "KB");
}
console.log("giza portal runtimes ready");
