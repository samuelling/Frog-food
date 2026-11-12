// The vivarium, drawn from js/core/world.js at true scale (mm).
import * as THREE from '../vendor/three.module.min.js';
import { toon, inked, dropletMaterial, waterMaterial, shaftMaterial, moteMaterial, LIGHT, TOON_LIGHT } from './toon.js';
import { merge, ribbon, tube, paint, noSway } from './geom.js';
import * as TX from './textures.js';
import { TANK } from '../core/scale.js';
import { mulberry32 } from '../core/rng.js';

export function buildScene(world, opts = {}) {
  const scene = new THREE.Scene();
  const R = mulberry32(world.seed + 99);
  const fogCol = new THREE.Color('#6f9a86');
  scene.fog = new THREE.FogExp2(fogCol, 0.0042);
  scene.background = new THREE.Color('#2a3a36');
  const root = new THREE.Group(); scene.add(root);
  const parts = { scene, root, fogCol, droplets: null, rain: null, motes: null, shafts: [], leafMeshes: [] };

  // ---------------------------------------------------------------- substrate
  {
    const N = opts.mobile ? 200 : 300;
    const g = new THREE.PlaneGeometry(TANK.w, TANK.d, N, N); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const soil = new THREE.Color('#4a3524'), soil2 = new THREE.Color('#6b4e33'), moss = new THREE.Color('#3f7a2a'), moss2 = new THREE.Color('#6fa43a'), litter = new THREE.Color('#8a6a3a'), mud = new THREE.Color('#2a2418');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const y = world.terrainHeight(x, z); p.setY(i, y);
      const m = world.moss(x, z), lit = 0.5 + 0.5 * Math.sin(x * 0.11) * Math.cos(z * 0.13);
      c.copy(soil).lerp(soil2, lit * 0.6);
      if (m > 0.3) c.lerp(moss.clone().lerp(moss2, R()), Math.min(1, (m - 0.3) * 2.2));
      else if (lit > 0.75) c.lerp(litter, 0.4);
      if (world.isWater(x, z) || (Math.hypot(x - world.pond.x, z - world.pond.z) < world.pond.r + 4)) c.lerp(mud, 0.7);
      col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon({ vertexColors: true, rim: 0.12, noise: 0.45, noiseScale: 0.35 }));
    m.name = 'substrate'; root.add(m); parts.terrain = m;
  }
  // ---------------------------------------------------------------- pond
  {
    const P = world.pond, g = new THREE.CircleGeometry(P.r + 20, 64); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, waterMaterial()); m.position.set(P.x, P.level, P.z); m.renderOrder = 2; root.add(m);
  }
  // ---------------------------------------------------------------- cork log
  {
    const L = world.log, ax = new THREE.Vector3(L.ax, 0, L.az), bx = new THREE.Vector3(L.bx, 0, L.bz);
    const len = ax.distanceTo(bx), mid = ax.clone().add(bx).multiplyScalar(0.5);
    const g = new THREE.CylinderGeometry(L.r, L.r * 1.05, len + L.r * 0.8, 40, 24, false);
    // gnarl it a little
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.06 * Math.sin(a * 7 + y * 0.05) + 0.04 * Math.sin(y * 0.13); p.setX(i, x * k); p.setZ(i, z * k); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon({ map: TX.barkTexture(), rim: 0.25, noise: 0.3 }));
    m.rotation.z = Math.PI / 2; m.rotation.y = -Math.atan2(bx.z - ax.z, bx.x - ax.x);
    m.position.set(mid.x, world._logAxisY(mid.x, mid.z), mid.z);
    m.rotation.order = 'YZX';
    root.add(m); inked(m, { width: 0.05, max: 1.2 });
  }
  // ---------------------------------------------------------------- stones
  for (const r of world.rocks) {
    const g = new THREE.IcosahedronGeometry(1, 4), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); const k = 1 + 0.12 * Math.sin(v.x * 3 + r.x) * Math.cos(v.z * 2.7 + r.z) + 0.05 * Math.sin(v.y * 9); p.setXYZ(i, v.x * k, v.y * k, v.z * k); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon({ color: R() < 0.5 ? '#8c8a80' : '#7a7466', rim: 0.3, noise: 0.5, noiseScale: 0.6 }));
    m.scale.set(r.r, r.h, r.r * (0.85 + R() * 0.3)); m.position.set(r.x, world.terrainHeight(r.x, r.z) - 1, r.z); m.rotation.y = R() * 6;
    root.add(m); inked(m, { width: 0.04 });
  }
  // ---------------------------------------------------------------- bromeliads (Neoregelia-like): skyscrapers with a lake in the cup
  for (const B of world.bromeliads) {
    const geoms = [], y0 = world.terrainHeight(B.x, B.z), n = B.leaves;
    for (let i = 0; i < n; i++) {
      const inner = i / n, a = i * 2.39996 + R() * 0.2;               // golden-angle rosette
      const L = B.r * (1.05 - inner * 0.55), H = B.h * (0.55 + inner * 0.5), W = 9 + B.r * 0.085 * (1 - inner * 0.4);
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), s = new THREE.Vector3(-d.z, 0, d.x);
      const P = [], S = [], Wd = [], NR = [];
      const outward = 0.25 + (1 - inner) * 0.75;
      for (let k = 0; k <= 18; k++) {
        const t = k / 18;
        // quadratic arch: up steeply, then out and (for outer leaves) down
        const r = B.base * 0.6 + L * (t * t * 0.9 * outward + t * 0.15);
        const h = H * (Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) - t * t * (1 - inner) * 0.55);
        P.push(new THREE.Vector3(B.x + d.x * r, y0 + h, B.z + d.z * r)); S.push(s);
        Wd.push(W * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), 0.35) * (1 - 0.75 * t) + 0.3);
      }
      for (let k = 0; k <= 18; k++) { const a1 = P[Math.max(0, k - 1)], a2 = P[Math.min(18, k + 1)], tg = a2.clone().sub(a1).normalize(); NR.push(new THREE.Vector3().crossVectors(tg, S[k]).normalize().negate()); }
      const red = B.hue === 0;
      geoms.push(ribbon(P, S, Wd, { colorA: red ? '#7a1f2c' : '#3d6b2a', colorB: red ? (inner > 0.6 ? '#c2304a' : '#5e8a2c') : '#8bb04a', colorPow: red ? 0.6 : 1.4, channel: 0.25, normals: NR }));
    }
    const g = merge(geoms);
    const m = new THREE.Mesh(g, toon({ vertexColors: true, side: THREE.DoubleSide, trans: 0.9, transCol: '#ffd27a', rim: 0.35, noise: 0.3, sway: 0.6 }));
    root.add(m); inked(m, { width: 0.06, max: 2 }); parts.leafMeshes.push(m);
    // the cup's lake
    const w = new THREE.Mesh(new THREE.CircleGeometry(B.base * 1.3, 32).rotateX(-Math.PI / 2), waterMaterial()); w.position.set(B.x, y0 + B.cup, B.z); root.add(w);
  }
  // ---------------------------------------------------------------- broad hanging leaves and their petioles
  for (const l of world.leaves) {
    const U = new THREE.Vector3(Math.cos(l.yaw), 0, Math.sin(l.yaw)), V = new THREE.Vector3(-Math.sin(l.yaw), 0, Math.cos(l.yaw));
    const NU = 14, NV = 8, pos = [], uv = [], idx = [], sway = [];
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
      const u = i / NU, v = j / NV * 2 - 1;
      // heart-shaped outline: lobes at the base, pointed tip
      const half = l.wid * 0.5 * (Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.04)), 0.7) * (1 - 0.35 * u) + 0.25 * Math.exp(-u * 9));
      const lu = (u - 0.5) * l.len, lv = v * half;
      const droop = -Math.pow(Math.max(0, u - 0.25), 2) * l.len * 0.35 - Math.abs(v) * half * 0.18 + l.tilt * lu * 0.3;
      pos.push(l.x + U.x * lu + V.x * lv, l.y + droop, l.z + U.z * lu + V.z * lv); uv.push(u, j / NV); sway.push(u * u * 0.6 + Math.abs(v) * 0.2);
      if (i < NU && j < NV) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon({ map: TX.leafTexture(l.hue), side: THREE.DoubleSide, trans: 1.1, transCol: '#e8ff8a', rim: 0.3, noise: 0.15, sway: 1.2, spec: 0.25, shin: 30 }));
    root.add(m); inked(m, { width: 0.05, max: 1.5 }); parts.leafMeshes.push(m);
    // petiole: from the ground up and over to the leaf base
    const px = l.x - U.x * l.len * 0.35, pz = l.z - U.z * l.len * 0.35, gy = world.terrainHeight(px, pz);
    const pts = [new THREE.Vector3(px, gy - 1, pz), new THREE.Vector3(px, gy + (l.y - gy) * 0.6, pz), new THREE.Vector3(l.x - U.x * l.len * 0.45, l.y + 3, l.z - U.z * l.len * 0.45), new THREE.Vector3(l.x - U.x * l.len * 0.5, l.y, l.z - U.z * l.len * 0.5)];
    const pm = new THREE.Mesh(tube(pts, [1.4, 0.9], 8, '#4c7a2a', '#7aa43c', 0.5), toon({ vertexColors: true, rim: 0.3, sway: 0.5 }));
    root.add(pm); inked(pm, { width: 0.04 });
  }
  // ---------------------------------------------------------------- ferns and fittonia: trunks and leaflets
  {
    const trunks = [], leafletM = [], fitM = [];
    const tmp = new THREE.Object3D();
    for (const pl of world.plants) for (const s of pl.stems) {
      const gy = world.terrainHeight(s.x, s.z), d = new THREE.Vector3(Math.cos(s.dir), 0, Math.sin(s.dir));
      const pts = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6, out = s.h * (0.15 * t + (pl.kind === 'fern' ? 0.45 : 0.15) * t * t) + s.lean * s.h * 0.3 * t; pts.push(new THREE.Vector3(s.x + d.x * out, gy - 0.5 + s.h * (Math.sin(t * Math.PI * 0.5) - (pl.kind === 'fern' ? 0.3 * t * t : 0)), s.z + d.z * out)); }
      trunks.push(tube(pts, [s.r, s.r * 0.25], 7, pl.kind === 'fern' ? '#4a5f22' : '#6a5a3a', pl.kind === 'fern' ? '#7d9a3a' : '#8a7a5a', 1));
      const curve = new THREE.CatmullRomCurve3(pts);
      if (pl.kind === 'fern') {
        for (let k = 3; k < 30; k++) {
          const t = k / 30, p = curve.getPointAt(t), tg = curve.getTangentAt(t), side = new THREE.Vector3().crossVectors(tg, new THREE.Vector3(0, 1, 0)).normalize();
          const len = s.h * 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.1));
          for (const sg of [-1, 1]) {
            tmp.position.copy(p).addScaledVector(side, sg * len * 0.5);
            tmp.lookAt(p.clone().addScaledVector(side, sg * len * 2).add(new THREE.Vector3(0, -len * 0.3, 0)));
            tmp.scale.set(len * 0.28, 1, len); tmp.updateMatrix(); leafletM.push([tmp.matrix.clone(), t]);
          }
        }
      } else {
        for (let k = 2; k < 7; k++) {
          const t = k / 7, p = curve.getPointAt(t), a = k * 1.7 + s.dir;
          for (const sg of [0, Math.PI]) {
            const dir = new THREE.Vector3(Math.cos(a + sg), -0.15, Math.sin(a + sg));
            tmp.position.copy(p).addScaledVector(dir, 4); tmp.lookAt(p.clone().addScaledVector(dir, 12)); const L = 7 + R() * 4; tmp.scale.set(L * 0.65, 1, L); tmp.updateMatrix(); fitM.push([tmp.matrix.clone(), t]);
          }
        }
      }
    }
    const tm = new THREE.Mesh(merge(trunks), toon({ vertexColors: true, rim: 0.35, sway: 0.8 }));
    root.add(tm); inked(tm, { width: 0.035 });
    // leaflet: a flat pointed oval along +z, slightly cupped
    const leaflet = (curl) => { const g = new THREE.PlaneGeometry(1, 1, 2, 4); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i) + 0.5; const w = Math.sin(Math.PI * Math.min(1, z)) * (1 - 0.3 * z); p.setX(i, x * w); p.setZ(i, z); p.setY(i, -x * x * curl - z * z * 0.08); } g.computeVertexNormals(); return g; };
    const mk = (list, geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, list.length); const sw = new Float32Array(list.length); list.forEach(([mm, t], i) => { im.setMatrixAt(i, mm); sw[i] = t * t * 0.8; }); geo.setAttribute('aSway', new THREE.InstancedBufferAttribute(sw, 1)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); root.add(im); return im; };
    const fg = leaflet(0.25);
    parts.ferns = mk(leafletM, fg, toon({ color: '#5f9a34', side: THREE.DoubleSide, trans: 1.0, transCol: '#dfff8a', rim: 0.25, noise: 0.35, noiseScale: 0.5, sway: 1.0 }));
    parts.fittonia = mk(fitM, leaflet(0.12), toon({ map: TX.leafTexture(0.4, true), side: THREE.DoubleSide, trans: 0.7, rim: 0.3, sway: 0.7, spec: 0.2 }));
  }
  // ---------------------------------------------------------------- the fruit dish
  {
    const D = world.dish, base = world._rawHeight(D.x, D.z);
    const glass = toon({ color: '#cfe8ee', opacity: 0.28, rim: 0.9, spec: 1.2, shin: 120, transparent: true, depthWrite: false, side: THREE.DoubleSide, noise: 0 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, D.rim, 64, 1, true), glass); ring.position.set(D.x, base + D.rim / 2, D.z); ring.renderOrder = 3; root.add(ring);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, D.floor, 64), glass); floor.position.set(D.x, base + D.floor / 2, D.z); floor.renderOrder = 3; root.add(floor);
    const top = TX.bananaTop();
    for (const b of world.bananas) {
      const side = toon({ color: '#e8d08a', rim: 0.25, noise: 0.25 }), cap = toon({ map: top, rim: 0.2, noise: 0.15, spec: 0.35, shin: 25 });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.02, b.h, 48), [side, cap, side]);
      m.position.set(b.x, base + D.floor + b.h / 2, b.z); root.add(m); inked(m, { width: 0.04 });
      // yeast colonies: soft cream mounds
      const yg = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), ym = toon({ color: '#f3ead2', rim: 0.4, noise: 0.4, noiseScale: 2 });
      for (let k = 0; k < 9; k++) { const a = R() * 6.28, d = R() * b.r * 0.8, y = new THREE.Mesh(yg, ym); const s = 0.6 + R() * 1.6; y.scale.set(s, s * 0.45, s); y.position.set(b.x + Math.cos(a) * d, base + D.floor + b.h, b.z + Math.sin(a) * d); root.add(y); }
    }
  }
  // ---------------------------------------------------------------- glass walls: distant cliffs with condensation
  {
    const cond = TX.condensation();
    const mat = toon({ color: '#9ec3c4', map: cond, opacity: 0.22, rim: 0.6, transparent: true, depthWrite: false, side: THREE.DoubleSide, noise: 0, emit: 0.15 });
    const H = TANK.h, walls = [[0, H / 2, TANK.z0, 0], [0, H / 2, TANK.z1, Math.PI], [TANK.x0, H / 2, 0, Math.PI / 2], [TANK.x1, H / 2, 0, -Math.PI / 2]];
    for (const [x, y, z, ry] of walls) { const m = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w, H), mat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 5; root.add(m); }
    // the dark room beyond: a big soft box
    const room = new THREE.Mesh(new THREE.BoxGeometry(TANK.w * 8, TANK.h * 6, TANK.d * 8), new THREE.MeshBasicMaterial({ color: '#1f2a2a', side: THREE.BackSide, fog: false }));
    room.position.y = TANK.h; root.add(room); parts.room = room;
  }
  // ---------------------------------------------------------------- the lid: screen and LED bar (the sky and the sun)
  {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w, TANK.d), new THREE.MeshBasicMaterial({ map: TX.screenTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false }));
    screen.rotation.x = Math.PI / 2; screen.position.y = TANK.h; root.add(screen);
    const ledMat = new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false });
    const led = new THREE.Mesh(new THREE.BoxGeometry(TANK.w * 0.9, 6, 40), ledMat); led.position.set(0, TANK.h + 8, -10); root.add(led); parts.led = led;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w * 1.1, 110), new THREE.MeshBasicMaterial({ color: '#fff1c0', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.rotation.x = Math.PI / 2; glow.position.set(0, TANK.h - 1, -10); root.add(glow); parts.ledGlow = glow;
    // light shafts: slanted soft cones through the humid air
    for (let i = 0; i < 9; i++) {
      const x = -180 + i * 45 + (R() - 0.5) * 20, z = -40 + (R() - 0.5) * 120, r0 = 10 + R() * 14, r1 = r0 * (2.2 + R()), h = TANK.h - 40;
      const g = new THREE.CylinderGeometry(r0, r1, h, 24, 1, true);
      const m = new THREE.Mesh(g, shaftMaterial('#fff0c0', 0.05 + R() * 0.05)); m.position.set(x + 25, TANK.h - h / 2, z + 10); m.rotation.z = -0.12; m.rotation.x = 0.08;
      m.renderOrder = 10; root.add(m); parts.shafts.push(m);
    }
  }
  // ---------------------------------------------------------------- droplets (and falling mist)
  {
    const g = new THREE.SphereGeometry(1, 24, 16);
    const dm = new THREE.InstancedMesh(g, dropletMaterial(), 400); dm.count = 0; dm.frustumCulled = false; dm.renderOrder = 6; root.add(dm); parts.droplets = dm;
    const rm = new THREE.InstancedMesh(g, dropletMaterial(), 200); rm.count = 0; rm.frustumCulled = false; rm.renderOrder = 6; root.add(rm); parts.rain = rm;
  }
  // ---------------------------------------------------------------- drifting motes and mist around the fly
  {
    const n = opts.mobile ? 500 : 1200, pos = new Float32Array(n * 3), size = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[3 * i] = (R() - 0.5) * 140; pos[3 * i + 1] = R() * 70; pos[3 * i + 2] = (R() - 0.5) * 140; size[i] = 0.04 + Math.pow(R(), 4) * 0.4; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const pts = new THREE.Points(g, moteMaterial('#f2fff0', 0.55)); pts.frustumCulled = false; root.add(pts); parts.motes = pts; parts.moteBase = pos.slice();
  }
  return parts;
}

// per-frame updates of the shared scene: time of day, droplets, rain, motes
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const DAY = { sun: new THREE.Color('#fff1d0'), sky: new THREE.Color('#86b9a2'), ground: new THREE.Color('#5c4c30'), fog: new THREE.Color('#78a08c'), rim: new THREE.Color('#fff4c8') };
const NIGHT = { sun: new THREE.Color('#5f78b8'), sky: new THREE.Color('#22344a'), ground: new THREE.Color('#0f1414'), fog: new THREE.Color('#16232a'), rim: new THREE.Color('#8fb2ff') };
export function updateScene(parts, game, camPos, t) {
  const L = game.clock.light;
  LIGHT.time.value = t;
  TOON_LIGHT.value = 0.18 + 0.82 * L;
  LIGHT.sunCol.value.copy(NIGHT.sun).lerp(DAY.sun, L);
  LIGHT.skyCol.value.copy(NIGHT.sky).lerp(DAY.sky, L);
  LIGHT.groundCol.value.copy(NIGHT.ground).lerp(DAY.ground, L);
  LIGHT.rimCol.value.copy(NIGHT.rim).lerp(DAY.rim, L);
  // night: the moon-blue light comes from the room, not the LED bar
  LIGHT.sunDir.value.set(0.25 - 0.6 * (1 - L), 1, 0.15 + 0.5 * (1 - L)).normalize();
  parts.scene.fog.color.copy(NIGHT.fog).lerp(DAY.fog, L);
  // humidity thickens the haze; misting most of all
  const mist = Math.exp(-game.clock.mistAge / 30);
  parts.scene.fog.density = 0.0034 + 0.0025 * mist + 0.0012 * (1 - L);
  parts.scene.background.copy(parts.scene.fog.color).multiplyScalar(0.55);
  parts.room.material.color.copy(parts.scene.fog.color).multiplyScalar(0.45);
  parts.led.material.color.setScalar(0.15 + 0.85 * L); parts.ledGlow.material.opacity = 0.35 * L;
  // droplets: the nearest few hundred
  const W = game.world, D = parts.droplets;
  const near = W.droplets.length > 400 ? W.droplets.map(d => [d, (d.x - camPos.x) ** 2 + (d.z - camPos.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 400).map(a => a[0]) : W.droplets;
  let k = 0;
  for (const d of near) {
    _p.set(d.x, d.y, d.z); _s.set(d.r, d.r * 0.82, d.r); _q.identity(); _m.compose(_p, _q, _s); D.setMatrixAt(k++, _m);
  }
  D.count = k; D.instanceMatrix.needsUpdate = true;
  const Rn = parts.rain; k = 0;
  for (const d of game.rain) { if (k >= 200) break; _p.set(d.x, d.y, d.z); _s.set(d.r * 0.9, d.r * 1.15, d.r * 0.9); _m.compose(_p, _q, _s); Rn.setMatrixAt(k++, _m); }
  Rn.count = k; Rn.instanceMatrix.needsUpdate = true;
  // motes: a box of air that follows the fly, drifting downwind
  const pos = parts.motes.geometry.attributes.position, base = parts.moteBase, n = pos.count;
  const wx = 0.28 * 4 * t, wz = -1 * 4 * t;
  for (let i = 0; i < n; i++) {
    let x = base[3 * i] + wx + Math.sin(t * 0.3 + i) * 2, y = base[3 * i + 1] + Math.sin(t * 0.21 + i * 0.7) * 3, z = base[3 * i + 2] + wz;
    x = ((x - camPos.x + 70) % 140 + 140) % 140 - 70 + camPos.x; z = ((z - camPos.z + 70) % 140 + 140) % 140 - 70 + camPos.z; y = ((y - camPos.y + 20) % 70 + 70) % 70 - 20 + camPos.y;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
}
