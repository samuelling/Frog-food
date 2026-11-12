// Looming detection, schematic. In the fly, LPLC2 neurons pool outward motion from T4/T5 across the eye and
// drive the giant fibre (GF), which triggers the escape jump (Klapoetke et al. 2017; Ache et al. 2019; von
// Reyn et al. 2014). Their responses follow the angular size and expansion speed of an approaching object,
// much like the locust LGMD's "eta" function (Gabbiani et al. 1999): eta = C * dtheta/dt * exp(-alpha * theta).
// Here theta is computed geometrically from the frogs and their tongues. When FrogFood's view is routed through
// FlyHarp's optic-lobe model (js/render/flyeye.js), a T4/T5-based LPLC2 read-out can replace this.
import { clamp, wrapAngle } from './rng.js';

export const LOOM = { alpha: 3.2, gain: 6, gfThreshold: 0.62, tau: 0.03 };

export class LoomDetector {
  constructor() { this.prev = new Map(); this.lplc2 = 0; this.gf = false; this.dir = 0; this.src = null; this.theta = 0; }
  /** eye {x,y,z}, yaw of the fly, frogs: [Frog]; returns {lplc2 0..1, gf bool, azimuth (rad, 0 = straight ahead, + = left)} */
  update(dt, eye, yaw, frogs) {
    let best = 0, bestAz = 0, src = null, maxTheta = 0;
    const objs = [];
    for (const f of frogs) {
      const h = f.headPos();
      objs.push({ key: 'h' + f.id, p: h, r: f.length * 0.32, f });
      if (f.state === 'strike' && f.tongue.tip) objs.push({ key: 't' + f.id, p: f.tongue.tip, r: 0.9, f, tongue: true });
      if (f.state === 'hop' && f.hop) objs.push({ key: 'b' + f.id, p: f.pos, r: f.length * 0.45, f });
    }
    const seen = new Set();
    for (const o of objs) {
      seen.add(o.key);
      const d = Math.max(0.3, Math.hypot(o.p.x - eye.x, o.p.y - eye.y, o.p.z - eye.z));
      const th = 2 * Math.atan(o.r / d);
      const pv = this.prev.get(o.key); this.prev.set(o.key, th);
      if (pv === undefined) continue;
      const dth = (th - pv) / Math.max(dt, 1e-4);
      const eta = Math.max(0, dth) * Math.exp(-LOOM.alpha * th) * LOOM.gain * (o.tongue ? 3 : 1);
      maxTheta = Math.max(maxTheta, th);
      if (eta > best) { best = eta; src = o.f; bestAz = wrapAngle(Math.atan2(-(o.p.x - eye.x), -(o.p.z - eye.z)) - yaw); }
    }
    for (const k of [...this.prev.keys()]) if (!seen.has(k)) this.prev.delete(k);
    const target = clamp(best, 0, 1.5);
    this.lplc2 += (target - this.lplc2) * (1 - Math.exp(-dt / LOOM.tau));
    this.gf = this.lplc2 > LOOM.gfThreshold;
    this.dir = bestAz; this.src = src; this.theta = maxTheta;
    return { lplc2: clamp(this.lplc2, 0, 1), gf: this.gf, azimuth: bestAz, src };
  }
  /** the escape direction: away from the looming source (in world xz), as the GF jump is aimed */
  escapeDir(yaw) { const a = yaw + this.dir + Math.PI; return { x: -Math.sin(a), z: -Math.cos(a) }; }
}
