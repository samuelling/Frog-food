// Keyboard + mouse (pointer lock) and touch controls, folded into one input object per frame.
//   Desktop: WASD move, mouse look, Shift run, Space jump, E act, G groom (then A/D sweep, W rub legs),
//            J or left click = song pulse tap, K or right button (hold) = sine hum, V fly-eye view, H help, P pause
//   Touch:   left stick move, drag right side to look, buttons for everything else
export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas; this.keys = new Set(); this.edges = new Set(); this.ups = new Set();
    this.look = { dx: 0, dy: 0 }; this.sens = 0.0022; this.touch = { x: 0, y: 0, id: null, lookId: null, lx: 0, ly: 0 };
    this.locked = false; this.enabled = false; this.touchRun = false;
    this.stamps = { pulse: [], humDown: [], humUp: [] };   // event times (performance.now) for the song, so taps are timed to the event, not the frame
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      if (!this.keys.has(k)) { this.edges.add(k); this._stamp(k, true); }
      this.keys.add(k);
    });
    addEventListener('keyup', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (this.keys.has(k)) this._stamp(k, false); this.keys.delete(k); this.ups.add(k); });
    addEventListener('blur', () => { this.keys.clear(); });
    canvas.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (!this.locked && !this.isTouch) { try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ } return; }
      if (e.button === 0) { this.edges.add('mouse0'); this._stamp('mouse0', true); } if (e.button === 2) { this.edges.add('mouse2'); this.keys.add('mouse2'); this._stamp('mouse2', true); }
    });
    addEventListener('mouseup', e => { if (e.button === 2 && this.keys.has('mouse2')) { this._stamp('mouse2', false); this.keys.delete('mouse2'); this.ups.add('mouse2'); } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; ui && ui.onLock && ui.onLock(this.locked); });
    addEventListener('mousemove', e => { if (this.locked) { this.look.dx += e.movementX * this.sens; this.look.dy += e.movementY * this.sens; } });
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }
  /** wire on-screen touch controls (elements from index.html) */
  bindTouch(el) {
    const stick = el.querySelector('#stick'), knob = el.querySelector('#knob'), lookPad = el.querySelector('#lookpad');
    const st = this.touch;
    stick.addEventListener('touchstart', e => { const t = e.changedTouches[0]; st.id = t.identifier; const r = stick.getBoundingClientRect(); st.cx = r.left + r.width / 2; st.cy = r.top + r.height / 2; st.r = r.width / 2; this._stick(t); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === st.id) this._stick(t); e.preventDefault(); }, { passive: false });
    const end = e => { for (const t of e.changedTouches) if (t.identifier === st.id) { st.id = null; st.x = st.y = 0; knob.style.transform = ''; } };
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    this._knob = knob;
    lookPad.addEventListener('touchstart', e => { const t = e.changedTouches[0]; st.lookId = t.identifier; st.lx = t.clientX; st.ly = t.clientY; e.preventDefault(); }, { passive: false });
    lookPad.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === st.lookId) { this.look.dx += (t.clientX - st.lx) * 0.006; this.look.dy += (t.clientY - st.ly) * 0.006; st.lx = t.clientX; st.ly = t.clientY; } e.preventDefault(); }, { passive: false });
    lookPad.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === st.lookId) st.lookId = null; });
    // buttons: data-key = the key they press; data-hold = held while touched
    for (const b of el.querySelectorAll('[data-key]')) {
      const k = b.dataset.key;
      b.addEventListener('touchstart', e => { e.preventDefault(); if (k === 'run') { this.touchRun = !this.touchRun; b.classList.toggle('on', this.touchRun); return; } this.edges.add(k); this.keys.add(k); this._stamp(k, true); b.classList.add('down'); }, { passive: false });
      const up = e => { e.preventDefault(); if (this.keys.has(k)) this._stamp(k, false); this.keys.delete(k); this.ups.add(k); b.classList.remove('down'); };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
    }
  }
  _stamp(k, down) {
    const t = performance.now();
    if (down && (k === 'j' || k === 'mouse0' || k === 'pulse')) this.stamps.pulse.push(t);
    if (k === 'k' || k === 'mouse2' || k === 'hum') (down ? this.stamps.humDown : this.stamps.humUp).push(t);
  }
  _stick(t) { const st = this.touch; let x = (t.clientX - st.cx) / st.r, y = (t.clientY - st.cy) / st.r; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } st.x = x; st.y = y; this._knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`; }
  /** the frame's input; clears edges */
  read() {
    const K = this.keys, E = this.edges, U = this.ups, has = k => K.has(k), edge = k => E.has(k);
    const fwd = (has('w') || has('ArrowUp') ? 1 : 0) - (has('s') || has('ArrowDown') ? 1 : 0) - this.touch.y;
    const strafe = (has('d') || has('ArrowRight') ? 1 : 0) - (has('a') || has('ArrowLeft') ? 1 : 0) + this.touch.x;
    const out = {
      fwd: Math.max(-1, Math.min(1, fwd)), strafe: Math.max(-1, Math.min(1, strafe)),
      run: has('Shift') || this.touchRun || Math.hypot(this.touch.x, this.touch.y) > 0.92,
      jump: edge(' ') || edge('jump'),
      look: { dx: this.look.dx, dy: this.look.dy },
      act: edge('e') || edge('act'),
      groom: edge('g') || edge('groom'),
      sweepL: edge('a') || edge('ArrowLeft') || edge('sweepL'), sweepR: edge('d') || edge('ArrowRight') || edge('sweepR'),
      rub: edge('w') || edge('ArrowUp') || edge('rub'),
      pulse: edge('j') || edge('mouse0') || edge('pulse'),
      humDown: edge('k') || edge('mouse2') || edge('hum'), humUp: U.has('k') || U.has('mouse2') || U.has('hum'),
      view: edge('v'), help: edge('h') || edge('help'), pause: edge('p') || edge('Escape'), mute: edge('m'),
    };
    out.stamps = this.stamps; this.stamps = { pulse: [], humDown: [], humUp: [] };
    this.look.dx = this.look.dy = 0; E.clear(); U.clear();
    return out;
  }
}
