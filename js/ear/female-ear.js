// The female's ears: FlyHarp's Tonnectome (js/ear/ear-net.js, the FlyWire auditory network, 4,222 neurons)
// listening to the male's song. The song arrives as ideal antenna frames, one per 5 ms, made by Opulation's
// Framer (js/core/song.js) from the pulse/hum schedule: the same filterbank FlyHarp's ear worklet applies to
// sound, evaluated on the true-pitch song (270 Hz pulses, 155 Hz sine).
//
// Read-outs, every frame:
//   drive  - mean rate of the 32 AVLP/PVLP/WED neurons that respond most to pulse song (data/song-model.json
//            readout; chosen by Opulation's tools/make-model.mjs on FlyHarp's float network)
//   areas  - mean rate per area (JO, AMMC, saddle, wedge, AVLP/PVLP, GNG), for the HUD and the music
//   vpoEN  - the vaginal-plate-opening excitatory neurons (Wang et al. 2021). In this network they stay near
//            zero for song alone (they need more than the ear), which is reported honestly in the HUD.
import { Framer } from '../core/song.js';

export const AREAS = [['JO', ['JO']], ['AMMC', ['AMMC']], ['SAD', ['SAD']], ['WED', ['WED']], ['VLP', ['AVLP', 'PVLP']], ['GNG', ['GNG']]];
export const DRIVE_FULL = 0.052;   // readout mean for a steady 35 ms pulse song at full level (tools/test.mjs checks it)

export class FemaleEar {
  constructor(EarNet, meta, bin, M) {
    this.net = new EarNet(meta, bin); this.M = M; this.meta = meta;
    this.readout = M.readout; this.vpo = (M.named && M.named.vpoEN) || [];
    this.areaIdx = AREAS.map(([, nps]) => { const s = new Set(nps), a = []; meta.np.forEach((n, i) => { if (s.has(n)) a.push(i); }); return Int32Array.from(a); });
    this.reset();
  }
  reset() {
    this.net.reset(); this.framer = new Framer(this.M); this.sch = { pulses: [], hums: [], end: Infinity };
    this.f = new Float32Array(4 * this.M.NB + 2); this.last = { drive: 0, vpo: 0, areas: new Float32Array(AREAS.length), n: 0 };
  }
  /** pulses: song-clock ticks (0.25 ms), ascending, all later than any given before */
  addPulses(ticks) { for (const t of ticks) this.sch.pulses.push({ t }); }
  setHums(hums) { this.sch.hums = hums; }
  /** run the network up to song tick `now` (minus the pulse envelope's reach). gain: level at her antennae */
  advanceTo(now, gain = 1) {
    const M = this.M, F = M.dtTicks, safe = now - M.envOff, out = this.last;
    if (safe - this.framer.n * F > 8000) this.skipTo(now - 2000);          // fell behind (a hidden tab): jump, do not crawl
    let n = 0, dsum = 0, vsum = 0; const asum = new Float32Array(AREAS.length);
    while ((this.framer.n + 1) * F <= safe && n < 400) {
      const fr = this.framer.next(this.sch).f;
      for (let i = 0; i < fr.length; i++) this.f[i] = fr[i] / 65536 * gain;
      this.net.input(this.f); this.net.step(); n++;
      const r = this.net.r;
      let d = 0; for (const i of this.readout) d += r[i]; dsum += d / this.readout.length;
      let v = 0; for (const i of this.vpo) v += r[i]; vsum += this.vpo.length ? v / this.vpo.length : 0;
      this.areaIdx.forEach((idx, k) => { let s = 0; for (let j = 0; j < idx.length; j++) s += r[idx[j]]; asum[k] += s / Math.max(1, idx.length); });
    }
    if (n === 0 && (this.framer.n + 1) * F <= safe) return out;
    if (n > 0) { out.drive = dsum / n; out.vpo = vsum / n; for (let k = 0; k < asum.length; k++) out.areas[k] = asum[k] / n; out.n = this.framer.n; }
    // drop pulses the framer has finished with
    if (this.framer.pi > 256) { this.sch.pulses.splice(0, this.framer.pi); this.framer.pi = 0; }
    return out;
  }
  /** skip ahead without running the network (when she is out of earshot): keeps the framer in step */
  skipTo(now) {
    const F = this.M.dtTicks, target = Math.max(0, Math.floor((now - this.M.envOff) / F) - 1);
    if (target > this.framer.n) { this.framer.n = target; this.net.reset(); this.last.drive = 0; this.last.areas.fill(0); }
    while (this.framer.pi < this.sch.pulses.length && this.sch.pulses[this.framer.pi].t < this.framer.n * F - this.M.envOff) this.framer.pi++;
    if (this.framer.pi > 256) { this.sch.pulses.splice(0, this.framer.pi); this.framer.pi = 0; }
  }
}
