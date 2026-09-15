/**
 * Patch EDGE_GLITCH_* exports in src/scene/edgeGlitch/constants.js from a params object.
 * Used by:
 *   - EdgeGlitchTuner FINALIZE (via Vite /__edge_glitch_finalize middleware)
 *   - CLI: node scripts/edge-glitch-tuner-finalize.mjs path/to/params.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EDGE_GLITCH_PARAM_SCHEMA } from "../src/scene/edgeGlitch/constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONSTANTS = resolve(ROOT, "src/scene/edgeGlitch/constants.js");
const DEBUG_OUT = resolve(ROOT, "public/debug/edge-glitch-tuner-finalize.json");

const KEY_TO_CONST = Object.fromEntries(
  EDGE_GLITCH_PARAM_SCHEMA.map((s) => [s.key, s.constName])
);

/**
 * Also keep schema `default:` literals in sync with the named exports.
 * @param {string} src
 * @param {string} key
 * @param {number} value
 */
function patchSchemaDefault(src, key, value) {
  const lit = Number.isInteger(value) ? String(value) : String(value);
  const rowRe = new RegExp(
    `(key: "${key}",[\\s\\S]{0,180}?default: )(-?[\\d.]+)`
  );
  if (!rowRe.test(src)) return { src, ok: false };
  return { src: src.replace(rowRe, `$1${lit}`), ok: true };
}

/**
 * @param {Record<string, number>} params
 * @param {{ label?: string }} [meta]
 * @returns {{ updated: string[], skipped: string[], path: string }}
 */
export function finalizeEdgeGlitchConfig(params, meta = {}) {
  if (!params || typeof params !== "object") {
    throw new Error("finalizeEdgeGlitchConfig: params object required");
  }

  let src = readFileSync(CONSTANTS, "utf8");
  const updated = [];
  const skipped = [];

  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      skipped.push(key);
      continue;
    }
    const constName = KEY_TO_CONST[key];
    if (!constName) {
      skipped.push(key);
      continue;
    }

    const lit = Number.isInteger(value) ? String(value) : String(value);
    const exportRe = new RegExp(
      `(export const ${constName} = )(-?[\\d.]+)(;)`
    );
    if (!exportRe.test(src)) {
      skipped.push(key);
      continue;
    }
    src = src.replace(exportRe, `$1${lit}$3`);
    const schemaPatch = patchSchemaDefault(src, key, value);
    src = schemaPatch.src;
    updated.push(key);
  }

  writeFileSync(CONSTANTS, src);

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

  return { updated, skipped, path: CONSTANTS };
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/edge-glitch-tuner-finalize.mjs <params.json>");
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(resolve(file), "utf8"));
  const params = raw.params ?? raw;
  const result = finalizeEdgeGlitchConfig(params, { label: raw.label });
  console.log(JSON.stringify(result, null, 2));
}
