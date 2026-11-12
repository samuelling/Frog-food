// FrogFood's game state and rules, independent of rendering and audio, so it runs headless in Node.
// main.js feeds it input and the audio clock, sends the song to the female's ear (a Web Worker running the
// Tonnectome) and draws what it holds.
import { World } from './world.js';
import { FlyBody, fwdOf, rightOf } from './fly.js';
import { Frog } from './frog.js';
import { FemaleFly, RivalMale, NpcFly } from './npc.js';
import { LifeClock } from './lifeclock.js';
import { Grooming, Missions, PARTS } from './missions.js';
import { Courtship, geometry } from './courtship.js';
import { LoomDetector } from './loom.js';
import { MaleCircuit } from './male.js';
import { SongAdapter, featuresOf } from './songadapter.js';
import { mulberry32, clamp, wrapAngle } from './rng.js';
import { TIME } from './scale.js';
import { WIND } from './world.js';

export const DRIVE_FULL = 0.052;   // the ear's song-pathway drive for a steady 35 ms song at full level (tools/test.mjs)

export class Game {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 7;
    this.rand = mulberry32(this.seed * 101 + 3);
    const W = this.world = new World(this.seed);
    this.clock = new LifeClock(opts.start ?? TIME.start);
    const dz = W.dropZone;
    this.fly = new FlyBody(W, dz.x, dz.z, 0.6);
    this.fly.pos.y += 60; this.fly.onGround = false; this.fly.vel.y = -50;       // tipped out of the keeper's cup
    this.groom = new Grooming(0.9);
    this.missions = new Missions();
    this.court = new Courtship();
    this.loom = new LoomDetector();
    this.male = new MaleCircuit();
    this.song = new SongAdapter(this.seed + 5);
    this.stats = { water: 0.62, energy: 0.58 };
    this.dead = null; this.won = null; this.paused = false;
    this.timeScale = 1; this.simT = 0; this.songNow = 0;
    this.messages = [];
    this.grooming = false; this.drinking = null; this.feeding = null;
    this.rain = []; this.lastDay = this.clock.day; this.lastLights = this.clock.lightsOn; this.mistWas = false;
    this.ear = { drive: 0, areas: null, vpo: 0, female: null, gain: 0, fresh: false };
    this.air = { pulses: [], hums: [] };      // every male's song, as it reaches the air
    this.tasteTimer = 0; this.escapes = 0; this.strikesAtMe = new Set();
    const player = this.player = { id: 0, isPlayer: true, alive: true, pos: this.fly.pos, vel: this.fly.vel, get moved() { return 0; } };
    const self = this;
    Object.defineProperty(player, 'moved', { get() { return self.fly.moved * (1 + 0.7 * self.groom.body) * (self.fly.trapped ? 1.5 : 1); } });
    player.forward = () => fwdOf(this.fly.yaw);

    // the cast
    this.frogs = [
      new Frog(W, { id: 1, species: 'azureus', seed: this.seed + 11, at: { x: 70, z: 70 }, home: { x: W.dish.x, z: W.dish.z } }),
      new Frog(W, { id: 2, species: 'leucomelas', seed: this.seed + 23, at: { x: -120, z: -60 } }),
    ];
    if (opts.frogs === 0) this.frogs = [];
    const R = this.rand, near = (r) => ({ x: dz.x + (R() - 0.5) * r, z: dz.z + (R() - 0.5) * r });
    this.females = [
      new FemaleFly(W, { id: 201, name: 'virgin A', at: near(60), seed: 201 }),
      new FemaleFly(W, { id: 202, name: 'virgin B', at: { x: W.dish.x - 20, z: W.dish.z - 30 }, seed: 202 }),
      new FemaleFly(W, { id: 203, name: 'mated', mated: true, at: near(50), seed: 203 }),
    ];
    this.rival = new RivalMale(W, { id: 301, at: near(70), seed: 301 });
    this.siblings = [];
    for (let i = 0; i < (opts.siblings ?? 8); i++) this.siblings.push(new NpcFly(W, { id: 400 + i, at: near(90), seed: 400 + i, sex: R() < 0.5 ? 'm' : 'f' }));
    this.say('You tumble out of the keeper\'s cup into a forest the size of a cathedral. You are 2.5 mm long. You cannot fly.', 'story', 7);
  }
  get npcs() { return [...this.females, this.rival, ...this.siblings]; }
  get prey() { return [...(this.won ? [] : [this.player]), ...this.npcs.filter(n => n.alive && !n.copulating && !(this.won && this.won.female === n))]; }
  say(text, kind = 'info', dur = 4) { this.messages.push({ text, kind, t: this.simT, dur }); if (this.messages.length > 30) this.messages.shift(); }

  /** input: {fwd, strafe, run, jump, look:{dx,dy}, act, groom (toggle), sweepL, sweepR, rub, pulse, humDown, humUp}
   *  realDt: seconds; songNow: the audio clock (seconds) for the song, or undefined to use game time */
  update(realDt, input = {}, songNow) {
    const ev = [];
    if (this.paused || (this.won && this.won.done)) return ev;
    realDt = Math.min(realDt, 0.1);
    if (this.dead) {   // the world goes on for a moment: the frog finishes its swallow
      if (this.simT - this.dead.t < 5) { const dt = realDt * 0.6; this.simT += dt; for (const f of this.frogs) f.update(dt, [], { lightsOn: this.clock.lightsOn }); }
      return ev;
    }
    this.songNow = songNow ?? this.songNow + realDt;
    // bullet time: when a frog fixates you, your fast vision (and the game) slows the world
    const threat = this.frogs.some(f => f.target === this.player && (f.state === 'aim' || f.state === 'strike'));
    const want = threat ? 0.22 : 1;
    this.timeScale += (want - this.timeScale) * (1 - Math.exp(-realDt / (threat ? 0.05 : 0.3)));
    const dt = Math.min(realDt * this.timeScale, 0.05);
    this.simT += dt;
    this.clock.update(dt);
    const C = this.clock, F = this.fly, lightsOn = C.lightsOn;
    if (input.look) F.look(input.look.dx || 0, input.look.dy || 0);

    // --- grooming mode
    if (input.groom) { this.grooming = !this.grooming && !F.trapped; if (this.grooming) { this.drinking = this.feeding = null; ev.push({ type: 'groom-on' }); } else ev.push({ type: 'groom-off' }); }
    this.groom.update(dt);
    if (this.grooming) {
      for (const side of ['L', 'R']) if (input['sweep' + side]) {
        const r = this.groom.sweep(side, this.simT); ev.push({ type: 'sweep', ...r });
        if (!r.ok && r.why === 'clogged') this.say(`Your ${r.legs} legs are caked in dust: rub them together (W).`, 'hint', 2);
      }
      if (input.rub) ev.push({ type: 'rub', ...this.groom.rub() });
      if (this.groom.clean && !this.missions.done.groom) { this.grooming = false; ev.push({ type: 'groom-off' }); }
    }
    const before = this.missions.progress.groom;
    this.missions.set('groom', 1 - PARTS.reduce((a, p) => a + this.groom.dust[p.id], 0) / (PARTS.length * 0.9));
    if (this.missions.done.groom && before < 1) { ev.push({ type: 'mission', id: 'groom' }); this.say('Clean. The world snaps into focus and the air is full of smells.', 'good'); }

    // --- the song: commit it, and mix every singer into the air
    const wingDust = this.groom.dust.wings, en = this.stats.energy;
    this.song.setCondition({ jitter: 0.0025 + 0.004 * wingDust + 0.002 * (1 - en), amp: 0.9 * (1 - 0.45 * wingDust) * (0.6 + 0.4 * en) });
    // song input: event-timed if the caller provides times (the browser does), else now
    const songIn = [];
    if (input.pulseTimes) for (const t of input.pulseTimes) songIn.push([t, 'tap']); else if (input.pulse) songIn.push([this.songNow, 'tap']);
    if (input.humDownTimes) for (const t of input.humDownTimes) songIn.push([t, 'on']); else if (input.humDown) songIn.push([this.songNow, 'on']);
    if (input.humUpTimes) for (const t of input.humUpTimes) songIn.push([t, 'off']); else if (input.humUp) songIn.push([this.songNow, 'off']);
    if (!this.dead) for (const [t, k] of songIn.sort((a, b) => a[0] - b[0])) { if (k === 'tap') this.song.tap(t); else if (k === 'on') this.song.humOn(t); else this.song.humOff(t); }
    const mine = this.song.commit(this.songNow);
    const rivals = this.rival.alive ? this.rival.song.commit(this.songNow) : [];
    const newAir = [...mine.map(p => ({ ...p, who: 0 })), ...rivals.map(p => ({ ...p, who: 1 }))].sort((a, b) => a.t - b.t);
    for (const p of newAir) this.air.pulses.push(p);
    if (this.air.pulses.length > 800) this.air.pulses.splice(0, 400);
    this.air.hums = [...this.song.hums, ...this.rival.song.hums];
    if (mine.length) ev.push({ type: 'pulses', who: 0, pulses: mine });
    if (rivals.length) ev.push({ type: 'pulses', who: 1, pulses: rivals, at: { ...this.rival.pos } });
    this.myFeat = this.song.features(this.songNow);
    this.airFeat = featuresOf(this.air.pulses, this.air.hums, this.songNow, this.song.humming || this.rival.song.humming);

    // --- moving
    const busy = this.grooming || this.drinking || this.feeding || this.won;
    let mv = { fwd: busy ? 0 : input.fwd, strafe: busy ? 0 : input.strafe, run: input.run, jump: !this.grooming && input.jump };
    if (this.drinking || this.feeding) { if (Math.abs(input.fwd || 0) + Math.abs(input.strafe || 0) > 0.3 || input.jump) { this.drinking = this.feeding = null; mv = { ...input }; } }
    if (mv.jump && this.loom.lplc2 > 0.25) mv.escape = this.loom.escapeDir(F.yaw);      // the giant-fibre jump goes away from the loom
    for (const e of F.update(dt, mv)) {
      ev.push(e);
      if (e.type === 'trapped') this.say(e.what === 'water' ? 'The pond\'s surface grabs you. Mash Space to haul yourself out.' : 'Surface tension! You are stuck to a droplet. Mash Space to break free.', 'warn', 3);
      if (e.type === 'land' && e.impact > 300) this.say('A fall that would kill a person: at your size, the air catches you.', 'info', 3);
    }
    for (const f of this.frogs) f.repel(F.pos, 0.9);

    // --- the action key: courtship first, then drink, feed, or shove a rival
    if (input.act) this._act(ev);
    if (this.drinking) {
      const d = this.drinking.drop;
      const k = dt * 0.22; this.stats.water = clamp(this.stats.water + k, 0, 1); this.missions.add('drink', k / 0.4);
      if (d) { d.r = Math.max(0, d.r - dt * 0.03); if (d.r < 0.25) { this.world.droplets.splice(this.world.droplets.indexOf(d), 1); this.drinking = null; } }
      if (this.stats.water >= 1) this.drinking = null;
      if (this.missions.done.drink && !this._saidDrink) { this._saidDrink = true; ev.push({ type: 'mission', id: 'drink' }); this.say('Water. You drank a sip the size of your own head.', 'good'); }
    }
    if (this.feeding) {
      const k = dt * 0.12; this.stats.energy = clamp(this.stats.energy + k, 0, 1); this.missions.add('feed', k / 0.35);
      if (F.ground !== 'banana') this.feeding = null;
      if (this.stats.energy >= 1) this.feeding = null;
      if (this.missions.done.feed && !this._saidFeed) { this._saidFeed = true; ev.push({ type: 'mission', id: 'feed' }); this.say('Yeast and sugar. Fuel for a song.', 'good'); }
    }

    // --- body: water and sugar
    const hum = this.humidity = this.world.humidity(F.pos.x, F.pos.y, F.pos.z, { lightsOn, mistAge: C.mistAge });
    const act = 1 + (F.running ? 0.8 : 0) + (this.myFeat.singing ? 0.5 : 0) + (F.trapped ? 1 : 0);
    this.stats.water -= dt / 320 * (1.75 - hum) * (F.running ? 1.4 : 1);
    this.stats.energy -= dt / 420 * act;
    if (this.stats.water <= 0) return this._die('desiccation', 'You dried out. At 2.5 mm, a fly loses its own weight in water in hours.', ev);
    if (this.stats.energy <= 0) return this._die('starvation', 'You ran out of sugar. Flies starve within a day or two.', ev);
    if (F.trapped && F.trapped.t > 45) return this._die('drowned', 'The water held you until you were too tired to struggle.', ev);
    if (C.dead) return this._die('age', `You lived your whole life: ${TIME.lifeDays} days in the frog tank. A long one, for a feeder fly. But no offspring.`, ev);

    // --- the vivarium's day: lights, misting, restocking
    if (C.lightsOn !== this.lastLights) { this.lastLights = C.lightsOn; ev.push({ type: 'lights', on: C.lightsOn }); this.say(C.lightsOn ? 'The LED bar flickers on. The frogs wake.' : 'Lights out. The frogs sleep. The forest drips.', 'story', 4); }
    if (C.day !== this.lastDay) { this.lastDay = C.day; this._restock(ev); }
    if (C.misting && !this.mistWas) { ev.push({ type: 'mist', on: true }); this.say('The misting nozzles hiss. Droplets the size of beach balls are falling. Get under a leaf!', 'warn', 4); }
    if (!C.misting && this.mistWas) ev.push({ type: 'mist', on: false });
    this.mistWas = C.misting;
    this._rain(dt, ev);
    const sheltered = this.world.shelter(F.pos.x, F.pos.y, F.pos.z);
    this.sheltered = sheltered;
    if ((C.misting || C.mistAge < 25 || !lightsOn) && sheltered > 0.5 && hum > 0.78) {
      if (this.missions.add('shelter', dt / 14) ) { ev.push({ type: 'mission', id: 'shelter' }); this.say('You waited it out in a humid refuge, as wild flies do.', 'good'); }
    }

    // --- everyone else
    const ctx = { frogs: this.frogs, females: this.females, lightsOn, songNow: this.songNow, copDuration: 12 };
    for (const n of this.npcs) for (const e of n.update(dt, ctx)) {
      ev.push({ ...e, npc: n });
      if (e.type === 'rival-copulates') this.say('The rival male has mounted her. Too slow.', 'warn', 4);
      if (e.type === 'kick' && e.male === this.player) { const f = fwdOf(F.yaw); F.pos.x -= f.x * 1.5; F.pos.z -= f.z * 1.5; F.pos.y = this.world.surface(F.pos.x, F.pos.z).y; ev.push({ type: 'kicked' }); }
      if (e.type === 'extrude' && this.court.female === n) this.say('She extrudes her ovipositor at you: a mated female\'s "no".', 'warn', 3);
    }
    // females hear the air: whichever singers are within earshot of each (two at once scramble each other's IPIs)
    const rivalFeat = this.rival.alive ? this.rival.song.features(this.songNow) : null;
    const myOn = this.myFeat.singing || this.myFeat.sinceSong < 0.5, rvOn = this.rival.alive && (this.rival.singing || (rivalFeat && rivalFeat.sinceSong < 0.5));
    for (const f of this.females) {
      if (!f.alive) continue;
      const dMe = myOn ? Math.hypot(f.pos.x - F.pos.x, f.pos.z - F.pos.z) : Infinity, dRv = rvOn ? Math.hypot(f.pos.x - this.rival.pos.x, f.pos.z - this.rival.pos.z) : Infinity;
      const aMe = nearField(dMe), aRv = nearField(dRv);
      const feat = aMe > 0.05 && aRv > 0.05 ? this.airFeat : aRv > aMe ? rivalFeat : this.myFeat;
      const isEar = this.ear.female === f && this.ear.fresh;
      const drive = isEar ? this.ear.drive / DRIVE_FULL : 0.9;          // the Tonnectome for the one being courted
      f.listen(dt, { drive, audible: Math.max(aMe, aRv), feat });
    }
    // which female's ears to run: the one being courted, else the nearest within earshot
    const target = this.court.female || this.females.filter(f => f.alive).sort((a, b) => Math.hypot(a.pos.x - F.pos.x, a.pos.z - F.pos.z) - Math.hypot(b.pos.x - F.pos.x, b.pos.z - F.pos.z))[0] || null;
    if (target !== this.ear.female) { this.ear.female = target; this.ear.fresh = false; ev.push({ type: 'ear-target', female: target }); }
    if (target) {
      const dMe = Math.hypot(target.pos.x - F.pos.x, target.pos.z - F.pos.z), dRv = this.rival.alive ? Math.hypot(target.pos.x - this.rival.pos.x, target.pos.z - this.rival.pos.z) : Infinity;
      this.ear.gain = Math.max(nearField(dMe), this.rival.singing ? nearField(dRv) : 0);
    }

    // --- frogs
    const preyList = this.prey;
    for (const f of this.frogs) for (const e of f.update(dt, preyList, { lightsOn })) {
      ev.push({ ...e, frog: f });
      if (e.target === this.player) {
        if (e.type === 'notice') this.say('Something vast has turned its head towards you.', 'warn', 2.5);
        if (e.type === 'strike') this.strikesAtMe.add(f);
        if (e.type === 'miss' && this.strikesAtMe.has(f)) { this.strikesAtMe.delete(f); this.escapes++; if (this.missions.set('escape', 1)) { ev.push({ type: 'mission', id: 'escape' }); } this.say('The tongue slaps the ground where you were. Alive.', 'good', 3); }
        if (e.type === 'catch') return this._die('eaten', `Eaten by ${f.sp.name}. Its tongue reached you in ${Math.round((1e3 * 0.065))} ms.`, ev, f);
      } else if (e.type === 'catch' && e.target) {
        e.target.alive = false;
        if (Math.hypot(e.target.pos.x - F.pos.x, e.target.pos.z - F.pos.z) < 80) this.say(e.target === this.rival ? 'A frog ate the rival male.' : e.target.sex === 'f' && this.females.includes(e.target) ? 'A frog ate a female you could have courted.' : 'A frog ate one of your siblings.', 'warn', 3);
      }
    }
    // --- looming: LPLC2 / giant fibre
    this.loomState = this.loom.update(dt, F.eye, F.yaw, this.frogs);

    // --- courtship
    for (const e of this.court.update(dt, { fly: F, player: this.player, females: this.females, feat: this.myFeat })) {
      ev.push(e);
      if (e.type === 'stage') this._courtBest = Math.max(this._courtBest || 0, this.court.index);
      if (e.type === 'court-start') { this._courtBest = 0; this._met = this._met || new Map(); const seen = this._met.get(e.female.id); this._met.set(e.female.id, this.simT); if (seen === undefined || this.simT - seen > 25) this.say(e.female.mated ? 'A female. Something about her smells of another male (cVA).' : 'A female. Your P1 neurons light up.', 'story', 3); }
      if (e.type === 'stage' && e.stage === 'follow') this.say('Follow her.', 'hint', 2);
      if (e.type === 'stage' && e.stage === 'tap') this.say('Close in and tap her (E).', 'hint', 2.5);
      if (e.type === 'stage' && e.stage === 'lick') this.say('She is slowing down for you. Get behind her and lick (E).', 'hint', 3);
      if (e.type === 'court-end' && (e.why !== 'lost' || this._courtBest >= 1)) this.say(e.why === 'lost' ? 'You lost her.' : e.why === 'taken' ? 'She is with another male now.' : 'She is gone.', 'warn', 2.5);
    }
    // the male courtship circuit (schematic), driven by what is happening
    this.tasteTimer = Math.max(0, this.tasteTimer - dt);
    const g = this.court.female ? geometry(F, this.court.female) : null;
    const sees = g ? clamp(1 - Math.abs(g.az) / 0.8, 0, 1) * clamp(1 - g.dist / 30, 0, 1) * (lightsOn ? 1 : 0.3) : 0;
    this.male.step(dt, { sees, tastes: this.tasteTimer > 0 ? 1 : 0, singing: this.myFeat.singing, pulse: mine.length > 0, hum: this.song.humming });

    // win: copulation lasts ~20 min in real flies; here a short scene
    if (this.won && !this.won.done) { this.won.t += dt; if (this.won.t > 8) { this.won.done = true; ev.push({ type: 'win-end' }); } }
    // senses for the HUD
    this.senses = this._senses();
    return ev;
  }

  _act(ev) {
    const F = this.fly;
    if (F.trapped) return;
    if (this.court.female && ['orient', 'follow', 'tap', 'lick', 'mount'].includes(this.court.stage)) {
      const g = geometry(F, this.court.female);
      if (g.dist < 4 || this.court.stage === 'lick' || this.court.stage === 'mount') {
        for (const e of this.court.act({ fly: F, player: this.player })) {
          ev.push(e);
          if (e.type === 'taste') { this.tasteTimer = e.mated ? 0 : 3; this.say(e.mated ? 'cVA. 7-T. She has mated.' : '7,11-heptacosadiene: a virgin. Your P1 cluster fires; pIP10 is ready to sing.', e.mated ? 'warn' : 'good', 3.5); }
          if (e.type === 'hint') this.say(e.text, 'hint', 2.5);
          if (e.type === 'kick') this.say('Too soon: she kicks you off.', 'warn', 2.5);
          if (e.type === 'copulate') { this.won = { t: 0, female: e.female, done: false }; this.missions.set('court', 1); ev.push({ type: 'win' }); this.say('She accepts. Copulation: about twenty minutes in real life. Your genes go on.', 'good', 8); }
        }
        return;
      }
    }
    // a droplet within reach?
    const nd = this.world.nearestDroplet(F.pos.x, F.pos.z, 1.2);
    if (nd && Math.abs(nd.drop.y - F.pos.y) < nd.drop.r + 1.5) { this.drinking = { drop: nd.drop }; ev.push({ type: 'drink' }); return; }
    // the pond's edge?
    const fw = fwdOf(F.yaw);
    for (const k of [0.8, 1.6]) if (this.world.isWater(F.pos.x + fw.x * k, F.pos.z + fw.z * k)) { this.drinking = { drop: null }; ev.push({ type: 'drink' }); return; }
    if (F.ground === 'banana') { this.feeding = { t: 0 }; ev.push({ type: 'feed' }); return; }
    // shove the rival away
    const r = this.rival;
    if (r.alive) { const gg = geometry(F, r); if (gg.dist < 4 && Math.abs(gg.az) < 0.7) { r.deter(); ev.push({ type: 'lunge' }); this.say('You lunge at the rival. He backs off.', 'good', 2.5); return; } }
    this.say(F.ground === 'dish' ? 'Climb onto the banana to feed.' : 'Nothing to do here. (E drinks at a droplet, feeds on fruit, taps a female.)', 'hint', 2);
  }

  _die(cause, text, ev, by) { this.dead = { cause, text, by, t: this.simT, age: this.clock.ageText, at: { ...this.fly.eye }, yaw: this.fly.yaw, pitch: this.fly.pitch }; this.player.alive = false; ev.push({ type: 'death', cause, text }); return ev; }

  _restock(ev) {
    const virgins = this.females.filter(f => f.alive && !f.mated && !f.copulating).length;
    const dz = this.world.dropZone, R = this.rand;
    if (virgins < 2) { const f = new FemaleFly(this.world, { name: 'virgin (new batch)', at: { x: dz.x + (R() - 0.5) * 40, z: dz.z + (R() - 0.5) * 40 } }); this.females.push(f); }
    for (let i = 0; i < 3; i++) this.siblings.push(new NpcFly(this.world, { at: { x: dz.x + (R() - 0.5) * 50, z: dz.z + (R() - 0.5) * 50 } }));
    this.siblings = this.siblings.filter(s => s.alive).slice(-12);
    ev.push({ type: 'restock' }); this.say(`Day ${this.clock.day}. The keeper tips in a fresh cup of dusted flies.`, 'story', 4);
  }

  // misting: drops fall near the fly (what you can see is all that matters), and settle as new droplets
  _rain(dt, ev) {
    const F = this.fly, W = this.world, R = this.rand;
    if (this.clock.misting) {
      let n = dt * 7; while (n > 0) { if (R() < n) { const a = R() * 6.28, d = R() * 24; this.rain.push({ x: F.pos.x + Math.cos(a) * d, z: F.pos.z + Math.sin(a) * d, y: F.pos.y + 90 + R() * 60, r: 0.5 + R() * 0.9, vy: -320 }); } n -= 1; }
    }
    for (let i = this.rain.length - 1; i >= 0; i--) {
      const d = this.rain[i]; d.y += d.vy * dt;
      const sh = W.shelter(d.x, d.y - 1, d.z) > 0.5;
      const gy = W.surface(d.x, d.z).y;
      const hitFly = !F.trapped && Math.hypot(d.x - F.pos.x, d.z - F.pos.z) < d.r + 0.7 && d.y - d.r < F.pos.y + 1.2 && d.y > F.pos.y && !this.sheltered;
      if (hitFly) { this.rain.splice(i, 1); const nd = W.addDroplet(F.pos.x, F.pos.z, d.r); F._trap(nd, ev); this.say('A falling droplet engulfs you!', 'warn', 2.5); continue; }
      if (d.y - d.r <= gy || (sh && d.y < this._leafAbove(d.x, d.z, d.y))) {
        this.rain.splice(i, 1);
        if (!sh) { W.addDroplet(d.x, d.z, d.r); ev.push({ type: 'splash', at: { x: d.x, y: gy, z: d.z }, r: d.r }); }
        if (W.droplets.length > 220) { const far = W.droplets.findIndex(q => Math.hypot(q.x - F.pos.x, q.z - F.pos.z) > 60); W.droplets.splice(far >= 0 ? far : 0, 1); }
      }
    }
  }
  _leafAbove(x, z, y) { for (const l of this.world.leaves) { const dx = x - l.x, dz = z - l.z, c = Math.cos(l.yaw), s = Math.sin(l.yaw), u = dx * c + dz * s, v = -dx * s + dz * c; if ((u / (l.len * 0.5)) ** 2 + (v / (l.wid * 0.5)) ** 2 < 1 && y <= l.y) return l.y; } return -Infinity; }

  // what the antennae smell, left and right; what the arista feels of the airflow
  _senses() {
    const F = this.fly, W = this.world, t = this.simT, f = fwdOf(F.yaw), r = rightOf(F.yaw);
    const sens = 1 - 0.85 * this.groom.dust.antennae;
    const at = (side) => ({ x: F.pos.x + f.x * 0.8 + r.x * side * 1.4, z: F.pos.z + f.z * 0.8 + r.z * side * 1.4 });
    const L = at(-1), Rr = at(1);
    const fruit = (p) => W.fruitOdor(p.x, p.z, t) * sens;
    const fem = (p) => { let c = 0; for (const q of this.females) if (q.alive) c += W.plume(p.x, p.z, q.pos.x, q.pos.z, 0.35, t + q.id); return c * sens; };
    const fl = fruit(L), fr = fruit(Rr), ml = fem(L), mr = fem(Rr);
    const windRel = wrapAngle(Math.atan2(-WIND.x, -WIND.z) - F.yaw);     // where the air is going, relative to your heading
    let cva = null; for (const q of this.females) if (q.alive && q.mated && Math.hypot(q.pos.x - F.pos.x, q.pos.z - F.pos.z) < 6) cva = q;
    return { fruit: { c: (fl + fr) / 2, lr: (fr - fl) / (fr + fl + 1e-4) }, female: { c: (ml + mr) / 2, lr: (mr - ml) / (mr + ml + 1e-4) }, wind: windRel, cva: !!cva && sens > 0.4, sens, humidity: this.humidity };
  }

  /** a quick summary for the HUD / tests */
  summary() {
    return { day: this.clock.day, clock: this.clock.clock, age: this.clock.ageText, water: this.stats.water, energy: this.stats.energy, dead: this.dead, won: !!this.won, missions: this.missions.list.filter(m => m.done).map(m => m.id) };
  }
}

// near-field sound: particle velocity falls off steeply, so song carries only a few body lengths
export function nearField(d) { return d === Infinity ? 0 : clamp(1 / (1 + (d / 4.5) ** 3), 0, 1); }
