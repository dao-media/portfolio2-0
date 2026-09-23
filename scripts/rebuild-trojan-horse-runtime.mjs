/**
 * Build Archaeology Trojan Horse runtime from the Envato / UTC wooden-block master.
 * Unzips into tmp/, Blender OBJ→GLB (cm→m), then resize → webp → meshopt.
 * Master zip under masters/Trojan Horse/ is never modified.
 *
 * Run: node scripts/rebuild-trojan-horse-runtime.mjs
 */
import { spawnSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  statSync
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";
const MASTER_ZIP = join(
  ROOT,
  "masters/Trojan Horse/wooden-block-horse-on-wheels-2026-09-01-05-57-23-utc.zip"
);
const RUNTIME_DIR = join(ROOT, "public/assets/models/trojan-horse/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "trojan-horse.glb");
const WORK = join(ROOT, "tmp/trojan-horse-rebuild");
const EXTRACT = join(WORK, "extract");
const RAW_GLB = join(WORK, "raw.glb");
const RESIZED = join(WORK, "resized.glb");
const WEBPED = join(WORK, "webp.glb");

function run(cmd, args, opts = {}) {
  console.log(">", cmd, args.join(" "));
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed with ${r.status}`);
  }
}

if (!existsSync(MASTER_ZIP)) {
  throw new Error(`missing master zip: ${MASTER_ZIP}`);
}
if (!existsSync(BLENDER)) {
  throw new Error(`Blender not found at ${BLENDER}`);
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(EXTRACT, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

run("unzip", ["-o", MASTER_ZIP, "-d", EXTRACT]);

const blenderPy = join(WORK, "export_trojan.py");
writeFileSync(
  blenderPy,
  `
import bpy
from pathlib import Path
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)

src_dir = Path(r"${EXTRACT}") / "Trojan_Horse"
# Zip lists the OBJ twice — take the single file on disk.
obj_path = src_dir / "Trojan_Horse.obj"
mtl_path = src_dir / "Trojan_Horse.mtl"
out = Path(r"${RAW_GLB}")

assert obj_path.is_file(), f"missing {obj_path}"
assert mtl_path.is_file(), f"missing {mtl_path}"

bpy.ops.wm.obj_import(
    filepath=str(obj_path),
    directory=str(src_dir),
    forward_axis="NEGATIVE_Z",
    up_axis="Y",
    use_split_objects=False,
    use_split_groups=False,
)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print("imported meshes", len(meshes), [m.name for m in meshes])

# World AABB before scale
mins = Vector((1e9, 1e9, 1e9))
maxs = Vector((-1e9, -1e9, -1e9))
for obj in meshes:
    for corner in obj.bound_box:
        w = obj.matrix_world @ Vector(corner)
        mins.x, mins.y, mins.z = min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)
        maxs.x, maxs.y, maxs.z = max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)
size = maxs - mins
print("raw AABB size", tuple(size))

# Envato toy horses are typically authored in cm. If tallest axis > 2, treat as cm.
CM_TO_M = 0.01
tall = max(size.x, size.y, size.z)
scale = CM_TO_M if tall > 2.0 else 1.0
print("apply scale", scale, "→ height_m ~", size.y * scale)

root = bpy.data.objects.new("trojan-horse-export-root", None)
bpy.context.collection.objects.link(root)
for obj in meshes:
    obj.parent = root
root.scale = (scale, scale, scale)
bpy.context.view_layer.update()

# Bind diffuse as baseColor; bump stays out (polish strips bad normals).
for obj in meshes:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        # Prefer explicit diffuse texture if Principled base is unbound.
        if not bsdf.inputs["Base Color"].is_linked:
            tex = next(
                (
                    n
                    for n in nt.nodes
                    if n.type == "TEX_IMAGE"
                    and n.image
                    and "diffuse" in (n.image.name or "").lower()
                ),
                None,
            )
            if tex:
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Metallic"].default_value = 0.02
        bsdf.inputs["Roughness"].default_value = 0.82

bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = root

bpy.ops.export_scene.gltf(
    filepath=str(out),
    export_format="GLB",
    use_selection=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_apply=False,
)
print("wrote", out)
`
);

run(BLENDER, ["--background", "--python", blenderPy]);

run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "resize",
  RAW_GLB,
  RESIZED,
  "--width",
  "1024",
  "--height",
  "1024"
]);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "webp",
  RESIZED,
  WEBPED,
  "--quality",
  "86"
]);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "meshopt",
  WEBPED,
  RUNTIME_GLB
]);

const st = statSync(RUNTIME_GLB);
console.log("done →", RUNTIME_GLB, `(${(st.size / 1024 / 1024).toFixed(2)} MB)`);
