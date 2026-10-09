/**
 * Pass M M3 — bake a point light's cube shadow one face per frame.
 *
 * three r172 (WebGLShadowMap.render) draws all six faces of a
 * PointLightShadow into one 4×2 atlas in a single pass: setRenderTarget(map),
 * clear() the whole map, then one viewport per face. For the duration of
 * `fn` the shadow reports a single viewport (face `face`) and the map is
 * scissored to that face's rect — setRenderTarget applies the target's
 * scissor, so the clear only wipes that face. Faces never overlap, so six
 * calls give the same map as one full bake (verified: debugFaceBakeCompare).
 *
 * The light still needs `shadow.needsUpdate` + `renderer.shadowMap.needsUpdate`
 * and a renderer.render() inside `fn`, as for a normal bake.
 */

/**
 * @template T
 * @param {import("three").PointLight} light
 * @param {number} face 0..5
 * @param {() => T} fn
 * @returns {T}
 */
export function withShadowFace(light, face, fn) {
  const shadow = light.shadow;
  const proto = Object.getPrototypeOf(shadow);
  const viewport = shadow._viewports[face];
  const count = shadow._viewportCount;
  shadow._viewportCount = 1;
  shadow.getViewport = () => viewport;
  shadow.updateMatrices = (l) => proto.updateMatrices.call(shadow, l, face);
  shadow.needsUpdate = true;
  // No map yet: three allocates it in this call and clears all of it (it is
  // new, so that is the same as clearing face 0).
  const map = shadow.map;
  const scissorTest = map?.scissorTest ?? false;
  if (map) {
    const w = shadow.mapSize.x;
    const h = shadow.mapSize.y;
    map.scissor.set(w * viewport.x, h * viewport.y, w * viewport.z, h * viewport.w);
    map.scissorTest = true;
  }
  try {
    return fn();
  } finally {
    delete shadow.getViewport;
    delete shadow.updateMatrices;
    shadow._viewportCount = count;
    if (map) {
      map.scissorTest = scissorTest;
      map.scissor.set(0, 0, map.width, map.height);
    }
  }
}

export const SHADOW_CUBE_FACES = 6;
