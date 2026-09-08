import * as THREE from "three";
import { NEON_FOG, NEON_FOG_LAYER } from "../stage/constants.js";

/**
 * DEV overlay — one camera-parented group, drawn by the existing beauty pass.
 * Left quad: FogDepthCapture packed depth (BasicDepthPacking `.r`, nearer = brighter).
 * Right quad: the fog soft term as a color ramp (red = contact, green = open air).
 * Layer 2 so the layer-0 depth pre-pass does not see it. Not a second composer.
 */
export class FogDebugOverlay {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.Texture} depthTexture
   */
  constructor(camera, depthTexture) {
    this.camera = camera;
    this._mode = "off";

    const geo = new THREE.PlaneGeometry(1, 1);
    this.depthMat = new THREE.ShaderMaterial({
      uniforms: {
        uSceneDepth: { value: depthTexture }
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D uSceneDepth;
        void main() {
          float packed = texture2D(uSceneDepth, vUv).r;
          gl_FragColor = vec4(vec3(packed), 1.0);
        }
      `
    });

    this.softMat = new THREE.ShaderMaterial({
      uniforms: {
        uSceneDepth: { value: depthTexture },
        uInvViewProj: { value: new THREE.Matrix4() },
        uViewMatrix: { value: new THREE.Matrix4() },
        uFogY: { value: NEON_FOG.y },
        uCameraNear: { value: 0.1 },
        uCameraFar: { value: 120 },
        uSoftFade: { value: NEON_FOG.softFade }
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D uSceneDepth;
        uniform mat4 uInvViewProj;
        uniform mat4 uViewMatrix;
        uniform float uFogY, uCameraNear, uCameraFar, uSoftFade;

        float fogDepthToViewZ(float depth, float near, float far) {
          return (near * far) / ((far - near) * depth - far);
        }

        void main() {
          vec2 ndc = vUv * 2.0 - 1.0;
          vec4 nearH = uInvViewProj * vec4(ndc, -1.0, 1.0);
          vec4 farH = uInvViewProj * vec4(ndc, 1.0, 1.0);
          vec3 ro = nearH.xyz / nearH.w;
          vec3 rf = farH.xyz / farH.w;
          vec3 rd = rf - ro;
          float denom = rd.y;
          if (abs(denom) < 1e-5) {
            gl_FragColor = vec4(0.05, 0.05, 0.08, 1.0);
            return;
          }
          float tHit = (uFogY - ro.y) / denom;
          if (tHit < 0.0) {
            gl_FragColor = vec4(0.05, 0.05, 0.08, 1.0);
            return;
          }
          vec3 hit = ro + rd * tHit;
          float fogViewZ = (uViewMatrix * vec4(hit, 1.0)).z;

          float packed = texture2D(uSceneDepth, vUv).r;
          float sceneDepth = 1.0 - packed;
          float sceneViewZ = fogDepthToViewZ(sceneDepth, uCameraNear, uCameraFar);
          float soft = 1.0;
          if (uSoftFade > 1e-5) {
            soft = clamp((fogViewZ - sceneViewZ) / uSoftFade, 0.0, 1.0);
          }
          // Red = hard contact (soft 0). Green = open air (soft 1).
          gl_FragColor = vec4(1.0 - soft, soft, 0.08, 1.0);
        }
      `
    });

    this.depthQuad = new THREE.Mesh(geo, this.depthMat);
    this.depthQuad.name = "fog-debug-depth";
    this.softQuad = new THREE.Mesh(geo.clone(), this.softMat);
    this.softQuad.name = "fog-debug-soft";

    this.group = new THREE.Group();
    this.group.name = "fog-debug-overlay";
    this.group.add(this.depthQuad, this.softQuad);
    this.group.layers.set(NEON_FOG_LAYER);
    this.depthQuad.layers.set(NEON_FOG_LAYER);
    this.softQuad.layers.set(NEON_FOG_LAYER);
    this.group.renderOrder = 999;
    this.group.visible = false;

    // Upper band of the camera view so the ring stays judgeable below.
    this.depthQuad.position.set(-0.34, 0.28, -1.05);
    this.softQuad.position.set(0.34, 0.28, -1.05);
    this.depthQuad.scale.set(0.52, 0.34, 1);
    this.softQuad.scale.set(0.52, 0.34, 1);

    camera.add(this.group);
  }

  /**
   * @param {"off"|"depth"|"soft"|"both"} mode
   */
  setMode(mode) {
    this._mode = mode;
    const on = mode !== "off";
    this.group.visible = on;
    this.depthQuad.visible = mode === "depth" || mode === "both";
    this.softQuad.visible = mode === "soft" || mode === "both";
    return this._mode;
  }

  /**
   * @param {THREE.Camera} camera
   * @param {number} near
   * @param {number} far
   * @param {number} softFade
   */
  sync(camera, near, far, softFade) {
    if (!this.group.visible) return;
    camera.updateMatrixWorld(true);
    const invViewProj = this.softMat.uniforms.uInvViewProj.value;
    invViewProj.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    this.softMat.uniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);
    this.softMat.uniforms.uCameraNear.value = near;
    this.softMat.uniforms.uCameraFar.value = far;
    this.softMat.uniforms.uSoftFade.value = softFade;
  }

  dispose() {
    this.group.removeFromParent();
    this.depthMat.dispose();
    this.softMat.dispose();
    this.depthQuad.geometry.dispose();
    this.softQuad.geometry.dispose();
  }
}
