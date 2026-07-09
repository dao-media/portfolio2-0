import * as THREE from "three";

const BEAM_VERTEX = `
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const BEAM_FRAGMENT = `
  uniform vec3 uOrigin;
  uniform vec3 uTarget;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uAngle;

  varying vec3 vWorldPos;

  void main() {
    vec3 axis = uTarget - uOrigin;
    float span = length(axis);
    if (span < 0.01) discard;

    axis /= span;

    vec3 rel = vWorldPos - uOrigin;
    float along = dot(rel, axis);

    if (along < 0.0 || along > span) discard;

    vec3 onAxis = uOrigin + axis * along;
    float radialDist = length(vWorldPos - onAxis);
    float maxRadius = tan(uAngle * 0.5) * along;
    if (maxRadius < 0.001 || radialDist > maxRadius) discard;

    float radial = 1.0 - radialDist / maxRadius;
    float core = pow(radial, 2.8);

    float t = along / span;
    if (t > 0.78) discard;

    float headGlow = pow(1.0 - t, 2.0) * 0.58;
    float shaft = sin(t * 3.14159265) * 0.3;
    float settle = pow(t, 2.6) * 0.08;

    float intensity = core * (headGlow + shaft + settle + 0.06);
    float alpha = intensity * uOpacity;

    if (alpha < 0.004) discard;

    gl_FragColor = vec4(uColor * intensity, alpha);
  }
`;

/**
 * Volumetric cone volume rendered from the POV head rig to the active subject.
 * Haze is densest along the beam axis — not a screen-space vignette ring.
 * Pair with SpotlightBloomPass when the lighting pass is wired up.
 */
export class PovSpotlightBeam {
  /**
   * @param {THREE.ColorRepresentation} color
   * @param {number} opacity
   */
  constructor(color = 0xfff4e6, opacity = 0.085) {
    this._origin = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);

    this.uniforms = {
      uOrigin: { value: new THREE.Vector3() },
      uTarget: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uAngle: { value: Math.PI / 7 }
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 1, 1, true), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  setColor(color) {
    this.uniforms.uColor.value.set(color);
  }

  /**
   * @param {THREE.Vector3} origin World-space light origin (above POV head).
   * @param {THREE.Vector3} target World-space aim point on the active subject.
   * @param {number} coneAngle Spotlight outer cone angle in radians.
   */
  update(origin, target, coneAngle, beamAngleRatio = 0.36) {
    this._origin.copy(origin);
    this._target.copy(target);

    const beamAngle = coneAngle * beamAngleRatio;
    const distance = Math.max(this._origin.distanceTo(this._target), 0.5);
    const radiusFar = Math.tan(beamAngle * 0.5) * distance * 1.08;

    this._direction.subVectors(this._target, this._origin).normalize();
    this._quaternion.setFromUnitVectors(this._up, this._direction);

    this.mesh.position.copy(this._origin).addScaledVector(this._direction, distance * 0.5);
    this.mesh.quaternion.copy(this._quaternion);

    const next = new THREE.CylinderGeometry(radiusFar, radiusFar, distance, 16, 1, true);
    this.mesh.geometry.dispose();
    this.mesh.geometry = next;

    this.uniforms.uOrigin.value.copy(this._origin);
    this.uniforms.uTarget.value.copy(this._target);
    this.uniforms.uAngle.value = beamAngle;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
