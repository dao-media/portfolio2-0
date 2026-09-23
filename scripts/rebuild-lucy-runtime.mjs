/**
 * Build Archaeology Lucy (Australopithecus afarensis cranium + mandible) runtime
 * from masters/Lucy/. Copy → resize → webp → meshopt into
 * public/assets/models/lucy/runtime/. Master files are never modified.
 *
 * ~284k tris / 2k maps — shelf prop; skip heavy simplify (already manageable).
 *
 * Run: node scripts/rebuild-lucy-runtime.mjs
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
  "masters/Lucy/australopithecus_afarensis_lucycrane_et_mand..glb"
);
const RUNTIME_DIR = join(ROOT, "public/assets/models/lucy/runtime");
const RUNTIME_GLB = join(RUNTIME_DIR, "lucy.glb");
const WORK = join(ROOT, "tmp/lucy-rebuild");
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
console.log(
  "source: masters/Lucy/australopithecus_afarensis_lucycrane_et_mand..glb (untouched)"
);
