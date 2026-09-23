/**
 * Build Archaeology olive-wood boat runtime from masters/Olive Wood Boat/.
 * Copy → simplify → resize → webp → meshopt into
 * public/assets/models/olive-wood-boat/runtime/. Master files are never modified.
 *
 * Master is a dense Tripo GLB (~1M tris / 4k maps) — simplify is required.
 *
 * Run: node scripts/rebuild-olive-wood-boat-runtime.mjs
 */
import { spawnSync } from "child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MASTER_GLB = join(ROOT, "masters/Olive Wood Boat/Olive wood boat.glb");
const RUNTIME_DIR = join(ROOT, "public/assets/models/olive-wood-boat/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "olive-wood-boat.glb");
const WORK = join(ROOT, "tmp/olive-wood-boat-rebuild");
const RAW_GLB = join(WORK, "raw.glb");
const SIMPLIFIED = join(WORK, "simplified.glb");
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

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

copyFileSync(MASTER_GLB, RAW_GLB);

// ~1M tris → ~50k (ratio 0.05) — shelf prop, not hero close-up.
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "simplify",
  RAW_GLB,
  SIMPLIFIED,
  "--ratio",
  "0.05",
  "--error",
  "0.001"
]);
run("npx", [
  "--yes",
  "@gltf-transform/cli@4.1.1",
  "resize",
  SIMPLIFIED,
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
console.log("source: masters/Olive Wood Boat/Olive wood boat.glb (untouched)");
