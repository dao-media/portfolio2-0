/**
 * Build Egypt portal day sky from masters/Sky's/20Sky-HDRI/Sky 16.hdr
 * (master untouched). Emits:
 *   public/assets/textures/skybox-egypt/equirect.webp
 *
 * Run: node scripts/rebuild-skybox-egypt-runtime.mjs
 */
import { spawnSync } from "child_process";
import { mkdirSync, existsSync, writeFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";
const MASTER = join(ROOT, "masters/Sky's/20Sky-HDRI/Sky 16.hdr");
const TEX_DIR = join(ROOT, "public/assets/textures/skybox-egypt");
const EQUIRECT = join(TEX_DIR, "equirect.webp");
const WORK = join(ROOT, "tmp/skybox-egypt-rebuild");

function run(cmd, args) {
  console.log(">", cmd, args.join(" "));
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

if (!existsSync(MASTER)) throw new Error(`missing master: ${MASTER}`);
if (!existsSync(BLENDER)) throw new Error(`Blender not found: ${BLENDER}`);
mkdirSync(WORK, { recursive: true });
mkdirSync(TEX_DIR, { recursive: true });

const pngOut = join(WORK, "equirect.png");
const blenderPy = join(WORK, "hdr_to_png.py");
writeFileSync(
  blenderPy,
  `
import bpy
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)
src = Path(r"${MASTER}")
out = Path(r"${pngOut}")

img = bpy.data.images.load(str(src), check_existing=False)
print("loaded", img.name, img.size[0], "x", img.size[1])

# Force pixel buffer (lazy HDR loads need this before save).
_ = len(img.pixels)
print("pixels", len(img.pixels))

w, h = int(img.size[0]), int(img.size[1])
target_w = 2048
target_h = max(1, int(round(target_w * (h / max(w, 1)))))
if w != target_w or h != target_h:
    img.scale(target_w, target_h)
    _ = len(img.pixels)
    print("scaled to", target_w, "x", target_h)

# Tone-map HDR → displayable PNG via pack into a new byte image.
tw, th = int(img.size[0]), int(img.size[1])
src_px = list(img.pixels)  # float RGBA, may be >1
out_img = bpy.data.images.new("egypt-sky-ldr", width=tw, height=th, alpha=False, float_buffer=False)
dst = [0.0] * (tw * th * 4)
for i in range(0, tw * th * 4, 4):
    r, g, b = src_px[i], src_px[i + 1], src_px[i + 2]
    # Simple Reinhard + gamma for MeshBasic (toneMapped:false) display.
    exposure = 4.5
    r = 1.0 - __import__("math").exp(-max(0.0, r) * exposure)
    g = 1.0 - __import__("math").exp(-max(0.0, g) * exposure)
    b = 1.0 - __import__("math").exp(-max(0.0, b) * exposure)
    r = max(0.0, min(1.0, r)) ** (1.0 / 2.2)
    g = max(0.0, min(1.0, g)) ** (1.0 / 2.2)
    b = max(0.0, min(1.0, b)) ** (1.0 / 2.2)
    dst[i] = r
    dst[i + 1] = g
    dst[i + 2] = b
    dst[i + 3] = 1.0
out_img.pixels = dst
out_img.filepath_raw = str(out)
out_img.file_format = "PNG"
out_img.save()
print("wrote", out)
`
);

run(BLENDER, ["--background", "--python", blenderPy]);
run("cwebp", ["-q", "88", "-m", "6", pngOut, "-o", EQUIRECT]);

const st = statSync(EQUIRECT);
console.log("OK", EQUIRECT, `${(st.size / 1024).toFixed(1)} KB`);
