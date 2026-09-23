/**
 * Rebuild Archaeology Antikythera runtime with real UVs.
 * Sketchfab CT master ships TEXCOORD_0 all zeros — baseColor never maps.
 * We smart-project UVs in Blender on the already-simplified mesh, then
 * resize → webp → meshopt into public/assets/models/antikythera/runtime/.
 * Master under masters/Antikythera Mechanism/ is never modified.
 */
import { spawnSync } from "child_process";
import { mkdirSync, copyFileSync, rmSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";
const MASTER_GLB = join(
  ROOT,
  "masters/Antikythera Mechanism/antikythera_mechanism_main_fragment_ct.glb"
);
const RUNTIME_DIR = join(ROOT, "public/assets/models/antikythera/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "antikythera.glb");
const WORK = join(ROOT, "tmp/anti-uv-rebuild");
const DECOMP = join(WORK, "decompressed.glb");
const UVED = join(WORK, "uv-projected.glb");
const RESIZED = join(WORK, "resized.glb");
const WEBPED = join(WORK, "webp.glb");

function run(cmd, args, opts = {}) {
  console.log(">", cmd, args.join(" "));
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed with ${r.status}`);
  }
}

mkdirSync(WORK, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

// Prefer existing simplified runtime as geometry source (already ~5MB meshopt).
// Decompress meshopt so Blender can import.
const src = existsSync(RUNTIME_GLB) ? RUNTIME_GLB : MASTER_GLB;
console.log("source", src);
run("npx", ["--yes", "@gltf-transform/cli@4.1.1", "copy", src, DECOMP]);

const blenderPy = join(WORK, "smart_uv.py");
const py = `
import bpy
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)
src = Path(r"${DECOMP}")
out = Path(r"${UVED}")
bpy.ops.import_scene.gltf(filepath=str(src))

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print("smart-projecting", len(meshes), "meshes")
for obj in meshes:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Angle-based: keeps island scale consistent with bronze albedo noise.
    bpy.ops.uv.smart_project(
        angle_limit=1.15192,  # ~66°
        island_margin=0.002,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

bpy.ops.export_scene.gltf(
    filepath=str(out),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_apply=False,
)
print("wrote", out)
`;
import { writeFileSync } from "fs";
writeFileSync(blenderPy, py);
run(BLENDER, ["--background", "--python", blenderPy]);

run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "resize",
  UVED,
  RESIZED,
  "--width",
  "512",
  "--height",
  "512"
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

console.log("done →", RUNTIME_GLB);
