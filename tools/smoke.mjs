// Headless-browser smoke test: serve the folder, open the game in Chrome (SwiftShader WebGL), collect console
// errors, and take screenshots of a few situations. node tools/smoke.mjs [chrome path]
// Screenshots go to shots/ (git-ignored).
import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const ROOT = new URL('..', import.meta.url).pathname;
const chrome = process.argv[2] || process.env.CHROME || '/usr/bin/google-chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { const q = path.join(p, 'index.html'); if (fs.existsSync(q)) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(q)); } res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(fs.readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
fs.mkdirSync(ROOT + 'shots', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
const errors = [], logs = [];
page.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + t); else logs.push(t); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
page.on('response', r => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });
const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
await page.goto(`http://localhost:${port}/index.html?autostart`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 4000));
const shot = async (name, setup, wait = 1500) => {
  if (only && !only.includes(name)) return;
  if (setup) await page.evaluate(setup);
  await new Promise(r => setTimeout(r, wait));
  await page.screenshot({ path: ROOT + 'shots/' + name + '.png' });
  console.log('shot', name);
};
await shot('start');
if (!process.env.DUSTY) await page.evaluate(() => { const g = window.FrogFood.game; for (const k in g.groom.dust) g.groom.dust[k] = 0; });
// stand still on the ground, looking around
await shot('ground', () => { const g = window.FrogFood.game, F = g.fly; F.pos.x = -10; F.pos.z = 40; F.pos.y = g.world.height(-10, 40); F.onGround = true; F.vel.y = 0; F.yaw = 2.6; F.pitch = 0.05; g.frogs.forEach(f => { f.state = 'rest'; f.timer = 999; }); });
await shot('frog', () => { const g = window.FrogFood.game, F = g.fly, f = g.frogs[0]; f.pos.x = 0; f.pos.z = 0; f.pos.y = g.world.height(0, 0); f.yaw = Math.PI; f.state = 'rest'; f.timer = 999; F.pos.x = 0; F.pos.z = -32; F.pos.y = g.world.height(0, -32); F.onGround = true; F.yaw = Math.PI; F.pitch = 0.18; });
await shot('female', () => { const g = window.FrogFood.game, F = g.fly, q = g.females[0]; q.pos.x = 30; q.pos.z = 30; q.pos.y = g.world.height(30, 30); q.yaw = 0.3; q.state = 'feed'; q.timer = 999; F.pos.x = 30 + 1.5; F.pos.z = 30 + 5; F.pos.y = g.world.height(F.pos.x, F.pos.z); F.yaw = Math.atan2(-(q.pos.x - F.pos.x), -(q.pos.z - F.pos.z)); F.pitch = -0.1; });
// courtship: put a virgin 4 mm in front and sing at her by pressing J every 350 ms
if (!only || only.includes('court')) {
  await page.evaluate(() => { const g = window.FrogFood.game, F = g.fly, q = g.females[0]; g.frogs.forEach(f => { f.pos.x = 200; f.pos.z = 200; f.state = 'rest'; f.timer = 999; }); q.pos.x = 20; q.pos.z = 20; q.pos.y = g.world.height(20, 20); q.yaw = 0; q.state = 'feed'; q.timer = 999; F.pos.x = 20; F.pos.z = 24; F.pos.y = g.world.height(20, 24); F.onGround = true; F.yaw = 0; F.pitch = -0.12; g.court.female = q; g.court.stage = 'sing'; });
  for (let i = 0; i < 16; i++) { await page.keyboard.press('j'); await new Promise(r => setTimeout(r, 350)); }
  const c = await page.evaluate(() => { const g = window.FrogFood.game, q = g.females[0]; return { fresh: g.ear.fresh, drive: g.ear.drive, areas: g.ear.areas, R: q.R, feat: g.myFeat, target: g.ear.female && g.ear.female.name, gain: g.ear.gain }; });
  console.log('court', JSON.stringify(c));
  await page.screenshot({ path: ROOT + 'shots/court.png' }); console.log('shot court');
}
await shot('dish', () => { const g = window.FrogFood.game, F = g.fly, D = g.world.dish; F.pos.x = D.x - 45; F.pos.z = D.z + 25; F.pos.y = g.world.height(F.pos.x, F.pos.z); F.yaw = Math.atan2(-(D.x - F.pos.x), -(D.z - F.pos.z)); F.pitch = 0.1; });
await shot('bromeliad', () => { const g = window.FrogFood.game, F = g.fly, B = g.world.bromeliads[0]; F.pos.x = B.x - 140; F.pos.z = B.z + 90; F.pos.y = g.world.height(F.pos.x, F.pos.z); F.yaw = Math.atan2(-(B.x - F.pos.x), -(B.z - F.pos.z)); F.pitch = 0.45; });
await shot('aim', () => { const g = window.FrogFood.game, F = g.fly, f = g.frogs[0]; F.pos.x = 0; F.pos.z = -16; F.pos.y = g.world.height(0, -16); F.onGround = true; F.yaw = Math.PI; F.pitch = 0.25; f.pos.x = 0; f.pos.z = 0; f.pos.y = g.world.height(0, 0); f.yaw = 0; f.state = 'aim'; f.target = g.player; f.timer = 0.45; f.hunger = 1; }, 700);
await shot('strike', null, 1150);
await shot('mist', () => { const g = window.FrogFood.game, F = g.fly; if (g.dead) { g.dead = null; g.player.alive = true; } F.trapped = null; F.pos.x = -40; F.pos.z = 20; F.pos.y = g.world.height(-40, 20); F.onGround = true; F.pitch = 0.5; g.frogs.forEach(f => { f.pos.x = 200; f.pos.z = -200; f.state = 'rest'; f.timer = 999; f.target = null; }); g.clock.t = (0.552 - g.clock.start) * 180; }, 2500);
await shot('night', () => { const g = window.FrogFood.game; g.clock.t = (0.92 - g.clock.start) * 180; });
await shot('eyeview', () => { const g = window.FrogFood.game; g.clock.t = (0.45 - g.clock.start) * 180; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'v' })); });
if (!only || only.includes('mobile')) {
  const mp = await browser.newPage();
  mp.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await mp.emulate({ viewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await mp.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2500)); await mp.screenshot({ path: ROOT + 'shots/mobile-start.png' });
  await mp.tap('#go'); await new Promise(r => setTimeout(r, 3000)); await mp.screenshot({ path: ROOT + 'shots/mobile-play.png' }); console.log('shot mobile');
  await mp.close();
}
const stats = await page.evaluate(() => { const g = window.FrogFood.game, r = window.FrogFood.renderer.info; const fr = window.FrogFood.flyharp.latest; return { calls: r.render.calls, tris: r.render.triangles, ear: g.ear.fresh, earDrive: g.ear.drive, frame: fr ? { n: fr.lum.length, mean: fr.lum.reduce((a, b) => a + b, 0) / fr.lum.length } : null, summary: g.summary() }; });
console.log(JSON.stringify(stats));
console.log('errors:', errors.length); for (const e of errors.slice(0, 20)) console.log('  ' + e.slice(0, 400));
await browser.close(); server.close();
process.exit(errors.filter(e => !/GPU stall|ReadPixels|AudioContext|swiftshader/i.test(e)).length ? 1 : 0);
