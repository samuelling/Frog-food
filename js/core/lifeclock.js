// A compressed life. One vivarium day passes in TIME.day real seconds; the LED bar runs on a timer and the
// misting system sprays twice a day. A fly that dodges everything still dies of old age after TIME.lifeDays.
import { TIME } from './scale.js';
import { clamp, smoothstep } from './rng.js';

export class LifeClock {
  constructor(start = TIME.start) { this.start = start; this.t = 0; }
  update(dt) { this.t += dt; }
  get abs() { return this.start + this.t / TIME.day; }                 // days since midnight of day 1
  get dayFrac() { return this.abs % 1; }
  get day() { return Math.floor(this.abs) + 1; }
  get lightsOn() { const f = this.dayFrac; return f >= TIME.lightsOn && f < TIME.lightsOff; }
  /** 0 (night) .. 1 (full light), with a 20-minute ramp at each end, as LED controllers do */
  get light() { const f = this.dayFrac, r = 20 / 1440; return clamp(smoothstep(TIME.lightsOn - r, TIME.lightsOn + r, f) * (1 - smoothstep(TIME.lightsOff - r, TIME.lightsOff + r, f)), 0, 1); }
  get clock() { const m = Math.floor(this.dayFrac * 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  get ageFrac() { return this.t / (TIME.lifeDays * TIME.day); }
  get ageText() { const h = this.t / TIME.day * 24; return h < 24 ? Math.floor(h) + ' h' : Math.floor(h / 24) + ' d ' + Math.floor(h % 24) + ' h'; }
  get dead() { return this.ageFrac >= 1; }
  /** real seconds since the most recent misting began (Infinity if none yet) */
  get mistAge() {
    let best = Infinity;
    for (let d = Math.floor(this.abs); d >= Math.floor(this.abs) - 1; d--) for (const m of TIME.mist) {
      const s = (this.abs - (d + m)) * TIME.day; if (s >= 0 && s < best) best = s;
    }
    return best;
  }
  get misting() { return this.mistAge < TIME.mistDuration; }
  /** seconds (real) until the next misting or lights-off, for mission hints */
  untilNext(f) { let d = f - this.dayFrac; if (d < 0) d += 1; return d * TIME.day; }
}
