// Grooming and the survival missions.
//
// Grooming follows Seeds et al. (2014, eLife): a fly covered in dust cleans itself head first. All grooming
// programmes are active at once, and a suppression hierarchy lets the most anterior dusty part win:
// eyes > antennae > abdomen > wings > notum (thorax). The front legs sweep the head; the hind legs sweep the
// abdomen, wings and notum. Sweeping moves dust from the body onto the legs, so the fly interleaves sweeps
// with leg rubs, which shed it. The dust here is the calcium/vitamin powder keepers shake feeder flies in.
import { clamp } from './rng.js';

export const PARTS = [
  { id: 'eyes', label: 'eyes', legs: 'front', effect: 'clears your vision' },
  { id: 'antennae', label: 'antennae', legs: 'front', effect: 'restores smell (and hearing)' },
  { id: 'abdomen', label: 'abdomen', legs: 'hind', effect: 'makes you less conspicuous to frogs' },
  { id: 'wings', label: 'wings', legs: 'hind', effect: 'strengthens your song' },
  { id: 'notum', label: 'notum', legs: 'hind', effect: 'makes you less conspicuous to frogs' },
];

export class Grooming {
  constructor(level = 0.9) {
    this.dust = Object.fromEntries(PARTS.map((p, i) => [p.id, clamp(level - i * 0.04, 0, 1)]));
    this.legs = { front: 0, hind: 0 }; this.lastSide = null; this.lastSweep = -1; this.active = false; this.sweepAnim = 0; this.rubAnim = 0;
  }
  /** the part the hierarchy lets you clean now */
  get current() { for (const p of PARTS) if (this.dust[p.id] > 0.06) return p; return null; }
  get clean() { return PARTS.every(p => this.dust[p.id] <= 0.06); }
  get body() { return (this.dust.abdomen + this.dust.notum) / 2; }
  /** side: 'L' | 'R', t: seconds. Alternating sides at a steady rhythm sweeps best. */
  sweep(side, t) {
    const p = this.current; if (!p) return { ok: false, why: 'clean' };
    const legs = p.legs, clog = this.legs[legs];
    if (clog > 0.75) return { ok: false, why: 'clogged', legs };
    const alt = this.lastSide && this.lastSide !== side, gap = t - this.lastSweep;
    const rhythm = alt && gap > 0.07 && gap < 0.6 ? 1 : 0.35;
    this.lastSide = side; this.lastSweep = t; this.sweepAnim = 1;
    const amt = Math.min(this.dust[p.id], 0.075 * rhythm * (1 - clog * 0.6));
    this.dust[p.id] -= amt; this.legs[legs] = clamp(clog + amt * 1.6, 0, 1);
    return { ok: true, part: p.id, amt, rhythm };
  }
  /** rub the legs together (front pair, or hind pair: whichever the current part needs, else the dirtier) */
  rub() {
    const p = this.current, legs = p ? p.legs : (this.legs.front > this.legs.hind ? 'front' : 'hind');
    this.legs[legs] = Math.max(0, this.legs[legs] - 0.22); this.rubAnim = 1;
    return { legs };
  }
  update(dt) { this.sweepAnim = Math.max(0, this.sweepAnim - dt * 5); this.rubAnim = Math.max(0, this.rubAnim - dt * 4); }
}

export const MISSIONS = [
  { id: 'groom', title: 'Shake off the dust', hint: 'Press G to groom. Alternate A / D to sweep, W to rub your legs clean when they clog. Head first: eyes, then antennae.', required: false },
  { id: 'drink', title: 'Find water', hint: 'Walk (do not run) up to a mist droplet or the pond edge and press E to drink. Fall into one and surface tension holds you: mash Space.', required: false },
  { id: 'feed', title: 'Eat fermenting fruit', hint: 'Follow the vinegar plume (antenna gauge) upwind to the banana in the dish. Climb on and press E. Frogs hunt there.', required: false },
  { id: 'shelter', title: 'Wait out the mist somewhere humid', hint: 'When the misting starts, or the lights go out, shelter under a broad leaf or in the moss until it passes.', required: false },
  { id: 'escape', title: 'Survive a frog strike', hint: 'When a frog fixates you, time slows (your looming detectors). Jump (Space) away from it or keep still.', required: false },
  { id: 'court', title: 'Win a mate', hint: 'Track a virgin female by her scent and sight, then court her: orient, follow, tap (E), sing (click / J for pulse, hold right-click / K for hum), lick (E), and mount (E).', required: true },
];

export class Missions {
  constructor() { this.done = {}; this.progress = Object.fromEntries(MISSIONS.map(m => [m.id, 0])); this.log = []; }
  set(id, v) { if (this.done[id]) return false; this.progress[id] = clamp(v, 0, 1); if (this.progress[id] >= 1) { this.done[id] = true; this.log.push(id); return true; } return false; }
  add(id, v) { return this.set(id, this.progress[id] + v); }
  get list() { return MISSIONS.map(m => ({ ...m, done: !!this.done[m.id], progress: this.progress[m.id] })); }
}
