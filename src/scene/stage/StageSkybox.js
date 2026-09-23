/**
 * Night skybox — high-res equirect dome ABOVE the wet concrete apron.
 *
 * Does not modify the wet floor. Soft horizon fade only dims the lower sky
 * into STAGE_BG so the dome meets the apron without a starfield crease.
 * Stars twinkle via a cheap hash sparkle on bright texels.
 */
import * as THREE from "three";
import { STAGE_BG, STAGE_FLOOR_RADIUS, CAM_FAR } from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

/** Standalone 4096×2048 equirect (preferred). */
export const SKYBOX_NIGHT_EQUIRECT_URL =
  "/assets/textures/skybox-night/equirect.webp";
/** Fallback GLB if the webp is missing. */
export const SKYBOX_NIGHT_GLB_URL =
  "/assets/models/skybox-night/runtime/skybox-night.glb";

export const SKYBOX_RADIUS = Math.min(
  Math.max(STAGE_FLOOR_RADIUS * 1.15, 180),
  CAM_FAR * 0.85
);

/**
 * Soft band where sky mixes toward floor ink (view elev).
 * Keep this narrow and ABOVE the geometric horizon — wet concrete stays intact.
 */
export const SKYBOX_HORIZON_LOW = 0.02;
export const SKYBOX_HORIZON_HIGH = 0.18;

/** Twinkle strength 0–1 on star-bright texels. */
export const SKYBOX_TWINKLE = 1;
/** Twinkle speed scale (multiplies per-star rates ~2.5–8 Hz). */
export const SKYBOX_TWINKLE_HZ = 1;

/**
 * @returns {Promise<THREE.Texture>}
 */
async function loadEquirect() {
  const loader = new THREE.TextureLoader();
  try {
    const tex = await loader.loadAsync(SKYBOX_NIGHT_EQUIRECT_URL);
    return tex;
  } catch (err) {
    console.warn(
      "[StageSkybox] equirect.webp missing — falling back to GLB texture",
      err
    );
    const { createGltfLoader } = await import("../loaders/createGltfLoader.js");
    const gltf = await createGltfLoader().loadAsync(SKYBOX_NIGHT_GLB_URL);
    let best = null;
    let bestScore = 0;
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        for (const key of ["emissiveMap", "map"]) {
          const t = mat[key];
          if (!t?.image) continue;
          const w = t.image.width || 0;
          const h = t.image.height || 0;
          const score = w * h + (key === "emissiveMap" ? 1 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = t;
          }
        }
      }
    });
    if (!best) throw new Error("[StageSkybox] no equirect in GLB fallback");
    return best.clone();
  }
}

/**
 * @param {{
 *   scene: THREE.Scene,
 *   parent?: THREE.Object3D
 * }} opts
 */
export async function installNightSkybox(opts) {
  const { scene, parent = scene } = opts;

  const equirect = await loadEquirect();
  equirect.colorSpace = THREE.SRGBColorSpace;
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.wrapS = THREE.RepeatWrapping;
  equirect.wrapT = THREE.ClampToEdgeWrapping;
  // No mipmaps — star points mush into blobs under LinearMipmapLinearFilter.
  equirect.generateMipmaps = false;
  equirect.minFilter = THREE.LinearFilter;
  equirect.magFilter = THREE.LinearFilter;
  equirect.anisotropy = 1;
  equirect.needsUpdate = true;

  const uniforms = {
    uMap: { value: equirect },
    uFloorColor: { value: new THREE.Color(STAGE_BG) },
    uHorizonLow: { value: SKYBOX_HORIZON_LOW },
    uHorizonHigh: { value: SKYBOX_HORIZON_HIGH },
    uTwinkle: { value: SKYBOX_TWINKLE },
    uTwinkleHz: { value: SKYBOX_TWINKLE_HZ },
    uTime: { value: 0 }
  };

  const material = new THREE.ShaderMaterial({
    name: "StageNightSkyboxMaterial",
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    // Keep star points from ACES mush — sky is already authored dark.
    toneMapped: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      uniform vec3 uFloorColor;
      uniform float uHorizonLow;
      uniform float uHorizonHigh;
      uniform float uTwinkle;
      uniform float uTwinkleHz;
      uniform float uTime;
      varying vec3 vDir;

      const float PI = 3.14159265359;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      vec2 dirToEquirect(vec3 d) {
        vec3 n = normalize(d);
        float lon = atan(n.z, n.x);
        float lat = asin(clamp(n.y, -1.0, 1.0));
        return vec2(lon * (1.0 / (2.0 * PI)) + 0.5, lat * (1.0 / PI) + 0.5);
      }

      void main() {
        vec3 dir = normalize(vDir);
        vec2 uv = dirToEquirect(dir);
        vec3 sky = texture2D(uMap, uv).rgb;

        // Twinkle: bright pinpoints only (nebula stays steady).
        float luma = dot(sky, vec3(0.2126, 0.7152, 0.0722));
        // Soft equirect stars peak well below 0.5 — keep the gate low.
        float starMask = smoothstep(0.06, 0.22, luma);
        // One cell ≈ one texel at 4K so neighboring screen pixels share a phase.
        vec2 cell = floor(uv * vec2(4096.0, 2048.0));
        float h = hash21(cell);
        float rate = uTwinkleHz * mix(2.8, 8.0, h);
        float wave = 0.5 + 0.5 * sin(uTime * rate + h * 6.2831853);
        // Sharp peaks (visible pulse) instead of a gentle sine dim.
        float spark = 0.12 + 0.88 * (wave * wave * wave);
        // Sparse hard blinks.
        float blink = step(0.86, fract(h * 37.17 + uTime * mix(0.55, 1.4, h)));
        spark *= mix(1.0, 0.04, blink);
        // Dim ↔ boost so the eye catches motion (not just -10% opacity).
        vec3 twinkled = sky * mix(0.08, 2.4, spark);
        sky = mix(sky, twinkled, starMask * clamp(uTwinkle, 0.0, 1.0));

        // Soft horizon: dim lower sky into floor ink — does not touch the apron.
        float elev = dir.y;
        float skyW = smoothstep(uHorizonLow, uHorizonHigh, elev);
        skyW = skyW * skyW * (3.0 - 2.0 * skyW);
        vec3 col = mix(uFloorColor, sky, skyW);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const skybox = new THREE.Mesh(
    new THREE.SphereGeometry(SKYBOX_RADIUS, 64, 48),
    material
  );
  skybox.name = "stage-night-skybox";
  skybox.position.set(0, STAGE_FLOOR_Y, 0);
  skybox.renderOrder = -100;
  skybox.frustumCulled = false;
  parent.add(skybox);

  scene.background = null;

  return {
    skybox,
    equirect,
    uniforms,
    /** @param {number} time seconds */
    setTime(time) {
      uniforms.uTime.value = time;
    },
    dispose() {
      parent.remove(skybox);
      skybox.geometry?.dispose?.();
      skybox.material?.dispose?.();
      equirect.dispose?.();
    }
  };
}
