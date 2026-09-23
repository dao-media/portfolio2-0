/**
 * Build Archaeology Homo neanderthalensis (La Chapelle-aux-Saints) skull runtime
 * from masters/Homo neanderthalensis/. Copy → simplify → resize → webp → meshopt.
 * Master files are never modified.
 *
 * Dense multi-mesh scan (~1.5M tris) — simplify required for shelf use.
 *
 * Run: node scripts/rebuild-neanderthal-runtime.mjs
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
const MASTER_GLB = join(
  ROOT,
  "masters/Homo neanderthalensis/le_chapelle-aux-saints-1_-_skull.glb"
);
const RUNTIME_DIR = join(ROOT, "public/assets/models/neanderthal/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "neanderthal.glb");
const WORK = join(ROOT, "tmp/neanderthal-rebuild");
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
console.log(
  "source: masters/Homo neanderthalensis/le_chapelle-aux-saints-1_-_skull.glb (untouched)"
);
