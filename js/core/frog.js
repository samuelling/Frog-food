// A dart frog, at true size (about 30 mm snout-vent: a 20 m kaiju to the fly).
// Behaviour is built from what is known of anuran prey capture:
//   - frogs see prey by its motion (Lettvin et al. 1959's "bug detectors"; Ewert's worm/anti-worm work): a fly
//     that freezes becomes hard to see unless it is very close;
//   - the hunt is orient -> approach -> fixate -> strike, and many dendrobatids twitch their toes while
//     fixating prey (toe-tapping), which here is the telegraph that a strike is coming;
//   - the tongue is ballistic and fast (tens of milliseconds out and back), aimed at where the prey was.
//   - dart frogs are diurnal: when the lights go off they sleep.
import { clamp, wrapAngle, mulberry32 } from './rng.js';
import { TANK } from './scale.js';

export const SPECIES = {
  azureus: { name: 'Dendrobates tinctorius "azureus"', base: '#2f6fd6', spots: '#0b0f1a', belly: '#1f3f9a', length: 34 },
  auratus: { name: 'Dendrobates auratus', base: '#2fbf7a', spots: '#0b1410', belly: '#1d6e4c', length: 30 },
  leucomelas: { name: 'Dendrobates leucomelas', base: '#f2c21b', spots: '#0d0d0d', belly: '#c48a12', length: 32 },
};

export const FROG = {
  sight: 150,          // mm
  strike: 21,          // tongue reach, mm (about 2/3 of body length)
  capture: 1.9,        // mm: a tongue tip this close to the fly catches it
  extend: 0.065, hold: 0.03, retract: 0.11,   // s
  aim: 0.5,            // s of fixation (toe-tapping) before the strike
  turn: 2.6,           // rad/s
  creep: 11,           // mm/s
  lose: 2.6,           // s a motionless fly can stay unnoticed before the frog gives up (beyond close range)
};

export class Frog {
  constructor(world, opts = {}) {
    this.world = world; this.id = opts.id ?? 0;
    this.species = opts.species || 'azureus'; this.sp = SPECIES[this.species];
    this.length = this.sp.length; this.radius = this.length * 0.36;
    this.rand = mulberry32(opts.seed ?? 11);
    const p = opts.at || world.randomGround(this.rand);
    this.pos = { x: p.x, y: world.surface(p.x, p.z).y, z: p.z }; this.yaw = this.rand() * 6.28;
    this.home = opts.home || null;          // a spot it likes to hunt (the fruit dish)
    this.state = 'rest'; this.timer = 1 + this.rand() * 2;
    this.target = null; this.interest = 0; this.toeTap = 0; this.throat = 0; this.blink = 0;
    this.tongue = { out: 0, len: 0, tip: null, aim: null };
    this.hop = null; this.asleep = false; this.lean = 0; this.eyeRetract = 0; this.hunger = 1;
  }
  get eye() { return { x: this.pos.x, y: this.pos.y + this.length * 0.32, z: this.pos.z }; }
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  headPos() { const f = this.forward(), k = this.length * 0.36; return { x: this.pos.x + f.x * k, y: this.pos.y + this.length * 0.22, z: this.pos.z + f.z * k }; }

  _bearing(p) { return Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z)); }
  _turnTo(p, dt, rate = FROG.turn) { const d = wrapAngle(this._bearing(p) - this.yaw); this.yaw += clamp(d, -rate * dt, rate * dt); return Math.abs(d); }

  /** prey: [{pos, moved 0..1, alive, isPlayer, id}]; env: {lightsOn}; returns events */
  update(dt, prey, env = {}) {
    const ev = [], R = this.rand;
    this.throat = (this.throat + dt * 2.2) % 1;
    this.toeTap = Math.max(0, this.toeTap - dt * 3);
    this.eyeRetract = Math.max(0, this.eyeRetract - dt * 1.5);
    this.hunger = Math.min(1, this.hunger + dt / 50);
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt * 6); else if (R() < dt * 0.2) this.blink = 1;
    // night: sleep where you are
    if (env.lightsOn === false && !['strike', 'swallow'].includes(this.state)) { if (!this.asleep) { this.asleep = true; this.state = 'rest'; this.target = null; ev.push({ type: 'sleep' }); } }
    else if (this.asleep && env.lightsOn !== false) { this.asleep = false; this.timer = 1; ev.push({ type: 'wake' }); }

    switch (this.state) {
      case 'rest': {
        this.timer -= dt;
        const seen = this.asleep ? this._see(prey, dt, 0.08) : this._see(prey, dt);
        if (seen) { this.target = seen; this.state = 'stalk'; this.interest = FROG.lose; ev.push({ type: 'notice', target: seen }); break; }
        if (this.timer <= 0 && !this.asleep) this._startHop(this._wanderPoint(), ev);
        break;
      }
      case 'hop': this._doHop(dt, ev); break;
      case 'stalk': {
        const t = this.target;
        if (!t || !t.alive) { this._idle(); break; }
        const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z), off = this._turnTo(t.pos, dt);
        // interest decays while the fly is still; motion renews it
        if (t.moved > 0.08 || d < 7) this.interest = FROG.lose; else this.interest -= dt;
        if (this.interest <= 0 || d > FROG.sight * 1.1) { ev.push({ type: 'lost', target: t }); this._idle(); break; }
        if (d <= FROG.strike * 0.92 && off < 0.3) { this.state = 'aim'; this.timer = FROG.aim; ev.push({ type: 'aim', target: t }); break; }
        if (off < 0.5) {
          if (d > 55) { const f = this._bearing(t.pos); const L = Math.min(d - 30, 38); this._startHop({ x: this.pos.x - Math.sin(f) * L, z: this.pos.z - Math.cos(f) * L }, ev, true); }
          else { const f = this.forward(), sp = FROG.creep * (d > FROG.strike ? 1 : 0.2); this._moveTo(this.pos.x + f.x * sp * dt, this.pos.z + f.z * sp * dt); this.toeTap = Math.max(this.toeTap, 0.4); }
        }
        break;
      }
      case 'aim': {
        const t = this.target;
        if (!t || !t.alive) { this._idle(); break; }
        this._turnTo(t.pos, dt, FROG.turn * 1.5);
        this.toeTap = 1; this.lean = Math.min(1, this.lean + dt * 3);
        const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        if (d > FROG.strike * 1.05) { this.state = 'stalk'; this.lean = 0; ev.push({ type: 'unaim', target: t }); break; }
        this.timer -= dt;
        if (this.timer <= 0) this._strike(t, ev);
        break;
      }
      case 'strike': this._doStrike(dt, ev); break;
      case 'swallow': { this.timer -= dt; this.eyeRetract = 1; if (this.timer <= 0) { this.state = 'rest'; this.timer = 3 + R() * 4; } break; }
    }
    return ev;
  }
  _idle() { this.state = 'rest'; this.timer = 1.5 + this.rand() * 3; this.target = null; this.lean = 0; }
  // motion-based detection of prey
  _see(prey, dt, scale = 1) {
    let best = null, bestP = 0;
    const e = this.eye;
    for (const q of prey) {
      if (!q.alive) continue;
      const d = Math.hypot(q.pos.x - this.pos.x, q.pos.z - this.pos.z);
      if (d > FROG.sight) continue;
      const off = Math.abs(wrapAngle(this._bearing(q.pos) - this.yaw));
      if (off > 2.5) continue;                                                       // nearly panoramic, blind straight behind
      if (Math.abs(q.pos.y - e.y) > 60) continue;
      const near = 1 - d / FROG.sight;
      const p = (3.2 * q.moved * near * near + (d < 6 ? 0.6 : 0)) * scale * (q.isPlayer ? 0.4 + 0.6 * this.hunger : 0.5 * this.hunger);
      if (this.rand() < p * dt && p > bestP) { best = q; bestP = p; }
    }
    return best;
  }
  _wanderPoint() {
    const R = this.rand;
    if (this.home && R() < 0.55) return { x: this.home.x + (R() - 0.5) * 70, z: this.home.z + (R() - 0.5) * 70 };
    const a = R() * 6.28, L = 18 + R() * 30; return { x: this.pos.x + Math.cos(a) * L, z: this.pos.z + Math.sin(a) * L };
  }
  _valid(x, z) { const m = this.radius + 4; return x > TANK.x0 + m && x < TANK.x1 - m && z > TANK.z0 + m && z < TANK.z1 - m && !this.world.isWater(x, z); }
  _moveTo(x, z) { if (!this._valid(x, z)) return false; this.pos.x = x; this.pos.z = z; this.pos.y = this.world.surface(x, z).y; return true; }
  _startHop(to, ev, hunting = false) {
    let { x, z } = to, tries = 0;
    while (!this._valid(x, z) && tries++ < 8) { x = (x + this.pos.x) / 2 + (this.rand() - 0.5) * 10; z = (z + this.pos.z) / 2 + (this.rand() - 0.5) * 10; }
    if (!this._valid(x, z)) { this.timer = 1; return; }
    const L = Math.hypot(x - this.pos.x, z - this.pos.z);
    this.hop = { x0: this.pos.x, z0: this.pos.z, y0: this.pos.y, x1: x, z1: z, y1: this.world.surface(x, z).y, t: 0, dur: 0.28 + L * 0.006, h: 6 + L * 0.25, hunting, yaw0: this.yaw, yaw1: Math.atan2(-(x - this.pos.x), -(z - this.pos.z)), turn: 0 };
    this.state = 'hop'; ev.push({ type: 'hop', from: { ...this.pos }, to: { x, z } });
  }
  _doHop(dt, ev) {
    const H = this.hop;
    // turn first, then jump
    if (H.turn < 1) { H.turn = Math.min(1, H.turn + dt * 3); this.yaw = H.yaw0 + wrapAngle(H.yaw1 - H.yaw0) * H.turn; return; }
    H.t += dt; const u = Math.min(1, H.t / H.dur);
    this.pos.x = H.x0 + (H.x1 - H.x0) * u; this.pos.z = H.z0 + (H.z1 - H.z0) * u;
    this.pos.y = H.y0 + (H.y1 - H.y0) * u + H.h * 4 * u * (1 - u);
    if (u >= 1) {
      this.pos.y = this.world.surface(this.pos.x, this.pos.z).y; this.hop = null;
      ev.push({ type: 'land', at: { ...this.pos }, mass: this.length });
      if (H.hunting && this.target) this.state = 'stalk'; else { this.state = 'rest'; this.timer = 1.5 + this.rand() * 4; }
    }
  }
  _strike(t, ev) {
    const h = this.headPos();
    const lead = 0.03, aim = { x: t.pos.x + (t.vel ? t.vel.x * lead : 0), y: t.pos.y + 0.5, z: t.pos.z + (t.vel ? t.vel.z * lead : 0) };
    const len = Math.hypot(aim.x - h.x, aim.y - h.y, aim.z - h.z);
    this.tongue = { phase: 0, t: 0, from: h, aim, len: Math.min(len + 1.5, FROG.strike * 1.25), out: 0, tip: { ...h }, caught: null };
    this.state = 'strike'; this.lean = 1; ev.push({ type: 'strike', target: t, aim });
  }
  _doStrike(dt, ev) {
    const T = this.tongue; T.t += dt;
    const tot = FROG.extend + FROG.hold + FROG.retract;
    let out;
    if (T.t < FROG.extend) out = T.t / FROG.extend; else if (T.t < FROG.extend + FROG.hold) out = 1; else out = Math.max(0, 1 - (T.t - FROG.extend - FROG.hold) / FROG.retract);
    T.out = out;
    const dx = T.aim.x - T.from.x, dy = T.aim.y - T.from.y, dz = T.aim.z - T.from.z, l = Math.hypot(dx, dy, dz) || 1, L = T.len * out;
    T.tip = { x: T.from.x + dx / l * L, y: T.from.y + dy / l * L, z: T.from.z + dz / l * L };
    const tg = this.target;
    if (!T.caught && tg && tg.alive && T.t <= FROG.extend + FROG.hold) {
      const q = tg.pos, d = Math.hypot(q.x - T.tip.x, q.y + 0.4 - T.tip.y, q.z - T.tip.z);
      if (d < FROG.capture) { T.caught = tg; ev.push({ type: 'catch', target: tg }); }
    }
    if (T.caught) { const c = T.caught; c.pos.x = T.tip.x; c.pos.y = T.tip.y - 0.4; c.pos.z = T.tip.z; }
    if (T.t >= tot) {
      this.lean = 0; T.out = 0;
      if (T.caught) { this.state = 'swallow'; this.timer = 1.4; this.hunger = 0; ev.push({ type: 'swallow', target: T.caught }); this.target = null; }
      else { ev.push({ type: 'miss', target: tg }); this.state = 'stalk'; this.interest = 1.2; }
    }
  }
  // push a fly out of the frog's body
  repel(p, r = 1) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz), min = this.radius + r;
    if (d < min && d > 1e-6) { p.x = this.pos.x + dx / d * min; p.z = this.pos.z + dz / d * min; return true; }
    return false;
  }
}
