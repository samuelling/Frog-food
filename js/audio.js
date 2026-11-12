// FrogFood's sound. The male's courtship song is the lead instrument: every pulse is a true 270 Hz wing click
// (Gaussian-windowed, as in Opulation's renderTrue), the hum a 155 Hz sine. In FlyHarp style the song also
// plays the female's brain: her Tonnectome's areas (JO, AMMC, saddle, wedge, ventrolateral, GNG) each voice a
// note of a chord built on the hum, swelling with their activity, so you hear her listening. Frogs are
// musical too: looming (the LPLC2 read-out) is a rising drone, each frog has a call, landings thud.
const AREA_RATIOS = [1, 1.5, 2, 2.5, 3, 0.5];

export class Audio {
  constructor() { this.ctx = null; this.on = false; this.transpose = 0; this.peaks = new Float32Array(6).fill(1e-3); this.mute = false; }
  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0.8;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(C.destination);
    this.rev = C.createConvolver(); this.rev.buffer = this._impulse(2.8, 2.2);
    this.wet = C.createGain(); this.wet.gain.value = 0.32; this.rev.connect(this.wet); this.wet.connect(this.master);
    this.songBus = C.createGain(); this.songBus.gain.value = 0.9; this.songBus.connect(this.master); this.songBus.connect(this.rev);
    this.fxBus = C.createGain(); this.fxBus.gain.value = 0.8; this.fxBus.connect(this.master); this.fxBus.connect(this.rev);
    this._buildPulses();
    this._ambience(); this._choir(); this._loomVoice();
    this.on = true;
  }
  get now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }
  setVolume(v) { if (this.master) this.master.gain.value = v; }
  setTranspose(oct) { this.transpose = oct; this._buildPulses(); if (this.choir) this.choir.forEach((o, i) => o.osc.frequency.value = 155 * AREA_RATIOS[i] * 2 ** oct); }
  _impulse(sec, decay) { const C = this.ctx, n = Math.round(C.sampleRate * sec), b = C.createBuffer(2, n, C.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }
  _buildPulses() {
    const C = this.ctx; if (!C) return;
    const f = 270 * 2 ** this.transpose, sg = 0.0025, n = Math.round(C.sampleRate * 0.024), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) { const t = i / C.sampleRate - 0.012; d[i] = Math.exp(-0.5 * (t / sg) ** 2) * Math.cos(2 * Math.PI * f * t); }
    this.pulseBuf = b;
  }
  /** a wing pulse at audio time `when` (s). who: 0 = you, 1 = rival (panned) */
  pulse(when, amp = 0.8, pan = 0) {
    if (!this.on || this.mute) return;
    const C = this.ctx, s = C.createBufferSource(), g = C.createGain(), p = C.createStereoPanner();
    s.buffer = this.pulseBuf; g.gain.value = amp * 0.9; p.pan.value = pan;
    s.connect(g); g.connect(p); p.connect(this.songBus);
    s.start(Math.max(C.currentTime, when - 0.012));
    // each click also plucks the choir softly (the brain "rings")
    if (this.choir) for (const v of this.choir) { v.pluck.gain.cancelScheduledValues(when); v.pluck.gain.setValueAtTime(v.pluck.gain.value, Math.max(C.currentTime, when)); v.pluck.gain.linearRampToValueAtTime(v.level * 0.5 + 0.02, Math.max(C.currentTime, when) + 0.004); v.pluck.gain.setTargetAtTime(0, Math.max(C.currentTime, when) + 0.004, 0.05); }
  }
  humOn(when, who = 0) {
    if (!this.on) return; const C = this.ctx; this.humOff(when, who);
    const o = C.createOscillator(), o2 = C.createOscillator(), g = C.createGain(), g2 = C.createGain(), p = C.createStereoPanner();
    o.frequency.value = 155 * 2 ** this.transpose; o2.frequency.value = 310 * 2 ** this.transpose; g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(p); p.connect(this.songBus); p.pan.value = who ? 0.4 : 0;
    const t = Math.max(C.currentTime, when); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.012);
    o.start(t); o2.start(t); (this.hums = this.hums || {})[who] = { o, o2, g };
  }
  humOff(when, who = 0) {
    const h = this.hums && this.hums[who]; if (!h) return; const C = this.ctx, t = Math.max(C.currentTime, when);
    h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.linearRampToValueAtTime(0, t + 0.015); h.o.stop(t + 0.03); h.o2.stop(t + 0.03); this.hums[who] = null;
  }
  // her brain's chord
  _choir() {
    const C = this.ctx; this.choir = [];
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7; lp.connect(this.master); lp.connect(this.rev); this.choirFilter = lp;
    AREA_RATIOS.forEach((r, i) => {
      const o = C.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = 155 * r * 2 ** this.transpose; o.detune.value = (i - 2.5) * 3;
      const g = C.createGain(); g.gain.value = 0; const pl = C.createGain(); pl.gain.value = 0;
      o.connect(g); o.connect(pl); g.connect(lp); pl.connect(lp); o.start();
      this.choir.push({ osc: o, gain: g, pluck: pl, level: 0 });
    });
  }
  /** areas: Float32Array(6) mean rates from her Tonnectome; R: her receptivity 0..1; near: how close (0..1) */
  setBrain(areas, R = 0, near = 0) {
    if (!this.on || !this.choir) return; const C = this.ctx, t = C.currentTime;
    this.choir.forEach((v, i) => {
      const a = areas ? areas[i] : 0; this.peaks[i] = Math.max(this.peaks[i] * 0.999, a, 1e-3);
      v.level = Math.min(1, a / this.peaks[i]) * near;
      v.gain.gain.setTargetAtTime(v.level * (0.04 + 0.05 * R), t, 0.12);
    });
    this.choirFilter.frequency.setTargetAtTime(500 + 2500 * R, t, 0.3);
  }
  _loomVoice() {
    const C = this.ctx, g = C.createGain(); g.gain.value = 0; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120; lp.Q.value = 6;
    const p = C.createStereoPanner(); const os = [55, 55.7, 82.4].map((f, i) => { const o = C.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    lp.connect(g); g.connect(p); p.connect(this.fxBus); this.loomV = { g, lp, p, os };
  }
  /** lplc2 0..1, az: radians (+ left) */
  loom(level, az = 0, slow = 1) {
    if (!this.on) return; const t = this.ctx.currentTime, L = this.loomV;
    L.g.gain.setTargetAtTime(Math.min(0.5, level * 0.55), t, 0.04); L.lp.frequency.setTargetAtTime(110 + level * 1600, t, 0.05); L.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(az))), t, 0.05);
    L.os[2].frequency.setTargetAtTime(82.4 * (1 + level * 1.5) * slow, t, 0.05);
  }
  _noise(sec = 1) { const C = this.ctx, n = Math.round(C.sampleRate * sec), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
  _ambience() {
    const C = this.ctx, src = C.createBufferSource(); src.buffer = this._noise(3); src.loop = true;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; const g = C.createGain(); g.gain.value = 0.09;
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start(); this.amb = { g, lp };
    const hiss = C.createBufferSource(); hiss.buffer = this._noise(2); hiss.loop = true; const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; const hg = C.createGain(); hg.gain.value = 0;
    hiss.connect(hp); hp.connect(hg); hg.connect(this.fxBus); hiss.start(); this.mistG = hg;
  }
  setAmbience({ light = 1, mist = false } = {}) {
    if (!this.on) return; const t = this.ctx.currentTime;
    this.amb.g.gain.setTargetAtTime(0.05 + 0.05 * light, t, 0.5);
    this.mistG.gain.setTargetAtTime(mist ? 0.12 : 0, t, 0.3);
  }
  thump(dist, mass = 30) {
    if (!this.on) return; const C = this.ctx, t = C.currentTime, o = C.createOscillator(), g = C.createGain();
    o.frequency.setValueAtTime(70 - mass * 0.4, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.35);
    const v = Math.min(0.9, 0.9 / (1 + dist / 35)); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 0.55);
  }
  whoosh(level = 1) {
    if (!this.on) return; const C = this.ctx, t = C.currentTime, s = C.createBufferSource(), bp = C.createBiquadFilter(), g = C.createGain();
    s.buffer = this._noise(0.4); bp.type = 'bandpass'; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2500, t + 0.15); bp.Q.value = 2;
    g.gain.setValueAtTime(0.5 * level, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); s.connect(bp); bp.connect(g); g.connect(this.fxBus); s.start(t);
  }
  plink(dist = 10, r = 1) {
    if (!this.on) return; const C = this.ctx, t = C.currentTime, o = C.createOscillator(), g = C.createGain();
    o.frequency.setValueAtTime(900 / r + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(300 / r + 200, t + 0.12);
    g.gain.setValueAtTime(Math.min(0.25, 0.3 / (1 + dist / 15)), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 0.3);
  }
  // dart frog calls: azureus a low buzz, leucomelas a long bright trill
  call(species, dist = 50) {
    if (!this.on) return; const C = this.ctx, t = C.currentTime, o = C.createOscillator(), am = C.createGain(), lfo = C.createOscillator(), g = C.createGain(), lg = C.createGain();
    const f = species === 'leucomelas' ? 2600 : species === 'auratus' ? 3600 : 1100, rate = species === 'leucomelas' ? 18 : species === 'auratus' ? 12 : 30, dur = species === 'leucomelas' ? 2.2 : 0.9;
    o.frequency.value = f / 2 ** 2.5; o.type = 'triangle';                       // brought down into musical range: an interpretation, not a recording
    lfo.frequency.value = rate; lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.5;
    const v = Math.min(0.25, 0.3 / (1 + dist / 60)); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.05); g.gain.setValueAtTime(v, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(am); am.connect(g); g.connect(this.fxBus); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  chord(kind) {
    if (!this.on) return; const C = this.ctx, t = C.currentTime;
    const notes = kind === 'win' ? [155, 232.5, 310, 387.5, 465] : kind === 'death' ? [110, 130.8, 155.6] : [310, 387.5];
    notes.forEach((f, i) => { const o = C.createOscillator(), g = C.createGain(); o.type = 'triangle'; o.frequency.value = f; const t0 = t + i * (kind === 'win' ? 0.12 : 0.05); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.12, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t0 + (kind === 'good' ? 0.8 : 3)); o.connect(g); g.connect(this.master); g.connect(this.rev); o.start(t0); o.stop(t0 + 3.2); });
  }
}
