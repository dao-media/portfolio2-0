import * as THREE from "three";

/**
 * Parallax distance of the galaxy, meters from the origin. A 100 m camera
 * move shifts the belt by about 0.24°. The drawn shell is a small sphere
 * on the camera so this can sit far past CAM_FAR.
 */
export const MILKY_WAY_DISTANCE = 24000;
/** Camera-centered draw shell. Stays inside CAM_FAR (220). */
export const MILKY_WAY_SHELL = 40;
/**
 * Galactic plane. The band is the set of directions perpendicular to this
 * normal — a streak of stars about 14° above the −Z horizon, tilted in X.
 */
export const GALACTIC_PLANE_N = new THREE.Vector3(0.55, 0.97, 0.242).normalize();
/**
 * View-elevation sine of the horizon blend. The night sky is black at
 * {@link SKY_HORIZON_LOW} (just under the horizon) and full by
 * {@link SKY_HORIZON_HIGH} (~11°). Stars fade inside that same band.
 */
export const SKY_HORIZON_LOW = -0.03;
export const SKY_HORIZON_HIGH = 0.2;
/**
 * World radius of the lens, just outside the 3.6 m disk radius.
 * Angular size is atan(this / camera distance), so the warp tracks the hole.
 */
export const BLACK_HOLE_LENS_WORLD_RADIUS = 4.8;
/** Hold distance sqrt(5²+15²). Lens strength is 1 at this range. */
export const BLACK_HOLE_LENS_REF_DISTANCE = 15.81;

/**
 * Angular radius, screen radius (UV), and strength from camera-to-hole distance.
 * Far (~108 m) is a small weak warp. The hold (~15.8 m) is strength 1.
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} holePos
 */
export function blackHoleLensFromCamera(camera, holePos) {
  const dist = Math.max(camera.position.distanceTo(holePos), 0.75);
  const angular = Math.atan(BLACK_HOLE_LENS_WORLD_RADIUS / dist);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const uvRadius = (Math.tan(angular) / Math.max(tanHalf, 1e-4)) * 0.5;
  const refAngular = Math.atan(
    BLACK_HOLE_LENS_WORLD_RADIUS / BLACK_HOLE_LENS_REF_DISTANCE
  );
  const strength = Math.min(2.4, angular / refAngular);
  return { dist, angular, uvRadius, strength };
}

const MilkyWayNebulaShader = {
  uniforms: {
    uTime: { value: 0 },
    uBlackHoleScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uLensingRadius: { value: 0 },
    uLensingStrength: { value: 0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vScreen;
    varying vec3 vDir;
    varying vec3 vView;
    void main() {
      // Ray from the camera through this shell vertex, hit the distant galaxy.
      vec3 D = normalize(position);
      vView = D;
      vec3 C = cameraPosition;
      float R = ${MILKY_WAY_DISTANCE.toFixed(1)};
      float b = dot(C, D);
      float disc = b * b - dot(C, C) + R * R;
      float t = -b + sqrt(max(disc, 0.0));
      vDir = C + D * t;
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vScreen = clip.xy / clip.w * 0.5 + 0.5;
      gl_Position = clip;
      gl_Position.z = clip.w * 0.999;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec2 uBlackHoleScreenPos;
    uniform float uLensingRadius;
    uniform float uLensingStrength;

    varying vec2 vScreen;
    varying vec3 vDir;
    varying vec3 vView;

    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    // Short star kernels packed onto wavy filaments. Empty sky stays empty.
    float filamentStars(float along, float across) {
      float ridge = abs(across - 0.02 * sin(along * 2.4));
      ridge = min(ridge, abs(across - 0.016 * sin(along * 4.1 + 1.3) - 0.028));
      ridge = min(ridge, abs(across + 0.018 * sin(along * 1.7 + 2.2) + 0.02));
      float filaments = exp(-ridge * ridge * 1600.0);
      if (filaments < 0.04) return 0.0;

      vec2 gv = vec2(along * 80.0, across * 220.0);
      vec2 id = floor(gv);
      vec2 f = fract(gv) - 0.5;
      float n = hash21(id);
      float show = step(0.62, n);
      vec2 jitter = vec2(hash21(id + 1.7), hash21(id + 8.2)) - 0.5;
      vec2 d = (f - jitter * 0.9) * vec2(1.0, 1.4);
      float core = smoothstep(0.045, 0.0, length(d));
      float twinkle = 0.82 + 0.18 * sin(uTime * 1.6 + n * 12.0);
      return show * core * filaments * twinkle * (0.55 + 0.45 * n);
    }

    void main() {
      vec3 dir = normalize(vDir);
      vec2 toBh = vScreen - uBlackHoleScreenPos;
      float distToBh = length(toBh);
      if (uLensingStrength > 0.001 && distToBh < uLensingRadius && distToBh > 0.0001) {
        float t = distToBh / uLensingRadius;
        float pull = uLensingStrength * (1.0 - t) * (1.0 - t);
        vec2 distortion = normalize(toBh) * pull * min(uLensingRadius, 0.55) * 0.85;
        vec3 side = cross(dir, vec3(0.0, 1.0, 0.0));
        if (dot(side, side) < 1e-4) side = cross(dir, vec3(1.0, 0.0, 0.0));
        side = normalize(side);
        vec3 lift = cross(side, dir);
        dir = normalize(dir + side * distortion.x + lift * distortion.y);
      }

      vec3 planeN = normalize(vec3(0.55, 0.97, 0.242));
      vec3 tangent = normalize(cross(planeN, vec3(0.0, 1.0, 0.0)));
      vec3 bitangent = normalize(cross(planeN, tangent));
      float across = dot(dir, planeN);
      float along = atan(dot(dir, bitangent), dot(dir, tangent));
      float stars = filamentStars(along, across);
      float haloAcross = abs(across);
      float halo = exp(-haloAcross * haloAcross * 180.0);
      vec2 hv = vec2(along * 36.0, across * 80.0);
      vec2 hid = floor(hv);
      float hn = hash21(hid + 4.0);
      vec2 hd = (fract(hv) - 0.5) - (vec2(hash21(hid + 2.0), hash21(hid + 9.0)) - 0.5) * 0.75;
      float haloStar = step(0.9, hn) * smoothstep(0.05, 0.0, length(hd)) * halo;

      vec3 starColor = mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.94, 0.8), hash21(hid + 3.0));
      // Linear values that encode to STAGE_BG 0x070709 when tone mapping is off.
      vec3 deepSpace = vec3(0.002125, 0.002125, 0.00273);
      float elev = vView.y;
      float skyW = smoothstep(${SKY_HORIZON_LOW.toFixed(3)}, ${SKY_HORIZON_HIGH.toFixed(3)}, elev);
      skyW = skyW * skyW * (3.0 - 2.0 * skyW);
      float starW = smoothstep(0.0, ${SKY_HORIZON_HIGH.toFixed(3)}, elev);
      vec3 lit = deepSpace + starColor * (stars * 0.7 + haloStar * 0.28) * starW;
      vec3 finalSky = mix(vec3(0.0), lit, skyW);
      gl_FragColor = vec4(finalSky, 1.0);
    }
  `
};

/**
 * Inside-out galactic dome. Lensing uses screen position so the warp
 * follows the hole instead of a fixed sphere UV.
 * @param {number} [radius]
 */
export function createMilkyWayDome(radius = MILKY_WAY_SHELL) {
  const geometry = new THREE.SphereGeometry(radius, 64, 32);
  const material = new THREE.ShaderMaterial({
    name: "MilkyWayNebula",
    uniforms: THREE.UniformsUtils.clone(MilkyWayNebulaShader.uniforms),
    vertexShader: MilkyWayNebulaShader.vertexShader,
    fragmentShader: MilkyWayNebulaShader.fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "milky-way-dome";
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  mesh.userData.bhNdc = new THREE.Vector3();
  return mesh;
}

/**
 * @param {THREE.Mesh} dome
 * @param {THREE.Camera} camera
 * @param {number} time
 * @param {THREE.Vector3 | null} blackHolePos
 * @param {boolean} lens
 */
export function updateMilkyWayDome(dome, camera, time, blackHolePos, lens) {
  const uniforms = dome?.material?.uniforms;
  if (!uniforms || !camera) return;
  dome.position.copy(camera.position);
  uniforms.uTime.value = time;
  if (!lens || !blackHolePos) {
    uniforms.uLensingStrength.value = 0;
    uniforms.uLensingRadius.value = 0;
    return;
  }
  const scale = blackHoleLensFromCamera(camera, blackHolePos);
  uniforms.uLensingRadius.value = scale.uvRadius;
  uniforms.uLensingStrength.value = scale.strength;
  const ndc = dome.userData.bhNdc.copy(blackHolePos).project(camera);
  uniforms.uBlackHoleScreenPos.value.set((ndc.x + 1) * 0.5, (ndc.y + 1) * 0.5);
}
