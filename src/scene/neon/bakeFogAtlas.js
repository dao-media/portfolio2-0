import * as THREE from "three";
import { FOG_ATLAS, NEON_FOG } from "../stage/constants.js";

const BAKE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const BAKE_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float uTheta, uScale, uLoopRadius;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  float fbm(vec2 p) {
    float val = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      val += a * snoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return val;
  }

  void main() {
    vec2 off = vec2(cos(uTheta), sin(uTheta)) * uLoopRadius;
    vec2 uv  = vUv * uScale + off;
    vec2 q   = vec2(fbm(uv), fbm(uv + vec2(5.2, 1.3)));
    float n  = fbm(uv + 1.5 * q);
    n = smoothstep(0.0, 1.0, n * 0.5 + 0.5);
    gl_FragColor = vec4(vec3(n), 1.0);
  }
`;

/**
 * Bake the FBM loop once during the load gate. Runtime fog only samples the atlas.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.DataTexture}
 */
export function bakeFogAtlas(renderer) {
  const { N, TILE, COLS, ROWS } = FOG_ATLAS;
  const bakeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTheta: { value: 0 },
      uScale: { value: NEON_FOG.uScale },
      uLoopRadius: { value: NEON_FOG.uLoopRadius }
    },
    vertexShader: BAKE_VERTEX,
    fragmentShader: BAKE_FRAGMENT
  });

  const rt = new THREE.WebGLRenderTarget(TILE, TILE, {
    depthBuffer: false,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.NoColorSpace
  });
  const aw = COLS * TILE;
  const ah = ROWS * TILE;
  const atlas = new Uint8Array(aw * ah * 4);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMaterial);
  quadScene.add(quad);

  const prevTarget = renderer.getRenderTarget();
  const px = new Uint8Array(TILE * TILE * 4);

  for (let k = 0; k < N; k += 1) {
    bakeMaterial.uniforms.uTheta.value = (2 * Math.PI * k) / N;
    renderer.setRenderTarget(rt);
    renderer.render(quadScene, quadCam);
    renderer.readRenderTargetPixels(rt, 0, 0, TILE, TILE, px);
    const cx = (k % COLS) * TILE;
    const cy = Math.floor(k / COLS) * TILE;
    for (let y = 0; y < TILE; y += 1) {
      const src = y * TILE * 4;
      const dst = ((cy + y) * aw + cx) * 4;
      atlas.set(px.subarray(src, src + TILE * 4), dst);
    }
  }

  renderer.setRenderTarget(prevTarget);
  rt.dispose();
  quad.geometry.dispose();
  bakeMaterial.dispose();

  const tex = new THREE.DataTexture(atlas, aw, ah, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  tex.name = "neon-fog-atlas";
  return tex;
}
