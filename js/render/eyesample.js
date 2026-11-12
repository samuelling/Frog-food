// The FlyHarp hook, part 1: sample a rendered frame onto the fly's 721-column hexagonal eye, in exactly the
// format FlyHarp's optic-lobe model takes (js/worker.js {cmd:'run', frames:[Float32Array(721)]}, luminance
// 0..1 with 0.5 = the grey the flyvis network was trained on, one frame per 20 ms model step).
//
// Columns and their lattice positions come from FlyHarp's data/fly.json (the flyvis model; Lappalainen et al.
// 2024), computed as FlyHarp's engine does: x = 1.5 v / sqrt(3), y = -(u + v/2), unit neighbour spacing,
// +y dorsal. Each column looks DPHI degrees from its neighbours (4.78 deg is the median interommatidial angle
// of the measured eye in FlyHarp's data/eyemap.json, Zhao et al. 2025). Here the eye faces straight ahead
// (+x to the right of the view), so the 721 columns cover about +-72 deg around the fly's heading.
// Pure JS (no three.js): it reads RGBA pixels from wherever you rendered them.
export const DPHI = 4.784;

export class FlyEye {
  constructor() { this.n = 0; this.X = null; this.Y = null; this.map = null; this.key = ''; }
  setColumnsFromModel(model) {
    const cols = model.columns, s3 = Math.sqrt(3);
    this.n = cols.length;
    this.X = Float32Array.from(cols, ([u, v]) => 1.5 * v / s3);
    this.Y = Float32Array.from(cols, ([u, v]) => -(u + v / 2));
    this.map = null; return this;
  }
  /** a hexagonal eye of radius r columns without the model file (r = 15 gives 721) */
  setColumnsHex(r = 15) {
    const cols = []; for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) if (Math.abs(u + v) <= r) cols.push([u, v]);
    return this.setColumnsFromModel({ columns: cols });
  }
  /** viewing direction of each column: azimuth (+ right) and elevation (+ up), radians */
  directions(dphi = DPHI) { const k = dphi * Math.PI / 180; return { az: Float32Array.from(this.X, x => x * k), el: Float32Array.from(this.Y, y => y * k) }; }
  /** pixel index lists (3x3 box per column) for a w x h perspective image with vertical FOV fovDeg (square pixels) */
  _build(w, h, fovDeg, flipY) {
    const { az, el } = this.directions(), t = Math.tan(fovDeg * Math.PI / 360), aspect = w / h;
    const idx = new Int32Array(this.n * 9);
    for (let i = 0; i < this.n; i++) {
      // direction -> perspective image: x = tan(az)/ (t*aspect), y = tan(el)/cos(az)/t  (camera looks down -z)
      const ca = Math.cos(az[i]), dx = Math.sin(az[i]) * Math.cos(el[i]), dy = Math.sin(el[i]), dz = ca * Math.cos(el[i]);
      const nx = dz > 0.05 ? dx / dz / (t * aspect) : Math.sign(dx), ny = dz > 0.05 ? dy / dz / t : Math.sign(dy);
      const cx = Math.round((nx * 0.5 + 0.5) * (w - 1)), cyTop = Math.round((0.5 - ny * 0.5) * (h - 1));
      const cy = flipY ? h - 1 - cyTop : cyTop;
      let k = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const xx = Math.min(w - 1, Math.max(0, cx + ox)), yy = Math.min(h - 1, Math.max(0, cy + oy));
        idx[9 * i + k++] = yy * w + xx;
      }
    }
    this.map = idx; this.key = w + 'x' + h + '@' + fovDeg + (flipY ? 'f' : '');
  }
  /** px: RGBA bytes (WebGL readPixels is bottom-up: flipY true). Returns Float32Array(n) luminance 0..1. */
  sample(px, w, h, { fovDeg = 140, flipY = true, out = null, gain = 1, recentre = false } = {}) {
    const key = w + 'x' + h + '@' + fovDeg + (flipY ? 'f' : '');
    if (!this.map || this.key !== key) this._build(w, h, fovDeg, flipY);
    const o = out || new Float32Array(this.n), m = this.map;
    let mean = 0;
    for (let i = 0; i < this.n; i++) {
      let acc = 0;
      for (let k = 0; k < 9; k++) { const p = 4 * m[9 * i + k]; acc += 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]; }
      o[i] = Math.min(1, acc / 9 / 255 * gain); mean += o[i];
    }
    // optional: re-centre on FlyHarp's grey operating point, as its webcam path does without photoreceptor adaptation
    if (recentre) { mean /= this.n; for (let i = 0; i < this.n; i++) o[i] = Math.min(1, Math.max(0, 0.5 + (o[i] - mean))); }
    return o;
  }
}
