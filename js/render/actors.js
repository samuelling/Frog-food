// Frogs (forest-spirit kaiju) and flies, built from primitives at true size, cel-shaded and inked.
import * as THREE from '../vendor/three.module.min.js';
import { toon, inked } from './toon.js';
import * as TX from './textures.js';

let shadowTex = null;
function shadowMat() {
  if (!shadowTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, 'rgba(10,14,8,0.55)'); r.addColorStop(0.6, 'rgba(10,14,8,0.25)'); r.addColorStop(1, 'rgba(10,14,8,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); shadowTex = new THREE.CanvasTexture(c); }
  return new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
}
function blob(r) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), shadowMat()); m.renderOrder = 1; return m; }
const sph = (r = 1, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);
function limb(a, b, r, mat, ink = true) {
  // a capsule from a to b (local coordinates)
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, L), 6, 10), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  if (ink) inked(m, { width: 0.012, max: 0.6 });
  return m;
}

// ------------------------------------------------------------------------------------------------- frog
export class FrogView {
  constructor(frog) {
    this.frog = frog;
    const skin = TX.frogSkin(frog.species, frog.id * 7 + 3);
    const base = { azureus: '#2f6fd6', auratus: '#2fbf7a', leucomelas: '#f2c21b' }[frog.species];
    const mSkin = toon({ map: skin, spec: 1.6, shin: 70, wet: 0.85, rim: 0.95, noise: 0.12, noiseScale: 0.08, emit: 0.28 });
    const mLeg = toon({ color: frog.species === 'leucomelas' ? '#1a1712' : base, map: frog.species === 'leucomelas' ? null : skin, spec: 1.2, shin: 60, wet: 0.8, rim: 0.5, noise: 0.1 });
    const mEye = toon({ color: '#07080a', spec: 3.0, shin: 180, wet: 1, rim: 0.8, noise: 0 });
    const mPad = toon({ color: frog.species === 'leucomelas' ? '#2a2620' : '#cfd8e8', spec: 0.6, rim: 0.4, trans: 0.6 });
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const torso = new THREE.Mesh(sph(1, 40, 28), mSkin); torso.scale.set(0.34, 0.25, 0.5); torso.position.set(0, 0.24, 0.05); this.body.add(torso); inked(torso, { width: 0.004, max: 0.6 });
    const head = new THREE.Mesh(sph(1, 36, 24), mSkin); head.scale.set(0.3, 0.21, 0.27); head.position.set(0, 0.3, -0.3); this.body.add(head); inked(head, { width: 0.004, max: 0.6 });
    this.throat = new THREE.Mesh(sph(1, 20, 14), toon({ color: base, spec: 1, rim: 0.4 })); this.throat.scale.set(0.2, 0.1, 0.18); this.throat.position.set(0, 0.16, -0.33); this.body.add(this.throat);
    this.eyes = [];
    for (const s of [-1, 1]) { const e = new THREE.Mesh(sph(0.08, 24, 16), mEye); e.position.set(s * 0.15, 0.4, -0.36); this.body.add(e); inked(e, { width: 0.003, max: 0.4 }); this.eyes.push(e); }
    // legs: front pair (with toe-tapping hands), hind pair folded
    this.hands = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.17, 0.22, -0.22); this.body.add(arm);
      arm.add(limb([0, 0, 0], [s * 0.07, -0.14, -0.1], 0.045, mLeg)); arm.add(limb([s * 0.07, -0.14, -0.1], [s * 0.05, -0.2, -0.2], 0.035, mLeg));
      const hand = new THREE.Group(); hand.position.set(s * 0.05, -0.21, -0.2); arm.add(hand);
      for (let k = 0; k < 4; k++) { const a = (k - 1.5) * 0.45; const toe = new THREE.Group(); toe.rotation.y = a; hand.add(toe); toe.add(limb([0, 0, 0], [0, -0.005, -0.07], 0.012, mLeg, false)); const pad = new THREE.Mesh(sph(0.022, 10, 8), mPad); pad.position.set(0, -0.005, -0.075); toe.add(pad); }
      this.hands.push(hand);
      const leg = new THREE.Group(); leg.position.set(s * 0.2, 0.2, 0.2); this.body.add(leg);
      leg.add(limb([0, 0, 0], [s * 0.15, -0.08, -0.12], 0.07, mLeg)); leg.add(limb([s * 0.15, -0.08, -0.12], [s * 0.12, -0.17, 0.16], 0.05, mLeg)); leg.add(limb([s * 0.12, -0.17, 0.16], [s * 0.16, -0.2, -0.02], 0.035, mLeg));
      for (let k = 0; k < 5; k++) { const pad = new THREE.Mesh(sph(0.022, 10, 8), mPad); pad.position.set(s * (0.13 + k * 0.025), -0.2, -0.05 - k * 0.02); leg.add(pad); }
      leg.userData.side = s; (this.legs = this.legs || []).push(leg);
    }
    this.root.scale.setScalar(frog.length);
    // tongue (world space)
    this.tongue = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1).translate(0, 0.5, 0), toon({ color: '#e98aa0', spec: 1.5, shin: 50, rim: 0.5 }));
    this.tip = new THREE.Mesh(sph(1.3, 16, 12), toon({ color: '#f0a0b4', spec: 2, shin: 60, rim: 0.6 }));
    this.tongue.visible = this.tip.visible = false;
    this.shadow = blob(frog.length * 0.55);
  }
  addTo(parent) { parent.add(this.root, this.tongue, this.tip, this.shadow); }
  update(t, world) {
    const f = this.frog;
    this.root.position.set(f.pos.x, f.pos.y, f.pos.z); this.root.rotation.y = f.yaw;
    const hop = f.state === 'hop' && f.hop && f.hop.turn >= 1;
    // lean into the strike, crouch while aiming, stretch in the air
    this.body.rotation.x = -0.18 * f.lean + (hop ? -0.25 : 0);
    this.body.position.y = -0.03 * f.lean;
    for (const leg of this.legs) leg.rotation.x = hop ? 0.9 : 0;
    // toe-tapping: the telegraph
    this.hands.forEach((h, i) => { h.rotation.x = f.toeTap > 0.05 ? Math.sin(t * 38 + i * 2.1) * 0.5 * f.toeTap : 0; });
    // breathing throat, blinking, eyes pulled in to swallow
    const th = 1 + 0.25 * Math.max(0, Math.sin(f.throat * Math.PI * 2));
    this.throat.scale.set(0.2 * th, 0.1 * th, 0.18 * th);
    for (const e of this.eyes) { e.scale.y = 1 - 0.85 * f.blink * f.blink; e.position.y = 0.4 - 0.08 * f.eyeRetract; }
    const asleep = f.asleep; if (asleep) for (const e of this.eyes) e.scale.y = 0.15;
    // tongue
    const T = f.tongue;
    if (f.state === 'strike' && T.tip && T.out > 0.01) {
      const a = new THREE.Vector3(T.from.x, T.from.y, T.from.z), b = new THREE.Vector3(T.tip.x, T.tip.y, T.tip.z), L = a.distanceTo(b);
      this.tongue.visible = this.tip.visible = true;
      this.tongue.position.copy(a); this.tongue.scale.set(0.7, Math.max(0.01, L), 0.7);
      this.tongue.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.tip.position.copy(b);
    } else this.tongue.visible = this.tip.visible = false;
    const gy = world.surface(f.pos.x, f.pos.z).y;
    this.shadow.position.set(f.pos.x, gy + 0.15, f.pos.z); const k = Math.max(0.4, 1 - (f.pos.y - gy) / 40); this.shadow.scale.setScalar(k); this.shadow.material.opacity = k;
  }
}

// -------------------------------------------------------------------------------------------------- fly
const FLY_MATS = {};
function flyMats(sex, dusty) {
  const key = sex + (dusty ? 'd' : '');
  if (FLY_MATS[key]) return FLY_MATS[key];
  const tint = dusty ? '#f4efe4' : '#ffffff';
  return FLY_MATS[key] = {
    eye: toon({ color: '#a8261c', spec: 0.9, shin: 30, rim: 0.4, noise: 0.25, noiseScale: 30 }),
    thorax: toon({ color: dusty ? '#d8cbb0' : '#8a6a42', rim: 0.45, spec: 0.3, shin: 25, noise: 0.2, noiseScale: 12 }),
    abdomen: toon({ map: TX.abdomenTexture(sex), color: tint, rim: 0.4, spec: 0.25, noise: 0.1 }),
    wing: toon({ color: '#c9d8e2', opacity: 0.5, rim: 1.3, spec: 0.8, shin: 40, side: THREE.DoubleSide, transparent: true, depthWrite: false, noise: 0, trans: 0.5, transCol: '#ffe0f0' }),
    leg: toon({ color: dusty ? '#cfc4ad' : '#3a2a18', rim: 0.3, noise: 0 }),
    ovi: toon({ color: '#3a2a1a', rim: 0.3 }),
  };
}
export class FlyView {
  constructor(npc) {
    this.npc = npc; const sex = npc.sex, M = flyMats(sex, npc.dust > 0.5); this.M = M;
    this.root = new THREE.Group();
    const add = (geo, mat, pos, scl, ink = 0.006) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (scl) m.scale.set(...scl); this.root.add(m); if (ink) inked(m, { width: ink, max: 0.25, color: '#20160c' }); return m; };
    add(sph(1, 20, 14), M.thorax, [0, 0.62, -0.35], [0.42, 0.38, 0.55]);
    add(sph(1, 16, 12), M.thorax, [0, 0.62, -0.92], [0.3, 0.3, 0.22]);
    for (const s of [-1, 1]) add(sph(1, 18, 14), M.eye, [s * 0.23, 0.66, -0.94], [0.17, 0.25, 0.2]);
    this.abd = add(sph(1, 20, 14), M.abdomen, [0, 0.52, 0.4], [0.38, 0.33, sex === 'f' ? 0.72 : 0.6]);
    this.abd.rotation.x = Math.PI / 2;
    // wings: pivot at the base so they can extend sideways to sing
    this.wings = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * 0.12, 0.88, -0.25); this.root.add(piv);
      const w = new THREE.Mesh(new THREE.CircleGeometry(1, 24), M.wing); w.rotation.x = -Math.PI / 2; w.scale.set(0.42, 1.05, 1); w.position.set(s * 0.12, 0, 0.9); piv.add(w);
      piv.rotation.y = s * -0.12; piv.userData.side = s; this.wings.push(piv);
    }
    // legs: three pairs, two segments each
    this.legs = [];
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * 0.18, 0.48, -0.55 + k * 0.22); this.root.add(piv);
      const fx = [-0.05, 0, 0.12][k], out = [0.45, 0.55, 0.5][k];
      piv.add(limb([0, 0, 0], [s * out * 0.6, 0.12, fx - 0.15 + k * 0.08], 0.035, M.leg, false));
      piv.add(limb([s * out * 0.6, 0.12, fx - 0.15 + k * 0.08], [s * out, -0.47, fx * 2 - 0.25 + k * 0.2], 0.025, M.leg, false));
      piv.userData = { side: s, pair: k }; this.legs.push(piv);
    }
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.03, 0.05, 0.25, 6), M.leg, [s * 0.1, 0.75, -1.1], null, 0).rotation.x = -0.6;
    if (sex === 'f') { this.ovi = add(new THREE.ConeGeometry(0.08, 0.35, 10), M.ovi, [0, 0.45, 1.1], null, 0); this.ovi.rotation.x = Math.PI / 2; this.ovi.scale.setScalar(0.01); }
    this.shadow = blob(1.6);
    this.phase = Math.random() * 6;
  }
  addTo(parent) { parent.add(this.root, this.shadow); }
  update(t, dt, world, opts = {}) {
    const n = this.npc;
    this.root.visible = this.shadow.visible = n.alive;
    if (!n.alive) return;
    this.root.position.set(n.pos.x, n.pos.y, n.pos.z); this.root.rotation.y = n.yaw;
    const sp = Math.hypot(n.vel.x, n.vel.z); this.phase += dt * sp * 4.5;
    for (const l of this.legs) { const tri = ((l.userData.pair + (l.userData.side > 0 ? 1 : 0)) % 2) * Math.PI; l.rotation.y = sp > 0.3 ? Math.sin(this.phase + tri) * 0.35 : 0; l.rotation.x = sp > 0.3 ? Math.max(0, Math.cos(this.phase + tri)) * 0.25 : 0; }
    // courtship: one wing out and vibrating; females flick; copulation curls
    const wingOut = n.wing || 0, buzz = opts.buzz || 0;
    this.wings.forEach(w => { const s = w.userData.side; const out = s === (n.wingSide || 1) ? wingOut : 0; w.rotation.y = s * (-0.12 - out * 1.35); w.rotation.z = s * out * (0.15 + 0.12 * Math.sin(t * 160) * buzz); });
    if (this.ovi) this.ovi.scale.setScalar(0.01 + 0.99 * (n.ovi || 0));
    this.abd.rotation.x = Math.PI / 2 + (n.copulating && n.sex === 'm' ? 0.6 : 0) + (n.kick ? 0.2 * n.kick : 0);
    const gy = n.pos.y; this.shadow.position.set(n.pos.x, gy + 0.05, n.pos.z);
  }
}

// ------------------------------------------------------------------------- the player's own legs and wing
// Drawn attached to the camera, at the bottom of the view: forelegs when grooming, a wing when singing.
export class SelfRig {
  constructor(camera) {
    this.root = new THREE.Group(); camera.add(this.root);
    const leg = toon({ color: '#6a4c2c', rim: 0.5, noise: 0.2, noiseScale: 20 }), dusty = toon({ color: '#e9e1cf', rim: 0.4, noise: 0.4, noiseScale: 20 });
    this.legs = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * 0.18, -0.42, -0.35); this.root.add(g);
      const a = limb([0, 0, 0], [s * -0.06, 0.12, -0.28], 0.028, leg, true), b = limb([s * -0.06, 0.12, -0.28], [s * -0.13, 0.02, -0.55], 0.022, leg, true);
      g.add(a, b); g.userData = { side: s, a, b }; this.legs.push(g);
    }
    this.legMats = [leg, dusty];
    const piv = new THREE.Group(); piv.position.set(0.5, -0.25, 0.1); this.root.add(piv);
    const w = new THREE.Mesh(new THREE.CircleGeometry(1, 28), toon({ color: '#dceaf2', opacity: 0.35, rim: 1.2, spec: 0.8, side: THREE.DoubleSide, transparent: true, depthWrite: false, noise: 0 }));
    w.scale.set(0.45, 1.1, 1); w.position.set(0, 0, -0.9); w.rotation.x = -Math.PI / 2 + 0.25; piv.add(w); this.wing = piv; piv.visible = false;
    this.buzz = 0;
  }
  update(t, dt, s) {
    // s: {grooming, sweep, rub, legDust, singing, pulse, side}
    const show = !!(s.grooming || s.feeding || s.drinking);
    this.legs.forEach(g => {
      g.visible = show;
      if (!show) return;
      const sd = g.userData.side;
      const sweep = s.sweep * Math.sin(t * 22 + (sd > 0 ? 0 : Math.PI)), rub = s.rub * Math.sin(t * 30 + (sd > 0 ? 0 : Math.PI));
      g.rotation.set(-0.3 + 0.35 * sweep + (s.drinking || s.feeding ? 0.2 : 0), sd * (0.25 * rub), sd * 0.1 * sweep);
      g.position.x = sd * (0.18 - 0.08 * Math.abs(rub));
    });
    this.buzz = Math.max(0, this.buzz - dt * 12); if (s.pulse) this.buzz = 1;
    this.wing.visible = !!s.singing;
    if (s.singing) { const sd = s.side || 1; this.wing.position.x = 0.5 * sd; this.wing.rotation.set(0, -sd * 0.4, sd * (0.05 * Math.sin(t * 190) * (this.buzz + (s.humming ? 0.6 : 0)))); }
  }
}
