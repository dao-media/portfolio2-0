import * as THREE from "three";

/**
 * Pass L L5 — per-stop dark environment (K2 variant A, Dane's pick).
 *
 * The shadow-side fill used to be almost entirely the white studio
 * RoomEnvironment (scene.environment, intensity 0.6): ambient 0.03 + hemi
 * 0.08 are tiny. Each stop now gets its own PMREM, captured from that stop's
 * position with everything hidden except the stop's own emitters (its neon
 * tube + floor glow — the lantern at Bust — the CRT screen at Desktop, the
 * LCD at Sidekick) over black. It is swapped in as scene.environment for the
 * visible stop at the SAME intensity value (environmentIntensity is
 * untouched); only one stop is ever visible (Pass J stop fade), so one
 * environment at a time is exact. Same PMREM size as the studio env (256),
 * so no program changes.
 *
 * The K2 debug capture missed one thing this does: emitters are captured at
 * full strength. A stop that is faded out has its whole group — tube
 * included — at opacity 0, so capturing stops 1–3 from Bust (as the study
 * did) baked their own neon at zero.
 */

const _center = new THREE.Vector3();

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.PMREMGenerator} pmrem
 * @param {THREE.Scene} scene
 * @param {{ group: THREE.Object3D, emitters: THREE.Object3D[], height?: number }} stop
 * @returns {THREE.Texture}
 */
export function captureStopDarkEnv(renderer, pmrem, scene, stop) {
  const keep = new Set();
  for (const root of stop.emitters) root?.traverse((o) => keep.add(o));
  const hidden = [];
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || keep.has(o) || !o.visible) return;
    o.visible = false;
    hidden.push(o);
  });
  // Emitters at full strength whatever the stop fade / layer cull says —
  // ancestors included (a culled stop's group may be hidden higher up).
  const ancestors = [];
  for (const root of stop.emitters) {
    for (let p = root?.parent; p; p = p.parent) {
      if (!p.visible) {
        ancestors.push(p);
        p.visible = true;
      }
    }
  }
  const saved = [];
  for (const o of keep) {
    const entry = { o, visible: o.visible, mask: o.layers.mask, mats: [] };
    o.visible = true;
    o.layers.enableAll();
    if (o.isMesh && o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m) continue;
        entry.mats.push([m, m.opacity, m.transparent, m.visible]);
        const authored = m.userData?.__revealAuthored?.opacity;
        m.opacity = Number.isFinite(authored) ? authored : 1;
        m.visible = true;
      }
    }
    saved.push(entry);
  }
  const bg = scene.background;
  const env = scene.environment;
  const fog = scene.fog;
  scene.background = new THREE.Color(0x000000);
  scene.environment = null;
  scene.fog = null;
  stop.group.getWorldPosition(_center);
  _center.y += stop.height ?? 1.0;
  let tex = null;
  try {
    tex = pmrem.fromScene(scene, 0.04, 0.05, 60, { position: _center }).texture;
    tex.name = `stop-dark-env:${stop.group.name || ""}`;
  } finally {
    scene.background = bg;
    scene.environment = env;
    scene.fog = fog;
    for (const o of hidden) o.visible = true;
    for (const p of ancestors) p.visible = false;
    for (const { o, visible, mask, mats } of saved) {
      o.visible = visible;
      o.layers.mask = mask;
      for (const [m, opacity, transparent, vis] of mats) {
        m.opacity = opacity;
        m.transparent = transparent;
        m.visible = vis;
      }
    }
  }
  return tex;
}
