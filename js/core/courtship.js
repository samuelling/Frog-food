// The courtship sequence as a skill game. Real male courtship (Greenspan & Ferveur 2000; reviewed in
// Auer & Benton 2016) runs: orient towards the female, follow her, tap her with a foreleg (tasting her
// cuticular pheromones: 7,11-HD says "virgin female", cVA and 7-T say "already mated"), sing by vibrating the
// wing nearest her, lick her genitalia, and attempt copulation by curling the abdomen. Steps repeat and fail;
// she decides. Here each step has a goal you must hold or a key (E) you must press at the right moment.
import { wrapAngle, clamp } from './rng.js';

export const STAGES = [
  { id: 'orient', label: 'Orient', how: 'Turn to face her and hold her in the centre of your view.' },
  { id: 'follow', label: 'Follow', how: 'Stay 2-7 mm behind her, facing her, as she walks.' },
  { id: 'tap', label: 'Tap', how: 'Get within 3 mm and press E to tap her with a foreleg (taste her pheromones).' },
  { id: 'sing', label: 'Sing', how: 'Sing: click / J to set the pulse tempo (steady, about 170 taps a minute = 35 ms IPIs), hold right-click / K for sine hum. Stay close: song carries only a few mm.' },
  { id: 'lick', label: 'Lick', how: 'She has slowed. Get right behind her and press E to lick.' },
  { id: 'mount', label: 'Copulate', how: 'When her vaginal plate opens, press E to curl your abdomen and mount. Too early and she kicks.' },
];

export function geometry(fly, f) {
  const dx = f.pos.x - fly.pos.x, dz = f.pos.z - fly.pos.z, dist = Math.hypot(dx, dz);
  const az = wrapAngle(Math.atan2(-dx, -dz) - fly.yaw);
  const ff = f.forward(), behind = dist > 1e-6 ? (-(dx) * ff.x + -(dz) * ff.z) / dist : 0;   // -1: male straight behind her
  return { dist, az, behind };
}

export class Courtship {
  constructor() { this.female = null; this.stage = null; this.hold = 0; this.lostFor = 0; this.tasted = new Map(); this.attempts = 0; this.kicks = 0; this.won = false; }
  get index() { return this.stage ? STAGES.findIndex(s => s.id === this.stage) : -1; }
  _set(stage, ev, extra = {}) { this.stage = stage; this.hold = 0; ev.push({ type: 'stage', stage, ...extra }); }
  end(ev, why) { if (this.female && this.female.courtedBy && this.female.courtedBy.isPlayer) this.female.courtedBy = null; this.female = null; this.stage = null; this.hold = 0; if (ev) ev.push({ type: 'court-end', why }); }

  /** ctx: {fly, player (the proxy NPCs see), females, feat (song features)} */
  update(dt, ctx) {
    const ev = [], fly = ctx.fly;
    if (this.won) return ev;
    if (!this.female) {
      for (const f of ctx.females) {
        if (!f.alive || f.copulating) continue;
        const g = geometry(fly, f);
        if (g.dist < 16 && Math.abs(g.az) < 0.5) { this.female = f; this._set('orient', ev, { female: f }); ev.push({ type: 'court-start', female: f }); break; }
      }
      return ev;
    }
    const f = this.female;
    if (!f.alive || f.copulating) { this.end(ev, f.alive ? 'taken' : 'eaten'); return ev; }
    const g = geometry(fly, f); this.geo = g;
    // claim her attention if you are the nearest suitor
    const cb = f.courtedBy; if (!cb || cb.isPlayer || Math.hypot(cb.pos.x - f.pos.x, cb.pos.z - f.pos.z) > g.dist) f.courtedBy = ctx.player;
    const facing = Math.abs(g.az);
    this.lostFor = g.dist > 30 || facing > 1.3 ? this.lostFor + dt : 0;
    if (this.lostFor > 3 || g.dist > 45) { this.end(ev, 'lost'); return ev; }
    switch (this.stage) {
      case 'orient':
        this.hold = facing < 0.25 && g.dist < 16 ? this.hold + dt : Math.max(0, this.hold - dt * 0.5);
        if (this.hold >= 1.0) this._set('follow', ev);
        break;
      case 'follow': {
        const ok = facing < 0.45 && g.dist > 1.2 && g.dist < 7;
        this.hold = ok ? this.hold + dt : Math.max(0, this.hold - dt * 0.3);
        if (this.hold >= 2.5) this._set('tap', ev);
        break;
      }
      case 'sing':
        this.hold = f.R;
        if (f.R >= 0.72) this._set('lick', ev);
        break;
      case 'lick': case 'mount':
        if (f.R < 0.5) this._set('sing', ev, { why: 'cooled' });
        break;
    }
    return ev;
  }
  /** the courtship action key (E). Returns events. */
  act(ctx) {
    const ev = [], f = this.female; if (!f) return ev;
    const g = geometry(ctx.fly, f);
    const close = g.dist < 3 && Math.abs(g.az) < 0.7, behind = g.dist < 2.8 && g.behind < -0.25;
    switch (this.stage) {
      case 'orient': case 'follow': case 'tap':
        if (!close) { ev.push({ type: 'hint', text: 'Too far to tap: get within 3 mm, facing her.' }); break; }
        this.tasted.set(f.id, f.mated ? 'mated' : 'virgin');
        ev.push({ type: 'taste', female: f, mated: f.mated });
        if (f.mated) { f.reject = Math.max(f.reject, 2.5); ev.push({ type: 'hint', text: 'cVA and 7-T on her cuticle: she has already mated. She will not have you. Look for another.' }); }
        else this._set('sing', ev);
        break;
      case 'sing':
        ev.push({ type: 'hint', text: 'Sing first: she is not ready (watch her receptivity).' });
        break;
      case 'lick':
        if (!behind) { ev.push({ type: 'hint', text: 'Get right behind her (within ~2.5 mm) to lick.' }); break; }
        f.R = clamp(f.R + 0.05, 0, 1); this._set('mount', ev); ev.push({ type: 'lick', female: f });
        break;
      case 'mount':
        if (!behind) { ev.push({ type: 'hint', text: 'Get right behind her to mount.' }); break; }
        this.attempts++;
        if (f.vpo > 0.6 && !f.mated) { f.copulating = ctx.player; f.copT = 0; this.won = true; ev.push({ type: 'copulate', female: f }); }
        else { f.R = clamp(f.R - 0.22, 0, 1); f.kick = 1; this.kicks++; ev.push({ type: 'kick', female: f, why: 'too-early' }); this._set('sing', ev, { why: 'kicked' }); }
        break;
    }
    return ev;
  }
}
