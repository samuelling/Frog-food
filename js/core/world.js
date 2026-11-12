// The vivarium: a 45 x 45 x 60 cm dart-frog tank, in true millimetres. Pure functions and data, no rendering:
// the game logic, the headless tests and the renderer all ask this module where the ground is.
//
// Layout (x to the right, z towards the front glass, y up; the keeper looks in through the front, +z):
//   substrate sloping up towards the back, a shallow pond front-left, a half-buried cork log across the back,
//   two bromeliads (a giant one back-right with a water-filled cup), broad hanging leaves as shelter,
//   a petri dish of fermenting banana front-right (where the flies gather, and so do the frogs),
//   moss carpets, stones, fern clusters whose stems are tree trunks at fly scale, mist droplets everywhere.
import { mulberry32, fbm2, noise2, clamp, smoothstep, hash2 } from './rng.js';
import { TANK, PHYS } from './scale.js';

export const WIND = (() => { const x = 0.28, z = -1, l = Math.hypot(x, z); return { x: x / l, z: z / l, speed: 6 }; })();   // mm/s, front vent to top screen

export class World {
  constructor(seed = 7) {
    this.seed = seed;
    const R = mulberry32(seed);
    this.rand = R;
    this.pond = { x: -115, z: 100, r: 46 };
    this.dish = { x: 105, z: 112, r: 30, rim: 3.5, floor: 0.8 };
    this.bananas = [{ x: 96, z: 104, r: 12.5, h: 7 }, { x: 118, z: 124, r: 11, h: 6 }];
    this.log = { ax: -210, az: -165, bx: 45, bz: -45, r: 22, bury: 9 };
    this.bromeliads = [
      { x: 135, z: -125, r: 115, h: 230, base: 20, cup: 70, leaves: 22, hue: 0 },
      { x: -160, z: -40, r: 70, h: 140, base: 13, cup: 45, leaves: 16, hue: 1 },
    ];
    this.rocks = [];
    for (const [x, z, r, h] of [[30, 60, 26, 13], [-40, 150, 16, 7], [180, 20, 22, 11], [-60, -100, 14, 6], [60, -150, 18, 9], [-190, 170, 20, 9]]) this.rocks.push({ x, z, r, h });
    this._flatten = [{ x: this.dish.x, z: this.dish.z, r: this.dish.r + 4, fall: 14 }];
    this.pond.level = this._rawHeight(this.pond.x, this.pond.z) - 3.5;

    // broad hanging leaves (philodendron, pothos): shelter from lights and mist; held up by petioles (stems)
    this.leaves = [];
    const leafSpots = [[-60, 40, 26], [20, -10, 40], [150, 60, 22], [-130, 30, 30], [70, -90, 34], [-20, 120, 18], [-175, 110, 36], [190, -40, 28], [-90, -150, 45], [110, 160, 24]];
    for (const [x, z, hAbove] of leafSpots) {
      const len = 34 + R() * 26, wid = len * (0.55 + R() * 0.15), yaw = R() * Math.PI * 2;
      this.leaves.push({ x, z, y: this._rawHeight(x, z) + hAbove, len, wid, yaw, tilt: (R() - 0.5) * 0.35, hue: R() });
    }
    // fern / fittonia clusters: their stems are tree trunks to a fly
    this.plants = [];
    for (let i = 0; i < 26; i++) {
      let x, z, tries = 0;
      do { x = TANK.x0 + 20 + R() * (TANK.w - 40); z = TANK.z0 + 20 + R() * (TANK.d - 40); tries++; } while (tries < 40 && (this._inPond(x, z, 10) || this._nearDish(x, z, 18) || this._nearLog(x, z, 8)));
      const kind = R() < 0.55 ? 'fern' : 'fittonia', stems = [];
      const n = kind === 'fern' ? 5 + Math.floor(R() * 5) : 4 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, d = R() * 7;
        stems.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, r: 0.6 + R() * 0.7, h: (kind === 'fern' ? 40 : 22) + R() * 35, lean: (R() - 0.5) * 0.5, dir: R() * Math.PI * 2 });
      }
      this.plants.push({ x, z, kind, stems, hue: R() });
    }
    // obstacles: vertical cylinders the fly bumps into (stems, petioles, bromeliad hearts)
    this.obstacles = [];
    for (const p of this.plants) for (const s of p.stems) this.obstacles.push({ x: s.x, z: s.z, r: s.r });
    for (const l of this.leaves) this.obstacles.push({ x: l.x - Math.cos(l.yaw) * l.len * 0.35, z: l.z - Math.sin(l.yaw) * l.len * 0.35, r: 1.4, petiole: true });
    for (const b of this.bromeliads) this.obstacles.push({ x: b.x, z: b.z, r: b.base });
    this._grid = new Map();
    for (const o of this.obstacles) { const k = this._cell(o.x, o.z); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const kk = (k[0] + a) + ',' + (k[1] + b); (this._grid.get(kk) || this._grid.set(kk, []).get(kk)).push(o); } }

    // mist droplets resting on the substrate and moss: water, and sticky traps
    this.droplets = [];
    this._dropId = 0;
    for (let i = 0; i < 70; i++) {
      let x, z, tries = 0;
      do { x = TANK.x0 + 10 + R() * (TANK.w - 20); z = TANK.z0 + 10 + R() * (TANK.d - 20); tries++; } while (tries < 30 && (this.moss(x, z) < 0.35 || this._inPond(x, z, 4) || this._nearDish(x, z, 3)));
      this.addDroplet(x, z, 0.45 + R() * 1.0);
    }
    // the drop zone: where the keeper tipped the cup of dusted feeder flies in
    this.dropZone = { x: -20, z: 70 };
  }
  _cell(x, z) { return [Math.floor(x / 16), Math.floor(z / 16)]; }
  _inPond(x, z, m = 0) { return Math.hypot(x - this.pond.x, z - this.pond.z) < this.pond.r + m; }
  _nearDish(x, z, m = 0) { return Math.hypot(x - this.dish.x, z - this.dish.z) < this.dish.r + m; }
  _segDist(x, z) { const L = this.log, vx = L.bx - L.ax, vz = L.bz - L.az, t = clamp(((x - L.ax) * vx + (z - L.az) * vz) / (vx * vx + vz * vz), 0, 1); return { d: Math.hypot(x - L.ax - t * vx, z - L.az - t * vz), t }; }
  _nearLog(x, z, m = 0) { return this._segDist(x, z).d < this.log.r + m; }

  // substrate before ponds and flattening
  _rawHeight(x, z) {
    const back = (TANK.z1 - z) / TANK.d;                      // 0 at the front glass, 1 at the back
    return 50 + 42 * back * back + 16 * fbm2(x / 95, z / 95, 3, this.seed) + 4.5 * fbm2(x / 23, z / 23, 3, this.seed + 5) + 0.9 * noise2(x / 5.5, z / 5.5, this.seed + 9);
  }
  // the substrate surface (soil, leaf litter, moss), mm
  terrainHeight(x, z) {
    let h = this._rawHeight(x, z);
    for (const f of this._flatten) { const d = Math.hypot(x - f.x, z - f.z), w = smoothstep(f.r + f.fall, f.r, d); if (w > 0) h = h + (this._rawHeight(f.x, f.z) - h) * w; }
    const pd = Math.hypot(x - this.pond.x, z - this.pond.z);
    if (pd < this.pond.r + 18) h -= 13 * smoothstep(this.pond.r + 18, this.pond.r - 14, pd);
    return h;
  }
  // moss cover, 0..1
  moss(x, z) {
    const m = 0.5 + 0.5 * fbm2(x / 60 + 3, z / 60 - 7, 3, this.seed + 21);
    const nearPond = smoothstep(this.pond.r + 50, this.pond.r + 5, Math.hypot(x - this.pond.x, z - this.pond.z));
    const nearLog = smoothstep(this.log.r + 30, this.log.r, this._segDist(x, z).d);
    return clamp(m * 1.25 - 0.3 + 0.45 * nearPond + 0.3 * nearLog, 0, 1);
  }
  isWater(x, z) { return this._inPond(x, z) && this.terrainHeight(x, z) < this.pond.level; }

  // Highest walkable surface at (x, z): substrate, log, stones, dish, banana. Returns {y, kind}.
  surface(x, z) {
    let y = this.terrainHeight(x, z), kind = this.moss(x, z) > 0.55 ? 'moss' : 'soil';
    if (this.isWater(x, z)) { y = this.pond.level; kind = 'water'; }
    const { d } = this._segDist(x, z), L = this.log;
    if (d < L.r) { const ly = this._logAxisY(x, z) + Math.sqrt(L.r * L.r - d * d); if (ly > y) { y = ly; kind = 'bark'; } }
    for (const r of this.rocks) { const dd = Math.hypot(x - r.x, z - r.z); if (dd < r.r) { const ry = this.terrainHeight(r.x, r.z) - 1 + r.h * Math.sqrt(1 - (dd / r.r) ** 2); if (ry > y) { y = ry; kind = 'stone'; } } }
    const D = this.dish, dd = Math.hypot(x - D.x, z - D.z);
    if (dd < D.r + 0.6) {
      const base = this._rawHeight(D.x, D.z);
      if (dd > D.r - 0.6) { y = base + D.rim; kind = 'glass'; }
      else { y = base + D.floor; kind = 'dish'; }
      for (const b of this.bananas) if (Math.hypot(x - b.x, z - b.z) < b.r) { y = base + D.floor + b.h; kind = 'banana'; }
    }
    return { y, kind };
  }
  _logAxisY(x, z) {
    // the log's axis runs at the substrate height of its own centre line, minus how deep it is buried
    const { t } = this._segDist(x, z), L = this.log;
    const ax = L.ax + t * (L.bx - L.ax), az = L.az + t * (L.bz - L.az);
    return this._rawHeight(ax, az) - L.bury;
  }
  height(x, z) { return this.surface(x, z).y; }

  // push a body of radius r out of stems and keep it inside the glass. Mutates p {x, z}; returns true if it hit.
  collide(p, r = PHYS.bodyRadius) {
    let hit = false;
    const m = 2 + r;
    if (p.x < TANK.x0 + m) { p.x = TANK.x0 + m; hit = true; } if (p.x > TANK.x1 - m) { p.x = TANK.x1 - m; hit = true; }
    if (p.z < TANK.z0 + m) { p.z = TANK.z0 + m; hit = true; } if (p.z > TANK.z1 - m) { p.z = TANK.z1 - m; hit = true; }
    const [cx, cz] = this._cell(p.x, p.z), list = this._grid.get(cx + ',' + cz);
    if (list) for (const o of list) {
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = o.r + r;
      if (d < min) { const k = d > 1e-6 ? min / d : 0; if (k) { p.x = o.x + dx * k; p.z = o.z + dz * k; } else p.x = o.x + min; hit = true; }
    }
    return hit;
  }

  // under a leaf, a bromeliad's arching leaves, or the log's overhang? (shelter from mist and lights)
  shelter(x, y, z) {
    for (const l of this.leaves) {
      if (y > l.y) continue;
      const dx = x - l.x, dz = z - l.z, c = Math.cos(l.yaw), s = Math.sin(l.yaw), u = dx * c + dz * s, v = -dx * s + dz * c;
      if ((u / (l.len * 0.5)) ** 2 + (v / (l.wid * 0.5)) ** 2 < 1) return 1;
    }
    for (const b of this.bromeliads) { const d = Math.hypot(x - b.x, z - b.z); if (d > b.base + 2 && d < b.r * 0.75) return 0.8; }
    return 0;
  }
  // relative humidity, 0..1, at a point; env: {t (day fraction), lightsOn, mistAge (s since misting, or Infinity)}
  humidity(x, y, z, env = {}) {
    const pd = Math.hypot(x - this.pond.x, z - this.pond.z);
    let h = 0.58 + 0.24 * Math.exp(-Math.max(0, pd - this.pond.r) / 35) + 0.14 * this.moss(x, z) + 0.2 * this.shelter(x, y, z);
    for (const b of this.bromeliads) h += 0.1 * Math.exp(-Math.max(0, Math.hypot(x - b.x, z - b.z) - b.base) / 40);
    if (env.lightsOn !== false) h -= 0.16 * Math.exp(-(x * x) / (2 * 120 * 120)) * (1 - this.shelter(x, y, z));    // under the LED bar, open ground dries
    else h += 0.12;
    if (env.mistAge !== undefined && isFinite(env.mistAge)) h += 0.22 * Math.exp(-env.mistAge / 40);
    return clamp(h, 0, 1);
  }

  // odour plume from a point source, carried by the tank's slow airflow; intermittent filaments, as real plumes are
  plume(px, pz, sx, sz, strength, t) {
    const dx = px - sx, dz = pz - sz, down = dx * WIND.x + dz * WIND.z, cross = -dx * WIND.z + dz * WIND.x;
    if (down < -2) return strength * Math.exp((down + 2) / 2.5) * Math.exp(-cross * cross / 10);
    const dn = Math.max(down, 0), sig = 2.5 + 0.2 * dn;
    const c = strength * Math.exp(-cross * cross / (2 * sig * sig)) / (1 + dn / 70);
    const fil = 0.5 + 0.5 * noise2((dn - WIND.speed * 2.2 * t) / 7, cross / (2 + 0.08 * dn), 99);
    return c * (0.3 + 0.7 * fil * fil);
  }
  // fermenting fruit: acetic acid + ethanol from the banana and its yeast
  fruitOdor(x, z, t) { let c = 0; for (const b of this.bananas) c += this.plume(x, z, b.x, b.z, 0.6, t); return c; }

  addDroplet(x, z, r) {
    const s = this.surface(x, z);
    const d = { id: this._dropId++, x, z, r, y: s.y + r * 0.72, vol: 1 };
    this.droplets.push(d); return d;
  }
  nearestDroplet(x, z, maxD = Infinity) {
    let best = null, bd = maxD;
    for (const d of this.droplets) { const dd = Math.hypot(x - d.x, z - d.z) - d.r; if (dd < bd) { bd = dd; best = d; } }
    return best ? { drop: best, gap: bd } : null;
  }
  // feeding spots: yeast on the banana slices
  feedSpot(x, z) { for (const b of this.bananas) if (Math.hypot(x - b.x, z - b.z) < b.r) return b; return null; }
  randomGround(rand, avoidWater = true) {
    for (let i = 0; i < 100; i++) { const x = TANK.x0 + 15 + rand() * (TANK.w - 30), z = TANK.z0 + 15 + rand() * (TANK.d - 30); if (!avoidWater || !this.isWater(x, z)) return { x, z }; }
    return { x: 0, z: 0 };
  }
}

// deterministic per-cell scatter (the renderer's near-field detail and the tests use it)
export function cellScatter(cx, cz, k, seed) { return hash2(cx * 7 + k, cz * 13 - k, seed); }
