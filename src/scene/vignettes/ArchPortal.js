/**
 * Giza portal — true 3D window through the Archaeology stone arch.
 *
 * Egypt is a **lined diorama tunnel** under the arch (arch-local meters): sand
 * floor + L/R walls at the jambs + HDRI dome (`skybox-egypt/equirect.webp` from
 * `masters/Sky's/20Sky-HDRI/Sky 16.hdr`). Spot + arch floor pool replace neon.
 *
 * Giza runtime is tip-along-X; tipStand **+Z π/2** maps tip → +Y.
 */
import * as THREE from "three";
import { createGltfLoader } from "../loaders/createGltfLoader.js";
import { NEON_FOG_LAYER, WET_FLOOR_LAYER } from "../stage/constants.js";
import { STAGE_FLOOR_Y } from "./pcSceneBlockout.js";

export const ARCH_PORTAL_DESERT_URL =
  "/assets/models/desert-giza/runtime/desert-giza.glb";
export const ARCH_PORTAL_PYRAMIDS_URL =
  "/assets/models/giza-pyramids/runtime/giza-pyramids.glb";
export const ARCH_PORTAL_SKY_URL =
  "/assets/textures/skybox-egypt/equirect.webp";
export const ARCH_PORTAL_SAND_URL =
  "/assets/textures/desert-sand/basecolor.webp";

export const ARCH_PORTAL_LIGHT_COLOR = 0xffd089;
export const ARCH_PORTAL_LIGHT_INTENSITY = 8;
export const ARCH_PORTAL_LIGHT_DISTANCE = 6;
export const ARCH_PORTAL_LIGHT_DECAY = 2.0;
export const ARCH_PORTAL_LIGHT_ANGLE = 0.35;
export const ARCH_PORTAL_LIGHT_PENUMBRA = 0.2;

export const ARCH_PORTAL_POOL_WIDTH = 3.2;
export const ARCH_PORTAL_POOL_DEPTH = 4.0;
export const ARCH_PORTAL_POOL_OPACITY = 0.95;
export const ARCH_PORTAL_POOL_Y = 0.014;
export const ARCH_PORTAL_POOL_NEAR = 0.12;

export const ARCH_PORTAL_OPEN_W = 3.15;
export const ARCH_PORTAL_OPEN_H = 4.15;
export const ARCH_PORTAL_OPEN_Z = -0.22;
export const ARCH_PORTAL_OPEN_Y = 2.05;

/** Tunnel just inside the stone jambs (slightly oversize so oblique stop fills). */
export const ARCH_PORTAL_TUNNEL_W = ARCH_PORTAL_OPEN_W * 1.08;
export const ARCH_PORTAL_TUNNEL_H = ARCH_PORTAL_OPEN_H * 1.02;
export const ARCH_PORTAL_TUNNEL_NEAR = 0.06;
export const ARCH_PORTAL_TUNNEL_DEPTH = 7.2;
export const ARCH_PORTAL_TUNNEL_FAR =
  ARCH_PORTAL_TUNNEL_NEAR + ARCH_PORTAL_TUNNEL_DEPTH;

export const ARCH_PORTAL_DUNES_ENABLED = false;

export const ARCH_PORTAL_PYRAMIDS_Z = 3.6;
export const ARCH_PORTAL_PYRAMIDS_SCALE = 0.026;

const CLIP_Y_FLOOR = -0.02;
const CLIP_Y_TOP = ARCH_PORTAL_OPEN_Y + ARCH_PORTAL_OPEN_H * 0.52;

const _FWD = new THREE.Vector3();
const _TMP = new THREE.Vector3();
const _POOL = new THREE.Vector3();
const _BOX = new THREE.Box3();
const _CLIP_N = new THREE.Vector3();
const _CLIP_P = new THREE.Vector3();

/**
 * Day sky for tunnel faces — sample Sky 16 equirect by view direction
 * (same idea as StageSkybox) so L/R/ceiling/back read as one continuous sky.
 * @param {THREE.Texture} skyTex
 * @returns {THREE.ShaderMaterial}
 */
function makeEgyptSkyMaterial(skyTex) {
  const map = skyTex.clone();
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;

  return new THREE.ShaderMaterial({
    name: "ArchPortalEgyptSkyMaterial",
    side: THREE.DoubleSide,
    depthWrite: true,
    fog: false,
    toneMapped: false,
    uniforms: {
      uMap: { value: map },
      // LDR webp is mid-key; gain keeps day readable under the night stage grade.
      uGain: { value: 1.85 },
      // Lift horizon into sky so sand banks meet blue, not the gray ground strip.
      uHorizonLift: { value: 0.12 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      uniform float uGain;
      uniform float uHorizonLift;
      varying vec3 vDir;

      const float PI = 3.14159265359;

      vec2 dirToEquirect(vec3 d) {
        vec3 n = normalize(d);
        float lon = atan(n.z, n.x);
        float lat = asin(clamp(n.y, -1.0, 1.0));
        // Bias latitude upward so aperture samples cloud/sky, not ground band.
        lat = clamp(lat + uHorizonLift, -1.5707963, 1.5707963);
        return vec2(lon * (1.0 / (2.0 * PI)) + 0.5, lat * (1.0 / PI) + 0.5);
      }

      void main() {
        vec3 sky = texture2D(uMap, dirToEquirect(vDir)).rgb * uGain;
        gl_FragColor = vec4(sky, 1.0);
      }
    `
  });
}

/**
 * Egypt aperture fill: sand floor + sky-lined L/R/ceiling + HDRI back.
 * Black shells sit well outside the stone so they never paint the aperture.
 * @param {THREE.Texture} sandTex
 * @param {THREE.Texture} skyTex
 * @returns {{ group: THREE.Group, sky: THREE.Mesh, ground: THREE.Mesh }}
 */
function makeEgyptTunnel(sandTex, skyTex) {
  const group = new THREE.Group();
  group.name = "arch-portal-booth";

  const w = ARCH_PORTAL_TUNNEL_W;
  const h = ARCH_PORTAL_TUNNEL_H;
  const d = ARCH_PORTAL_TUNNEL_DEPTH;
  const z0 = ARCH_PORTAL_TUNNEL_NEAR;
  const zMid = z0 + d * 0.5;
  const halfW = w * 0.5;
  const yMid = h * 0.5;

  const sandMat = new THREE.MeshBasicMaterial({
    map: sandTex,
    color: 0xffffff,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
    depthWrite: true
  });
  const blackMat = new THREE.MeshBasicMaterial({
    color: 0x050403,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
    depthWrite: true
  });

  const skyMat = makeEgyptSkyMaterial(skyTex);

  // Floor — jamb-to-jamb.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), sandMat);
  ground.name = "arch-portal-sand-ground";
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0.02, zMid);
  ground.frustumCulled = false;
  ground.renderOrder = -1;
  group.add(ground);

  // Sky-lined L/R/ceiling — view-dir equirect so foreshortened sides stay day sky.
  const wallL = new THREE.Mesh(new THREE.PlaneGeometry(d, h), skyMat);
  wallL.name = "arch-portal-wall-left";
  wallL.position.set(-halfW + 0.015, yMid, zMid);
  wallL.rotation.y = Math.PI / 2;
  wallL.frustumCulled = false;
  wallL.renderOrder = -1;
  group.add(wallL);

  const wallR = new THREE.Mesh(new THREE.PlaneGeometry(d, h), skyMat);
  wallR.name = "arch-portal-wall-right";
  wallR.position.set(halfW - 0.015, yMid, zMid);
  wallR.rotation.y = -Math.PI / 2;
  wallR.frustumCulled = false;
  wallR.renderOrder = -1;
  group.add(wallR);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), skyMat);
  ceil.name = "arch-portal-ceiling";
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, h - 0.02, zMid);
  ceil.frustumCulled = false;
  ceil.renderOrder = -1;
  group.add(ceil);

  // Back — full aperture sky card (same view-dir material).
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.08, h * 1.08), skyMat);
  sky.name = "arch-portal-day-sky";
  sky.position.set(0, yMid, ARCH_PORTAL_TUNNEL_FAR - 0.04);
  sky.rotation.y = Math.PI;
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  group.add(sky);

  // Lower sand banks (dunes), not full-height textured walls.
  const bankH = h * 0.34;
  const bankL = new THREE.Mesh(
    new THREE.PlaneGeometry(d * 0.88, bankH),
    sandMat.clone()
  );
  bankL.name = "arch-portal-bank-left";
  bankL.position.set(-halfW + 0.03, bankH * 0.5, zMid * 0.85);
  bankL.rotation.y = Math.PI / 2;
  bankL.frustumCulled = false;
  group.add(bankL);

  const bankR = new THREE.Mesh(
    new THREE.PlaneGeometry(d * 0.88, bankH),
    sandMat.clone()
  );
  bankR.name = "arch-portal-bank-right";
  bankR.position.set(halfW - 0.03, bankH * 0.5, zMid * 0.85);
  bankR.rotation.y = -Math.PI / 2;
  bankR.frustumCulled = false;
  group.add(bankR);

  // Black shells well outside the stone (~pillar thickness) — never in aperture.
  const shellD = d + 1.2;
  const shellH = h * 1.35;
  const shellX = ARCH_PORTAL_OPEN_W * 0.5 + 1.35;
  const shellZ = z0 + shellD * 0.5;

  const shellL = new THREE.Mesh(
    new THREE.PlaneGeometry(shellD, shellH),
    blackMat
  );
  shellL.name = "booth-shell-left";
  shellL.position.set(-shellX, yMid, shellZ);
  shellL.rotation.y = Math.PI / 2;
  shellL.frustumCulled = false;
  shellL.renderOrder = 4;
  group.add(shellL);

  const shellR = new THREE.Mesh(
    new THREE.PlaneGeometry(shellD, shellH),
    blackMat.clone()
  );
  shellR.name = "booth-shell-right";
  shellR.position.set(shellX, yMid, shellZ);
  shellR.rotation.y = -Math.PI / 2;
  shellR.frustumCulled = false;
  shellR.renderOrder = 4;
  group.add(shellR);

  return { group, sky, ground };
}

/**
 * Arch silhouette floor pool — bright at threshold.
 * @returns {{ geometry: THREE.BufferGeometry }}
 */
function makeArchFloorPoolGeometry() {
  const halfW = ARCH_PORTAL_POOL_WIDTH * 0.5;
  const depth = ARCH_PORTAL_POOL_DEPTH;
  const spring = depth * 0.4;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.lineTo(-halfW, spring);
  shape.absarc(0, spring, halfW, Math.PI, 0, false);
  shape.lineTo(halfW, 0);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 48);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  let maxY = 0;
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
  const inv = 1 / Math.max(maxY, 1e-6);
  for (let i = 0; i < pos.count; i++) {
    const t = 1 - pos.getY(i) * inv;
    const b = 0.35 + 0.65 * t * t;
    colors[i * 3] = b;
    colors[i * 3 + 1] = b * 0.88;
    colors[i * 3 + 2] = b * 0.55;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return { geometry };
}

/**
 * @param {THREE.Object3D} root
 * @param {THREE.Plane[] | null} clipPlanes
 * @param {number} [fallbackColor]
 * @param {boolean} [lit]
 */
function toEgyptMat(root, clipPlanes = null, fallbackColor = 0xc4a574, lit = true) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const next = lit
        ? new THREE.MeshLambertMaterial({
            map: m.map ?? null,
            color: m.color?.clone?.() ?? new THREE.Color(fallbackColor),
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false,
            emissive: new THREE.Color(fallbackColor).multiplyScalar(0.22)
          })
        : new THREE.MeshBasicMaterial({
            map: m.map ?? null,
            color: m.color?.clone?.() ?? new THREE.Color(fallbackColor),
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false
          });
      if (clipPlanes?.length) {
        next.clippingPlanes = clipPlanes;
        next.clipIntersection = false;
      }
      mats[i] = next;
      m.dispose?.();
    }
    o.material = mats.length === 1 ? mats[0] : mats;
  });
}

export class ArchPortal {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   renderer: THREE.WebGLRenderer,
   *   reducedMotion?: boolean
   * }} opts
   */
  constructor({ scene, renderer, reducedMotion = false }) {
    this.mainScene = scene;
    this.renderer = renderer;
    this.reducedMotion = reducedMotion;

    this.portalWorld = new THREE.Group();
    this.portalWorld.name = "arch-portal-world";
    this.portalWorld.visible = false;

    this.backplate = null;
    this.spot = null;
    this.floorPool = null;
    this._sky = null;
    this._ground = null;
    this._booth = null;
    this._desert = null;
    this._pyramids = null;
    this._contentOn = false;
    /** near, bottom, top — aperture filled by tunnel walls, not L/R clips */
    /** @type {THREE.Plane[]} */
    this._clipPlanes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
    this._ready = false;
    this._mounted = false;
    this._level = 0;
    this._archRoot = null;
    this._vignetteGroup = null;
  }

  /** @returns {Promise<void>} */
  async load() {
    const loader = createGltfLoader();
    const texLoader = new THREE.TextureLoader();

    const [sandTex, skyTex, desertGltf, pyrGltf] = await Promise.all([
      texLoader.loadAsync(ARCH_PORTAL_SAND_URL),
      texLoader.loadAsync(ARCH_PORTAL_SKY_URL),
      loader.loadAsync(ARCH_PORTAL_DESERT_URL),
      loader.loadAsync(ARCH_PORTAL_PYRAMIDS_URL)
    ]);

    sandTex.colorSpace = THREE.SRGBColorSpace;
    sandTex.wrapS = THREE.RepeatWrapping;
    sandTex.wrapT = THREE.RepeatWrapping;
    sandTex.repeat.set(2.5, 2.5);
    sandTex.anisotropy = 8;

    skyTex.colorSpace = THREE.SRGBColorSpace;
    skyTex.wrapS = THREE.RepeatWrapping;
    skyTex.wrapT = THREE.ClampToEdgeWrapping;
    skyTex.generateMipmaps = false;
    skyTex.minFilter = THREE.LinearFilter;
    skyTex.magFilter = THREE.LinearFilter;

    const tunnel = makeEgyptTunnel(sandTex, skyTex);
    this._booth = tunnel.group;
    this._sky = tunnel.sky;
    this._ground = tunnel.ground;
    this.portalWorld.add(this._booth);

    this._desert = desertGltf.scene;
    this._desert.name = "arch-portal-dunes";
    this._desert.visible = ARCH_PORTAL_DUNES_ENABLED;
    if (ARCH_PORTAL_DUNES_ENABLED) {
      this.portalWorld.add(this._desert);
    }

    // Native tip is along +X (bases read as vertical walls). tipStand +Z π/2 → tip +Y.
    const pyrRaw = pyrGltf.scene;
    pyrRaw.rotation.z = Math.PI / 2;
    this._pyramids = new THREE.Group();
    this._pyramids.name = "arch-portal-pyramids";
    this._pyramids.add(pyrRaw);
    this._pyramids.rotation.set(0, Math.PI * 0.2, 0);
    this._pyramids.scale.setScalar(ARCH_PORTAL_PYRAMIDS_SCALE);
    this._pyramids.updateMatrixWorld(true);
    _BOX.setFromObject(this._pyramids);
    _BOX.getCenter(_TMP);
    this._pyramids.position.set(
      -_TMP.x,
      0.02 - _BOX.min.y,
      ARCH_PORTAL_PYRAMIDS_Z - _TMP.z
    );
    toEgyptMat(this._pyramids, null, 0xe0c090, true);
    this.portalWorld.add(this._pyramids);

    const sun = new THREE.DirectionalLight(0xffe6c0, 3.4);
    sun.name = "arch-portal-sun";
    sun.position.set(5, 8, 2);
    this.portalWorld.add(sun);
    this.portalWorld.add(sun.target);
    sun.target.position.set(0, 1.0, 3.5);
    const fill = new THREE.DirectionalLight(0x9ec8ff, 1.1);
    fill.name = "arch-portal-fill";
    fill.position.set(-3, 4, 5);
    this.portalWorld.add(fill);
    this.portalWorld.add(fill.target);
    fill.target.position.set(0, 1.0, 3.5);
    const amb = new THREE.AmbientLight(0xffd8a8, 0.7);
    amb.name = "arch-portal-amb";
    this.portalWorld.add(amb);

    this._ready = true;
  }

  /**
   * @param {THREE.Object3D} archRoot
   * @param {THREE.Object3D} vignetteGroup
   */
  mount(archRoot, vignetteGroup) {
    if (this._mounted || !archRoot) return;

    const plateMat = new THREE.MeshBasicMaterial({
      color: 0x050403,
      side: THREE.DoubleSide,
      depthWrite: true
    });
    this.backplate = new THREE.Mesh(
      new THREE.PlaneGeometry(ARCH_PORTAL_OPEN_W, ARCH_PORTAL_OPEN_H),
      plateMat
    );
    this.backplate.name = "arch-portal-backplate";
    this.backplate.renderOrder = -3;
    this.backplate.frustumCulled = false;
    this.backplate.position.set(0, ARCH_PORTAL_OPEN_Y, ARCH_PORTAL_OPEN_Z + 0.05);
    archRoot.add(this.backplate);

    this.portalWorld.scale.setScalar(1);
    this.portalWorld.renderOrder = -1;
    archRoot.add(this.portalWorld);

    this.spot = new THREE.SpotLight(
      ARCH_PORTAL_LIGHT_COLOR,
      0,
      ARCH_PORTAL_LIGHT_DISTANCE,
      ARCH_PORTAL_LIGHT_ANGLE,
      ARCH_PORTAL_LIGHT_PENUMBRA,
      ARCH_PORTAL_LIGHT_DECAY
    );
    this.spot.name = "arch-portal-daylight";
    this.spot.castShadow = false;
    this.spot.layers.enable(0);
    this.spot.layers.enable(NEON_FOG_LAYER);
    this.spot.layers.enable(WET_FLOOR_LAYER);
    this.spot.target.name = "arch-portal-daylight-target";
    this.mainScene.add(this.spot);
    this.mainScene.add(this.spot.target);

    const { geometry: poolGeom } = makeArchFloorPoolGeometry();
    const poolMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(ARCH_PORTAL_LIGHT_COLOR),
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.floorPool = new THREE.Mesh(poolGeom, poolMat);
    this.floorPool.name = "arch-portal-floor-pool";
    this.floorPool.rotation.x = -Math.PI / 2;
    this.floorPool.position.y = STAGE_FLOOR_Y + ARCH_PORTAL_POOL_Y;
    this.floorPool.renderOrder = 2;
    this.floorPool.frustumCulled = false;
    this.floorPool.layers.enable(NEON_FOG_LAYER);
    vignetteGroup.add(this.floorPool);

    this._archRoot = archRoot;
    this._vignetteGroup = vignetteGroup;
    this._mounted = true;
    this.renderer.localClippingEnabled = true;
    this._syncClipPlanes();
    this._syncLightRig(0);
    this._setPortalVisible(false);
  }

  /**
   * Near / floor / top only — aperture fill is the tunnel mesh, not L/R clips.
   */
  _syncClipPlanes() {
    if (!this.portalWorld?.parent) return;
    this.portalWorld.updateMatrixWorld(true);
    const mw = this.portalWorld.matrixWorld;

    const setPlane = (plane, nx, ny, nz, px, py, pz) => {
      _CLIP_N.set(nx, ny, nz).transformDirection(mw).normalize();
      _CLIP_P.set(px, py, pz).applyMatrix4(mw);
      plane.setFromNormalAndCoplanarPoint(_CLIP_N, _CLIP_P);
    };

    setPlane(
      this._clipPlanes[0],
      0,
      0,
      1,
      0,
      ARCH_PORTAL_OPEN_Y,
      ARCH_PORTAL_OPEN_Z
    );
    setPlane(this._clipPlanes[1], 0, 1, 0, 0, CLIP_Y_FLOOR, 4);
    setPlane(this._clipPlanes[2], 0, -1, 0, 0, CLIP_Y_TOP, 4);
  }

  /**
   * @param {boolean} visible
   */
  _setPortalVisible(visible) {
    this.portalWorld.visible = visible;
    if (this.backplate) this.backplate.visible = !visible;
  }

  /**
   * @param {number} level
   */
  _syncLightRig(level) {
    if (!this._mounted || !this._archRoot || !this.spot) return;

    this._archRoot.updateMatrixWorld(true);
    _TMP.set(0, ARCH_PORTAL_OPEN_Y * 0.35, ARCH_PORTAL_OPEN_Z);
    this._archRoot.localToWorld(_TMP);
    this.spot.position.copy(_TMP);

    _FWD.set(0, 0, -1).transformDirection(this._archRoot.matrixWorld).normalize();
    this.spot.target.position
      .copy(this.spot.position)
      .addScaledVector(_FWD, 1.5)
      .setY(STAGE_FLOOR_Y + 0.05);
    this.spot.target.updateMatrixWorld(true);

    this.spot.intensity = level * ARCH_PORTAL_LIGHT_INTENSITY;
    this.spot.color.setHex(ARCH_PORTAL_LIGHT_COLOR);
    this.spot.userData.fogIntensity = level * ARCH_PORTAL_LIGHT_INTENSITY;

    if (this.floorPool) {
      _POOL.copy(this.spot.position)
        .addScaledVector(_FWD, ARCH_PORTAL_POOL_NEAR)
        .setY(STAGE_FLOOR_Y + ARCH_PORTAL_POOL_Y);
      this._vignetteGroup.worldToLocal(_POOL);
      this.floorPool.position.copy(_POOL);
      const yaw = Math.atan2(_FWD.x, _FWD.z);
      this.floorPool.rotation.set(-Math.PI / 2, 0, yaw);
      this.floorPool.material.color.setHex(ARCH_PORTAL_LIGHT_COLOR);
      this.floorPool.material.opacity = level * ARCH_PORTAL_POOL_OPACITY;
      this.floorPool.visible = level > 1e-3;
    }
  }

  /**
   * @param {THREE.WebGLRenderer} _renderer
   * @param {THREE.Camera} _mainCam
   * @param {number} level
   */
  update(_renderer, _mainCam, level = 0) {
    this._level = level;
    if (!this._mounted || !this._ready) return;
    if (level > 0.08) this._contentOn = true;
    else if (level <= 0.02) this._contentOn = false;
    const on = this._contentOn;
    this._setPortalVisible(on);
    if (on) this._syncClipPlanes();
    this._syncLightRig(on ? level : 0);
  }

  renderPortalSubpass() {}

  getLight() {
    return this.spot;
  }

  getArriveDrivenIntensity() {
    return this._level * ARCH_PORTAL_LIGHT_INTENSITY;
  }

  dispose() {
    this.backplate?.geometry?.dispose?.();
    this.backplate?.material?.dispose?.();
    this.floorPool?.geometry?.dispose?.();
    this.floorPool?.material?.dispose?.();
    if (this.spot) {
      this.mainScene.remove(this.spot);
      this.mainScene.remove(this.spot.target);
      this.spot.dispose?.();
    }
    this._booth?.traverse?.((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m?.map?.dispose?.();
        m?.dispose?.();
      }
    });
    this.portalWorld?.removeFromParent?.();
  }
}
