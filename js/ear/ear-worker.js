// The female's ears, off the main thread (module worker). Messages:
//   in  {cmd:'init', base}                       -> out {cmd:'ready', n}
//   in  {cmd:'reset'}                            start a new listening session (song tick 0 = now)
//   in  {cmd:'pulses', ticks:[...]}              new pulses (0.25 ms ticks since the session began), ascending
//   in  {cmd:'tick', now, gain, hums}            run her network up to `now`; gain = level at her antennae
//   out {cmd:'state', drive, vpo, areas, n}
import { FemaleEar } from './female-ear.js';

let ear = null;
async function loadEarNet(url) {
  // FlyHarp's ear-net.js is a classic script (UMD); evaluate it here with a CommonJS-style module object
  const src = await (await fetch(url)).text(), mod = { exports: {} };
  new Function('module', src)(mod);
  return mod.exports;
}
async function loadBin(url) {
  try { const r = await fetch(url); if (r.ok) return await r.arrayBuffer(); } catch (e) { /* fall through */ }
  throw new Error('could not load ' + url);
}
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.cmd === 'init') {
      const b = m.base;
      const [EarNet, meta, bin, M] = await Promise.all([loadEarNet(b + 'js/ear/ear-net.js'), fetch(b + 'data/ear.json').then(r => r.json()), loadBin(b + 'data/ear.bin'), fetch(b + 'data/song-model.json').then(r => r.json())]);
      ear = new FemaleEar(EarNet, meta, bin, M);
      self.postMessage({ cmd: 'ready', n: meta.n });
    } else if (!ear) return;
    else if (m.cmd === 'reset') ear.reset();
    else if (m.cmd === 'pulses') ear.addPulses(m.ticks);
    else if (m.cmd === 'tick') {
      if (m.hums) ear.setHums(m.hums);
      const o = m.gain > 0.02 ? ear.advanceTo(m.now, m.gain) : (ear.skipTo(m.now), ear.last);
      self.postMessage({ cmd: 'state', drive: o.drive, vpo: o.vpo, areas: Array.from(o.areas), n: o.n, quiet: !(m.gain > 0.02) });
    }
  } catch (err) { self.postMessage({ cmd: 'error', message: String(err && err.stack || err) }); }
};
