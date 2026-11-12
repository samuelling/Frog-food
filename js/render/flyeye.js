// The FlyHarp hook, part 2: render what the fly sees with a wide camera, sample it onto the 721 ommatidia
// (js/render/eyesample.js), and hand the frames to anything that wants them, in FlyHarp's visual-input format.
//
//   const hook = window.FrogFood.flyharp;
//   hook.enable(true);                     // start rendering eye frames at 50 Hz (one per 20 ms model step)
//   hook.exportFrame();                    // -> {lum: Float32Array(721), t, pose} : the latest frame
//   const off = hook.onFrame(f => ...);    // stream frames
//   hook.connectWorker(worker);            // a FlyHarp js/worker.js instance: frames are batched into
//                                          // {cmd: 'run', frames: [Float32Array(721), ...]} as FlyHarp's app does
//
// FlyHarp's worker expects luminance with 0.5 = mean grey (the flyvis training operating point). By default
// frames are re-centred on 0.5 and contrast-scaled like FlyHarp's webcam path; set hook.raw = true to send
// absolute luminance (FlyHarp's photoreceptor adaptation, js/gain.js, then does the work).
import * as THREE from '../vendor/three.module.min.js';
import { FlyEye } from './eyesample.js';

export class FlyEyeHook {
  constructor(renderer, scene, opts = {}) {
    this.renderer = renderer; this.scene = scene;
    this.size = opts.size || 96; this.fov = opts.fov || 150;
    this.cam = new THREE.PerspectiveCamera(this.fov, 1, 0.05, 2000);
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, { depthBuffer: true });
    this.px = new Uint8Array(this.size * this.size * 4);
    this.eye = new FlyEye().setColumnsHex(15);
    this.enabled = false; this.raw = false; this.contrast = 1;
    this.listeners = new Set(); this.latest = null; this.acc = 0; this.t = 0; this.workers = []; this.batch = [];
  }
  async loadColumns(url) { try { const m = await (await fetch(url)).json(); this.eye.setColumnsFromModel(m); } catch (e) { /* keep the hex eye */ } }
  enable(on = true) { this.enabled = on; return this; }
  onFrame(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  exportFrame() { return this.latest || this.capture(this._pose || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }); }
  connectWorker(worker) { this.workers.push(worker); this.enable(true); return () => { this.workers = this.workers.filter(w => w !== worker); }; }
  /** render and sample one frame from a pose {x,y,z,yaw,pitch} (eye position, mm) */
  capture(pose) {
    const c = this.cam; c.position.set(pose.x, pose.y, pose.z); c.rotation.set(pose.pitch || 0, pose.yaw || 0, 0, 'YXZ'); c.updateMatrixWorld();
    const R = this.renderer, prev = R.getRenderTarget();
    R.setRenderTarget(this.rt); R.render(this.scene, c); R.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, this.px); R.setRenderTarget(prev);
    const lum = this.eye.sample(this.px, this.size, this.size, { fovDeg: this.fov, flipY: true, recentre: !this.raw });
    if (!this.raw && this.contrast !== 1) for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, 0.5 + (lum[i] - 0.5) * this.contrast));
    const f = { lum, t: this.t, pose: { ...pose } };
    this.latest = f; return f;
  }
  /** call every animation frame; produces a frame per 20 ms of game time while enabled */
  tick(dt, pose) {
    this._pose = pose;
    if (!this.enabled) return;
    this.acc += dt; this.t += dt;
    let n = 0;
    while (this.acc >= 0.02 && n < 3) { this.acc -= 0.02; n++; }
    if (this.acc > 0.1) this.acc = 0;
    if (!n) return;
    const f = this.capture(pose);
    for (let k = 0; k < n; k++) { for (const cb of this.listeners) cb(f); if (this.workers.length) this.batch.push(Float32Array.from(f.lum)); }
    if (this.batch.length >= 3) { for (const w of this.workers) w.postMessage({ cmd: 'run', frames: this.batch.map(a => Float32Array.from(a)) }); this.batch = []; }
  }
  /** draw the eye's view as hexagons on a 2D canvas (the picture-in-picture "what the ommatidia see") */
  draw(ctx, w, h) {
    const f = this.latest; if (!f) return;
    const E = this.eye; let R = 0; for (let i = 0; i < E.n; i++) R = Math.max(R, Math.hypot(E.X[i], E.Y[i]));
    const s = Math.min(w, h) / 2 / (R + 1), r = s * 0.58;   // flat-topped hexes: neighbours are 1 apart vertically
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < E.n; i++) {
      const v = Math.round(f.lum[i] * 255), x = w / 2 + E.X[i] * s, y = h / 2 - E.Y[i] * s;
      ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
      ctx.fill();
    }
  }
}
