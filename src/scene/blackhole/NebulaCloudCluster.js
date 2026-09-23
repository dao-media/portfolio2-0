import * as THREE from "three";

const CloudSpriteShader = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x00e5ff) },
    uOpacity: { value: 0.35 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec2 vUv;

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
    }

    void main() {
      vec2 coord = vUv - 0.5;
      float dist = length(coord);
      if (dist > 0.5) discard;
      float softEdge = smoothstep(0.5, 0.05, dist);
      float pulse = sin(uTime * 0.8 + rand(vUv) * 6.28) * 0.1 + 0.9;
      float alpha = softEdge * uOpacity * pulse;
      gl_FragColor = vec4(uColor, alpha);
    }
  `
};

/**
 * Soft gas along the −Z flight, far enough out that the ring still sees it
 * above the apron.
 * @param {number} [count]
 */
export function createNebulaCluster(count = 4) {
  const group = new THREE.Group();
  group.name = "nebula-clouds";
  const geometry = new THREE.PlaneGeometry(10, 10);
  const colors = [
    new THREE.Color(0x00e5ff),
    new THREE.Color(0x8c2dff),
    new THREE.Color(0xff3d1a)
  ];

  for (let i = 0; i < count; i += 1) {
    const mat = new THREE.ShaderMaterial({
      name: "NebulaCloud",
      uniforms: THREE.UniformsUtils.clone(CloudSpriteShader.uniforms),
      vertexShader: CloudSpriteShader.vertexShader,
      fragmentShader: CloudSpriteShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    mat.uniforms.uColor.value = colors[i % colors.length];
    mat.uniforms.uOpacity.value = 0.02 + Math.random() * 0.015;
    const mesh = new THREE.Mesh(geometry, mat);
    const side = Math.random() < 0.5 ? -1 : 1;
    mesh.position.set(
      side * (36 + Math.random() * 50),
      22 + Math.random() * 28,
      -90 - Math.random() * 70
    );
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(0.8 + Math.random() * 1.4);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}

/**
 * @param {THREE.Group} group
 * @param {THREE.Camera} camera
 * @param {number} time
 */
export function updateNebulaCluster(group, camera, time) {
  if (!group) return;
  for (const cloud of group.children) {
    cloud.quaternion.copy(camera.quaternion);
    cloud.material.uniforms.uTime.value = time;
  }
}
