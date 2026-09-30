/**
 * Ring sky. Qwantani moonrise, a 4096×2048 linear EXR.
 * The shell is fixed in the world at a real depth, so the drop and
 * the ring orbit move it. It is not the scene IBL.
 */
import * as THREE from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

export const HDR_SKY_URL =
  "/assets/textures/sky-qwantani/qwantani_moonrise_puresky_4k.exr";
/** Inside the orbit, same idea as the old world-locked plate. */
export const HDR_SKY_RADIUS = 78;
/**
 * Image center faces the bust. The −Z shell point samples u = 0.25
 * before this offset.
 */
export const HDR_SKY_LON = 0.35;
/**
 * Highlight shoulder. The moon peaks near 1364 while the sky sits under 1,
 * and bloom (threshold 1) turns that disc into a white sheet.
 * 0.4 stays near 0.3. The moon lands near 1.2, then ACES.
 */
export const HDR_SKY_SHOULDER = 0.85;

/**
 * @param {THREE.Scene} scene
 */
export function createHdrSky(scene) {
  const uniforms = {
    uMap: { value: null },
    uLonOffset: { value: HDR_SKY_LON },
    uShoulder: { value: HDR_SKY_SHOULDER }
  };

  const material = new THREE.ShaderMaterial({
    name: "QwantaniSkyMaterial",
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: true,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = position;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      uniform float uLonOffset;
      uniform float uShoulder;
      varying vec3 vDir;

      const float PI = 3.14159265359;

      void main() {
        vec3 n = normalize(vDir);
        float lon = atan(n.z, n.x);
        float lat = asin(clamp(n.y, -1.0, 1.0));
        vec2 uv = vec2(
          fract(lon * (1.0 / (2.0 * PI)) + 0.5 + uLonOffset),
          lat * (1.0 / PI) + 0.5
        );
        vec3 sky = texture2D(uMap, uv).rgb;
        sky = sky / (1.0 + sky * uShoulder);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(HDR_SKY_RADIUS, 128, 80),
    material
  );
  mesh.name = "qwantani-sky";
  mesh.position.set(0, 0, 0);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  const sky = { mesh, ready: false, texture: null };

  new EXRLoader().load(
    HDR_SKY_URL,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      uniforms.uMap.value = texture;
      sky.texture = texture;
      sky.ready = true;
    },
    undefined,
    (err) => {
      console.warn("[HdrSky] EXR failed to load", err);
    }
  );

  return sky;
}
