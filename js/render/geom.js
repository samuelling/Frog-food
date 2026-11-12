// Small geometry helpers (no BufferGeometryUtils in the vendored three.js build).
import * as THREE from '../vendor/three.module.min.js';

/** merge geometries (all indexed or all non-indexed) with the attributes they share: position, normal, uv, color, aSway */
export function merge(geoms) {
  const names = ['position', 'normal', 'uv', 'color', 'aSway'].filter(n => geoms.every(g => g.attributes[n]));
  const out = new THREE.BufferGeometry();
  let total = 0, itotal = 0; const indexed = geoms.every(g => g.index);
  for (const g of geoms) { total += g.attributes.position.count; if (indexed) itotal += g.index.count; }
  for (const n of names) {
    const size = geoms[0].attributes[n].itemSize, arr = new Float32Array(total * size); let o = 0;
    for (const g of geoms) { const a = g.attributes[n]; for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr[o++] = a.array[i * size + k]; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  if (indexed) {
    const idx = new Uint32Array(itotal); let o = 0, base = 0;
    for (const g of geoms) { for (let i = 0; i < g.index.count; i++) idx[o++] = g.index.array[i] + base; base += g.attributes.position.count; }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

/** a ribbon along points P[i] with half-widths W[i] and side vectors S[i]; cross-section of 3 vertices with a channel */
export function ribbon(P, S, W, opts = {}) {
  const n = P.length, pos = [], uv = [], col = [], sway = [], idx = [];
  const cA = new THREE.Color(opts.colorA || '#ffffff'), cB = new THREE.Color(opts.colorB || opts.colorA || '#ffffff'), c = new THREE.Color();
  const up = opts.up || new THREE.Vector3(0, 1, 0), channel = opts.channel ?? 0.15;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), p = P[i], s = S[i], w = W[i];
    c.copy(cA).lerp(cB, Math.pow(t, opts.colorPow ?? 1));
    const nrm = opts.normals ? opts.normals[i] : up;
    for (let k = -1; k <= 1; k++) {
      const drop = k === 0 ? -channel * w : 0;
      pos.push(p.x + s.x * w * k + nrm.x * drop, p.y + s.y * w * k + nrm.y * drop, p.z + s.z * w * k + nrm.z * drop);
      uv.push(t, (k + 1) / 2); col.push(c.r, c.g, c.b); sway.push(t * t);
    }
    if (i < n - 1) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** a tube along a curve with per-point radius; color gradient; aSway grows along it */
export function tube(points, radii, segs = 6, colA = '#5b7a2a', colB = null, swayScale = 1) {
  const curve = new THREE.CatmullRomCurve3(points), N = Math.max(4, points.length * 3);
  const frames = curve.computeFrenetFrames(N, false), pos = [], nrm = [], uv = [], col = [], sway = [], idx = [];
  const cA = new THREE.Color(colA), cB = new THREE.Color(colB || colA), c = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t), r = radii[0] + (radii[1] - radii[0]) * t, Nn = frames.normals[i], B = frames.binormals[i];
    c.copy(cA).lerp(cB, t);
    for (let j = 0; j <= segs; j++) {
      const a = j / segs * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
      const nx = cx * Nn.x + sy * B.x, ny = cx * Nn.y + sy * B.y, nz = cx * Nn.z + sy * B.z;
      pos.push(p.x + r * nx, p.y + r * ny, p.z + r * nz); nrm.push(nx, ny, nz); uv.push(j / segs, t); col.push(c.r, c.g, c.b); sway.push(t * t * swayScale);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }   // outward-facing
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1)); g.setIndex(idx);
  return g;
}

/** add a constant vertex colour (for merging with coloured geometry) */
export function paint(g, color) { const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
export function noSway(g) { g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1)); return g; }
