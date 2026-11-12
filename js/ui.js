// The HUD: life, body, senses, missions, courtship, grooming, messages.
import { STAGES, geometry } from './core/courtship.js';
import { PARTS } from './core/missions.js';
import { AREAS } from './ear/female-ear.js';
import { NODES } from './core/male.js';
import { songQuality } from './core/npc.js';
import { humanEquivalent } from './core/scale.js';

const $ = id => document.getElementById(id);
const pct = v => Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';

export class HUD {
  constructor() {
    this.shown = new Set(); this.toastEls = [];
    $('c-stages').innerHTML = STAGES.map(s => `<span data-s="${s.id}">${s.label}</span>`).join('');
    $('c-ears').innerHTML = AREAS.map(([n], i) => `<div class="row"><span class="lbl">${{ JO: "Johnston's", AMMC: 'AMMC', SAD: 'saddle', WED: 'wedge', VLP: 'AVLP/PVLP', GNG: 'GNG' }[n]}</span><span class="bar"><i id="ear${i}"></i></span></div>`).join('');
    $('c-male').innerHTML = NODES.map(n => `<span id="mn-${n.id}" title="${n.area}: ${n.role}">${n.label}</span>`).join('');
    $('g-parts').innerHTML = PARTS.map(p => `<div id="gp-${p.id}" title="${p.effect}">${p.label}<i></i></div>`).join('');
    this.earPeak = new Float32Array(AREAS.length).fill(1e-3);
  }
  toast(m) {
    const el = document.createElement('div'); el.className = m.kind; el.textContent = m.text; $('toasts').appendChild(el);
    this.toastEls.push({ el, until: performance.now() + m.dur * 1000 });
    while (this.toastEls.length > 4) this.toastEls.shift().el.remove();
  }
  update(g, x = {}) {
    // messages
    for (const m of g.messages) if (!this.shown.has(m)) { this.shown.add(m); this.toast(m); }
    const now = performance.now();
    this.toastEls = this.toastEls.filter(t => { if (now > t.until) { t.el.style.opacity = 0; setTimeout(() => t.el.remove(), 700); return false; } return true; });
    // life and body
    const C = g.clock;
    $('h-day').textContent = 'Day ' + C.day; $('h-clock').textContent = C.clock; $('h-light').textContent = C.lightsOn ? '☀' : '☾';
    $('h-age').textContent = C.ageText; $('h-lifebar').style.width = pct(1 - C.ageFrac);
    $('h-water').style.width = pct(g.stats.water); $('h-energy').style.width = pct(g.stats.energy); $('h-hum').style.width = pct(g.humidity ?? 0.6);
    $('h-shelter').classList.toggle('on', (g.sheltered ?? 0) > 0.5); $('h-shelter').classList.toggle('good', true);
    // missions
    const ml = g.missions.list.map(m => `<li class="${m.done ? 'done' : ''} ${m.required ? 'req' : ''}" title="${m.hint}">${m.title}${!m.done && m.progress > 0.01 && m.progress < 1 ? `<span class="p"><i style="width:${pct(m.progress)}"></i></span>` : ''}</li>`).join('');
    if (ml !== this._ml) { $('h-missions').innerHTML = ml; this._ml = ml; }
    // senses
    const S = g.senses;
    if (S) {
      const lr = (c, l) => { const v = Math.min(1, c * 2.2); return [v * (1 - Math.max(0, l)), v * (1 + Math.min(0, l))]; };
      const [fl, fr] = lr(S.fruit.c, S.fruit.lr), [ml2, mr2] = lr(S.female.c * 2, S.female.lr);
      $('h-fruitL').style.setProperty('--v', pct(fl)); $('h-fruitR').style.setProperty('--v', pct(fr));
      $('h-femL').style.setProperty('--v', pct(ml2)); $('h-femR').style.setProperty('--v', pct(mr2));
      $('h-wind').style.transform = `rotate(${-S.wind}rad)`;
      $('h-cva').classList.toggle('on', S.cva); $('h-dulled').classList.toggle('on', S.sens < 0.6);
    }
    const L = g.loomState || { lplc2: 0, gf: false };
    $('h-loom').style.width = pct(L.lplc2); $('h-gf').classList.toggle('on', L.gf);
    // courtship
    const f = g.court.female;
    $('hud-court').classList.toggle('hidden', !f || g.grooming);
    if (f) {
      const idx = g.court.index;
      for (const el of $('c-stages').children) { const i = STAGES.findIndex(s => s.id === el.dataset.s); el.className = i < idx ? 'done' : i === idx ? 'cur' : ''; }
      const st = STAGES[idx];
      const tasted = g.court.tasted.get(f.id);
      $('c-name').textContent = tasted ? `(${tasted === 'mated' ? 'mated: cVA' : 'virgin: 7,11-HD'})` : '';
      $('c-how').textContent = st ? st.how : '';
      $('c-R').style.width = pct(f.R);
      $('c-vpo').textContent = f.vpo > 0.6 ? 'vaginal plate OPEN' : 'vaginal plate closed'; $('c-vpo').classList.toggle('on', f.vpo > 0.6); $('c-vpo').classList.toggle('good', true);
      $('c-ovi').classList.toggle('on', (f.ovi || 0) > 0.4);
      const F = g.myFeat; const q = songQuality(F);
      $('c-ipi').textContent = F.recentIPI ? (F.recentIPI * 1000).toFixed(1) + ' ms' : '— ms';
      $('c-cv').textContent = F.nIPI > 2 ? 'cv ' + F.ipiCV.toFixed(2) : '';
      $('c-sine').textContent = F.sineFrac > 0.01 ? 'sine ' + Math.round(F.sineFrac * 100) + '%' : '';
      $('c-q').style.width = pct(q.q / 1.35);
      const geo = geometry(g.fly, f);
      $('c-dist').textContent = `${geo.dist.toFixed(1)} mm away (${humanEquivalent(geo.dist)} at your scale)` + (geo.dist > 6 ? ' · too far for her to hear you' : '');
      const ear = g.ear, areas = ear && ear.female === f ? ear.areas : null;
      for (let i = 0; i < AREAS.length; i++) { const a = areas ? areas[i] : 0; this.earPeak[i] = Math.max(this.earPeak[i] * 0.998, a, 1e-3); const el = $('ear' + i); if (el) el.style.width = pct(a / this.earPeak[i]); }
      for (const n of NODES) { const v = g.male.a[n.id] || 0, el = $('mn-' + n.id); el.style.background = `rgba(255,154,192,${Math.min(1, v) * 0.85})`; el.style.color = v > 0.5 ? '#301' : ''; }
    }
    // grooming
    $('hud-groom').classList.toggle('hidden', !g.grooming);
    if (g.grooming) {
      const cur = g.groom.current;
      for (const p of PARTS) { const el = $('gp-' + p.id); el.classList.toggle('cur', cur && cur.id === p.id); el.querySelector('i').style.width = pct(g.groom.dust[p.id]); }
      $('g-front').style.width = pct(g.groom.legs.front); $('g-hind').style.width = pct(g.groom.legs.hind);
    }
    // prompt
    $('prompt').innerHTML = x.prompt || '';
  }
}

export function helpHTML() {
  return `<h1>How to be a fly</h1>
  <p><b>Scale.</b> Everything is true size: you are 2.5 mm long, so the 45 × 45 × 60 cm tank is a 300 m forest under a 400 m sky. A 3 cm dart frog is a 20 m giant. Mist droplets are beach balls; soil grains are boulders; moss is a forest.</p>
  <p><b>Frogs see motion.</b> Freeze and a frog loses you (unless you are almost under its chin). When one fixates you its toes start tapping, your looming detectors fire and time slows: jump (Space) away, or stay still. The tongue is out and back in about 0.2 s.</p>
  <p><b>Water.</b> Walk up to a droplet and press E to drink. Run, jump or fall into one and surface tension holds you: mash Space. The pond edge works too.</p>
  <p><b>Food.</b> Follow the vinegar smell (left/right antenna bars; the airflow arrow shows where odour drifts) upwind to the fermenting banana, climb on, press E.</p>
  <p><b>Dust.</b> You arrive coated in calcium powder. Press G to groom: alternate A / D to sweep, W to rub your legs clean. Flies clean head first, so eyes come first (clear sight), then antennae (smell), then abdomen, wings (song strength) and thorax.</p>
  <p><b>Mist and night.</b> Twice a day the misting system rains beach-ball droplets: shelter under a broad leaf or deep in moss. At night the frogs sleep.</p>
  <p><b>Courtship.</b> Find a female by her scent (pink antenna bars) and sight. Face her and hold her centred (orient), follow 2-7 mm behind, tap her with E (you taste whether she is a virgin), then <b>sing</b>: tap a steady tempo with click or J; every tap sets the wing's pulse generator, which sings ten times faster (tap every 350 ms → 35 ms between pulses, what females prefer). Hold right-click or K to hum sine song between pulse trains. Stay within a few mm: song is near-field. Her ears are a real connectome model; watch her receptivity rise and her walking slow. When she slows, get behind her and lick (E); when her vaginal plate opens, mount (E). Too early and she kicks. A mated female (cVA) will extrude her ovipositor and refuse you. A rival male may court her too: his song scrambles yours. Shove him with E.</p>
  <p class="small">Press H to close.</p>`;
}
