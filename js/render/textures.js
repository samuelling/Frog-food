// Procedural textures, painted on canvases at load (no image files to fetch).
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, fbm2 } from '../core/rng.js';

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// dart-frog skin: base colour with organic black spots or bands (sphere UVs: u around, v pole to pole)
export function frogSkin(species, seed = 1) {
  const [c, g] = canvas(512, 256), R = mulberry32(seed);
  const pal = { azureus: ['#2b62d0', '#3f86ea', '#0b0f1a'], auratus: ['#27b26f', '#61d89a', '#0c1611'], leucomelas: ['#f0be16', '#ffd94a', '#0d0c0a'] }[species];
  g.fillStyle = pal[0]; g.fillRect(0, 0, 512, 256);
  // mottled lighter wash
  for (let i = 0; i < 400; i++) { g.fillStyle = pal[1] + '22'; g.beginPath(); g.arc(R() * 512, R() * 256, 4 + R() * 18, 0, 6.3); g.fill(); }
  g.fillStyle = pal[2];
  if (species === 'leucomelas') {
    // black bands with yellow islands
    for (let x = 0; x < 512; x += 2) for (let y = 0; y < 256; y += 2) {
      const n = fbm2(x / 46, y / 24, 3, seed) + 0.35 * Math.sin(y / 256 * Math.PI * 5 + fbm2(x / 60, 0, 2, seed + 3) * 2);
      if (n > 0.18) g.fillRect(x, y, 2, 2);
    }
  } else if (species === 'auratus') {
    for (let x = 0; x < 512; x += 2) for (let y = 0; y < 256; y += 2) { const n = fbm2(x / 34, y / 30, 4, seed); if (n > 0.12) g.fillRect(x, y, 2, 2); }
  } else {
    // azureus: scattered black spots, denser on the back
    for (let i = 0; i < 140; i++) { const y = 40 + Math.pow(R(), 1.5) * 170, x = R() * 512, r = 3 + R() * 10; g.beginPath(); g.ellipse(x, y, r * (1 + R()), r, R() * 3, 0, 6.3); g.fill(); }
  }
  return tex(c);
}

export function barkTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#5b4632'; g.fillRect(0, 0, 256, 512);
  for (let x = 0; x < 256; x += 2) for (let y = 0; y < 512; y += 2) {
    const n = fbm2(x / 9, y / 70, 4, 31), m = fbm2(x / 30, y / 30, 3, 7);
    const v = 70 + 70 * n + 30 * m;
    g.fillStyle = `rgb(${v * 1.15 | 0},${v * 0.92 | 0},${v * 0.66 | 0})`; g.fillRect(x, y, 2, 2);
  }
  // cork furrows
  g.strokeStyle = 'rgba(25,18,10,0.6)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) { let x = Math.random() * 256; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y < 512; y += 16) { x += (Math.random() - 0.5) * 8; g.lineTo(x, y); } g.stroke(); }
  return tex(c, { repeat: [3, 2] });
}

export function bananaTop() {
  const [c, g] = canvas(256);
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, '#f2e2a8'); grd.addColorStop(0.75, '#ead48c'); grd.addColorStop(0.92, '#c8a85a'); grd.addColorStop(1, '#6b5a2a');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  // the seed star and fermenting spots
  g.fillStyle = '#5b4524';
  for (let k = 0; k < 3; k++) { const a = k * 2.094; g.beginPath(); g.ellipse(128 + Math.cos(a) * 16, 128 + Math.sin(a) * 16, 9, 4, a, 0, 6.3); g.fill(); }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${150 + Math.random() * 60},${110 + Math.random() * 40},50,0.35)`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 9, 0, 6.3); g.fill(); }
  return tex(c);
}

// broad leaf with veins (u along the midrib, v across)
export function leafTexture(hue = 0, variegated = false) {
  const [c, g] = canvas(256);
  const base = variegated ? '#5d8f3a' : ['#3e7d2c', '#4f8e2e', '#2f6b31'][Math.floor(hue * 3) % 3];
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${170 + Math.random() * 60},${220},${90},0.05)`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 20, 0, 6.3); g.fill(); }
  g.strokeStyle = variegated ? 'rgba(250,240,235,0.9)' : 'rgba(210,240,150,0.55)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  g.lineWidth = variegated ? 1.6 : 1.4;
  for (let x = 14; x < 250; x += variegated ? 14 : 22) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + 22, 128 + s * 50, x + 46, 128 + s * 118); g.stroke(); }
  if (variegated) { g.lineWidth = 0.8; for (let i = 0; i < 160; i++) { const x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16); g.stroke(); } }
  return tex(c);
}

// condensation on the glass: droplets of many sizes, brighter rims
export function condensation() {
  const [c, g] = canvas(512), R = mulberry32(5);
  g.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const x = R() * 512, y = R() * 512, r = Math.pow(R(), 3) * 9 + 0.6;
    g.fillStyle = 'rgba(220,240,255,0.18)'; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, r, 3.6, 5.6); g.stroke();
  }
  // a few runs
  for (let i = 0; i < 18; i++) { const x = R() * 512; let y = R() * 300; g.strokeStyle = 'rgba(230,245,255,0.25)'; g.lineWidth = 1 + R() * 2; g.beginPath(); g.moveTo(x, y); y += 80 + R() * 200; g.lineTo(x + (R() - 0.5) * 6, y); g.stroke(); }
  return tex(c, { repeat: [1.5, 2] });
}

export function screenTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#0d0f10'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(160,170,170,0.5)'; g.lineWidth = 1;
  for (let i = 0; i <= 256; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  return tex(c, { repeat: [24, 24] });
}

// fly body: abdomen stripes (male: dark tip; female: bands)
export function abdomenTexture(sex) {
  // sphere UVs, rotated so the long axis is z: image top = rear tip, right half (u 0.5..1) = dorsal
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#d2ad72'; g.fillRect(0, 0, 128, 64);
  const band = (y, h) => { const grd = g.createLinearGradient(56, 0, 128, 0); grd.addColorStop(0, 'rgba(40,26,14,0)'); grd.addColorStop(0.25, 'rgba(40,26,14,0.95)'); grd.addColorStop(0.75, 'rgba(40,26,14,0.95)'); grd.addColorStop(1, 'rgba(40,26,14,0.95)'); g.fillStyle = grd; g.fillRect(56, y, 72, h); g.fillRect(0, y, 4, h); };
  if (sex === 'm') { g.fillStyle = '#2a1a0e'; g.fillRect(0, 0, 128, 15); band(17, 5); band(26, 5); }
  else for (let k = 0; k < 6; k++) band(4 + k * 7, 4);
  return tex(c);
}

export function dustSpecks() {
  const [c, g] = canvas(512), R = mulberry32(9);
  for (let i = 0; i < 520; i++) { const x = R() * 512, y = R() * 512, r = Math.pow(R(), 3) * 7 + 0.4; g.fillStyle = `rgba(250,248,240,${0.15 + R() * 0.45})`; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
  return c.toDataURL();
}
