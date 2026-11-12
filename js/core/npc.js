// The other flies: females (NPCs with a receptivity state), a rival male, and the rest of the feeder batch.
import { mulberry32, clamp, wrapAngle, smoothstep } from './rng.js';
import { PHYS } from './scale.js';
import { SongAdapter } from './songadapter.js';

let NEXT_ID = 100;

export class NpcFly {
  constructor(world, opts = {}) {
    this.world = world; this.id = opts.id ?? NEXT_ID++;
    this.rand = mulberry32(opts.seed ?? this.id * 31 + 7);
    const p = opts.at || world.randomGround(this.rand);
    this.pos = { x: p.x, y: world.surface(p.x, p.z).y, z: p.z }; this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = this.rand() * 6.28; this.moved = 0; this.alive = true; this.sex = opts.sex || 'f';
    this.state = 'wander'; this.timer = this.rand() * 3; this.goal = null; this.speedMul = 1; this.fleeFrom = null;
    this.dust = opts.dust ?? 0.8; this.name = opts.name || '';
    this.wing = 0; this.wingSide = 1; this.abdomen = 0; this.ovi = 0; this.kick = 0;
  }
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  _steer(goal, dt, speed) {
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { this.vel.x = this.vel.z = 0; return d; }
    const want = Math.atan2(-dx, -dz), dy = wrapAngle(want - this.yaw);
    this.yaw += clamp(dy, -6 * dt, 6 * dt);
    const f = this.forward(), s = speed * Math.max(0, Math.cos(dy));
    this.vel.x = f.x * s; this.vel.z = f.z * s;
    return d;
  }
  _move(dt) {
    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    this.world.collide(p);
    const s = this.world.surface(p.x, p.z);
    if (s.kind === 'water' || s.y > this.pos.y + PHYS.climb) { this.vel.x = this.vel.z = 0; this.goal = null; return; }
    this.pos.x = p.x; this.pos.z = p.z; this.pos.y = s.y;
    for (const d of this.world.droplets) { const dx = this.pos.x - d.x, dz = this.pos.z - d.z, dd = Math.hypot(dx, dz), m = d.r + 0.5; if (dd < m && dd > 1e-6) { this.pos.x = d.x + dx / dd * m; this.pos.z = d.z + dz / dd * m; } }
  }
  _motion(dt) { const sp = Math.hypot(this.vel.x, this.vel.z); this.moved += (clamp(sp / PHYS.run, 0, 1) - this.moved) * (1 - Math.exp(-dt / 0.15)); }
  // wandering, feeding at the fruit, and running from frogs that are hunting them
  baseUpdate(dt, ctx) {
    const R = this.rand;
    const threat = ctx.frogs.find(f => f.target === this && (f.state === 'aim' || f.state === 'strike' || f.state === 'stalk'));
    if (threat && this.state !== 'flee' && R() < dt * 4) { this.state = 'flee'; this.timer = 1.2 + R(); this.fleeFrom = threat; }
    switch (this.state) {
      case 'flee': {
        const f = this.fleeFrom, dx = this.pos.x - f.pos.x, dz = this.pos.z - f.pos.z, l = Math.hypot(dx, dz) || 1;
        this._steer({ x: this.pos.x + dx / l * 10, z: this.pos.z + dz / l * 10 }, dt, PHYS.run * 0.9);
        this.timer -= dt; if (this.timer <= 0) { this.state = 'wander'; this.goal = null; }
        break;
      }
      case 'feed': this.vel.x = this.vel.z = 0; this.timer -= dt; if (this.timer <= 0) { this.state = 'wander'; this.goal = null; } break;
      default: {
        if (!this.goal || this.timer <= 0) {
          const B = this.world.bananas, b = B[Math.floor(R() * B.length)];
          if (ctx.lightsOn && R() < 0.35) this.goal = { x: b.x + (R() - 0.5) * b.r, z: b.z + (R() - 0.5) * b.r, feed: true };
          else { const a = R() * 6.28, L = 4 + R() * 25; this.goal = { x: this.pos.x + Math.cos(a) * L, z: this.pos.z + Math.sin(a) * L }; }
          this.timer = 4 + R() * 6;
        }
        this.timer -= dt;
        const pause = !ctx.lightsOn ? 0.15 : 1;
        const d = this._steer(this.goal, dt, 5.5 * this.speedMul * pause);
        if (d < 1) { if (this.goal.feed) { this.state = 'feed'; this.timer = 3 + R() * 6; } this.goal = null; this.vel.x = this.vel.z = 0; }
      }
    }
  }
  update(dt, ctx) { if (!this.alive) return []; this.baseUpdate(dt, ctx); this._move(dt); this._motion(dt); return []; }
}

// ------------------------------------------------------------------------------------------------ females
// Receptivity R (0..1). Song raises it when it sounds like a conspecific male: IPIs near 35 ms, regular, with
// some sine song. The ear itself is the Tonnectome (js/ear/female-ear.js): its song-pathway drive scales how
// much she hears. The IPI preference is schematic: it stands in for the song-pattern tuning found in pC1 and
// vpoEN (Deutsch et al. 2019; Wang et al. 2021), which this connectome-only rate model does not reproduce.
// Behaviour follows the literature: song slows a receptive female (Bussell et al. 2014; Coen et al. 2014);
// at high receptivity she pauses and opens her vaginal plate (vpoDN; Wang et al. 2021); a mated female, who
// carries the previous male's cVA, extrudes her ovipositor, kicks and runs (Mezzera et al. 2020).
export const PREF = { ipi: 0.035, ipiSd: 0.0075, cvSlack: 0.06, cvScale: 0.12, rise: 0.085, fall: 0.03, accept: 0.85, base: 0.08 };

export function songQuality(feat) {
  if (!feat) return { q: 0, ipi: 0, reg: 0, mix: 0 };
  const ipi = feat.nIPI >= 3 ? Math.exp(-0.5 * ((feat.ipiMean - PREF.ipi) / PREF.ipiSd) ** 2) : 0;
  const reg = feat.nIPI >= 3 ? Math.exp(-Math.max(0, feat.ipiCV - PREF.cvSlack) / PREF.cvScale) : 0;
  const mix = smoothstep(0.03, 0.25, feat.sineFrac) * smoothstep(0.05, 0.25, feat.pulseFrac);
  const q = ipi * reg * (1 + 0.35 * mix) + 0.15 * smoothstep(0.05, 0.4, feat.sineFrac) * (feat.nIPI < 3 ? 1 : 0);
  return { q, ipi, reg, mix };
}

export class FemaleFly extends NpcFly {
  constructor(world, opts = {}) {
    super(world, { ...opts, sex: 'f' });
    this.mated = !!opts.mated; this.R = this.mated ? 0 : PREF.base;
    this.vpo = 0; this.courtedBy = null; this.copulating = null; this.copT = 0; this.reject = 0; this.lastQ = { q: 0 };
    this.hearing = 0; this.events = [];
  }
  /** hear: {drive (0..~1.3, Tonnectome song-pathway drive, normalised), audible (0..1), feat (song features)} */
  listen(dt, hear) {
    const Q = songQuality(hear && hear.audible > 0.05 ? hear.feat : null);
    this.lastQ = Q;
    const H = hear ? clamp(hear.drive, 0, 1.4) * hear.audible : 0; this.hearing = H;
    const singing = hear && hear.feat && hear.feat.singing && hear.audible > 0.05;
    if (this.mated) { this.R = Math.max(0, this.R + dt * (0.01 * H * Q.q - 0.05)); return; }
    if (singing || (hear && hear.feat && hear.feat.sinceSong < 1)) this.R += dt * PREF.rise * H * (Q.q - 0.3);
    else this.R -= dt * PREF.fall;
    this.R = clamp(this.R, 0, 1);
  }
  update(dt, ctx) {
    if (!this.alive) return [];
    const ev = []; const R = this.rand;
    this.kick = Math.max(0, this.kick - dt * 4);
    if (this.copulating) {
      this.vel.x = this.vel.z = 0; this.copT += dt;
      if (this.copT > (ctx.copDuration ?? 12)) { const by = this.copulating; this.copulating = null; this.mated = true; this.R = 0; this.vpo = 0; ev.push({ type: 'copulation-end', by }); }
      this._motion(dt); return ev;
    }
    const male = this.courtedBy;
    const near = male && male.alive !== false ? Math.hypot(male.pos.x - this.pos.x, male.pos.z - this.pos.z) : Infinity;
    // vaginal plate opening once receptive enough
    this.vpo += ((this.R >= PREF.accept && !this.mated ? 1 : 0) - this.vpo) * (1 - Math.exp(-dt / 0.4));
    this.ovi += ((this.reject > 0 ? 1 : 0) - this.ovi) * (1 - Math.exp(-dt / 0.15));
    if (this.reject > 0) this.reject -= dt;
    // a mated female with a male on her: ovipositor out, kick, run
    if (this.mated && near < 4) {
      if (this.reject <= 0) { this.reject = 2.5; ev.push({ type: 'extrude' }); }
      if (near < 2 && this.kick <= 0 && R() < dt * 3) { this.kick = 1; ev.push({ type: 'kick', male }); }
      if (R() < dt * 0.6) { this.state = 'decamp'; this.timer = 1.5; }
    }
    // an unready virgin, touched: kick him off
    if (!this.mated && near < 1.7 && this.R < 0.35 && this.kick <= 0 && R() < dt * 1.2) { this.kick = 1; ev.push({ type: 'kick', male }); }
    if (this.state === 'decamp') {
      const f = male ? { x: this.pos.x - (male.pos.x - this.pos.x) * 4, z: this.pos.z - (male.pos.z - this.pos.z) * 4 } : this.goal;
      if (f) this._steer(f, dt, PHYS.run * 0.8); this.timer -= dt; if (this.timer <= 0) this.state = 'wander';
    } else {
      this.baseUpdate(dt, ctx);
      // courted: song slows her, and at acceptance she stops
      if (male && near < 12) { this.speedMul = Math.max(0.03, 1 - 0.95 * this.R); if (this.state === 'feed' && R() < dt * 0.3) { this.state = 'wander'; this.goal = null; } }
      else this.speedMul = 1;
      if (this.vpo > 0.5 && near < 8) { this.vel.x *= 0.05; this.vel.z *= 0.05; }
      else if (this.state !== 'flee' && male && near < 12 && (this.state === 'wander') && R() < dt * 0.25) { const a = R() * 6.28; this.goal = { x: this.pos.x + Math.cos(a) * 15, z: this.pos.z + Math.sin(a) * 15 }; }
    }
    this._move(dt); this._motion(dt);
    return ev;
  }
}

// --------------------------------------------------------------------------------------------- rival male
// Tracks a receptive female and courts her with a decent but imperfect song (about 38 ms IPIs, some jitter).
// His pulses go into the same air as yours: her ear hears both, so a rival singing nearby scrambles your IPIs.
export class RivalMale extends NpcFly {
  constructor(world, opts = {}) {
    super(world, { ...opts, sex: 'm' });
    this.song = new SongAdapter(opts.seed ?? 77); this.song.setCondition({ jitter: 0.003, amp: 0.8 });
    this.target = null; this.deterred = 0; this.nextTap = 0; this.singing = false; this.tempo = 0.40 + this.rand() * 0.04; this.courting = false; this.age = 0;
  }
  update(dt, ctx) {
    if (!this.alive) return [];
    const ev = [];
    this.deterred = Math.max(0, this.deterred - dt); this.age += dt;
    const cands = ctx.females.filter(f => f.alive && !f.mated && !f.copulating);
    if (!this.target || !cands.includes(this.target)) this.target = cands.sort((a, b) => Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) - Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z))[0] || null;
    const t = this.target, d = t ? Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : Infinity;
    this.courting = !!t && d < 70 && this.deterred <= 0 && ctx.lightsOn !== false && this.age > 60;   // he too arrives dusty: a minute's grace
    if (this.state === 'flee' || !this.courting) {
      if (this.deterred > 0 && t) { const dx = this.pos.x - t.pos.x, dz = this.pos.z - t.pos.z, l = Math.hypot(dx, dz) || 1; this._steer({ x: this.pos.x + dx / l * 10, z: this.pos.z + dz / l * 10 }, dt, d < 40 ? PHYS.run * 0.7 : 0); }
      else this.baseUpdate(dt, ctx);
      this.singing = false;
    } else {
      // get behind her and follow
      const f = t.forward(), spot = { x: t.pos.x - f.x * 3, z: t.pos.z - f.z * 3 };
      const dd = this._steer(spot, dt, d > 6 ? PHYS.run * 0.6 : PHYS.walk * 0.9);
      if (dd < 1.5) { const dy = wrapAngle(Math.atan2(-(t.pos.x - this.pos.x), -(t.pos.z - this.pos.z)) - this.yaw); this.yaw += clamp(dy, -6 * dt, 6 * dt); }
      if (!t.courtedBy || t.courtedBy === this || Math.hypot(t.courtedBy.pos.x - t.pos.x, t.courtedBy.pos.z - t.pos.z) > d) t.courtedBy = this;
      this.singing = d < 8;
      if (this.singing && ctx.songNow >= this.nextTap) { this.song.tap(ctx.songNow); this.nextTap = ctx.songNow + this.tempo + (this.rand() - 0.5) * 0.05; if (this.rand() < 0.12) this.nextTap += 0.8; }
      // attempt copulation once she has opened
      if (t.vpo > 0.7 && d < 3.5) { t.copulating = this; t.copT = 0; ev.push({ type: 'rival-copulates', female: t }); }
    }
    this.wing += ((this.singing ? 1 : 0) - this.wing) * (1 - Math.exp(-dt / 0.05));
    this._move(dt); this._motion(dt);
    return ev;
  }
  deter() { this.deterred = 12; this.state = 'wander'; this.goal = null; this.singing = false; }
}
