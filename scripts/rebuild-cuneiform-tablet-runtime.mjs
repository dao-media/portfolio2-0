/**
 * Build Archaeology Cuneiform Tablet runtime from masters/Cuneiform Tablet/.
 * Copy → simplify → resize → webp → meshopt. Master untouched.
 *
 * Master is a dense scan (~458 MB) — simplify is required for shelf use.
 *
 * Run: node scripts/rebuild-cuneiform-tablet-runtime.mjs
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
const MASTER_GLB = join(ROOT, "masters/Cuneiform Tablet/cuneiform_tablet.glb");
const RUNTIME_DIR = join(ROOT, "public/assets/models/cuneiform-tablet/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "cuneiform-tablet.glb");
const WORK = join(ROOT, "tmp/cuneiform-tablet-rebuild");
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

// Dense scan → shelf prop (~5% tris).
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
console.log("source: masters/Cuneiform Tablet/cuneiform_tablet.glb (untouched)");
