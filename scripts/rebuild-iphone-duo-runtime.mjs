/**
 * Build Duo FAB runtime from masters/iPhone Duo/iphone-duo_glb.zip
 * (`glb/iphone_duo_rigged_animated.glb` — skinned hinge + ArmatureAction).
 * resize → webp → meshopt into public/assets/models/iphone-duo/runtime/.
 * Master files are never modified.
 *
 * Run: node scripts/rebuild-iphone-duo-runtime.mjs
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
const MASTER_ZIP = join(ROOT, "masters/iPhone Duo/iphone-duo_glb.zip");
const MASTER_ENTRY = "glb/iphone_duo_rigged_animated.glb";
const RUNTIME_DIR = join(ROOT, "public/assets/models/iphone-duo/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "iphone-duo.glb");
const WORK = join(ROOT, "tmp/iphone-duo-rebuild");
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

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

run("unzip", ["-o", MASTER_ZIP, MASTER_ENTRY, "-d", WORK]);
const extracted = join(WORK, MASTER_ENTRY);
if (!existsSync(extracted)) {
  throw new Error(`unzip missed ${MASTER_ENTRY}`);
}
copyFileSync(extracted, RAW_GLB);

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
  "source: masters/iPhone Duo/iphone-duo_glb.zip →",
  MASTER_ENTRY
);
