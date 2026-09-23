/**
 * Build Bust lantern runtime from masters/Lantern/lantern.glb.
 * resize → webp → meshopt into public/assets/models/lantern/runtime/.
 * Master files are never modified.
 *
 * Prefer the full master (`lantern.glb`); `lantern (1).glb` is an already-shrunk
 * Sketchfab twin (1024 maps) kept as reference only.
 *
 * Run: node scripts/rebuild-lantern-runtime.mjs
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
const MASTER_GLB = join(ROOT, "masters/Lantern/lantern.glb");
const RUNTIME_DIR = join(ROOT, "public/assets/models/lantern/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "lantern.glb");
const WORK = join(ROOT, "tmp/lantern-rebuild");
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
console.log("source: masters/Lantern/lantern.glb (untouched)");
