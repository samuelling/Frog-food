// Near-field detail that only exists at fly scale: soil grains as boulders, moss as a forest of stems and
// capsules, fallen leaves as huge curled sheets. Placed per grid cell from a hash, so the same boulder is
// always in the same place, and rebuilt around the fly as it walks.
import * as THREE from '../vendor/three.module.min.js';
import { toon, inked } from './toon.js';
import { hash2 } from '../core/rng.js';
import { noSway } from './geom.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Detail {
  constructor(world, parent, mobile = false) {
    this.world = world; this.center = { x: Infinity, z: Infinity };
    this.layers = [];
    const grain = new THREE.IcosahedronGeometry(1, 1);
    // gently flatten the icosahedra into pebbles
    const gp = grain.attributes.position; for (let i = 0; i < gp.count; i++) gp.setY(i, gp.getY(i) * 0.7); grain.computeVertexNormals();
    // moss: a stem with a leafy crown and (sometimes) a capsule on a seta; built as one small geometry
    const moss = mossGeometry();
    const leaf = litterGeometry();
    const sprout = sproutGeometry();
    this.add('grains', grain, toon({ vertexColors: false, color: '#ffffff', rim: 0.25, noise: 0.35, noiseScale: 3 }), { cell: 2.6, radius: mobile ? 34 : 46, per: 2, max: mobile ? 1500 : 3200, ink: 0.01 });
    this.add('moss', moss, toon({ color: '#ffffff', rim: 0.35, noise: 0.3, noiseScale: 2, trans: 0.8, transCol: '#e2ff7a', sway: 0.25, side: THREE.DoubleSide }), { cell: 1.4, radius: mobile ? 24 : 34, per: 2, max: mobile ? 2400 : 6000, ink: 0 });
    this.add('litter', leaf, toon({ color: '#ffffff', rim: 0.2, noise: 0.4, noiseScale: 0.8, side: THREE.DoubleSide, trans: 0.4, transCol: '#ffb060' }), { cell: 11, radius: mobile ? 90 : 120, per: 1, max: 500, ink: 0.02 });
    this.add('sprouts', sprout, toon({ color: '#ffffff', rim: 0.3, noise: 0.2, side: THREE.DoubleSide, trans: 0.9, sway: 0.8 }), { cell: 6, radius: mobile ? 50 : 70, per: 1, max: 600, ink: 0.008 });
    for (const L of this.layers) parent.add(L.mesh);
  }
  add(name, geo, mat, o) {
    const mesh = new THREE.InstancedMesh(geo, mat, o.max); mesh.count = 0; mesh.frustumCulled = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.max * 3), 3);
    if (o.ink) inked(mesh, { width: o.ink, max: 0.3 });
    this.layers.push({ name, mesh, ...o });
  }
  update(pos, force = false) {
    if (!force && Math.hypot(pos.x - this.center.x, pos.z - this.center.z) < 3) return;
    this.center = { x: pos.x, z: pos.z };
    const W = this.world;
    for (const L of this.layers) {
      let k = 0; const c0x = Math.floor(pos.x / L.cell), c0z = Math.floor(pos.z / L.cell), n = Math.ceil(L.radius / L.cell);
      for (let i = -n; i <= n && k < L.max; i++) for (let j = -n; j <= n && k < L.max; j++) {
        if (i * i + j * j > n * n) continue;
        const cx = c0x + i, cz = c0z + j;
        for (let q = 0; q < L.per && k < L.max; q++) {
          const h = (sd) => hash2(cx * 3 + q * 101, cz * 5 - q * 37, sd);
          const x = (cx + h(1)) * L.cell, z = (cz + h(2)) * L.cell;
          const s = W.surface(x, z); if (s.kind === 'water' || s.kind === 'dish' || s.kind === 'glass' || s.kind === 'banana') continue;
          this._zc = z;
          if (!this[L.name](x, s, W.moss(x, z), h(3), h, L)) continue;
          L.mesh.setMatrixAt(k, _m); L.mesh.setColorAt(k, _c); k++;
        }
      }
      L.mesh.count = k; L.mesh.instanceMatrix.needsUpdate = true; if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true;
      for (const ch of L.mesh.children) ch.count = k;
    }
  }
  grains(x, s, moss, r, h) {
    if (s.kind === 'moss' && r > 0.25) return false;
    if (s.kind === 'bark' && r > 0.3) return false;
    const size = 0.12 + Math.pow(h(4), 2.2) * (s.kind === 'stone' ? 0.6 : 1.1);
    _e.set(h(5) * 3, h(6) * 6, h(7) * 3); _q.setFromEuler(_e); _s.set(size, size * (0.6 + h(8) * 0.5), size * (0.8 + h(9) * 0.4));
    return this._place(x, s, size, h, s.kind === 'stone' ? '#8b887d' : s.kind === 'bark' ? '#6b5038' : h(10) < 0.5 ? '#6e5236' : '#8a6c48', 0.15);
  }
  _place(x, s, size, h, color, vary) {
    _p.set(x, s.y - size * 0.25, this._zc); _m.compose(_p, _q, _s); _c.set(color).multiplyScalar(1 - vary + 2 * vary * h(11)); return true;
  }
  moss(x, s, moss, r, h) {
    if (moss < 0.45 || r > moss * 1.2) return false;
    const tall = 1.2 + h(4) * 3.2 * moss, wide = tall * (0.8 + h(8) * 0.5);
    _e.set((h(5) - 0.5) * 0.5, h(6) * 6.28, (h(7) - 0.5) * 0.5); _q.setFromEuler(_e); _s.set(wide, tall, wide);
    return this._place(x, s, 0, h, h(9) < 0.3 ? '#8ab83e' : h(9) < 0.8 ? '#5c9a32' : '#3f7a2a', 0.18);
  }
  litter(x, s, moss, r, h) {
    if (moss > 0.6 && r > 0.2) return false;
    if (r > 0.55) return false;
    const L = 6 + h(4) * 16;
    _e.set((h(5) - 0.5) * 0.3, h(6) * 6.28, (h(7) - 0.5) * 0.3); _q.setFromEuler(_e); _s.set(L * 0.55, L * 0.5, L);
    return this._place(x, { y: s.y + 0.2 }, 0, h, ['#9a6b34', '#b4843e', '#7a4f2a', '#c49a52', '#6e5a30'][Math.floor(h(9) * 5)], 0.12);
  }
  sprouts(x, s, moss, r, h) {
    if (r > 0.35 || s.kind === 'stone') return false;
    const L = 3 + h(4) * 7;
    _e.set(0, h(6) * 6.28, 0); _q.setFromEuler(_e); _s.set(L, L, L);
    return this._place(x, s, 0, h, h(9) < 0.5 ? '#6aa83a' : '#8cc04a', 0.15);
  }
}
function mossGeometry() {
  // one moss shoot (unit height): a thin stem clothed in a spiral of narrow pointed leaves, like a bottle-brush
  const pos = [], nrm = [], uv = [], sway = [];
  const tri = (a, b, c, t) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map(x => x / l); for (const p of [a, b, c]) { pos.push(...p); nrm.push(...n); uv.push(0, t); sway.push(t * 0.6); } };
  // stem: 4 thin quads
  for (let k = 0; k < 4; k++) { const a0 = k * Math.PI / 2, a1 = a0 + Math.PI / 2, r = 0.025; const p0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r], q0 = [p0[0] * 0.5, 1, p0[2] * 0.5], q1 = [p1[0] * 0.5, 1, p1[2] * 0.5]; tri(p0, q0, p1, 0.5); tri(p1, q0, q1, 0.5); }
  // leaves
  const n = 26;
  for (let k = 0; k < n; k++) {
    const t = 0.12 + 0.88 * k / n, a = k * 2.4, len = 0.22 * (1 - 0.55 * t) + 0.05, w = 0.035, up = 0.55 + 0.35 * t;
    const d = [Math.cos(a), 0, Math.sin(a)], s = [-Math.sin(a) * w, 0, Math.cos(a) * w];
    const base = [d[0] * 0.02, t, d[2] * 0.02], tip = [d[0] * len * Math.cos(up), t + len * Math.sin(up), d[2] * len * Math.cos(up)];
    const l = [base[0] + s[0], base[1], base[2] + s[2]], r = [base[0] - s[0], base[1], base[2] - s[2]];
    tri(l, tip, r, t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  return g;
}
function litterGeometry() {
  // a curled fallen leaf: unit length along z, curled up at the edges
  const g = new THREE.PlaneGeometry(1, 1, 6, 10); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i) + 0.5, w = Math.sin(Math.PI * z) * (1 - 0.2 * z); p.setX(i, x * w); p.setZ(i, z - 0.5); p.setY(i, (x * x) * 0.35 + Math.sin(z * 3) * 0.04); }
  g.computeVertexNormals(); return noSway(g);
}
function sproutGeometry() {
  // a seedling / grass tuft: three blades, unit height
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(0.08, 1, 1, 4).translate(0, 0.5, 0); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, y * y * 0.35); p.setX(i, p.getX(i) * (1 - y * 0.8)); }
    g.rotateY(k * 2.1); parts.push(g);
  }
  const g = mergeSimple(parts); g.computeVertexNormals();
  const p = g.attributes.position, sw = new Float32Array(p.count); for (let i = 0; i < p.count; i++) sw[i] = p.getY(i) * p.getY(i) * 0.2;
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  return g;
}
function mergeSimple(list) {
  const geos = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
