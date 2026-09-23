/**
 * Bust-stop lantern — warm fire glow (not neon scroll).
 * Runtime: `public/assets/models/lantern/runtime/lantern.glb`
 * (from `masters/Lantern/lantern.glb` via `scripts/rebuild-lantern-runtime.mjs`).
 */

import * as THREE from "three";
import { createGltfLoader } from "../loaders/createGltfLoader.js";

/** Planted height of the Bust lantern (meters). */
export const BUST_LANTERN_HEIGHT_M = 2.48;
export const BUST_LANTERN_URL = "/assets/models/lantern/runtime/lantern.glb";

/** Warm candle / oil-lamp palette (sRGB hex). */
export const LANTERN_WARM = Object.freeze({
  /** Key PointLight + floor pool. */
  light: 0xffa45a,
  /** Deep ember in the flame base. */
  ember: 0xb82e0a,
  /** Mid flame body. */
  flame: 0xff6a1a,
  /** Soft hot core. */
  core: 0xffd080,
  /** Glass wash. */
  glass: 0xffb56a
});

/** Soft scene fill from the lantern (PointLight knobs). */
export const LANTERN_LIGHT = Object.freeze({
  /** Candela — hot enough to read as key on bust/lawn under ACES (not ambient fill). */
  maxIntensity: 110,
  distance: 9.0,
  decay: 1.75,
  /** Local Y of the flame / light origin (fraction of planted height). */
  flameFrac: 0.52
});

/**
 * @param {{
 *   neonTubeXZ?: [number, number],
 *   lanternHeight?: number,
 *   lanternUrl?: string,
 *   loadingManager?: import("three").LoadingManager | null
 * }} def
 * @returns {THREE.Group}
 */
export function makeNeonLantern(def) {
  const height = def.lanternHeight ?? BUST_LANTERN_HEIGHT_M;
  const xz = def.neonTubeXZ ?? [2.2, 0.85];
  const url = def.lanternUrl ?? BUST_LANTERN_URL;
  const flameY = height * LANTERN_LIGHT.flameFrac;

  const root = new THREE.Group();
  root.name = "neon-tube";
  root.userData.neonProp = "lantern";
  root.userData.tubeLength = height;
  root.userData.seatOrigin = "bottom";
  root.userData.flameLocalY = flameY;
  root.userData.lanternLight = { ...LANTERN_LIGHT };
  root.userData.lanternWarm = new THREE.Color(LANTERN_WARM.light);
  root.position.set(xz[0], 0, xz[1]);

  const fire = buildFireRig(height, flameY);
  root.add(fire.root);
  root.userData.fireRig = fire;

  // NeonSystem still reads `.material` for arrive level; flame shader owns visuals.
  Object.defineProperty(root, "material", {
    get: () => fire.mat,
    set: () => {},
    configurable: true
  });
  root.userData.neonCoreMat = fire.mat;
  root.userData.neonDriveMats = [fire.mat];
  root.userData.neonGlassMats = [];

  /**
   * Per-frame fire + returns intensity flicker multiplier for the PointLight.
   * @param {number} timeSec
   * @param {number} displayLevel 0–1
   * @param {boolean} reducedMotion
   * @param {import("three").Camera | null} [camera]
   * @returns {number} flicker mul ≈ 0.85–1.1
   */
  root.userData.tickLantern = (
    timeSec,
    displayLevel,
    reducedMotion,
    _camera = null
  ) => {
    const lvl = Math.max(0, displayLevel);
    // No visible flame mesh — glow only (soft core behind frosted glass).
    fire.mat.uniforms.uLevel.value = 0;
    fire.flame.visible = false;

    let flicker = 1;
    if (!reducedMotion && lvl > 1e-3) {
      const t = timeSec;
      flicker =
        0.92 +
        0.045 * Math.sin(t * 6.1) +
        0.035 * Math.sin(t * 11.7 + 1.1) +
        0.025 * Math.sin(t * 19.3 + 0.7) +
        0.02 * Math.sin(t * 3.4 + 2.2) * Math.sin(t * 7.9);
      flicker = THREE.MathUtils.clamp(flicker, 0.84, 1.1);
    }

    // Soft chamber glow only — reads through frosted panes, not as fake fire.
    fire.core.material.opacity = 0.35 * lvl * flicker;
    fire.halo.material.opacity = 0.18 * lvl * flicker;
    if (!reducedMotion && lvl > 1e-3) {
      const breathe = 0.94 + 0.06 * flicker;
      fire.core.scale.setScalar(breathe);
      fire.halo.scale.setScalar(0.96 + 0.07 * flicker);
    } else {
      fire.core.scale.setScalar(1);
      fire.halo.scale.setScalar(1);
    }

    const glassMats = root.userData.neonGlassMats;
    if (Array.isArray(glassMats)) {
      for (const gm of glassMats) {
        if (!gm || !("emissiveIntensity" in gm)) continue;
        gm.emissiveIntensity = lvl * flicker * 1.0;
      }
    }

    return flicker;
  };

  const loader = createGltfLoader(def.loadingManager ?? undefined);
  loader.load(
    url,
    (gltf) => {
      const model = gltf.scene;
      model.name = "neon-lantern-model";
      fitLanternModel(model, height);
      model.traverse((obj) => {
        if (!obj.isMesh) return;
        // Light lives inside the cage — body must NOT cast into the PointLight
        // shadow map or it occludes the whole stop (reads as ambient fill only).
        obj.castShadow = false;
        obj.receiveShadow = true;
        obj.frustumCulled = false;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          const n = String(m.name || obj.name || "").toLowerCase();
          if (n.includes("glass")) {
            // Semi-opaque frosted panes — warm wash, chamber mostly hidden.
            m.color = new THREE.Color(0xffe0b8);
            m.emissive = new THREE.Color(LANTERN_WARM.glass);
            m.emissiveIntensity = 0;
            m.transparent = true;
            m.opacity = 0.72;
            m.depthWrite = true;
            m.roughness = 0.88;
            m.metalness = 0.02;
            m.envMapIntensity = 0.2;
            if ("transmission" in m) m.transmission = 0;
            if ("thickness" in m) m.thickness = 0;
            if ("clearcoat" in m) m.clearcoat = 0;
            m.toneMapped = true;
            m.side = THREE.DoubleSide;
            root.userData.neonGlassMats.push(m);
          } else {
            if ("metalness" in m) m.metalness = Math.min(m.metalness ?? 0.4, 0.55);
            if ("roughness" in m) m.roughness = Math.max(m.roughness ?? 0.5, 0.55);
            if ("envMapIntensity" in m) m.envMapIntensity = 0.4;
            fire.mat.userData.neonBodyMat = m;
          }
          m.needsUpdate = true;
        }
      });
      root.add(model);
      fire.root.renderOrder = 3;
      root.userData.lanternReady = true;
    },
    undefined,
    (err) => {
      console.warn("[makeNeonLantern] Failed to load lantern GLB.", err);
    }
  );

  return root;
}

/**
 * Soft oil-lamp fire: billboard flame + ember core + halo.
 * Sized relative to planted lantern height.
 * @param {number} height
 * @param {number} flameY
 */
function buildFireRig(height, flameY) {
  const scale = height / 3.1;
  const mat = makeFireMaterial();

  const root = new THREE.Group();
  root.name = "neon-lantern-fire";
  root.position.y = flameY;

  const flameH = 0.28 * scale;
  const flameW = 0.14 * scale;
  const geo = new THREE.PlaneGeometry(flameW, flameH, 1, 12);
  geo.translate(0, flameH * 0.38, 0);

  const billboard = new THREE.Group();
  billboard.name = "lantern-flame-billboard";
  root.add(billboard);

  const flame = new THREE.Mesh(geo, mat);
  flame.name = "lantern-flame";
  flame.visible = false; // procedural flame looks fake — frosted glass + glow instead
  flame.castShadow = false;
  flame.receiveShadow = false;
  flame.renderOrder = 5;
  flame.frustumCulled = false;
  billboard.add(flame);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.038 * scale, 14, 12),
    new THREE.MeshBasicMaterial({
      color: LANTERN_WARM.core,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    })
  );
  core.name = "lantern-ember-core";
  core.position.y = 0.02 * scale;
  core.castShadow = false;
  core.receiveShadow = false;
  core.renderOrder = 4;
  root.add(core);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.11 * scale, 16, 12),
    new THREE.MeshBasicMaterial({
      color: LANTERN_WARM.flame,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    })
  );
  halo.name = "lantern-flame-halo";
  halo.position.y = 0.05 * scale;
  halo.castShadow = false;
  halo.receiveShadow = false;
  halo.renderOrder = 3;
  root.add(halo);

  return { root, mat, billboard, flame, core, halo };
}

/**
 * Soft teardrop candle flame — SDF silhouette + rising fbm, not hard-edged cards.
 */
function makeFireMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLevel: { value: 0 },
      uTime: { value: 0 },
      uFlicker: { value: 1 },
      uEmber: { value: new THREE.Color(LANTERN_WARM.ember) },
      uFlame: { value: new THREE.Color(LANTERN_WARM.flame) },
      uCore: { value: new THREE.Color(LANTERN_WARM.core) }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uLevel;
      uniform float uTime;
      uniform float uFlicker;
      uniform vec3 uEmber;
      uniform vec3 uFlame;
      uniform vec3 uCore;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.05 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        if (uLevel < 1e-4) discard;

        vec2 uv = vUv;
        // Centered coords: x ∈ [-1,1], y ∈ [0,1]
        float x = (uv.x - 0.5) * 2.0;
        float y = uv.y;

        // Rising turbulence — soft, not glittery.
        float rise = uTime * 1.35;
        float n = fbm(vec2(x * 1.8 + 0.15 * sin(uTime * 2.4), y * 2.6 - rise));
        float n2 = fbm(vec2(x * 3.4 - uTime * 0.4, y * 4.0 - rise * 1.6));
        float turb = (n * 0.7 + n2 * 0.3) * 2.0 - 1.0;

        // Classic candle teardrop: wide base, sharp tip, soft edges.
        float tip = pow(clamp(y, 0.0, 1.0), 1.15);
        float halfW = mix(0.55, 0.06, tip) * (0.92 + 0.1 * uFlicker);
        // Lateral wobble grows toward tip.
        float wobble = turb * mix(0.04, 0.22, tip);
        float d = abs(x - wobble) / max(halfW, 1e-3);

        float body = 1.0 - smoothstep(0.35, 1.05, d);
        // Soft foot (wick / ember seat) and soft tip fade.
        body *= smoothstep(-0.02, 0.12, y);
        body *= 1.0 - smoothstep(0.72, 1.02, y + turb * 0.08);
        // Hollow the very tip so it feathers instead of a hard point.
        body *= 1.0 - 0.35 * smoothstep(0.78, 1.0, y);

        float coreMask = (1.0 - smoothstep(0.0, 0.55, d)) * (1.0 - smoothstep(0.15, 0.7, y));
        float midMask = body * (1.0 - tip * 0.55);

        vec3 col = mix(uEmber, uFlame, clamp(y * 1.1 + turb * 0.08, 0.0, 1.0));
        col = mix(col, uCore, coreMask * 0.85);
        // Slight tip cool-down (less white-hot neon).
        col = mix(col, uEmber * 1.1, smoothstep(0.55, 0.95, y) * 0.35);
        col *= 0.75 + 0.35 * uFlicker;

        float alpha = body * uLevel * (0.5 + 0.35 * uFlicker);
        alpha *= mix(1.0, 0.55, tip); // tip more translucent
        if (alpha < 0.015) discard;

        // Soft bloom contribution without blowing to white.
        float boost = 1.0 + 0.45 * coreMask + 0.2 * midMask;
        gl_FragColor = vec4(col * boost, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

/**
 * Scale + shift so the lantern stands height-tall with foot on local Y=0.
 * @param {THREE.Object3D} model
 * @param {number} targetHeight
 */
function fitLanternModel(model, targetHeight) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const spanY = Math.max(size.y, 1e-3);
  const s = targetHeight / spanY;
  model.scale.setScalar(s);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
}
