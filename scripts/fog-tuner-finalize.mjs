/**
 * Patch FOG_PARAM_SCHEMA defaults in src/fog/fogConfig.js from a params object.
 * Used by:
 *   - FogTuner FINALIZE (via Vite /__fog_finalize middleware)
 *   - CLI: node scripts/fog-tuner-finalize.mjs path/to/params.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FOG_CONFIG = resolve(ROOT, "src/fog/fogConfig.js");
const DEBUG_OUT = resolve(ROOT, "public/debug/fog-tuner-finalize.json");

/**
 * @param {Record<string, boolean|number>} params
 * @param {{ label?: string }} [meta]
 * @returns {{ updated: string[], skipped: string[], path: string }}
 */
export function finalizeFogConfig(params, meta = {}) {
  if (!params || typeof params !== "object") {
    throw new Error("finalizeFogConfig: params object required");
  }

  let src = readFileSync(FOG_CONFIG, "utf8");
  const updated = [];
  const skipped = [];

  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "number" && typeof value !== "boolean") {
      skipped.push(key);
      continue;
    }

    // Match schema rows like:
    //   { key: "fogMinY", type: "number", default: -0.2, ...
    //   { key: "halfRes", type: "boolean", default: true },
    const re = new RegExp(
      `(\\{ key: "${key}", type: "(?:boolean|number)", default: )([^,}\\s]+)`
    );
    if (!re.test(src)) {
      skipped.push(key);
      continue;
    }
    const lit =
      typeof value === "boolean"
        ? value
          ? "true"
          : "false"
        : Number.isInteger(value)
          ? String(value)
          : String(value);
    src = src.replace(re, `$1${lit}`);
    updated.push(key);
  }

  writeFileSync(FOG_CONFIG, src);

  mkdirSync(dirname(DEBUG_OUT), { recursive: true });
  writeFileSync(
    DEBUG_OUT,
    JSON.stringify(
      {
        label: meta.label ?? null,
        ts: Date.now(),
        updated,
        skipped,
        params
      },
      null,
      2
    )
  );

  return { updated, skipped, path: FOG_CONFIG };
}

/** CLI entry when run as `node scripts/fog-tuner-finalize.mjs …` */
const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/fog-tuner-finalize.mjs <params.json>");
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(resolve(file), "utf8"));
  const params = raw.params ?? raw;
  const result = finalizeFogConfig(params, { label: raw.label });
  console.log(JSON.stringify(result, null, 2));
}
