/**
 * CRT bezel opening + content plane — measured in Blender from pc-from-source.glb
 * (`scripts/crt-bezel-blender-measure2.py`). Screen-local UV plane basis.
 *
 * Content fills nearly the full bezel opening: inset **2 mm** (was 1 cm) and
 * corner radius **4 mm** (was 1.2 cm) so MySpace/XP chrome is not cropped by the
 * rounded-rect mesh (§20.15). Do NOT add more DOM_CAPTURE_EDGE_PAD — wrong layer.
 */
export const CRT_CONTENT_INSET_M = 0.001;
/** Near-sharp — physical bezel provides the soft corner; mesh rounding was double-cropping. */
export const CRT_CONTENT_CORNER_R_M = 0.001;
/** Opening measure kept from Blender; content = opening − 2×inset. */
const CRT_OPENING_W = 0.24335199052382325 + 2 * 0.01;
const CRT_OPENING_H = 0.18999103180153665 + 2 * 0.01;
export const CRT_CONTENT_PLANE = Object.freeze({
  width: CRT_OPENING_W - 2 * CRT_CONTENT_INSET_M,
  height: CRT_OPENING_H - 2 * CRT_CONTENT_INSET_M,
  aspect: (CRT_OPENING_W - 2 * CRT_CONTENT_INSET_M) / (CRT_OPENING_H - 2 * CRT_CONTENT_INSET_M),
  centerU: -5.4631608769895035e-06,
  centerV: -9.089274185178353e-07,
  depth: 0.0015,
  cornerRadius: CRT_CONTENT_CORNER_R_M,
  canvasWidth: 1024,
  canvasHeight: 813
});
export const CRT_CONTENT_PLANE_URL = "/assets/models/pc-source/crt-content-plane.glb";
