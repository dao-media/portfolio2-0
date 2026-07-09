export const waterCursorVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const waterCursorFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uStretch;
  uniform float uAngle;
  uniform float uTailBias;
  uniform float uPressScale;
  uniform float uPresence;
  uniform float uRadius;
  uniform float uIdleRadiusWobble;
  uniform float uWaveAmp;
  uniform float uWavePhase;
  uniform float uDeformEnabled;
  uniform vec3 uColor;
  uniform float uOpacity;

  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float theta = atan(p.y, p.x);
    float rel = theta - uAngle;

    float baseR = uRadius * uPressScale * uPresence;
    float r = baseR;

    if (uDeformEnabled > 0.5) {
      // mode 2: symmetric elongation along the motion axis
      r += baseR * uStretch * 0.35 * cos(2.0 * rel);

      // mode 1: nose/tail asymmetry — teardrop without piecewise seams
      r -= baseR * uStretch * uTailBias * cos(rel);

      // mode 3: traveling settle wave
      r += uWaveAmp * cos(3.0 * theta - uWavePhase);

      if (uIdleRadiusWobble > 0.0) {
        r += uIdleRadiusWobble * sin(theta * 3.0 + uTime * 0.8);
      }

      // harmonic overdriven → corners return; keep deviation under ~40%
      r = clamp(r, baseR * 0.6, baseR * 1.4);
    }

    float d = length(p) - r;
    float alpha = 1.0 - smoothstep(-fwidth(d), fwidth(d), d);
    alpha *= uOpacity * clamp(uPresence, 0.0, 1.0);

    if (alpha < 0.001) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;
