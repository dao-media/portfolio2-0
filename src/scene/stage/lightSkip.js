/**
 * Pass N N1 — skip lights that contribute nothing.
 *
 * three evaluates every light in every lit fragment, intensity 0 or not: at
 * Bust, the three other stops' neon PointLights (each with a cube shadow
 * lookup), two directional and a rect-area light are all at 0 and still run
 * per pixel. Hiding exactly those lights saved 7.0 ms at settled Bust (1.6
 * MP) with an identical image — but hiding changes the light count, so every
 * program would relink on every hop.
 *
 * Instead each per-light body in `lights_fragment_begin` is wrapped in a
 * branch on the light's colour uniform (three uploads colour × intensity, so
 * intensity 0 ⇒ colour 0). The branch is the same for every fragment (a
 * uniform), so the GPU skips the whole body, shadow lookup included. Light
 * count, light values and program keys are unchanged; the RE_Direct line
 * that pcProductionMaterials patches is untouched (it lands inside).
 *
 * Applied from the StageExperience constructor, before any program
 * compiles. `?lightskip=0` keeps three's chunk (A/B).
 */
import * as THREE from "three";

const LOOPS = [
  ["NUM_POINT_LIGHTS", "pointLight"],
  ["NUM_SPOT_LIGHTS", "spotLight"],
  ["NUM_DIR_LIGHTS", "directionalLight"],
  ["NUM_RECT_AREA_LIGHTS", "rectAreaLight"]
];

/**
 * @param {string} chunk
 * @returns {string | null} patched chunk, or null if three's chunk changed shape
 */
export function patchLightLoops(chunk) {
  let out = chunk;
  for (const [count, light] of LOOPS) {
    const head = `for ( int i = 0; i < ${count}; i ++ ) {`;
    const assign = `${light} = ${light}s[ i ];`;
    const at = out.indexOf(head);
    if (at < 0) return null;
    const assignAt = out.indexOf(assign, at);
    const end = out.indexOf("#pragma unroll_loop_end", at);
    if (assignAt < 0 || end < 0 || assignAt > end) return null;
    const close = out.lastIndexOf("}", end);
    const afterAssign = assignAt + assign.length;
    out =
      out.slice(0, afterAssign) +
      `\n\t\tif ( any( greaterThan( ${light}.color, vec3( 0.0 ) ) ) ) {` +
      out.slice(afterAssign, close) +
      "\t}\n\t" +
      out.slice(close);
  }
  return out;
}

let active = null;

/**
 * Patch once (idempotent), before the first program compiles.
 * @param {string} search page query (the worker gets it in its init message)
 * @returns {boolean} whether the skip is active
 */
export function applyLightSkip(search = "") {
  if (active != null) return active;
  if (/[?&]lightskip=0\b/.test(search)) return (active = false);
  const patched = patchLightLoops(THREE.ShaderChunk.lights_fragment_begin);
  if (!patched) {
    console.warn("[lightSkip] lights_fragment_begin changed shape — not patched");
    return (active = false);
  }
  THREE.ShaderChunk.lights_fragment_begin = patched;
  return (active = true);
}
