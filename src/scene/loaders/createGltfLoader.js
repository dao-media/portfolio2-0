import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { applyMaterialIntentSSOT } from "./materialIntentSSOT.js";

/**
 * GLTFLoader with EXT_meshopt_compression. Register before loading Archaeology / stele GLBs.
 * Never use gltf-transform `optimize` (it simplify()s meshes away).
 *
 * Every load through this loader also runs {@link applyMaterialIntentSSOT},
 * gated to `PROP_GLBS` by URL there — stage systems loaded through this same
 * factory (black hole, etc.) are structurally excluded, not just untouched
 * by the allowlist.
 * @param {import("three").LoadingManager} [manager]
 */
export function createGltfLoader(manager) {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const loadAsync = loader.loadAsync.bind(loader);
  loader.loadAsync = async (url, onProgress) => {
    const gltf = await loadAsync(url, onProgress);
    applyMaterialIntentSSOT(gltf, url);
    return gltf;
  };
  // Some call sites still use the callback API — wrap it too, or those loads
  // (e.g. the neon lantern) never see the SSOT rule at all.
  const load = loader.load.bind(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
    load(
      url,
      (gltf) => {
        applyMaterialIntentSSOT(gltf, url);
        onLoad?.(gltf);
      },
      onProgress,
      onError
    );
  };
  return loader;
}
