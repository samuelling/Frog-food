// FrogFood: wiring. Game logic (js/core/game.js) + renderer (js/render/*) + audio (js/audio.js) + the female's
// ears in a worker (js/ear/ear-worker.js) + the FlyHarp hook (js/render/flyeye.js, window.FrogFood.flyharp).
import * as THREE from './vendor/three.module.min.js';
import { Game } from './core/game.js';
import { buildScene, updateScene } from './render/scene.js';
import { Detail } from './render/detail.js';
import { FrogView, FlyView, SelfRig } from './render/actors.js';
import { FlyEyeHook } from './render/flyeye.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HUD, helpHTML } from './ui.js';
import { geometry } from './core/courtship.js';
import { dustSpecks } from './render/textures.js';

const $ = id => document.getElementById(id);
const canvas = $('view');
const lock = () => { try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* no pointer lock here */ } };
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/.test(navigator.userAgent);
if (mobile) document.body.classList.add('touch');

// ------------------------------------------------------------------------------------------------ setup

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const game = new Game({ seed: Number(params.get('seed')) || 7 });
const parts = buildScene(game.world, { mobile });
const scene = parts.scene;
const camera = new THREE.PerspectiveCamera(mobile ? 80 : 74, 1, 0.04, 3000); camera.rotation.order = 'YXZ'; scene.add(camera);
const detail = new Detail(game.world, parts.root, mobile);
const self = new SelfRig(camera);
const frogViews = game.frogs.map(f => { const v = new FrogView(f); v.addTo(parts.root); return v; });
const flyViews = new Map();
function syncFlies() { for (const n of game.npcs) if (!flyViews.has(n)) { const v = new FlyView(n); v.addTo(parts.root); flyViews.set(n, v); } }
syncFlies();

const audio = new Audio();
const hud = new HUD();
const input = new Input(canvas, { onLock: locked => { if (!locked && running && !mobile && !game.dead && !game.won) setPaused(true); } });
if (mobile) input.bindTouch($('touch'));
$('fx-dust').style.backgroundImage = `url(${dustSpecks()})`;

// the FlyHarp hook
const flyharp = new FlyEyeHook(renderer, scene, { size: mobile ? 72 : 96 });
flyharp.loadColumns('data/fly.json');
window.FrogFood = { game, flyharp, scene, camera, renderer, audio, version: 'v1' };

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); parts.motes.material.uniforms.uScale.value = h * renderer.getPixelRatio() / 2 / Math.tan(camera.fov * Math.PI / 360); }
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------------------------- the female's ears
const ear = { worker: null, ready: false, t0: 0, target: null, sent: 0, pending: [] };
try {
  ear.worker = new Worker(new URL('./ear/ear-worker.js', import.meta.url), { type: 'module' });
  ear.worker.onmessage = e => {
    const m = e.data;
    if (m.cmd === 'ready') { ear.ready = true; $('loading').textContent = `Her ears are ready: ${m.n.toLocaleString()} FlyWire neurons.`; }
    else if (m.cmd === 'state') { if (!m.quiet) { game.ear.drive = m.drive; game.ear.areas = m.areas; game.ear.vpo = m.vpo; game.ear.fresh = true; } else { game.ear.areas = m.areas; } }
    else if (m.cmd === 'error') { console.warn('ear worker:', m.message); $('loading').textContent = 'Her ears failed to load; a stand-in is used.'; }
  };
  ear.worker.postMessage({ cmd: 'init', base: new URL('.', location.href).href });
} catch (e) { console.warn('no ear worker', e); $('loading').textContent = 'No workers here; a stand-in for her ears is used.'; }
function earSync(events, songNow) {
  if (!ear.ready) return;
  const W = ear.worker, tick = t => Math.round((t - ear.t0) * 4000);
  if (game.ear.female !== ear.target) { ear.target = game.ear.female; ear.t0 = songNow; W.postMessage({ cmd: 'reset' }); game.ear.fresh = false; }
  const ticks = [];
  for (const e of events) if (e.type === 'pulses') for (const p of e.pulses) { const k = tick(p.t); if (k >= 0) ticks.push(k); }
  if (ticks.length) { ticks.sort((a, b) => a - b); W.postMessage({ cmd: 'pulses', ticks }); }
  const hums = game.air.hums.filter(h => h.t1 === Infinity || h.t1 > ear.t0).map(h => ({ t0: Math.max(0, tick(h.t0)), t1: h.t1 === Infinity ? Infinity : tick(h.t1) }));
  W.postMessage({ cmd: 'tick', now: tick(songNow), gain: game.ear.gain, hums });
}

// --------------------------------------------------------------------------------------------- screens
let running = false, paused = false, helpOpen = false, eyeView = false, last = performance.now(), endShown = false, t = 0, camY = null, bob = 0, shake = 0;
function setPaused(p) { paused = p; game.paused = p || helpOpen; $('paused').classList.toggle('hidden', !p); }
$('paused').addEventListener('click', () => { setPaused(false); if (!mobile) lock(); });
$('help-body').innerHTML = helpHTML();
$('help').addEventListener('click', () => toggleHelp(false));
function toggleHelp(v = !helpOpen) { helpOpen = v; $('help').classList.toggle('hidden', !v); game.paused = v || paused; }
$('go').addEventListener('click', async () => {
  try { await audio.start(); } catch (e) { console.warn('audio', e); }
  if ($('opt-oct').checked) audio.setTranspose(2);
  $('start').classList.add('hidden'); $('hud').classList.remove('hidden'); if (mobile) $('touch').classList.remove('hidden');
  input.enabled = true; running = true; last = performance.now();
  const F = game.fly; F.pos.y += 60; F.onGround = false; F.vel.y = -50; camY = null;   // tipped out of the keeper's cup
  if (!mobile) lock();
});
$('again').addEventListener('click', () => location.reload());
if (params.has('autostart')) setTimeout(() => $('go').click(), 50);

function showEnd() {
  endShown = true; document.exitPointerLock?.();
  const d = game.dead, w = game.won;
  $('end-title').textContent = w ? 'Your genes go on' : { eaten: 'Frog food', desiccation: 'Dried out', starvation: 'Starved', drowned: 'Drowned', age: 'Old age' }[d.cause] || 'Dead';
  $('end-text').textContent = w ? `She accepted you on day ${game.clock.day}, at ${game.clock.clock}. In about twenty minutes of real fly time, you will have passed on your genes. In a few days her eggs will hatch in the fermenting banana, and some of your children will be dusted in calcium and dropped into a frog tank. That is the game.` : d.text;
  const done = game.missions.list.filter(m => m.done).map(m => m.title);
  $('end-stats').innerHTML = `Age ${game.clock.ageText}. Goals reached: ${done.length ? done.join(', ') : 'none'}. Frog strikes survived: ${game.escapes}. Courtship attempts: ${game.court.attempts}, kicks taken: ${game.court.kicks}.`;
  $('end').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
}

// -------------------------------------------------------------------------------------------- the loop
function prompt() {
  const F = game.fly, c = game.court;
  if (game.dead || game.won) return '';
  if (F.trapped) return 'Stuck! Mash <b>Space</b>' + (mobile ? ' / Jump' : '');
  if (game.loomState && game.loomState.lplc2 > 0.3 && game.timeScale < 0.7) return '<b>Space</b> — jump away! (or freeze)';
  if (game.grooming) return '';
  if (c.female && ['tap', 'lick', 'mount'].includes(c.stage)) { const g = geometry(F, c.female); if (g.dist < 4) return `<b>E</b> — ${c.stage === 'tap' ? 'tap her' : c.stage === 'lick' ? 'lick' : c.female.vpo > 0.6 ? 'mount!' : 'mount (she is not open yet)'}`; }
  if (game.drinking) return 'drinking…'; if (game.feeding) return 'feeding…';
  const nd = game.world.nearestDroplet(F.pos.x, F.pos.z, 1.2); if (nd) return '<b>E</b> — drink';
  if (F.ground === 'banana') return '<b>E</b> — feed on yeast and fruit';
  if (game.groom.dust.eyes > 0.5 && game.simT > 8 && game.simT < 40) return '<b>G</b> — groom the dust off';
  return '';
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(); let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!running) { t += dt; renderOnly(dt); return; }
  const inp = input.read();
  if (inp.help) toggleHelp();
  if (inp.pause && mobile) setPaused(!paused);
  if (inp.mute) { audio.mute = !audio.mute; audio.setVolume(audio.mute ? 0 : 0.8); }
  if (inp.view) { eyeView = !eyeView; flyharp.enable(eyeView || flyharp.workers.length > 0); $('eyepip').classList.toggle('hidden', !eyeView); }
  if (paused || helpOpen) { renderOnly(0); return; }
  if (game.grooming) { inp.fwd = 0; inp.strafe = 0; }
  // grooming keys double as movement keys: when grooming, A/D/W sweep and rub; otherwise they move
  if (!game.grooming) { inp.sweepL = inp.sweepR = inp.rub = false; }
  $('tgroom').classList.toggle('hidden', !game.grooming || !mobile);
  const songNow = audio.on ? audio.now : now / 1000;
  // song events carry their own times (keyboard / mouse / touch event time, mapped onto the song clock)
  const toSong = ts => ts.map(x => songNow - Math.max(0, now - x) / 1000);
  if (inp.stamps) { inp.pulseTimes = toSong(inp.stamps.pulse); inp.humDownTimes = toSong(inp.stamps.humDown); inp.humUpTimes = toSong(inp.stamps.humUp); }
  const wasHum = game.song.humming;
  const ev = game.update(dt, inp, songNow);
  if (!wasHum && game.song.humming) audio.humOn(game.song.hums[game.song.hums.length - 1].t0, 0);
  if (wasHum && !game.song.humming) audio.humOff(songNow, 0);
  syncFlies();
  earSync(ev, songNow);
  handleEvents(ev);
  t += dt;
  draw(dt);
  hud.update(game, { prompt: prompt() });
  if ((game.dead || (game.won && game.won.done)) && !endShown) setTimeout(showEnd, game.dead ? 1600 : 400);
}

function handleEvents(ev) {
  const F = game.fly, dist = p => Math.hypot(p.x - F.pos.x, p.z - F.pos.z);
  for (const e of ev) {
    switch (e.type) {
      case 'pulses': {
        // your own song at full level; the rival's fades with distance (song is near-field)
        const att = e.who ? 1 / (1 + (dist(e.at) / 12) ** 2) : 1, pan = e.who ? Math.max(-1, Math.min(1, (e.at.x - F.pos.x) / 10)) * 0.6 : 0;
        if (att > 0.02) for (const p of e.pulses) audio.pulse(p.t, (p.amp ?? 0.8) * att, pan);
        if (!e.who) self.buzz = 1; break;
      }
      case 'land': if (e.frog) { const d = dist(e.at); audio.thump(d, e.mass); shake = Math.max(shake, Math.min(1, 6 / (1 + d / 10))); } break;
      case 'strike': if (e.frog) audio.whoosh(e.target === game.player ? 1 : 0.3); break;
      case 'notice': if (e.frog && e.target === game.player) audio.call(e.frog.species, dist(e.frog.pos)); break;
      case 'hop': if (e.frog && Math.random() < 0.15) audio.call(e.frog.species, dist(e.frog.pos)); break;
      case 'splash': audio.plink(dist(e.at), e.r); break;
      case 'mission': audio.chord('good'); break;
      case 'death': audio.chord('death'); audio.humOff(audio.now, 0); break;
      case 'win': audio.chord('win'); break;
      case 'trapped': audio.plink(0, 0.6); break;
      case 'kicked': shake = Math.max(shake, 0.5); break;
    }
  }
  audio.setAmbience({ light: game.clock.light, mist: game.clock.misting });
  const L = game.loomState || { lplc2: 0, azimuth: 0 };
  audio.loom(L.lplc2, L.azimuth, game.timeScale);
  const f = game.ear.female;
  if (f) { const d = dist(f.pos); audio.setBrain(game.ear.areas, f.R, Math.max(0, 1 - d / 25) * (game.court.female ? 1 : 0.4)); }
}

const _v = new THREE.Vector3();
function placeCamera(dt) {
  const F = game.fly, e = F.eye;
  if (game.dead && game.dead.by) {
    // eaten: hang where the tongue took you, looking into the frog's face as it swallows
    const d = game.dead, h = d.by.headPos(), k = Math.min(1, (game.simT - d.t) * 0.6);
    camera.position.set(d.at.x + (h.x - d.at.x) * 0.25 * k, d.at.y + (h.y - d.at.y) * 0.25 * k, d.at.z + (h.z - d.at.z) * 0.25 * k);
    camera.lookAt(h.x, h.y, h.z); return;
  }
  if (camY === null) camY = e.y;
  camY += (e.y - camY) * (1 - Math.exp(-dt / (F.onGround ? 0.06 : 0.015)));
  bob += dt * F.speed * 1.4;
  const bobY = F.onGround ? Math.sin(bob) * 0.03 * Math.min(1, F.speed / 10) : 0;
  shake = Math.max(0, shake - dt * 2.5);
  const sh = shake * 0.15;
  camera.position.set(e.x + (Math.random() - 0.5) * sh, camY + bobY + (Math.random() - 0.5) * sh, e.z + (Math.random() - 0.5) * sh);
  let roll = 0; if (F.trapped) roll = Math.sin(t * 3) * 0.15;
  camera.rotation.set(F.pitch, F.yaw, roll);
}
function draw(dt) {
  placeCamera(dt);
  updateScene(parts, game, camera.position, t);
  detail.update(game.fly.pos);
  for (const v of frogViews) v.update(t, game.world);
  for (const [n, v] of flyViews) {
    const far = Math.hypot(n.pos.x - camera.position.x, n.pos.z - camera.position.z) > 220;
    v.root.visible = !far && n.alive; v.shadow.visible = v.root.visible;
    if (!far) v.update(t, dt, game.world, { buzz: n.singing ? 1 : 0 });
  }
  // your own forelegs and singing wing
  const fem = game.court.female, side = fem ? (geometry(game.fly, fem).az > 0 ? -1 : 1) : 1;
  self.update(t, dt, { grooming: game.grooming, sweep: game.groom.sweepAnim, rub: game.groom.rubAnim, feeding: !!game.feeding, drinking: !!game.drinking, singing: game.myFeat && (game.myFeat.singing || game.song.plan), pulse: self.buzz > 0.5, humming: game.song.humming, side });
  self.buzz = Math.max(0, (self.buzz || 0) - dt * 10);
  // screen effects
  $('fx-dust').style.opacity = (game.groom.dust.eyes * 0.8).toFixed(2);
  $('fx-loom').style.opacity = Math.min(0.85, (game.loomState?.lplc2 || 0) * 0.9).toFixed(2);
  $('fx-slow').style.opacity = Math.max(0, (1 - game.timeScale) * 1.25).toFixed(2);
  $('fx-trap').style.opacity = game.fly.trapped ? 1 : 0;
  // the FlyHarp hook (renders a second, wide view at 50 Hz when enabled)
  const e = game.fly.eye; flyharp.tick(dt, { x: e.x, y: e.y, z: e.z, yaw: game.fly.yaw, pitch: game.fly.pitch });
  if (eyeView) flyharp.draw($('eyepip').getContext('2d'), 180, 180);
  renderer.render(scene, camera);
}
function renderOnly(dt) {
  // the title screen: a slow look around the forest floor
  const F = game.fly; if (!running) { F.yaw += dt * 0.05; }
  placeCamera(dt || 0.016); updateScene(parts, game, camera.position, t); detail.update(game.fly.pos);
  for (const v of frogViews) v.update(t, game.world);
  for (const [, v] of flyViews) v.update(t, dt || 0, game.world);
  renderer.render(scene, camera);
}
// start the title view on the ground, not mid-fall
if (!params.has('autostart')) { const F = game.fly; F.pos.y = game.world.height(F.pos.x, F.pos.z); F.onGround = true; F.vel.y = 0; }
requestAnimationFrame(frame);
