// The player's body: a bred-flightless male Drosophila. Walks, runs, jumps (legs only), gets stuck in water.
// Heading convention (matches a three.js camera's rotation.y): forward = (-sin yaw, 0, -cos yaw).
import { PHYS } from './scale.js';
import { clamp } from './rng.js';

export const fwdOf = yaw => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
export const rightOf = yaw => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

export class FlyBody {
  constructor(world, x, z, yaw = 0) {
    this.world = world;
    const s = world.surface(x, z);
    this.pos = { x, y: s.y, z }; this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = yaw; this.pitch = 0;
    this.onGround = true; this.ground = s.kind;
    this.trapped = null;       // {drop | 'water', struggle 0..1, t}
    this.speed = 0;            // horizontal speed, mm/s (frogs see motion)
    this.moved = 0;            // smoothed motion signal 0..1, what a frog's motion detector would see
    this.running = false; this.jumped = false; this.airTime = 0; this.lastLand = 0;
    this.frozen = 0;           // seconds standing still
  }
  get eye() { return { x: this.pos.x, y: this.pos.y + 0.75, z: this.pos.z }; }

  /** input: {fwd, strafe in -1..1, run, jump (edge), escape: {x,z} optional}; returns events [] */
  update(dt, input) {
    const W = this.world, ev = [];
    this.jumped = false; this.sinceLand = (this.sinceLand ?? 1) + dt;
    if (this.trapped) { this._struggle(dt, input, ev); this._motion(dt, 0.6); return ev; }
    const f = fwdOf(this.yaw), r = rightOf(this.yaw);
    let mx = (input.fwd || 0) * f.x + (input.strafe || 0) * r.x, mz = (input.fwd || 0) * f.z + (input.strafe || 0) * r.z;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    this.running = !!input.run && ml > 0.1;
    const top = (this.running ? PHYS.run : PHYS.walk) * (input.speedScale ?? 1);
    if (this.onGround) {
      const k = 1 - Math.exp(-dt / 0.05);
      this.vel.x += (mx * top - this.vel.x) * k; this.vel.z += (mz * top - this.vel.z) * k; this.vel.y = 0;
      if (input.jump) {
        const d = input.escape || (ml > 0.1 ? { x: mx / Math.max(ml, 1e-6), z: mz / Math.max(ml, 1e-6) } : f);
        const dl = Math.hypot(d.x, d.z) || 1;
        this.vel.x += d.x / dl * PHYS.jumpFwd; this.vel.z += d.z / dl * PHYS.jumpFwd; this.vel.y = PHYS.jumpUp;
        this.onGround = false; this.jumped = true; this.airTime = 0; ev.push({ type: 'jump' });
      }
    } else {
      this.vel.y += (-PHYS.g - PHYS.dragVert * this.vel.y) * dt;
      const kh = Math.exp(-PHYS.dragHoriz * dt);
      this.vel.x = this.vel.x * kh + mx * 2 * dt; this.vel.z = this.vel.z * kh + mz * 2 * dt;   // a little air steering
      this.airTime += dt;
    }
    // horizontal move, blocked by steps taller than the fly can climb
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const p = { x: nx, z: nz };
    if (W.collide(p)) ev.push({ type: 'bump' });
    let s = W.surface(p.x, p.z);
    const limit = this.onGround ? this.pos.y + PHYS.climb : this.pos.y + 2.0;   // in the air, legs still catch an edge a little above
    if (s.y > limit || (this.onGround && s.kind === 'water')) {
      // try sliding along each axis
      const a = { x: p.x, z: this.pos.z }, b = { x: this.pos.x, z: p.z };
      const sa = W.surface(a.x, a.z), sb = W.surface(b.x, b.z);
      if (sa.y <= limit && !(this.onGround && sa.kind === 'water')) { p.x = a.x; p.z = a.z; s = sa; this.vel.z = 0; }
      else if (sb.y <= limit && !(this.onGround && sb.kind === 'water')) { p.x = b.x; p.z = b.z; s = sb; this.vel.x = 0; }
      else { p.x = this.pos.x; p.z = this.pos.z; s = W.surface(p.x, p.z); this.vel.x = this.vel.z = 0; }
      if (s.y > limit) ev.push({ type: 'wall' });
    }
    this.pos.x = p.x; this.pos.z = p.z;
    if (this.onGround) {
      if (s.y < this.pos.y - 1.2) { this.onGround = false; this.airTime = 0; }       // walked off an edge
      else { this.pos.y = s.y; this.ground = s.kind; }
    }
    if (!this.onGround && this.airTime > 0.02 && s.y > this.pos.y + 0.3 && s.y <= this.pos.y + 2.0) { this.pos.y = s.y; this.onGround = true; this.ground = s.kind; this.vel.y = 0; this.vel.x *= 0.3; this.vel.z *= 0.3; this.sinceLand = 0; ev.push({ type: 'land', impact: 0, kind: s.kind }); }
    if (!this.onGround) {
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= s.y && this.vel.y <= 0) {
        const impact = -this.vel.y;
        this.pos.y = s.y; this.onGround = true; this.ground = s.kind; this.vel.y = 0; this.sinceLand = 0;
        this.vel.x *= 0.3; this.vel.z *= 0.3;
        ev.push({ type: 'land', impact, kind: s.kind });
        if (s.kind === 'water') this._trap('water', ev);
      }
    }
    // droplets: walk up to one and you can drink; run, jump or fall into one and surface tension holds you
    for (const d of W.droplets) {
      const dx = this.pos.x - d.x, dz = this.pos.z - d.z, dy = (this.pos.y + 0.4) - d.y;
      if (Math.abs(dx) > d.r + 2 || Math.abs(dz) > d.r + 2) continue;
      const dist = Math.hypot(dx, dy, dz), min = d.r + 0.45;
      if (dist < min) {
        const fast = !this.onGround || this.speed > PHYS.walk * 1.35 || this.sinceLand < 0.12;
        if (fast) { this._trap(d, ev); break; }
        const hd = Math.hypot(dx, dz) || 1e-6, k = Math.sqrt(Math.max(0, min * min - dy * dy)) / hd;   // touching: stop at the meniscus
        if (k > 1) { this.pos.x = d.x + dx * k; this.pos.z = d.z + dz * k; }
      }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this._motion(dt, clamp(this.speed / PHYS.run, 0, 1) + (this.onGround ? 0 : 0.6));
    return ev;
  }
  _motion(dt, target) {
    this.moved += (target - this.moved) * (1 - Math.exp(-dt / 0.15));
    this.frozen = this.moved < 0.04 ? this.frozen + dt : 0;
  }
  _trap(what, ev) {
    this.trapped = { what, struggle: 0, t: 0 };
    this.vel.x = this.vel.y = this.vel.z = 0; this.onGround = true;
    ev.push({ type: 'trapped', what: what === 'water' ? 'water' : 'drop' });
  }
  _struggle(dt, input, ev) {
    const T = this.trapped; T.t += dt;
    T.struggle = Math.max(0, T.struggle - dt * 0.12);
    if (input.jump) { T.struggle += 0.16; ev.push({ type: 'struggle', v: T.struggle }); }
    if (T.struggle >= 1) {
      // pop free, away from the water
      let away;
      if (T.what === 'water') { const P = this.world.pond, dx = this.pos.x - P.x, dz = this.pos.z - P.z, l = Math.hypot(dx, dz) || 1; away = { x: dx / l, z: dz / l };
        // walk the shoreline: find dry ground outward
        let k = 0; while (this.world.isWater(this.pos.x, this.pos.z) && k++ < 200) { this.pos.x += away.x * 0.5; this.pos.z += away.z * 0.5; }
      } else { const d = T.what, dx = this.pos.x - d.x, dz = this.pos.z - d.z, l = Math.hypot(dx, dz) || 1; away = { x: dx / l, z: dz / l }; this.pos.x = d.x + away.x * (d.r + 1.6); this.pos.z = d.z + away.z * (d.r + 1.6); }
      this.pos.y = this.world.surface(this.pos.x, this.pos.z).y;
      this.trapped = null; this.onGround = true;
      ev.push({ type: 'freed' });
    }
  }
  /** look: dx, dy in radians */
  look(dx, dy) { this.yaw -= dx; this.pitch = clamp(this.pitch - dy, -1.35, 1.45); }
}
