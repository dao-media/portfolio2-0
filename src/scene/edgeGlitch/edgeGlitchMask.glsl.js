/**
 * Soft occlusion fade — clip glitch against other geometry, but allow the
 * diamond's OUTSIDE half (spanOut) on empty background so tears/fringes
 * extend past the alpha edge.
 *
 * BasicDepthPacking: .r = 1 − windowZ (nearer = brighter). Empty/far = 0.
 *
 * Window-Z soft windows are too loose for same-stop props (shelf vs neon at
 * ~similar distance) — compare metric view-Z instead (uCamNear / uCamFar).
 * Do NOT fall back to edgeUv dilation across empty gaps (ladder unilateral bands).
 */
export const EDGE_GLITCH_OCC_GLSL = /* glsl */ `
float edgeGlitchUnpackWindowZ(float pack) {
  return 1.0 - pack;
}

float edgeGlitchViewZ(float pack, float camNear, float camFar) {
  float w = edgeGlitchUnpackWindowZ(pack);
  // Perspective: viewZ = (n*f) / (f − w*(f−n)), w = window Z in [0,1].
  return (camNear * camFar) / max(camFar - w * (camFar - camNear), 1e-5);
}

float edgeGlitchBustPackDilate(sampler2D bustDepth, vec2 uv, vec2 edgeUv, vec2 texel) {
  float pack = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      pack = max(pack, texture2D(bustDepth, uv + vec2(float(x), float(y)) * texel).r);
    }
  }
  if (pack < 1e-3) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        pack = max(pack, texture2D(bustDepth, edgeUv + vec2(float(x), float(y)) * texel).r);
      }
    }
  }
  return pack;
}

float edgeGlitchOccFade(
  sampler2D sceneDepth,
  sampler2D bustDepth,
  sampler2D edgeSdf,
  vec2 uv,
  vec2 edgeUv,
  vec2 bustTexel,
  float soft,
  float bias,
  float hasSceneDepth,
  float camNear,
  float camFar,
  float spanOut
) {
  float localPack = texture2D(bustDepth, uv).r;
  float dSdf = texture2D(edgeSdf, uv).r;
  // Outside the silhouette but still in the diamond's out-span (empty BG tips).
  float outPad = max(spanOut, 1e-6) * 1.35;
  float outsideTip = step(0.0, dSdf) * step(dSdf, outPad);

  float bustPack = edgeGlitchBustPackDilate(bustDepth, uv, edgeUv, bustTexel);
  if (bustPack < 1e-3 && outsideTip < 0.5) return 0.0;

  // No scene depth: allow subject + outside tips (diamond already gates where).
  if (hasSceneDepth < 0.5) {
    if (localPack > 1e-3 || outsideTip > 0.5) return 1.0;
    return 0.0;
  }

  float scenePack = texture2D(sceneDepth, uv).r;

  // Cleared far / sky — outside tips OK; tiny local dilate for AA on the rim.
  if (scenePack < 1e-3) {
    if (localPack > 1e-3 || outsideTip > 0.5) return 1.0;
    float fringe = localPack;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        fringe = max(
          fringe,
          texture2D(bustDepth, uv + vec2(float(x), float(y)) * bustTexel).r
        );
      }
    }
    return fringe > 1e-3 ? 1.0 : 0.0;
  }

  // Visible surface must be the subject within soft meters of view-Z.
  // Outside tips over other geometry (floor/props) stay clipped by mismatch.
  if (bustPack < 1e-3) return 0.0;
  float bustZ = edgeGlitchViewZ(bustPack, camNear, camFar);
  float sceneZ = edgeGlitchViewZ(scenePack, camNear, camFar);
  float mismatch = abs(sceneZ - bustZ);
  // soft is still the old window-Z knob (~0.004); map to meters (~0.12–0.25).
  float softM = max(soft * 30.0, 0.08) + bias * 40.0;
  return 1.0 - smoothstep(softM, softM * 2.5, mismatch);
}
`;

/**
 * Strength FIELD — L1 (Manhattan) diamond in the edge's local UV frame.
 *
 * Center = CROSS POINT (cursor projected onto alpha via SDF gradient).
 *   tAlong  = UV offset along edge tangent from crossUv
 *   tAcross = UV offset along edge normal from crossUv (NOT global SDF —
 *             global SDF re-zeros at every other silhouette edge, which turned
 *             vertical-edge diamonds into unilateral horizontal bands across
 *             ladder rails / multi-root props)
 *   across  = tAcross / spanOut  (out)  or  (−tAcross) / spanIn  (in)
 *   strength = max(0, 1 − |tAlong|/spanAlong − across)
 *
 * edgeNormal must point outside (same direction as sdfGrad at the cross).
 */
export const EDGE_GLITCH_MASK_GLSL = /* glsl */ `
float edgeGlitchWhere(
  vec2 uv,
  sampler2D edgeSdf,
  vec2 crossUv,
  vec2 edgeTangent,
  vec2 edgeNormal,
  float spanAlong,
  float spanOut,
  float spanIn
) {
  float tAlong = dot(uv - crossUv, edgeTangent);
  float tAcross = dot(uv - crossUv, edgeNormal);
  float across = (tAcross > 0.0)
    ? tAcross / max(spanOut, 1e-6)
    : (-tAcross) / max(spanIn, 1e-6);
  return max(0.0, 1.0 - abs(tAlong) / max(spanAlong, 1e-6) - across);
}
`;
