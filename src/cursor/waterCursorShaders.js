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
  uniform float uRimPress;
  uniform float uBlow;
  uniform float uSlurp;
  uniform float uNeck;
  uniform float uSlurpAngle;
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
    // Basic squeeze / elongation along the rim axis (into fill = against glitch push).
    vec2 tipDir = vec2(cos(uSlurpAngle), sin(uSlurpAngle));
    vec2 sideDir = vec2(-tipDir.y, tipDir.x);
    vec2 p = vUv - 0.5;

    float tear = uBlow * (1.0 - uSlurp * 0.75);
    float couple = max(tear, uSlurp);

    // Elongate along tip; squeeze sideways (uNeck strengthens the squeeze)
    float along = 1.0 + tear * 0.4 + uSlurp * 0.18;
    float across = 1.0 - tear * 0.18 - uSlurp * 0.12 * mix(0.5, 1.0, uNeck);
    across = max(across, 0.72);

    float gx = dot(p, tipDir) / along;
    float gy = dot(p, sideDir) / across;

    float baseR = uRadius * uPressScale * uRimPress * uPresence;
    float r = baseR;

    if (uDeformEnabled > 0.5) {
      float theta = atan(gy, gx);
      float rel = theta - uAngle;
      float tipRel = theta - uSlurpAngle;

      float motionAmt = uStretch * (1.0 - couple * 0.85);
      r += baseR * motionAmt * 0.35 * cos(2.0 * rel);
      r -= baseR * motionAmt * uTailBias * cos(rel);

      // Mild tip/tail bias — keep subtle, single mass
      float tip = cos(tipRel);
      r += baseR * tear * 0.22 * (-tip);
      r += baseR * uSlurp * 0.12 * tip;

      r += uWaveAmp * cos(3.0 * theta - uWavePhase);
      if (uIdleRadiusWobble > 0.0) {
        r += uIdleRadiusWobble * sin(theta * 3.0 + uTime * 0.8);
      }

      r = clamp(r, baseR * 0.7, baseR * 1.35);
    }

    float d = length(vec2(gx, gy)) - r;
    float alpha = 1.0 - smoothstep(-fwidth(d), fwidth(d), d);
    alpha *= uOpacity * clamp(uPresence, 0.0, 1.0);

    if (alpha < 0.001) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;
