/**
 * Build Archaeology Ptolemy bust runtime from masters/Ptolemy/.
 * Blender trims the two-tier pedestal (master mesh is one piece), then
 * resize → webp → meshopt into public/assets/models/ptolemy/runtime/.
 * Master files are never modified.
 *
 * Run: node scripts/rebuild-ptolemy-runtime.mjs
 */
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";
const MASTER_GLB = join(ROOT, "masters/Ptolemy/ptolemy_statue.glb");
const RUNTIME_DIR = join(ROOT, "public/assets/models/ptolemy/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "ptolemy.glb");
const WORK = join(ROOT, "tmp/ptolemy-rebuild");
/** glTF Y-up height in master — geometry below is pedestal (Blender import → local Z). */
const PEDESTAL_CUT_Y = 0.805;
const RAW_GLB = join(WORK, "trimmed.glb");
const RESIZED = join(WORK, "resized.glb");
const WEBPED = join(WORK, "webp.glb");

function run(cmd, args, opts = {}) {
  console.log(">", cmd, args.join(" "));
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed with ${r.status}`);
  }
}

if (!existsSync(MASTER_GLB)) {
  throw new Error(`missing master: ${MASTER_GLB}`);
}
if (!existsSync(BLENDER)) {
  throw new Error(`Blender not found at ${BLENDER}`);
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

const blenderPy = join(WORK, "trim_ptolemy.py");
writeFileSync(
  blenderPy,
  `
import bpy
from pathlib import Path

MASTER = ${JSON.stringify(MASTER_GLB)}
OUT = ${JSON.stringify(RAW_GLB)}
CUT_Y = ${PEDESTAL_CUT_Y}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=MASTER)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("no mesh in Ptolemy GLB")

for obj in meshes:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh = obj.data
    for i, v in enumerate(mesh.vertices):
        if v.co.z < CUT_Y:
            v.select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

bpy.ops.object.select_all(action="DESELECT")
for obj in meshes:
    if len(obj.data.vertices) == 0:
        continue
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    break

bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
bpy.ops.object.location_clear()

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_yup=True,
)
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
console.log(
  `source: masters/Ptolemy/ptolemy_statue.glb (untouched); pedestal cut Y=${PEDESTAL_CUT_Y}`
);
