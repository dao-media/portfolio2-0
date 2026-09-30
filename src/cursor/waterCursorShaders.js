export const waterCursorVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * GPU rim resolve — 3 SDF taps + the same response curves the CPU path used.
 * Writes a 2×1 float target (no readPixels):
 *   pixel 0: blow, raw slurp, neck, tip angle
 *   pixel 1: pushX px, pushY px (CSS; +Y down), 0, 1
 * Temporal damp matches WaterCursor rimFieldSmooth (state stays on the GPU).
 */
export const waterCursorRimResolveShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uEdgeSdf;
  uniform sampler2D uRimPrev;
  uniform vec2 uCursorUv;
  uniform float uSdfEps;
  uniform float uRimGate;
  uniform float uArm;
  uniform float uArmRamp;
  uniform float uInsideFree;
  uniform float uSlurpBand;
  uniform float uBlowExponent;
  uniform float uNeckPinch;
  uniform float uRecoilPushPx;
  uniform float uSnap;
  uniform float uSmooth;
  uniform float uDt;

  void main() {
    vec4 prev0 = texture2D(uRimPrev, vec2(0.25, 0.5));
    vec4 prev1 = texture2D(uRimPrev, vec2(0.75, 0.5));

    float blow = 0.0;
    float slurp = 0.0;
    float neck = 0.0;
    float tip = prev0.a;
    float pushX = 0.0;
    float pushY = 0.0;

    if (uRimGate > 0.5) {
      vec2 uv = clamp(uCursorUv, 0.0, 1.0);
      float d = texture2D(uEdgeSdf, uv).r;
      float dU = texture2D(uEdgeSdf, vec2(min(uv.x + uSdfEps, 1.0), uv.y)).r;
      float dV = texture2D(uEdgeSdf, vec2(uv.x, min(uv.y + uSdfEps, 1.0))).r;
      float arm = max(uArm, 1e-6);

      if (d >= -uInsideFree && d <= arm) {
        float gx = dU - d;
        float gy = dV - d;
        float rawLen = length(vec2(gx, gy));
        float gLen = 0.0;
        if (rawLen > 1e-8) {
          gx /= rawLen;
          gy /= rawLen;
          gLen = 1.0;
        } else {
          gx = 0.0;
          gy = 0.0;
        }

        float proximity = 0.0;
        if (d > 0.0) {
          float t = clamp(1.0 - d / arm, 0.0, 1.0);
          proximity = pow(t, max(uArmRamp, 0.01));
        }
        slurp = 1.0 - clamp(abs(d) / max(uSlurpBand, 1e-4), 0.0, 1.0);

        if (proximity >= 1e-4 || slurp >= 1e-4) {
          float p = clamp(proximity, 0.0, 1.0);
          float s = p * p * (3.0 - 2.0 * p);
          if (d > 0.0 && s > 1e-5) {
            blow = pow(s, max(uBlowExponent, 1.0));
          } else {
            blow = 0.0;
          }
          if (d < -uSnap) blow = 0.0;
          neck = slurp * clamp(uNeckPinch, 0.0, 1.0);
          if (d >= -uSnap) {
            pushX = gx * uRecoilPushPx;
            pushY = -gy * uRecoilPushPx;
          }
          if (gLen > 0.15) {
            float next = atan(gy, -gx);
            float diff = atan(sin(next - tip), cos(next - tip));
            if (abs(diff) <= 3.14159265 * 0.55) tip = next;
          }
        }
      }
    }

    float k = 1.0 - exp(-max(uSmooth, 0.0) * max(uDt, 0.0));
    blow = mix(prev0.r, clamp(blow, 0.0, 1.0), k);
    slurp = mix(prev0.g, clamp(slurp, 0.0, 1.0), k);
    neck = mix(prev0.b, clamp(neck, 0.0, 1.0), k);
    float angDiff = atan(sin(tip - prev0.a), cos(tip - prev0.a));
    tip = prev0.a + angDiff * k;
    pushX = mix(prev1.r, pushX, k);
    pushY = mix(prev1.g, pushY, k);

    if (gl_FragCoord.x < 1.0) {
      gl_FragColor = vec4(blow, slurp, neck, tip);
    } else {
      gl_FragColor = vec4(pushX, pushY, 0.0, 1.0);
    }
  }
`;

export const waterCursorRimResolveVertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const waterCursorFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uStretch;
  uniform float uAngle;
  uniform float uGravity;
  uniform float uCurve;
  uniform float uHoleHide;
  uniform vec2 uHoleUv;
  uniform float uHoleRad;
  uniform float uTailBias;
  uniform float uPressScale;
  uniform float uRimPress;
  uniform float uPresence;
  uniform float uRadius;
  uniform float uIdleRadiusWobble;
  uniform float uWaveAmp;
  uniform float uWavePhase;
  uniform float uDeformEnabled;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform sampler2D uRimState;
  uniform float uRimSlurp;
  uniform float uQuadPx;

  varying vec2 vUv;

  void main() {
    vec4 rim = texture2D(uRimState, vec2(0.25, 0.5));
    vec4 push = texture2D(uRimState, vec2(0.75, 0.5));

    float blow = 0.0;
    float slurp = 0.0;
    float neck = 0.0;
    float tipAngle = 0.0;
    vec2 pushUv = vec2(0.0);

    if (uDeformEnabled > 0.5) {
      float slurpRaw = rim.g;
      blow = rim.r;
      slurp = slurpRaw * uRimSlurp;
      neck = rim.b;
      tipAngle = rim.a;
      float recoilMul = blow * (1.0 - slurpRaw * 0.85);
      pushUv = vec2(push.r, push.g) * recoilMul / max(uQuadPx, 1.0);
    }

    vec2 tipDir = vec2(cos(tipAngle), sin(tipAngle));
    vec2 sideDir = vec2(-tipDir.y, tipDir.x);
    vec2 p = vUv - 0.5 - pushUv;

    vec2 flowDir = vec2(cos(uAngle), sin(uAngle));
    vec2 flowSide = vec2(-flowDir.y, flowDir.x);
    float gAlong = 1.0 + uGravity * 0.9;
    float gAcross = max(0.64, 1.0 - uGravity * 0.32);
    float alongFlow = dot(p, flowDir);
    float acrossFlow = dot(p, flowSide) - uCurve * alongFlow * alongFlow;
    p = flowDir * (alongFlow / gAlong) + flowSide * (acrossFlow / gAcross);

    float tear = blow * (1.0 - slurp * 0.75);
    float couple = max(tear, slurp);

    float along = 1.0 + tear * 0.4 + slurp * 0.18;
    float across = 1.0 - tear * 0.18 - slurp * 0.12 * mix(0.5, 1.0, neck);
    across = max(across, 0.72);

    float gx = dot(p, tipDir) / along;
    float gy = dot(p, sideDir) / across;

    float baseR = uRadius * uPressScale * uRimPress * uPresence;
    float r = baseR;

    if (uDeformEnabled > 0.5) {
      float theta = atan(gy, gx);
      float rel = theta - uAngle;
      float tipRel = theta - tipAngle;

      float motionAmt = uStretch * (1.0 - couple * 0.85);
      r += baseR * motionAmt * 0.35 * cos(2.0 * rel);
      r -= baseR * motionAmt * uTailBias * cos(rel);

      float tip = cos(tipRel);
      r += baseR * tear * 0.22 * (-tip);
      r += baseR * slurp * 0.12 * tip;

      r += uWaveAmp * cos(3.0 * theta - uWavePhase);
      if (uIdleRadiusWobble > 0.0) {
        r += uIdleRadiusWobble * sin(theta * 3.0 + uTime * 0.8);
      }

      r = clamp(r, baseR * 0.7, baseR * 1.35);
    }

    float d = length(vec2(gx, gy)) - r;
    float alpha = 1.0 - smoothstep(-fwidth(d), fwidth(d), d);
    alpha *= uOpacity * clamp(uPresence, 0.0, 1.0);
    if (uHoleHide > 0.001 && uHoleRad > 0.0) {
      float holeD = length(vUv - uHoleUv);
      float cover = 1.0 - smoothstep(uHoleRad * 0.9, uHoleRad * 1.06, holeD);
      alpha *= 1.0 - cover * uHoleHide;
    }

    if (alpha < 0.001) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;
