import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * GLTFLoader with EXT_meshopt_compression. Register before loading travel pack / T-rex.
 * Never use gltf-transform `optimize` (it simplify()s meshes away).
 * @param {import("three").LoadingManager} [manager]
 */
export function createGltfLoader(manager) {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}
