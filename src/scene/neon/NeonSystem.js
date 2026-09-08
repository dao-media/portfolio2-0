import * as THREE from "three";
import {
  FOG_ATLAS,
  NEON_FOG,
  NEON_FOG_LAYER,
  NEON_LIGHT_DECAY,
  NEON_LIGHT_DISTANCE,
  NEON_LIGHT_FALLOFF,
  NEON_LIGHT_HEIGHT,
  NEON_MAX_EMISSIVE,
  NEON_MAX_LIGHT,
  vignetteAngle
} from "../stage/constants.js";
import { createFogRing } from "./createFogRing.js";
import { FogDepthCapture } from "./FogDepthCapture.js";
import { FogDebugOverlay } from "./FogDebugOverlay.js";
import { makeNeonTube } from "./makeNeonTube.js";

const _TUBE_WORLD = new THREE.Vector3();
const _HAZE_LOOK = new THREE.Vector3();
const _DRAW_SIZE = new THREE.Vector2();

const HAZE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function makeHazeFragment() {
  const { N, TILE, COLS, ROWS } = FOG_ATLAS;
  return /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorld;
    uniform sampler2D uFogAtlas;
    uniform float uTime, uSpeed, uOpacity, uAlpha;
    uniform vec2 uAtlasOffset;
    uniform vec3 uColor;
    const float N = ${N}.0;
    const float COLS = ${COLS}.0;
    const float ROWS = ${ROWS}.0;
    const float TILE = ${TILE}.0;
    const float FOOT = ${NEON_FOG.footprint}.0;

    vec2 cellUV(vec2 uv, float idx) {
      float col = mod(idx, COLS);
      float row = floor(idx / COLS);
      vec2 inset = clamp(uv, 0.0, 1.0) * (1.0 - 2.0 / TILE) + (1.0 / TILE);
      return (vec2(col, row) + inset) / vec2(COLS, ROWS);
    }

    void main() {
      vec2 uv = (vWorld.xz + FOOT * 0.5) / FOOT + uAtlasOffset;
      float t  = fract(uTime * uSpeed * 0.1) * N;
      float i0 = floor(t);
      float i1 = mod(i0 + 1.0, N);
      float b  = fract(t);
      float n  = mix(
        texture2D(uFogAtlas, cellUV(uv, i0)).r,
        texture2D(uFogAtlas, cellUV(uv, i1)).r,
        b
      );
      float topFade = 1.0 - smoothstep(0.12, 1.0, vUv.y);
      float a = n * topFade * uAlpha * uOpacity;
      gl_FragColor = vec4(uColor, a);
    }
  `;
}

function atlasUniform(fogMaterial) {
  const uniforms = fogMaterial?.uniforms;
  if (!uniforms) return null;
  for (const key of Object.keys(uniforms)) {
    if (/atlas/i.test(key)) return uniforms[key];
  }
  return null;
}

/**
 * Four static per-stop lights, one shared fog ring, Y-billboard haze.
 * Intensity follows camera theta. Tubes stay put.
 */
export class NeonSystem {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   camera: THREE.Camera,
   *   fogMaterial: THREE.Material,
   *   reducedMotion?: boolean,
   *   isCoarse?: boolean
   * }} opts
   */
  constructor({ scene, camera, fogMaterial, reducedMotion = false, isCoarse = false }) {
    this.scene = scene;
    this.camera = camera;
    this.fogMaterial = fogMaterial;
    this.reducedMotion = reducedMotion;
    this.isCoarse = isCoarse;
    this.entries = [];
    this.stopLights = [];
    this.hazeCards = [];

    /** Live tune — defaults from constants; `__stage.setNeon` mutates these. */
    this._lightHeight = NEON_LIGHT_HEIGHT;
    this._maxLight = NEON_MAX_LIGHT;

    this.fogRing = createFogRing(fogMaterial);
    scene.add(this.fogRing);
    camera.layers.enable(NEON_FOG_LAYER);

    /** Opaque depth pre-pass for fog soft fade (not a second composer). */
    this.depthCapture = new FogDepthCapture();
    const depthU = fogMaterial?.uniforms;
    if (depthU?.uSceneDepth) {
      depthU.uSceneDepth.value = this.depthCapture.depthTexture;
    }
    if (depthU?.uSoftFade) {
      depthU.uSoftFade.value = NEON_FOG.softFade;
    }

    /** DEV depth / soft-term quads. Off until debugFogVis(). */
    this.debugOverlay = new FogDebugOverlay(camera, this.depthCapture.depthTexture);
  }

  /**
   * Depth-only layer-0 pass → fog `uSceneDepth`. Call once per frame before
   * the beauty composer so soft fade matches this camera pose.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  /**
   * Compile MeshDepthMaterial programs for GPU_HOLD_LAYER roots into the
   * offscreen depth target — not the live beauty frame.
   */
  compileHeldFogDepth(renderer, scene, camera) {
    if (!this.depthCapture) return;
    this.depthCapture.render(renderer, scene, camera, [], { includeHoldLayer: true });
  }

  captureFogDepth(renderer, scene, camera) {
    if (!this.depthCapture || !this.fogMaterial?.uniforms) return;

    // Include neon tubes — with soft fade they feather instead of punching holes.
    this.depthCapture.render(renderer, scene, camera, []);

    const u = this.fogMaterial.uniforms;
    renderer.getDrawingBufferSize(_DRAW_SIZE);
    if (u.uResolution?.value) u.uResolution.value.copy(_DRAW_SIZE);
    if (u.uCameraNear) u.uCameraNear.value = camera.near;
    if (u.uCameraFar) u.uCameraFar.value = camera.far;
    if (u.uSceneDepth) u.uSceneDepth.value = this.depthCapture.depthTexture;
    // uSoftFade is authored in constants / material init — do not stomp every frame.
    this.debugOverlay?.sync(
      camera,
      camera.near,
      camera.far,
      u.uSoftFade?.value ?? NEON_FOG.softFade
    );
  }

  /** Keep the depth target matched to the drawing buffer on resize. */
  setSize(renderer) {
    this.depthCapture?.setSizeFromRenderer(renderer);
  }

  /**
   * @param {{ def: { neonColors?: string[], name?: string, tubeLength?: number }, group: THREE.Group, tube?: THREE.Mesh }} vignette
   */
  attach(vignette) {
    const tube = makeNeonTube(vignette.def);
    vignette.group.add(tube);
    this._seatTubeOnFloor(tube, vignette.group);
    vignette.group.updateMatrixWorld(true);
    tube.getWorldPosition(_TUBE_WORLD);

    const dominant = new THREE.Color(vignette.def.neonColors?.[0] ?? "#00e5ff");
    const light = new THREE.PointLight(dominant, 0, NEON_LIGHT_DISTANCE, NEON_LIGHT_DECAY);
    light.name = `neon-stop-light-${this.entries.length}`;
    light.castShadow = false;
    light.layers.enable(0);
    light.layers.enable(NEON_FOG_LAYER);
    light.position.set(_TUBE_WORLD.x, this._lightHeight, _TUBE_WORLD.z);
    this.scene.add(light);

    const theta = Math.atan2(vignette.group.position.x, vignette.group.position.z);
    vignette.tube = tube;
    this.entries.push({ vignette, tube, dominant, theta });
    this.stopLights.push({ light, theta });
  }

  /**
   * Keep every tube's world-space bottom on Y=0 after vignette floor snaps
   * (Desktop drops group.y; Travel lifts it). Length/XZ offset stay identical.
   */
  seatTubesOnFloor() {
    for (let i = 0; i < this.entries.length; i += 1) {
      const { vignette, tube } = this.entries[i];
      this._seatTubeOnFloor(tube, vignette.group);
      vignette.group.updateMatrixWorld(true);
      tube.getWorldPosition(_TUBE_WORLD);
      const entry = this.stopLights[i];
      if (entry?.light) {
        entry.light.position.set(_TUBE_WORLD.x, this._lightHeight, _TUBE_WORLD.z);
      }
    }
  }

  /**
   * @param {THREE.Mesh} tube
   * @param {THREE.Object3D} group
   */
  _seatTubeOnFloor(tube, group) {
    const length = tube.userData.tubeLength ?? 4;
    // group.position.y is the vignette's world Y (ring place + floor snap).
    tube.position.y = length * 0.5 - group.position.y;
  }

  /** Build haze after every stop has attached. */
  finishMount() {
    this._buildHaze();
  }

  /**
   * @param {number} theta Camera orbit angle
   * @param {number} _total Stop count
   * @param {number} [time] Elapsed seconds
   */
  update(theta, _total, time = 0) {
    const n = this.entries.length;
    if (!n) return;

    const t = this.reducedMotion ? 0 : time;
    const uniforms = this.fogMaterial?.uniforms;
    if (uniforms?.uTime) uniforms.uTime.value = t;
    const drift = uniforms?.uWorldDrift;
    if (drift?.value) {
      const amp = this.reducedMotion ? 0 : NEON_FOG.driftAmp;
      drift.value.set(Math.sin(t * 0.15) * amp, Math.cos(t * 0.11) * amp);
    }

    for (let i = 0; i < n; i += 1) {
      const prox = neonProximity(theta, this.entries[i].theta);
      this.entries[i].tube.material.emissiveIntensity =
        (0.28 + 0.72 * prox) * NEON_MAX_EMISSIVE;
      this.stopLights[i].light.intensity = prox * this._maxLight;
    }

    this._updateHaze(theta, t, atlasUniform(this.fogMaterial)?.value ?? null);
  }

  /**
   * TEMP tuning probe — hot-update all 4 neon PointLights.
   * Prefer raising `height` before lowering `maxLight` (slab peak vs fog spread).
   * Remove once a pair is baked into constants.js.
   * @param {{ height?: number, maxLight?: number }} opts
   */
  setNeon({ height, maxLight } = {}) {
    if (typeof height === "number" && Number.isFinite(height)) {
      this._lightHeight = Math.max(0.05, height);
      for (const { light } of this.stopLights) {
        light.position.y = this._lightHeight;
      }
    }
    if (typeof maxLight === "number" && Number.isFinite(maxLight)) {
      this._maxLight = Math.max(0, maxLight);
    }
    return this.debugState();
  }

  /**
   * Show FogDepthCapture on a camera-parented debug quad (same beauty pass).
   * `depth` = packed `.r` (nearer = brighter). `soft` = contact ramp (red=0, green=1).
   * @param {"off"|"depth"|"soft"|"both"} [mode]
   */
  debugFogVis(mode = "both") {
    return this.debugOverlay?.setMode(mode) ?? "off";
  }

  /**
   * Isolate the "second fog layer" report. Floor is MeshStandard (no reflection
   * pass) — hiding it removes neon-stained floor. Feather is the radial band.
   * @param {{ floor?: boolean, feather?: number, fog?: boolean }} opts
   */
  debugFogIsolate({ floor, feather, fog } = {}) {
    if (typeof floor === "boolean" && this._stageFloor) {
      this._stageFloor.visible = floor;
    }
    const u = this.fogMaterial?.uniforms;
    if (typeof feather === "number" && u?.uFeather) {
      u.uFeather.value = Math.max(0, feather);
    }
    if (typeof fog === "boolean" && this.fogRing) {
      this.fogRing.visible = fog;
    }
    return {
      floorVisible: this._stageFloor?.visible ?? null,
      feather: u?.uFeather?.value ?? null,
      fogVisible: this.fogRing?.visible ?? null
    };
  }

  /** Bind the stage floor so isolate() can hide neon floor stain. */
  setStageFloor(floor) {
    this._stageFloor = floor;
  }

  /**
   * Capture stats for the depth RT: size vs drawing buffer, nearest filter,
   * live camera near/far, and a few packed-depth samples.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  debugFogCapture(renderer, scene, camera) {
    this.captureFogDepth(renderer, scene, camera);
    const rt = this.depthCapture?.target;
    const draw = renderer.getDrawingBufferSize(new THREE.Vector2());
    const u = this.fogMaterial?.uniforms;
    const samples = [];
    if (rt) {
      const pts = [
        [0.5, 0.5],
        [0.5, 0.22],
        [0.5, 0.72],
        [0.2, 0.4],
        [0.8, 0.4]
      ];
      const pixel = new Uint8Array(4);
      for (const [nx, ny] of pts) {
        const x = Math.min(rt.width - 1, Math.max(0, Math.floor(nx * rt.width)));
        const y = Math.min(rt.height - 1, Math.max(0, Math.floor(ny * rt.height)));
        renderer.readRenderTargetPixels(rt, x, y, 1, 1, pixel);
        const packed = pixel[0] / 255;
        const sceneDepth = 1 - packed;
        const near = camera.near;
        const far = camera.far;
        const sceneViewZ = (near * far) / ((far - near) * sceneDepth - far);
        samples.push({
          nx,
          ny,
          rgba: [pixel[0], pixel[1], pixel[2], pixel[3]],
          packed,
          sceneDepth,
          sceneViewZ: Number(sceneViewZ.toFixed(3))
        });
      }
    }
    return {
      rt: rt
        ? {
            width: rt.width,
            height: rt.height,
            minFilter: rt.texture.minFilter,
            magFilter: rt.texture.magFilter,
            generateMipmaps: rt.texture.generateMipmaps,
            type: rt.texture.type,
            colorSpace: rt.texture.colorSpace
          }
        : null,
      drawingBuffer: { width: draw.x, height: draw.y },
      sizeMatch: Boolean(rt && rt.width === draw.x && rt.height === draw.y),
      nearest: Boolean(
        rt &&
          rt.texture.minFilter === THREE.NearestFilter &&
          rt.texture.magFilter === THREE.NearestFilter
      ),
      camera: { near: camera.near, far: camera.far },
      uniforms: {
        near: u?.uCameraNear?.value ?? null,
        far: u?.uCameraFar?.value ?? null,
        softFade: u?.uSoftFade?.value ?? null,
        feather: u?.uFeather?.value ?? null,
        resolution: u?.uResolution?.value
          ? { x: u.uResolution.value.x, y: u.uResolution.value.y }
          : null
      },
      nearFarMatch: Boolean(
        u?.uCameraNear &&
          u.uCameraFar &&
          u.uCameraNear.value === camera.near &&
          u.uCameraFar.value === camera.far
      ),
      depthMatToneMapped: this.depthCapture?.depthMaterial?.toneMapped ?? null,
      rendererToneMapping: renderer.toneMapping,
      samples
    };
  }

  debugState() {
    return {
      /** TEMP live knobs — bake into constants.js then delete `setNeon`. */
      height: this._lightHeight,
      maxLight: this._maxLight,
      defaults: { height: NEON_LIGHT_HEIGHT, maxLight: NEON_MAX_LIGHT },
      lightCount: this.stopLights.length,
      lights: this.stopLights.map((s, i) => ({
        name: this.entries[i]?.vignette?.def?.name ?? i,
        intensity: s.light.intensity,
        color: `#${s.light.color.getHexString()}`,
        theta: s.theta,
        y: s.light.position.y,
        layer0: s.light.layers.isEnabled(0),
        layer2: s.light.layers.isEnabled(NEON_FOG_LAYER)
      })),
      ring: {
        rInner: NEON_FOG.rInner,
        rOuter: NEON_FOG.rOuter,
        layer: NEON_FOG_LAYER,
        softFade: NEON_FOG.softFade,
        depthCapture: Boolean(this.depthCapture?.depthTexture)
      },
      hazeVisible: this.hazeCards.filter((c) => c.mesh.visible).length,
      hazeTotal: this.hazeCards.length
    };
  }

  _buildHaze() {
    const count = this.isCoarse ? NEON_FOG.hazeCountCoarse : NEON_FOG.hazeCount;
    const geo = new THREE.PlaneGeometry(NEON_FOG.hazeWidth, NEON_FOG.hazeHeight);
    const frag = makeHazeFragment();

    for (let i = 0; i < count; i += 1) {
      const theta = (i / count) * Math.PI * 2;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uFogAtlas: { value: null },
          uTime: { value: 0 },
          uSpeed: { value: this.reducedMotion ? 0 : NEON_FOG.speed },
          uOpacity: { value: NEON_FOG.hazeOpacity },
          uAlpha: { value: 0 },
          uAtlasOffset: {
            value: new THREE.Vector2((i * 0.17) % 0.35, (i * 0.13) % 0.35)
          },
          uColor: { value: new THREE.Color(1, 1, 1) }
        },
        vertexShader: HAZE_VERTEX,
        fragmentShader: frag,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `neon-haze-${i}`;
      mesh.position.set(
        Math.sin(theta) * NEON_FOG.hazeRadius,
        NEON_FOG.hazeHeight * 0.5,
        Math.cos(theta) * NEON_FOG.hazeRadius
      );
      mesh.layers.set(NEON_FOG_LAYER);
      mesh.raycast = () => {};
      this.scene.add(mesh);
      this.hazeCards.push({ mesh, mat, theta });
    }
  }

  _updateHaze(camTheta, time, atlas) {
    if (!this.hazeCards.length) return;
    for (const card of this.hazeCards) {
      const prox = neonProximity(camTheta, card.theta);
      if (prox < NEON_FOG.hazeCull) {
        card.mesh.visible = false;
        continue;
      }
      card.mesh.visible = true;
      _HAZE_LOOK.set(this.camera.position.x, card.mesh.position.y, this.camera.position.z);
      card.mesh.lookAt(_HAZE_LOOK);

      const mix = twoNearestStops(card.theta, this.entries);
      card.mat.uniforms.uColor.value.copy(mix.a).lerp(mix.b, mix.t);
      card.mat.uniforms.uAlpha.value = prox;
      card.mat.uniforms.uTime.value = time;
      if (atlas && card.mat.uniforms.uFogAtlas.value !== atlas) {
        card.mat.uniforms.uFogAtlas.value = atlas;
      }
    }
  }
}

/** Shortest arc in [0, π]. */
export function angularDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function glslSmoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** 1 beside the stop, 0 at `falloff` radians away. */
export function neonProximity(camTheta, stopTheta, falloff = NEON_LIGHT_FALLOFF) {
  return glslSmoothstep(falloff, 0, angularDistance(camTheta, stopTheta));
}

/** Angular smoothstep used by lights and tubes. */
export function neonActiveAmount(theta, index, total) {
  return neonProximity(theta, vignetteAngle(index, total));
}

function twoNearestStops(theta, stops) {
  const white = new THREE.Color(1, 1, 1);
  if (!stops.length) return { a: white, b: white, t: 0 };
  if (stops.length === 1) {
    return { a: stops[0].dominant.clone(), b: stops[0].dominant.clone(), t: 0 };
  }
  let i0 = 0;
  let i1 = 1;
  let d0 = Infinity;
  let d1 = Infinity;
  for (let i = 0; i < stops.length; i += 1) {
    const d = angularDistance(theta, stops[i].theta);
    if (d < d0) {
      d1 = d0;
      i1 = i0;
      d0 = d;
      i0 = i;
    } else if (d < d1) {
      d1 = d;
      i1 = i;
    }
  }
  const t = d0 + d1 > 1e-5 ? d0 / (d0 + d1) : 0;
  return {
    a: stops[i0].dominant.clone(),
    b: stops[i1].dominant.clone(),
    t
  };
}
