/**
 * One load-time rule for every GLB, replacing the per-vignette
 * `_hardenBustMaterials` / `_hardenChassisMaterials` functions.
 *
 * glTF defaults `metallicFactor` to 1 when the file omits it. A material with
 * neither an explicit factor nor a metallicRoughnessTexture has zero artist
 * intent behind that 1 — it is always safe to zero. A material WITH a map
 * (or an explicit factor) may have real per-pixel or authored metal data, so
 * it is left alone unless named here: the allowlist is where a human decides
 * "this one is actually metal" (or, for a mapped material that still needs
 * pinning — e.g. a stone bust with a metalness map — "this one is pinned to
 * 0 on purpose"). Scalars only; never touches maps, so this cannot reopen
 * the warm-compile program-key leaks (adding/removing a map changes the
 * program's shader defines, which changing a scalar does not).
 *
 * @typedef {{ metalness: number, roughness?: number }} MaterialIntentEntry
 */

/**
 * Opt-in list: the material rule only runs for a GLB whose URL contains one
 * of these substrings — the AI-generated props (Archaeology, mostly
 * Tripo-named) plus the Bust and Sidekick, which the allowlist entries above
 * target by name. Stage systems (black hole, wet floor, PC production
 * materials, screens, grass, anything emissive/MeshBasic/custom-shader) are
 * never touched, regardless of what their materials happen to be named —
 * this list is the actual safety boundary, not the allowlist.
 */
const PROP_GLBS = [
  "/models/bust/",
  "/models/sidekick/",
  "/models/lantern/",
  "/models/shelving-unit/",
  "/models/venus-willendorf/",
  "/models/trojan-horse/",
  "/models/olmec-head/",
  "/models/olive-wood-boat/",
  "/models/cuneiform-tablet/",
  "/models/ishtar-gate/",
  "/models/lucy/",
  "/models/ptolemy/",
  "/models/divje-babe-flute/",
  "/models/neanderthal/"
];

/** @type {Record<string, MaterialIntentEntry>} */
export const METAL_ALLOWLIST = {
  // Bust — pending the bronze-vs-stone call (see debugMaterialAudit / the
  // chrome-state investigation). Held at the value the replaced
  // `_hardenBustMaterials` produced (metalness min(raw, 0.12) = 0.12 for this
  // GLB, roughness max(raw, 0.55) = 1) so this rule does not itself retune
  // the bust. Pass R: it had pinned 0 here, which was a silent retune
  // (23 Sep ran at 0.12); `pass-q-check` fails on 0.
  Mesh_0_material: { metalness: 0.12, roughness: 1 },
  // Sidekick chassis — genuinely metal parts (mesh/material names name the
  // metal). Roughened from the raw 0.553 so they read as worn, not mirrors.
  silver: { metalness: 1, roughness: 0.65 },
  carkey1: { metalness: 1, roughness: 0.65 },
  silver2: { metalness: 1, roughness: 0.65 },
  // Bust-vignette lantern body (glass is handled separately in
  // makeNeonLantern.js — color/emissive/transmission, not just scalars).
  // Raw glTF omits both metallicFactor and roughnessFactor (default 1/1);
  // values below are the prior inline cap's actual output at that raw
  // default (min(1, 0.55) / max(1, 0.55) — the roughness floor was already
  // a no-op), not the floor/cap constants themselves.
  lantern: { metalness: 0.55, roughness: 1 }
  // Sidekick "alu" (mesh `bottomPlastic`) is deliberately NOT listed here.
  // It has no metalnessMap and no explicit metallicFactor, so the generic
  // rule below already zeroes it — flagging per request, pending plastic
  // vs. metal confirmation. Add an entry here to override.
};

/**
 * Pass S S5 — meshes that are real metal although their material is not:
 * Sidekick's rivets and magnet share `lambert1` (no metallicFactor, so the
 * rule below zeroes it) with non-metal parts like `swivelPart`. Matched by
 * mesh name; each gets its own clone of the material at these values, so
 * the shared material keeps the generic rule. Same values as the chassis
 * allowlist metals.
 * @type {Record<string, MaterialIntentEntry>}
 */
export const METAL_MESHES = {
  magnet: { metalness: 1, roughness: 0.65 },
  rivet: { metalness: 1, roughness: 0.65 },
  rivet1: { metalness: 1, roughness: 0.65 }
};
const METAL_MESH_GLBS = ["/models/sidekick/"];

/**
 * @param {import("three/examples/jsm/loaders/GLTFLoader.js").GLTF} gltf
 * @param {string} [url] Source URL — gates which GLBs this rule ever touches.
 */
export function applyMaterialIntentSSOT(gltf, url) {
  if (typeof url === "string" && !PROP_GLBS.some((frag) => url.includes(frag))) return;
  const rawMaterials = gltf?.parser?.json?.materials;
  const scene = gltf?.scene;
  if (!rawMaterials || !scene) return;

  const rawByName = new Map();
  for (const raw of rawMaterials) {
    if (raw?.name) rawByName.set(raw.name, raw);
  }

  const seen = new Set();
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat) || typeof mat.metalness !== "number") continue;
      seen.add(mat);

      const allow = METAL_ALLOWLIST[mat.name];
      if (allow) {
        mat.metalness = allow.metalness;
        if (typeof allow.roughness === "number") mat.roughness = allow.roughness;
        mat.needsUpdate = true;
        continue;
      }

      const raw = rawByName.get(mat.name);
      const pbr = raw?.pbrMetallicRoughness;
      const hasFactor = Boolean(pbr && "metallicFactor" in pbr);
      const hasMap = Boolean(pbr?.metallicRoughnessTexture);
      if (!hasFactor && !hasMap) {
        mat.metalness = 0;
        mat.needsUpdate = true;
      }
    }
  });

  if (typeof url === "string" && !METAL_MESH_GLBS.some((frag) => url.includes(frag))) return;
  const clones = new Map();
  scene.traverse((obj) => {
    const want = obj.isMesh && !Array.isArray(obj.material) ? METAL_MESHES[obj.name] : null;
    // Idempotent: the loader can run this rule twice on one GLB.
    if (!want || !obj.material || obj.material.userData?.metalMesh) return;
    const key = `${obj.material.uuid}|${want.metalness}|${want.roughness}`;
    let mat = clones.get(key);
    if (!mat) {
      mat = obj.material.clone();
      mat.name = `${obj.material.name || "material"}-metal`;
      mat.userData = { ...mat.userData, metalMesh: true };
      mat.metalness = want.metalness;
      if (typeof want.roughness === "number") mat.roughness = want.roughness;
      clones.set(key, mat);
    }
    obj.material = mat;
  });
}
