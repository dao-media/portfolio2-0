/**
 * Soft occlusion fade — 1 when bust is visible, 0 when scene is nearer.
 * BasicDepthPacking: .r = 1 − windowZ (nearer = brighter). Empty/far = 0.
 * Dilates bust pack so outside-rim samples inherit silhouette Z.
 */
export const EDGE_GLITCH_OCC_GLSL = /* glsl */ `
float edgeGlitchUnpackWindowZ(float pack) {
  return 1.0 - pack;
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
  vec2 uv,
  vec2 edgeUv,
  vec2 bustTexel,
  float soft,
  float bias,
  float hasSceneDepth
) {
  if (hasSceneDepth < 0.5) return 1.0;
  float bustPack = edgeGlitchBustPackDilate(bustDepth, uv, edgeUv, bustTexel);
  if (bustPack < 1e-3) return 0.0;
  float bustW = edgeGlitchUnpackWindowZ(bustPack);
  float sceneW = edgeGlitchUnpackWindowZ(texture2D(sceneDepth, uv).r);
  // delta > 0 → scene farther than bust → bust visible
  float delta = sceneW - bustW;
  return smoothstep(-max(soft, 1e-6), max(soft, 1e-6), delta + bias);
}
`;

/**
 * Local silhouette-rim mask.
 *
 * WHERE = bilateral SDF rim × soft falloff from EDGE ORIGIN (projected cursor).
 * Local radius grows only slightly with proximity (scale).
 * Cursor→edge proximity is applied in the pass for WIDTH + INTENSITY.
 * Hard cut when cursor is inside (caller / dCursor).
 */
export const EDGE_GLITCH_MASK_GLSL = /* glsl */ `
float edgeGlitchWhere(vec2 uv, sampler2D edgeSdf, vec2 edgeUv,
    float bandOuter, float localRadius) {
  float d = texture2D(edgeSdf, uv).r;
  float edgeBand = smoothstep(bandOuter, 0.0, abs(d));
  // Soft fade from origin — follows the rim locally, not a hard sticker box
  float local = 1.0 - smoothstep(localRadius * 0.4, localRadius, distance(uv, edgeUv));
  return edgeBand * local;
}
`;
