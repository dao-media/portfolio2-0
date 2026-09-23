/**
 * Per-vignette VideoTexture fog — scene-anchored, native aspect, edge-masked.
 *
 * - Seated on each vignette XZ (pulled toward ring exterior), billboard yaw to camera.
 * - Bottom of every sheet locked near the apron; height capped (HEIGHT_MAX) so
 *   window-wide width does not build a canopy wall.
 * - Deeper layers sit further along −look and scale UP in width (height capped).
 * - Front layers thinner opacity; UV edge + bottom feather kill hard borders.
 * - Arrive travel: layers grow + fade in staggered (back leads); front bottom
 *   sits slightly below mid/back (VIDEO_FOG_FRONT_Y).
 * - Soft-contact off — ground-fog luma is coplanar with the apron.
 */
import * as THREE from "three";
import { NEON_FOG_LAYER } from "../stage/constants.js";
import {
  VIDEO_FOG_SRC,
  VIDEO_FOG_ASPECT,
  VIDEO_FOG_SIZE_X,
  VIDEO_FOG_FRONT_WIDTH_OVERSCAN,
  VIDEO_FOG_HEIGHT_MAX,
  VIDEO_FOG_Y,
  VIDEO_FOG_SOFT_DISTANCE,
  VIDEO_FOG_PULL,
  VIDEO_FOG_OPACITY,
  VIDEO_FOG_LAYER_COUNT,
  VIDEO_FOG_LAYER_DEPTH,
  VIDEO_FOG_LAYER_SCALE_GROWTH,
  VIDEO_FOG_LAYER_OPACITY_FALLOFF,
  VIDEO_FOG_EDGE_FEATHER,
  VIDEO_FOG_BOTTOM_FEATHER,
  VIDEO_FOG_FRONT_Y,
  VIDEO_FOG_ARRIVE_STAGGER,
  VIDEO_FOG_ARRIVE_EASE,
  VIDEO_FOG_ARRIVE_SCALE_MIN,
  VIDEO_FOG_TINT,
  VIDEO_FOG_NEON_RADIUS,
  VIDEO_FOG_NEON_FEATHER,
  VIDEO_FOG_NEON_MIN,
  VIDEO_FOG_NEON_MAX,
  VIDEO_FOG_NEON_COLOR_MIX
} from "./videoFogConfig.js";

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Slow early / soft finish — gradual appear while traveling into rest. */
function easeInOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Sheet height from width — cap so banks stay a low apron, not a canopy wall. */
function sheetHeight(width, aspect = VIDEO_FOG_ASPECT) {
  const native = width / Math.max(1e-6, aspect);
  return Math.min(native, VIDEO_FOG_HEIGHT_MAX);
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vViewZ;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vec4 mv = viewMatrix * world;
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uSoftDistance;
uniform float uOpacity;
uniform float uDepthPacked;
uniform float uEnabled;
uniform float uEdgeFeather;
uniform float uBottomFeather;
uniform vec3 uTint;
uniform vec3 uNeonWorld;
uniform vec3 uNeonColor;
uniform float uNeonRadius;
uniform float uNeonFeather;
uniform float uNeonMin;
uniform float uNeonMax;
uniform float uNeonArrive;
uniform float uNeonColorMix;

varying vec2 vUv;
varying float vViewZ;
varying vec3 vWorldPos;

float readWindowDepth(vec2 uv) {
  float raw = texture2D(tDepth, uv).x;
  return uDepthPacked > 0.5 ? (1.0 - raw) : raw;
}

float perspectiveDepthToViewZ(const in float invClipZ, const in float near, const in float far) {
  return (near * far) / ((far - near) * invClipZ - far);
}

float smoother01(float t) {
  float x = clamp(t, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

float edgeMask(vec2 uv, float feather) {
  float f = clamp(feather, 1e-4, 0.49);
  float ex0 = smoother01(uv.x / f);
  float ex1 = smoother01((1.0 - uv.x) / f);
  float ey0 = smoother01(uv.y / f);
  float ey1 = smoother01((1.0 - uv.y) / f);
  return ex0 * ex1 * ey0 * ey1;
}

/**
 * Soften the sheet floor (v=0). Ground-fog luma piles up here — a linear
 * smoother still leaves an additive "shelf", so pow kills the apron faster.
 */
float bottomFade(vec2 uv, float feather) {
  float f = clamp(feather, 1e-4, 0.95);
  float t = smoother01(uv.y / f);
  return t * t;
}

/** 0 far → 1 in the neon core (world XZ). */
float neonProxT(vec3 worldPos) {
  float d = length(worldPos.xz - uNeonWorld.xz);
  float outer = uNeonRadius + max(uNeonFeather, 1e-3);
  return smoother01(1.0 - smoothstep(uNeonRadius, outer, d));
}

void main() {
  if (uEnabled < 0.5) discard;

  vec4 texel = texture2D(tMap, vUv);
  // Density lives in RGB after encode bake. Do NOT max() with texel.a —
  // browsers that strip VP9/HEVC alpha set a=1 and that would force dens=1.
  float dens = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
  if (texel.a < 0.998) dens = min(dens, texel.a);
  // Mask rgb + alpha so AdditiveBlending (SRC_ALPHA, ONE) actually dissolves
  // the ruler-cut apron instead of leaving a bright shelf.
  float proxT = neonProxT(vWorldPos);
  float neonMul = mix(uNeonMin, uNeonMax, proxT);
  float mask = edgeMask(vUv, uEdgeFeather) * bottomFade(vUv, uBottomFeather);
  mask *= neonMul;
  float alpha = dens * uOpacity * mask;
  if (alpha < 0.01) discard;

  float soft = 1.0;
  if (uSoftDistance > 1e-5 && uResolution.x > 1.0) {
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    float windowZ = readWindowDepth(screenUv);
    float sceneViewZ = perspectiveDepthToViewZ(windowZ, uCameraNear, uCameraFar);
    float sceneEye = -sceneViewZ;
    float fragEye = -vViewZ;
    soft = smoothstep(0.0, uSoftDistance, max(sceneEye - fragEye, 0.0));
  }
  alpha *= soft;
  mask *= soft;
  if (alpha < 0.01) discard;

  // Scatter takes neon hue near the tube as arrive rises — smooth, no flicker.
  float colorW = clamp(proxT * uNeonArrive * uNeonColorMix, 0.0, 1.0);
  vec3 fogTint = mix(uTint, uNeonColor, colorW);
  vec3 col = fogTint * dens * mask;
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * @typedef {object} VideoFogPlane
 * @property {THREE.Mesh} mesh
 * @property {THREE.ShaderMaterial} material
 * @property {number} layerIndex
 * @property {number} baseOpacity
 */

export class VideoFogSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {{ vignetteCount?: number }} [opts]
   */
  constructor(scene, camera, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this._userOff = false;
    this._fade = 0;
    this._arriveLevel = 0;
    this._size = new THREE.Vector2(1, 1);
    this._tint = new THREE.Color(VIDEO_FOG_TINT);
    this._aspect = VIDEO_FOG_ASPECT;
    this._lookTarget = new THREE.Vector3();

    /** @type {HTMLVideoElement} */
    this._video = document.createElement("video");
    this._video.crossOrigin = "anonymous";
    this._video.loop = true;
    this._video.muted = true;
    this._video.playsInline = true;
    this._video.setAttribute("playsinline", "");
    this._video.setAttribute("webkit-playsinline", "");
    this._video.preload = "auto";

    const srcWebm = document.createElement("source");
    srcWebm.src = VIDEO_FOG_SRC.webm;
    srcWebm.type = 'video/webm; codecs="vp9"';
    const srcMp4 = document.createElement("source");
    srcMp4.src = VIDEO_FOG_SRC.mp4;
    srcMp4.type = 'video/mp4; codecs="hvc1"';
    this._video.appendChild(srcWebm);
    this._video.appendChild(srcMp4);

    this._texture = new THREE.VideoTexture(this._video);
    this._texture.colorSpace = THREE.SRGBColorSpace;
    this._texture.format = THREE.RGBAFormat;
    this._texture.minFilter = THREE.LinearFilter;
    this._texture.magFilter = THREE.LinearFilter;
    this._texture.generateMipmaps = false;
    // Default flipY keeps master ground-fog (lower frame) on the apron.
    this._texture.wrapS = THREE.ClampToEdgeWrapping;
    this._texture.wrapT = THREE.ClampToEdgeWrapping;
    this._texture.premultiplyAlpha = false;

    this.group = new THREE.Group();
    this.group.name = "video-fog-root";
    this.group.layers.set(NEON_FOG_LAYER);
    scene.add(this.group);

    const count = Math.max(1, opts.vignetteCount ?? 4);
    /** @type {THREE.Group[]} */
    this._stops = [];
    /** @type {VideoFogPlane[]} */
    this._planes = [];

    const geo = new THREE.PlaneGeometry(1, 1);
    const layers = Math.max(1, VIDEO_FOG_LAYER_COUNT | 0);
    const back = layers - 1;
    const growth = Math.max(1, VIDEO_FOG_LAYER_SCALE_GROWTH);

    for (let i = 0; i < count; i += 1) {
      const stop = new THREE.Group();
      stop.name = `video-fog-stop-${i}`;
      stop.layers.set(NEON_FOG_LAYER);
      this.group.add(stop);
      this._stops.push(stop);

      for (let L = 0; L < layers; L += 1) {
        const baseOpacity =
          VIDEO_FOG_OPACITY * Math.pow(VIDEO_FOG_LAYER_OPACITY_FALLOFF, back - L);
        const material = new THREE.ShaderMaterial({
          name: `VideoFogDepthFade-${i}-${L}`,
          uniforms: {
            tMap: { value: this._texture },
            tDepth: { value: null },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uCameraNear: { value: camera.near },
            uCameraFar: { value: camera.far },
            uSoftDistance: { value: VIDEO_FOG_SOFT_DISTANCE },
            uOpacity: { value: 0 },
            uDepthPacked: { value: 1 },
            uEnabled: { value: 1 },
            uEdgeFeather: { value: VIDEO_FOG_EDGE_FEATHER },
            uBottomFeather: { value: VIDEO_FOG_BOTTOM_FEATHER },
            uTint: { value: this._tint.clone() },
            uNeonWorld: { value: new THREE.Vector3() },
            uNeonColor: { value: new THREE.Color(VIDEO_FOG_TINT) },
            uNeonRadius: { value: VIDEO_FOG_NEON_RADIUS },
            uNeonFeather: { value: VIDEO_FOG_NEON_FEATHER },
            uNeonMin: { value: VIDEO_FOG_NEON_MIN },
            uNeonMax: { value: VIDEO_FOG_NEON_MAX },
            uNeonArrive: { value: 0 },
            uNeonColorMix: { value: VIDEO_FOG_NEON_COLOR_MIX }
          },
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
          blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Mesh(geo, material);
        mesh.name = `video-fog-plane-${i}-${L}`;
        mesh.frustumCulled = false;
        mesh.renderOrder = 40 + L;
        mesh.layers.set(NEON_FOG_LAYER);
        // Deeper = larger; bottom stays on VIDEO_FOG_Y. Full size stored for arrive grow.
        const scale = Math.pow(growth, L);
        const w = VIDEO_FOG_SIZE_X * scale;
        const h = sheetHeight(w, this._aspect);
        mesh.userData._fogLayer = L;
        mesh.userData._fullW = w;
        mesh.userData._fullH = h;
        mesh.scale.set(w * VIDEO_FOG_ARRIVE_SCALE_MIN, h * VIDEO_FOG_ARRIVE_SCALE_MIN, 1);
        mesh.position.set(
          0,
          this._layerBottomY(L) + h * VIDEO_FOG_ARRIVE_SCALE_MIN * 0.5,
          -L * VIDEO_FOG_LAYER_DEPTH
        );
        stop.add(mesh);
        this._planes.push({ mesh, material, layerIndex: L, baseOpacity });
      }
    }

    this._geo = geo;
    this._playPromise = null;
    this._ready = false;

    const onMeta = () => {
      const vw = this._video.videoWidth;
      const vh = this._video.videoHeight;
      if (vw > 0 && vh > 0) {
        this._aspect = vw / vh;
        this._relayoutLayers();
      }
      this._ready = true;
      this._tryPlay();
    };
    this._video.addEventListener("loadedmetadata", onMeta);
    this._video.addEventListener("loadeddata", onMeta);
    this._video.addEventListener("canplay", () => {
      this._ready = true;
      this._tryPlay();
    });
    this._video.load();
  }

  /**
   * Front-sheet world width: just wider than the viewport at this stop’s depth.
   * @param {THREE.Camera} camera
   * @param {THREE.Object3D} stop
   */
  _frontWidthForStop(camera, stop) {
    const fallback = VIDEO_FOG_SIZE_X;
    if (!camera?.isPerspectiveCamera || !stop) return fallback;
    const dx = stop.position.x - camera.position.x;
    const dz = stop.position.z - camera.position.z;
    const dist = Math.max(1.5, Math.hypot(dx, dz));
    const halfH =
      Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * dist;
    const halfW = halfH * Math.max(0.5, camera.aspect);
    const frustumW = 2 * halfW;
    // Feather eats both sides — size so the remaining core is just over window-wide.
    const core = Math.max(0.3, 1 - 2 * Math.min(0.49, VIDEO_FOG_EDGE_FEATHER));
    const overscan = Math.max(1, VIDEO_FOG_FRONT_WIDTH_OVERSCAN);
    return Math.max(fallback, (frustumW / core) * overscan);
  }

  /**
   * Write fullW/fullH for every plane on a stop from a frustum-sized front width.
   * @param {THREE.Object3D} stop
   * @param {number} frontW
   */
  _applyStopFullSize(stop, frontW) {
    const growth = Math.max(1, VIDEO_FOG_LAYER_SCALE_GROWTH);
    const aspect = Math.max(1e-6, this._aspect);
    const w0 = Math.max(VIDEO_FOG_SIZE_X, frontW);
    for (let i = 0; i < this._planes.length; i += 1) {
      const { mesh, layerIndex: L } = this._planes[i];
      if (mesh.parent !== stop) continue;
      const w = w0 * Math.pow(growth, L);
      const h = sheetHeight(w, aspect);
      mesh.userData._fullW = w;
      mesh.userData._fullH = h;
      mesh.position.z = -L * VIDEO_FOG_LAYER_DEPTH;
    }
  }

  /** Keep floor-anchored low banks after aspect / knob changes. */
  _relayoutLayers() {
    const growth = Math.max(1, VIDEO_FOG_LAYER_SCALE_GROWTH);
    const aspect = Math.max(1e-6, this._aspect);
    for (let i = 0; i < this._planes.length; i += 1) {
      const { mesh, layerIndex: L } = this._planes[i];
      const scale = Math.pow(growth, L);
      const w = VIDEO_FOG_SIZE_X * scale;
      const h = sheetHeight(w, aspect);
      mesh.userData._fullW = w;
      mesh.userData._fullH = h;
      mesh.position.z = -L * VIDEO_FOG_LAYER_DEPTH;
      const g = VIDEO_FOG_ARRIVE_SCALE_MIN;
      const bottomY = this._layerBottomY(L);
      mesh.scale.set(w * g, h * g, 1);
      mesh.position.y = bottomY + h * g * 0.5;
    }
  }

  /**
   * Per-layer arrive 0→1. Back leads; front trails. Ease pow slows the early rise.
   * @param {number} level
   * @param {number} L
   */
  _layerArriveT(level, L) {
    const layers = Math.max(1, VIDEO_FOG_LAYER_COUNT | 0);
    const back = layers - 1;
    const maxStagger = back > 0 ? 0.85 / back : 0;
    const stagger = Math.min(maxStagger, Math.max(0, VIDEO_FOG_ARRIVE_STAGGER));
    const start = (back - L) * stagger;
    const linear = smoothstep(start, 1, level);
    const ease = Math.max(1, VIDEO_FOG_ARRIVE_EASE);
    return Math.pow(linear, ease);
  }

  /**
   * Scene-fixed bottom Y per layer. Front sits just out of the rest+parallax
   * frame (VIDEO_FOG_FRONT_Y); mid/back meet the apron. Never camera-tracked.
   * @param {number} L
   */
  _layerBottomY(L) {
    return L === 0 ? VIDEO_FOG_FRONT_Y : VIDEO_FOG_Y;
  }

  /** Seat each stop on vignette XZ; pull toward ring exterior; face outward. */
  seatOnVignettes(vignettes = []) {
    const pull = Math.max(0, VIDEO_FOG_PULL);
    for (let i = 0; i < this._stops.length; i += 1) {
      const vig = vignettes[i];
      const p = vig?.group?.position;
      if (!p) continue;
      const len = Math.hypot(p.x, p.z) || 1;
      const nx = p.x / len;
      const nz = p.z / len;
      this._stops[i].position.set(p.x + nx * pull, 0, p.z + nz * pull);
      this._lookTarget.set(
        p.x + nx * (pull + 2),
        VIDEO_FOG_Y + VIDEO_FOG_SIZE_X / this._aspect * 0.5,
        p.z + nz * (pull + 2)
      );
      this._stops[i].lookAt(this._lookTarget);
    }
  }

  /**
   * Yaw only toward the camera — upright, scene XZ fixed. Do not move Y with cam.
   * @param {THREE.Camera} camera
   */
  billboardToward(camera) {
    if (!camera) return;
    for (let i = 0; i < this._stops.length; i += 1) {
      const stop = this._stops[i];
      if (!stop.visible) continue;
      // Look target at sheet mid-height in world — keeps yaw upright without pitching.
      const midY = VIDEO_FOG_Y + VIDEO_FOG_SIZE_X / this._aspect * 0.5;
      this._lookTarget.set(camera.position.x, midY, camera.position.z);
      stop.lookAt(this._lookTarget);
    }
  }

  /**
   * @param {THREE.Texture | null} depthTexture FogDepthCapture color RT
   * @param {{ packed?: boolean }} [opts]
   */
  setSceneDepth(depthTexture, opts = {}) {
    const packed = opts.packed !== false ? 1 : 0;
    for (let i = 0; i < this._planes.length; i += 1) {
      const u = this._planes[i].material.uniforms;
      u.tDepth.value = depthTexture;
      u.uDepthPacked.value = packed;
    }
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   */
  setSizeFromRenderer(renderer) {
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(1, this._size.x);
    const h = Math.max(1, this._size.y);
    for (let i = 0; i < this._planes.length; i += 1) {
      this._planes[i].material.uniforms.uResolution.value.set(w, h);
    }
  }

  /**
   * @param {{
   *   level?: number,
   *   activeIndex?: number,
   *   neonWorld?: THREE.Vector3 | null,
   *   neonColor?: THREE.Color | null
   * }} opts
   */
  setVignetteFog(opts = {}) {
    const level = Math.min(1, Math.max(0, opts.level ?? 0));
    this._arriveLevel = level;
    const active = opts.activeIndex ?? 0;
    const neon = opts.neonWorld ?? null;
    const neonColor = opts.neonColor ?? null;
    for (let i = 0; i < this._stops.length; i += 1) {
      const on = i === active;
      this._stops[i].visible = on;
      this._stops[i].userData._fogLevel = on ? level : 0;
      if (on && neon) {
        const stored =
          this._stops[i].userData._neonWorld ??
          (this._stops[i].userData._neonWorld = new THREE.Vector3());
        stored.copy(neon);
        stored.y = 0;
      }
      if (on && neonColor) {
        const storedC =
          this._stops[i].userData._neonColor ??
          (this._stops[i].userData._neonColor = new THREE.Color());
        storedC.copy(neonColor);
      }
    }
  }

  /** @param {number} fade */
  setCompositeFade(fade) {
    this._fade = Math.min(1, Math.max(0, fade));
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    this.group.visible = this.enabled && !this._userOff;
    for (let i = 0; i < this._planes.length; i += 1) {
      this._planes[i].material.uniforms.uEnabled.value = this.group.visible
        ? 1
        : 0;
    }
    if (this.group.visible) this._tryPlay();
    else this._video.pause();
  }

  setUserOff(off) {
    this._userOff = Boolean(off);
    this.setEnabled(this.enabled);
  }

  _tryPlay() {
    if (this._userOff || !this.enabled) return;
    if (!this._video.paused && this._ready) return;
    this._playPromise = this._video.play().then(
      () => {
        this._ready = true;
      },
      () => {
        /* muted autoplay usually OK; retry on next enable */
      }
    );
  }

  /**
   * @param {number} [_dt]
   * @param {{ camera?: THREE.Camera }} [opts]
   */
  update(_dt = 0, opts = {}) {
    if (!this.enabled || this._userOff) return;

    const cam = opts.camera ?? this.camera;
    if (cam) this.billboardToward(cam);

    const near = this.camera.near;
    const far = this.camera.far;
    const global = this._fade;
    const scaleMin = Math.min(1, Math.max(0.02, VIDEO_FOG_ARRIVE_SCALE_MIN));

    // Size each visible stop so the front sheet is just wider than the window.
    for (let s = 0; s < this._stops.length; s += 1) {
      const stop = this._stops[s];
      if (!stop.visible) continue;
      this._applyStopFullSize(stop, this._frontWidthForStop(cam, stop));
    }

    for (let i = 0; i < this._planes.length; i += 1) {
      const { mesh, material, baseOpacity, layerIndex: L } = this._planes[i];
      const stop = mesh.parent;
      const level = stop?.userData?._fogLevel ?? 0;
      const layerT = this._layerArriveT(level, L);
      const grow = easeInOutCubic(layerT);
      const fullW = mesh.userData._fullW ?? VIDEO_FOG_SIZE_X;
      const fullH = mesh.userData._fullH ?? fullW / this._aspect;
      const sc = scaleMin + (1 - scaleMin) * grow;
      mesh.scale.set(fullW * sc, fullH * sc, 1);
      const bottomY = this._layerBottomY(L);
      mesh.position.y = bottomY + fullH * sc * 0.5;
      mesh.userData._bottomY = bottomY;

      material.uniforms.uCameraNear.value = near;
      material.uniforms.uCameraFar.value = far;
      material.uniforms.uEdgeFeather.value = VIDEO_FOG_EDGE_FEATHER;
      material.uniforms.uBottomFeather.value = VIDEO_FOG_BOTTOM_FEATHER;
      material.uniforms.uNeonRadius.value = VIDEO_FOG_NEON_RADIUS;
      material.uniforms.uNeonFeather.value = VIDEO_FOG_NEON_FEATHER;
      material.uniforms.uNeonMin.value = VIDEO_FOG_NEON_MIN;
      material.uniforms.uNeonMax.value = VIDEO_FOG_NEON_MAX;
      material.uniforms.uNeonColorMix.value = VIDEO_FOG_NEON_COLOR_MIX;
      material.uniforms.uNeonArrive.value = level;
      const neonWorld = stop?.userData?._neonWorld;
      if (neonWorld) material.uniforms.uNeonWorld.value.copy(neonWorld);
      const neonColor = stop?.userData?._neonColor;
      if (neonColor) material.uniforms.uNeonColor.value.copy(neonColor);
      material.uniforms.uOpacity.value =
        baseOpacity * global * Math.max(layerT, 0);
      mesh.visible = material.uniforms.uOpacity.value > 0.008;
    }

    if (this._texture && this._video.readyState >= 2) {
      this._texture.needsUpdate = true;
    }
    if (this._video.paused && this._fade > 0.05) this._tryPlay();
  }

  debug() {
    const stop0 = this._stops[0];
    const scales = this._planes
      .filter((p) => p.mesh.parent === stop0)
      .map((p) => [p.layerIndex, p.mesh.scale.x, p.mesh.scale.y]);
    return {
      enabled: this.enabled,
      userOff: this._userOff,
      fade: this._fade,
      arriveLevel: this._arriveLevel,
      ready: this._ready,
      videoPaused: this._video.paused,
      readyState: this._video.readyState,
      currentTime: this._video.currentTime,
      videoWidth: this._video.videoWidth,
      videoHeight: this._video.videoHeight,
      aspect: this._aspect,
      currentSrc: this._video.currentSrc || null,
      stops: this._stops.length,
      planes: this._planes.length,
      layerOpacities: this._planes
        .filter((p) => p.mesh.parent === stop0)
        .map((p) => p.baseOpacity),
      layerScales: scales,
      softDistance: VIDEO_FOG_SOFT_DISTANCE,
      edgeFeather: VIDEO_FOG_EDGE_FEATHER,
      bottomFeather: VIDEO_FOG_BOTTOM_FEATHER,
      neonRadius: VIDEO_FOG_NEON_RADIUS,
      neonFeather: VIDEO_FOG_NEON_FEATHER,
      neonMin: VIDEO_FOG_NEON_MIN,
      neonMax: VIDEO_FOG_NEON_MAX,
      neonColorMix: VIDEO_FOG_NEON_COLOR_MIX,
      scaleGrowth: VIDEO_FOG_LAYER_SCALE_GROWTH,
      arriveStagger: VIDEO_FOG_ARRIVE_STAGGER,
      arriveEase: VIDEO_FOG_ARRIVE_EASE,
      arriveScaleMin: VIDEO_FOG_ARRIVE_SCALE_MIN,
      frontY: VIDEO_FOG_FRONT_Y,
      heightMax: VIDEO_FOG_HEIGHT_MAX,
      layerDepth: VIDEO_FOG_LAYER_DEPTH,
      pull: VIDEO_FOG_PULL,
      stop0: stop0?.position?.toArray?.() ?? null,
      sizeX: VIDEO_FOG_SIZE_X,
      frontOverscan: VIDEO_FOG_FRONT_WIDTH_OVERSCAN,
      opacity: VIDEO_FOG_OPACITY,
      falloff: VIDEO_FOG_LAYER_OPACITY_FALLOFF,
      blending: "additive",
      depthTest: false,
      anchor: "scene-vignette",
      src: { ...VIDEO_FOG_SRC }
    };
  }

  dispose() {
    this._video.pause();
    while (this._video.firstChild) this._video.removeChild(this._video.firstChild);
    this._video.load();
    this._texture.dispose();
    this._geo.dispose();
    for (let i = 0; i < this._planes.length; i += 1) {
      this._planes[i].material.dispose();
    }
    this.scene.remove(this.group);
  }
}
