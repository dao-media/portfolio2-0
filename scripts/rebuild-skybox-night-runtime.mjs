/**
 * Build night-sky equirect + runtime GLB from masters/SkyBox Night/.
 * Master untouched. Emits:
 *   public/assets/textures/skybox-night/equirect.webp  (4096×2048)
 *   public/assets/models/skybox-night/runtime/skybox-night.glb
 *
 * Run: node scripts/rebuild-skybox-night-runtime.mjs
 */
import { spawnSync } from "child_process";
import { mkdirSync, existsSync, copyFileSync, writeFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";
const MASTER = join(
  ROOT,
  "masters/SkyBox Night/night_sky_visible_spectrum_monochromatic.glb"
);
const TEX_DIR = join(ROOT, "public/assets/textures/skybox-night");
const EQUIRECT = join(TEX_DIR, "equirect.webp");
const RUNTIME_DIR = join(ROOT, "public/assets/models/skybox-night/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "skybox-night.glb");
const WORK = join(ROOT, "tmp/skybox-night-rebuild");

function run(cmd, args) {
  console.log(">", cmd, args.join(" "));
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

if (!existsSync(MASTER)) throw new Error(`missing master: ${MASTER}`);
if (!existsSync(BLENDER)) throw new Error(`Blender not found: ${BLENDER}`);
mkdirSync(WORK, { recursive: true });
mkdirSync(TEX_DIR, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

const pngOut = join(WORK, "equirect.png");
const blenderPy = join(WORK, "extract_equirect.py");
writeFileSync(
  blenderPy,
  `
import bpy
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)
src = Path(r"${MASTER}")
out = Path(r"${pngOut}")
bpy.ops.import_scene.gltf(filepath=str(src))

# Pick the largest image (equirect night sky).
imgs = [img for img in bpy.data.images if img.size[0] > 0 and img.size[1] > 0]
imgs.sort(key=lambda i: i.size[0] * i.size[1], reverse=True)
assert imgs, "no images in GLB"
img = imgs[0]
print("source image", img.name, img.size[0], "x", img.size[1])

# Save as PNG at native res (expect 4096×2048).
img.filepath_raw = str(out)
img.file_format = "PNG"
img.save()
print("wrote", out)
`
);
run(BLENDER, ["--background", "--python", blenderPy]);

// webp 4096 via cwebp (lossless-ish quality for stars)
run("cwebp", ["-q", "92", "-m", "6", pngOut, "-o", EQUIRECT]);

// Also keep a meshopt GLB (fallback / probes) at 4096.
const src = join(WORK, "src.glb");
const resized = join(WORK, "resized.glb");
const webped = join(WORK, "webp.glb");
copyFileSync(MASTER, src);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "resize",
  src,
  resized,
  "--width",
  "4096",
  "--height",
  "2048"
]);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "webp",
  resized,
  webped,
  "--quality",
  "92"
]);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "meshopt",
  webped,
  RUNTIME_GLB
]);

console.log(
  "done →",
  EQUIRECT,
  `(${(statSync(EQUIRECT).size / 1024 / 1024).toFixed(2)} MB)`,
  RUNTIME_GLB
);
