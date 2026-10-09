/**
 * Pass N N1 — winding analysis for a single triangle mesh (DEV probe:
 * debugAppleTopology). The apple tree came out as an open soup — no closed
 * component — so a runtime re-orient is not possible (§20 11k).
 *
 * Components are found by welding vertices on position (UV seams split
 * vertices, not surfaces). For each component: triangle count, boundary
 * edges (edge used by one triangle — 0 = closed), and signed volume (< 0 =
 * winding points inward, i.e. the outside is drawn by back faces).
 */
import * as THREE from "three";

function weldIds(pos) {
  const ids = new Int32Array(pos.count);
  const map = new Map();
  let next = 0;
  for (let i = 0; i < pos.count; i += 1) {
    const k = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    let id = map.get(k);
    if (id === undefined) {
      id = next;
      next += 1;
      map.set(k, id);
    }
    ids[i] = id;
  }
  return { ids, count: next };
}

/**
 * @param {THREE.BufferGeometry} geo
 */
export function analyzeOrientation(geo) {
  const pos = geo.attributes.position;
  const index = geo.index ? geo.index.array : null;
  const triCount = (index ? index.length : pos.count) / 3;
  const vi = (t, k) => (index ? index[t * 3 + k] : t * 3 + k);
  const { ids, count } = weldIds(pos);
  // union-find over welded vertices
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i += 1) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let t = 0; t < triCount; t += 1) {
    const a = find(ids[vi(t, 0)]);
    const b = find(ids[vi(t, 1)]);
    const c = find(ids[vi(t, 2)]);
    parent[b] = a;
    parent[find(c)] = find(a);
  }
  const comps = new Map();
  const triComp = new Int32Array(triCount);
  const edges = new Map();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let t = 0; t < triCount; t += 1) {
    const i0 = vi(t, 0);
    const i1 = vi(t, 1);
    const i2 = vi(t, 2);
    const root = find(ids[i0]);
    triComp[t] = root;
    let c = comps.get(root);
    if (!c) {
      c = { tris: 0, volume: 0, boundary: 0 };
      comps.set(root, c);
    }
    c.tris += 1;
    A.fromBufferAttribute(pos, i0);
    B.fromBufferAttribute(pos, i1);
    C.fromBufferAttribute(pos, i2);
    c.volume += A.dot(B.clone().cross(C)) / 6;
    for (const [p, q] of [[ids[i0], ids[i1]], [ids[i1], ids[i2]], [ids[i2], ids[i0]]]) {
      const k = p < q ? `${p}_${q}` : `${q}_${p}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of edges) {
    if (n !== 1) continue;
    const root = find(Number(k.split("_")[0]));
    comps.get(root).boundary += 1;
  }
  return { triCount, comps, triComp };
}
