// Headless checks of FrogFood's logic: node tools/test.mjs
// (The renderer and audio are checked separately in a headless browser: tools/smoke.mjs.)
import fs from 'fs';
import { World } from '../js/core/world.js';
import { FlyBody } from '../js/core/fly.js';
import { Frog, FROG } from '../js/core/frog.js';
import { LoomDetector } from '../js/core/loom.js';
import { SongAdapter } from '../js/core/songadapter.js';
import { FemaleFly, songQuality } from '../js/core/npc.js';
import { Courtship } from '../js/core/courtship.js';
import { LifeClock } from '../js/core/lifeclock.js';
import { Grooming } from '../js/core/missions.js';
import { Game, DRIVE_FULL, nearField } from '../js/core/game.js';
import { FemaleEar } from '../js/ear/female-ear.js';
import { TIME, PHYS } from '../js/core/scale.js';
import { FlyEye } from '../js/render/eyesample.js';

const ROOT = new URL('..', import.meta.url).pathname;
let fails = 0, passes = 0;
function ok(cond, msg, extra = '') { if (cond) { passes++; console.log('  ok   ' + msg + (extra ? '  ' + extra : '')); } else { fails++; console.log('  FAIL ' + msg + (extra ? '  ' + extra : '')); } }
const section = s => console.log('\n' + s);

// ------------------------------------------------------------------------------------------- world
section('world');
const W = new World(7);
let finite = true; for (let x = -220; x <= 220; x += 11) for (let z = -220; z <= 220; z += 11) { const s = W.surface(x, z); if (!isFinite(s.y)) finite = false; }
ok(finite, 'surface is finite everywhere');
ok(W.isWater(W.pond.x, W.pond.z), 'pond centre is water');
const b = W.bananas[0];
ok(W.surface(b.x, b.z).kind === 'banana' && W.surface(b.x, b.z).y > W.surface(W.dish.x + W.dish.r - 3, W.dish.z).y + 5, 'banana stands above the dish floor');
ok(W.droplets.length > 40, 'droplets placed', W.droplets.length);
ok(W.shelter(W.leaves[0].x, W.leaves[0].y - 5, W.leaves[0].z) === 1, 'under a leaf is sheltered');
const hOpen = W.humidity(0, W.height(0, 0), 0, { lightsOn: true }), hLeaf = W.humidity(W.leaves[3].x, W.leaves[3].y - 10, W.leaves[3].z, { lightsOn: true });
ok(hLeaf > hOpen, 'humidity higher under a leaf than in the open', hOpen.toFixed(2) + ' < ' + hLeaf.toFixed(2));
const downwind = W.fruitOdor(b.x + 0.28 * 40 / 1.04, b.z - 40 / 1.04, 1), upwind = W.fruitOdor(b.x - 0.28 * 40 / 1.04, b.z + 40 / 1.04, 1);
ok(downwind > 5 * upwind, 'fruit plume extends downwind', downwind.toFixed(3) + ' vs ' + upwind.toFixed(4));

// --------------------------------------------------------------------------------------------- fly
section('fly body');
{
  const F = new FlyBody(W, 0, 30, 0); F.pos.y += 40; F.onGround = false;
  let landed = null; for (let i = 0; i < 300 && !landed; i++) for (const e of F.update(1 / 120, {})) if (e.type === 'land') landed = e;
  ok(landed && landed.impact < PHYS.g / PHYS.dragVert + 1, 'falls 40 mm and lands below terminal speed', landed && landed.impact.toFixed(0) + ' mm/s');
  const y0 = F.pos.y; let top = y0; F.update(1 / 120, { jump: true });
  for (let i = 0; i < 120; i++) { F.update(1 / 120, {}); top = Math.max(top, F.pos.y); }
  ok(top - y0 > 4 && top - y0 < 12, 'jump height (legs only)', (top - y0).toFixed(1) + ' mm');
  const x0 = F.pos.x, z0 = F.pos.z; for (let i = 0; i < 120; i++) F.update(1 / 60, { fwd: 1 });
  const dd = Math.hypot(F.pos.x - x0, F.pos.z - z0);
  ok(dd > PHYS.walk * 1.5 && dd < PHYS.walk * 2.2, 'walks ~9 mm/s', dd.toFixed(1) + ' mm in 2 s');
  // run into a droplet: trapped; mash jump: freed
  const G = new FlyBody(W, 0, 0, 0); const d = W.addDroplet(G.pos.x - 0, G.pos.z - 6, 1.0);
  let trapped = false; for (let i = 0; i < 120 && !trapped; i++) for (const e of G.update(1 / 60, { fwd: 1, run: true })) if (e.type === 'trapped') trapped = true;
  ok(trapped, 'running into a droplet traps you (surface tension)');
  let freed = false; for (let i = 0; i < 60 && !freed; i++) for (const e of G.update(1 / 30, { jump: i % 2 === 0 })) if (e.type === 'freed') freed = true;
  ok(freed, 'mashing jump frees you');
  W.droplets.splice(W.droplets.indexOf(d), 1);
  const H = new FlyBody(W, 0, 0, 0); const d2 = W.addDroplet(0, -6, 1.0); let t2 = false;
  for (let i = 0; i < 200; i++) for (const e of H.update(1 / 60, { fwd: 1 })) if (e.type === 'trapped') t2 = true;
  ok(!t2 && Math.hypot(H.pos.x - d2.x, H.pos.z - d2.z) < d2.r + 1.2, 'walking up to a droplet stops at its edge (drinkable)');
  W.droplets.splice(W.droplets.indexOf(d2), 1);
}

// -------------------------------------------------------------------------------------------- frog
section('frog');
function hunt(moving, dist = 40) {
  const fr = new Frog(W, { at: { x: 0, z: 0 }, seed: 3 }); fr.yaw = 0;     // facing -z
  const prey = { id: 9, alive: true, isPlayer: true, pos: { x: 0, y: W.height(0, -dist), z: -dist }, vel: { x: 0, y: 0, z: 0 }, moved: moving ? 0.6 : 0 };
  const evs = []; let t = 0;
  for (; t < 30; t += 1 / 60) {
    if (moving) { prey.pos.x = 3 * Math.sin(t * 2); prey.vel.x = 6 * Math.cos(t * 2); prey.pos.y = W.height(prey.pos.x, prey.pos.z); }
    for (const e of fr.update(1 / 60, [prey], { lightsOn: true })) evs.push(e.type);
    if (evs.includes('catch') || evs.includes('lost')) break;
  }
  return { evs, t };
}
{
  const h = hunt(true);
  ok(h.evs.includes('notice') && h.evs.includes('aim') && h.evs.includes('strike') && h.evs.includes('catch'), 'a moving fly is noticed, stalked, struck and caught', h.evs.filter((e, i, a) => a.indexOf(e) === i).join('>') + ' in ' + h.t.toFixed(1) + ' s');
  let lost = 0; for (let k = 0; k < 5; k++) { const fr = new Frog(W, { at: { x: 0, z: 0 }, seed: 50 + k }); fr.yaw = 0; const prey = { alive: true, pos: { x: 0, y: W.height(0, -40), z: -40 }, moved: 0 }; let caught = false; for (let t = 0; t < 20; t += 1 / 60) for (const e of fr.update(1 / 60, [prey], { lightsOn: true })) if (e.type === 'catch') caught = true; if (!caught) lost++; }
  ok(lost === 5, 'a frozen fly at 40 mm is never caught', lost + '/5');
  // escape: jump sideways as the strike starts
  const fr = new Frog(W, { at: { x: 0, z: 0 }, seed: 3 }); fr.yaw = 0;
  const F = new FlyBody(W, 0, -18, 0); F.moved = 0.5;
  const prey = { alive: true, isPlayer: true, pos: F.pos, vel: F.vel, get moved() { return 0.5; } };
  fr.state = 'aim'; fr.target = prey; fr.timer = 0.01;
  let caught = false, jumped = false;
  for (let t = 0; t < 1; t += 1 / 240) { for (const e of fr.update(1 / 240, [prey], { lightsOn: true })) { if (e.type === 'catch') caught = true; } F.update(1 / 240, { jump: fr.state === 'strike' && !jumped ? (jumped = true) : false, escape: { x: 1, z: 0 } }); }
  ok(!caught, 'jumping as the tongue launches escapes it');
  // loom: an approaching hop
  const L = new LoomDetector(); const fr2 = new Frog(W, { at: { x: 0, z: -60 }, seed: 4 }); let peak = 0;
  for (let t = 0; t < 1; t += 1 / 60) { fr2.pos.z = -60 + t * 50; fr2.state = 'hop'; fr2.hop = {}; const r = L.update(1 / 60, { x: 0, y: W.height(0, 0) + 0.75, z: 0 }, 0, [fr2]); peak = Math.max(peak, r.lplc2); }
  ok(peak > 0.62, 'a frog bearing down drives LPLC2 past the giant-fibre threshold', peak.toFixed(2));
}

// ---------------------------------------------------------------------------- song -> the female's ear
section('song and the Tonnectome');
const M = JSON.parse(fs.readFileSync(ROOT + 'data/song-model.json'));
const meta = JSON.parse(fs.readFileSync(ROOT + 'data/ear.json')); const bin = fs.readFileSync(ROOT + 'data/ear.bin');
// ear-net.js is FlyHarp's classic (UMD) script; load it the way the worker does
const EarNet = (() => { const mod = { exports: {} }; new Function('module', fs.readFileSync(ROOT + 'js/ear/ear-net.js', 'utf8'))(mod); return mod.exports; })();
const ear = new FemaleEar(EarNet, meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length), M);
function perform(tapMs, seconds, opts = {}) {
  const S = new SongAdapter(5); S.setCondition({ jitter: opts.jitter ?? 0.002 });
  ear.reset(); let k = 0, next = 0, drive = 0, n = 0;
  for (let t = 0; t <= seconds; t += 0.005) {
    if (t >= next) { S.tap(next); k++; next += tapMs / 1000 + (opts.wobble ? (Math.sin(k * 2.3) * opts.wobble) / 1000 : 0); }
    if (opts.hum && Math.floor(t / 1.5) % 2 === 1) S.humOn(t); else S.humOff(t);
    const ps = S.commit(t);
    ear.addPulses(ps.map(p => Math.round(p.t * 4000))); ear.setHums(S.scheduleTicks().hums);
    const o = ear.advanceTo(Math.round(t * 4000), 1);
    if (t > 1) { drive += o.drive; n++; }
  }
  return { drive: drive / n, feat: S.features(seconds), q: songQuality(S.features(seconds)).q };
}
const good = perform(350, 4), slow = perform(550, 4), sloppy = perform(350, 4, { wobble: 90 }), mixed = perform(350, 6, { hum: true });
ok(Math.abs(good.drive / DRIVE_FULL - 1) < 0.25, 'Tonnectome song-pathway drive for a steady 35 ms song ~ DRIVE_FULL', good.drive.toFixed(4));
ok(Math.abs(good.feat.ipiMean - 0.035) < 0.002, 'tapping every 350 ms sings 35 ms IPIs', (good.feat.ipiMean * 1e3).toFixed(1) + ' ms');
ok(good.q > 0.7 && slow.q < 0.1, 'song quality: 35 ms good, 55 ms poor', good.q.toFixed(2) + ' / ' + slow.q.toFixed(2));
ok(sloppy.q < good.q * 0.8, 'irregular tapping lowers quality', sloppy.q.toFixed(2) + ' (cv ' + sloppy.feat.ipiCV.toFixed(2) + ')');
ok(mixed.q > good.q, 'adding sine song helps', mixed.q.toFixed(2));
ok(nearField(3) > 0.7 && nearField(12) < 0.06, 'song is near-field (a few mm)', nearField(3).toFixed(2) + ' / ' + nearField(12).toFixed(3));
{
  const f = new FemaleFly(W, { at: { x: 0, z: 0 } }); const fm = new FemaleFly(W, { at: { x: 0, z: 0 }, mated: true });
  for (let t = 0; t < 12; t += 0.05) { f.listen(0.05, { drive: 1, audible: 0.9, feat: mixed.feat }); fm.listen(0.05, { drive: 1, audible: 0.9, feat: mixed.feat }); }
  ok(f.R > 0.85 && fm.R < 0.1, 'a virgin hearing good song becomes receptive in ~12 s; a mated female does not', f.R.toFixed(2) + ' / ' + fm.R.toFixed(2));
  const f2 = new FemaleFly(W, { at: { x: 0, z: 0 } }); f2.R = 0.5;
  for (let t = 0; t < 8; t += 0.05) f2.listen(0.05, { drive: 1, audible: 0.9, feat: slow.feat });
  ok(f2.R < 0.5, 'the wrong song lowers receptivity', f2.R.toFixed(2));
}

// ----------------------------------------------------------------------------------- courtship sequence
section('courtship');
{
  const g = new Game({ seed: 7, frogs: 0, siblings: 0 });
  g.rival.alive = false;
  const fem = g.females[0]; fem.pos.x = 0; fem.pos.z = 0; fem.pos.y = g.world.height(0, 0); fem.yaw = 0;
  g.fly.pos.x = 0; g.fly.pos.z = 6; g.fly.pos.y = g.world.height(0, 6); g.fly.onGround = true; g.fly.vel.y = 0; g.fly.yaw = 0;
  g.groom.dust = { eyes: 0, antennae: 0, abdomen: 0, wings: 0, notum: 0 }; g.stats.energy = 1; g.stats.water = 1;
  const stages = []; let won = false, t = 0, nextTap = 0, acted = 0;
  for (; t < 60 && !won; t += 1 / 60) {
    // keep her still enough to script against: she wanders, we steer towards a spot 2 mm behind her
    const ff = fem.forward(), spot = { x: fem.pos.x - ff.x * 2, z: fem.pos.z - ff.z * 2 };
    const dx = spot.x - g.fly.pos.x, dz = spot.z - g.fly.pos.z, d = Math.hypot(dx, dz);
    const toHer = Math.atan2(-(fem.pos.x - g.fly.pos.x), -(fem.pos.z - g.fly.pos.z));
    g.fly.yaw = toHer;
    const fwd = d > 0.6 ? Math.min(1, d / 2) : 0;
    const local = { fwd: fwd * Math.cos(Math.atan2(-dx, -dz) - toHer), strafe: -fwd * Math.sin(Math.atan2(-dx, -dz) - toHer) };
    const input = { ...local, run: d > 6 };
    const st = g.court.stage;
    if (['tap', 'lick', 'mount'].includes(st) && t - acted > 0.4 && (st !== 'mount' || fem.vpo > 0.6)) { input.act = true; acted = t; }
    if (['sing', 'lick', 'mount'].includes(st)) { if (t >= nextTap) { input.pulse = true; nextTap = t + 0.35; } if (Math.floor(t / 1.2) % 3 === 2) input.humDown = true; else input.humUp = true; }
    for (const e of g.update(1 / 60, input)) { if (e.type === 'stage') stages.push(e.stage); if (e.type === 'win') won = true; }
  }
  ok(won, 'a scripted male completes orient > follow > tap > sing > lick > mount', stages.join('>') + ' in ' + t.toFixed(1) + ' s');
  // the mated female rejects
  const c = new Courtship(); const fm = g.females[2]; const fly = { pos: { x: fm.pos.x, y: fm.pos.y, z: fm.pos.z + 2 }, yaw: 0 }; fm.yaw = 0;
  c.female = fm; c.stage = 'tap'; const evs = c.act({ fly, player: g.player });
  ok(evs.some(e => e.type === 'taste' && e.mated) && c.stage === 'tap', 'tapping a mated female tastes cVA and stops the sequence');
}

// ------------------------------------------------------------------------------------- clock, grooming
section('life clock and grooming');
{
  const C = new LifeClock(0); C.update(TIME.day * 0.3); ok(C.lightsOn && C.clock.startsWith('07'), 'lights on at 07:12', C.clock);
  C.update(TIME.day * 0.6); ok(!C.lightsOn, 'lights off at 21:36', C.clock);
  const D = new LifeClock(0.25); D.update(TIME.day * 0.012); ok(D.misting, 'misting runs at 06:15');
  const G = new Grooming(0.9); const order = []; let t = 0;
  for (let i = 0; i < 2000 && !G.clean; i++) { t += 0.15; const r = G.sweep(i % 2 ? 'L' : 'R', t); if (r.ok && order[order.length - 1] !== r.part) order.push(r.part); if (!r.ok && r.why === 'clogged') G.rub(); }
  ok(G.clean && order.join(',') === 'eyes,antennae,abdomen,wings,notum', 'grooming runs anterior to posterior (Seeds et al. 2014)', order.join(' > '));
}

// ---------------------------------------------------------------------------------------- whole game
section('whole game, headless');
{
  const g = new Game({ seed: 11 }); let err = null, deaths = 0;
  try { for (let i = 0; i < 30 * 240; i++) { const ev = g.update(1 / 30, { fwd: (i % 300) < 150 ? 1 : 0, look: { dx: 0.004, dy: 0 }, run: (i % 600) < 100, jump: i % 97 === 0 }); if (g.dead) { deaths++; break; } } } catch (e) { err = e; }
  ok(!err, 'four minutes of wandering run without errors', err ? err.stack.split('\n').slice(0, 3).join(' | ') : g.summary().clock + (g.dead ? ' (died: ' + g.dead.cause + ')' : ''));
  // frozen at full stats in front of a frog does not die of the frog
  const h = new Game({ seed: 12, siblings: 0 }); h.rival.alive = false; h.females.forEach(f => f.alive = false);
  const fr = h.frogs[0]; h.frogs = [fr]; fr.pos = { x: 0, y: h.world.height(0, 0), z: 0 }; fr.yaw = 0; fr.state = 'rest'; fr.timer = 100;
  h.fly.pos.x = 0; h.fly.pos.z = -35; h.fly.pos.y = h.world.height(0, -35); h.fly.onGround = true; h.fly.vel.y = 0; h.fly.moved = 0;
  for (let i = 0; i < 60 * 20; i++) h.update(1 / 60, {});
  ok(!h.dead, 'freezing 35 mm in front of a frog: it never sees you');
  for (let i = 0; i < 60 * 30 && !h.dead; i++) h.update(1 / 60, { strafe: Math.sin(i / 20), fwd: 0.2 });
  ok(h.dead && h.dead.cause === 'eaten', 'dancing in front of it: eaten', h.dead ? h.dead.text : '');
}

// --------------------------------------------------------------------------------- FlyHarp eye sampling
section('FlyHarp hook');
{
  const eye = new FlyEye();
  const fly = JSON.parse(fs.readFileSync(ROOT + 'data/fly.json'));
  eye.setColumnsFromModel(fly);
  ok(eye.n === 721, '721 ommatidia from FlyHarp\'s flyvis columns', eye.n);
  // a synthetic frame: left half dark, right half bright -> ommatidia on the right (x>0) are brighter
  const w = 64, h = 64, px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = 4 * (y * w + x), v = x >= w / 2 ? 230 : 25; px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = 255; }
  const lum = eye.sample(px, w, h, { flipY: false });
  let L = 0, R = 0, nl = 0, nr = 0; for (let i = 0; i < eye.n; i++) { if (eye.X[i] < -1) { L += lum[i]; nl++; } else if (eye.X[i] > 1) { R += lum[i]; nr++; } }
  ok(lum.length === 721 && R / nr > L / nl + 0.3, 'sampling maps image left/right to eye anterior... per FlyHarp convention', (L / nl).toFixed(2) + ' vs ' + (R / nr).toFixed(2));
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
