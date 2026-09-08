/**
 * CRT bezel opening + content plane — measured in Blender from pc-from-source.glb
 * (`scripts/crt-bezel-blender-measure2.py`). Screen-local UV plane basis.
 * Content is the bezel opening inset 1 cm with slight rounded corners.
 */
export const CRT_CONTENT_INSET_M = 0.01;
export const CRT_CONTENT_CORNER_R_M = 0.012;
export const CRT_CONTENT_PLANE = Object.freeze({
  width: 0.24335199052382325,
  height: 0.18999103180153665,
  aspect: 1.2808604080745616,
  centerU: -5.4631608769895035e-06,
  centerV: -9.089274185178353e-07,
  depth: 0.0015,
  cornerRadius: 0.012,
  canvasWidth: 1024,
  canvasHeight: 799,
});
export const CRT_CONTENT_PLANE_URL = "/assets/models/pc-source/crt-content-plane.glb";
