/**
 * Per-vignette rest fidelity. Each resource pays while the camera is settled
 * on that stop and drops (or returns to full) during a hop.
 *
 * The stage applies this list. Do not add a parallel settle toggle.
 */

/** @typedef {"bake-once" | "frustum-subpixel" | "wind-gust"} RestMode */
/** @typedef {"drop-cast" | "full-count" | "skip" | "wind-full"} MotionMode */

/**
 * @typedef {{
 *   id: string,
 *   rest: RestMode,
 *   motion: MotionMode,
 *   probeSize?: number,
 *   everyN?: number,
 *   subpixelPx?: number,
 *   ndcMargin?: number
 * }} RestResource
 */

/** @type {Record<string, { index: number, resources: readonly RestResource[] }>} */
export const REST_FIDELITY = Object.freeze({
  bust: Object.freeze({
    index: 0,
    resources: Object.freeze([
      Object.freeze({
        id: "lantern-shadow-bake",
        rest: "bake-once",
        motion: "drop-cast"
      }),
      Object.freeze({
        id: "grass-rest-cull",
        rest: "frustum-subpixel",
        motion: "full-count",
        subpixelPx: 1,
        ndcMargin: 0.12
      }),
      Object.freeze({
        id: "grass-rest-wind",
        rest: "wind-gust",
        motion: "wind-full"
      }),
      Object.freeze({
        id: "wet-floor-probe",
        rest: "bake-once",
        motion: "skip",
        probeSize: 64
      })
    ])
  })
});

/**
 * @param {number} index
 */
export function restFidelityForIndex(index) {
  for (const entry of Object.values(REST_FIDELITY)) {
    if (entry.index === index) return entry;
  }
  return null;
}

/**
 * @param {number} index
 * @param {string} id
 * @returns {RestResource | null}
 */
export function restResource(index, id) {
  const entry = restFidelityForIndex(index);
  if (!entry) return null;
  return entry.resources.find((resource) => resource.id === id) ?? null;
}
