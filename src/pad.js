// Alice in AI Land - input: the badge, or a keyboard standing in for it.
//
// The badge enumerates as a DualShock 4, so in a browser it is a Gamepad with
// the "standard" mapping. This module turns that - or the keyboard - into a
// single stream of timestamped button edges, named the way the badge names
// its buttons:
//
//   UP DOWN LEFT RIGHT   A B X Y   SL SR   START SELECT
//
// Timing is the whole point of the range, so two things matter here:
//
//   1. Poll on a 4 ms timer, not requestAnimationFrame. A frame is 16 ms and
//      a background tab gets none; a timer keeps sampling.
//   2. Stamp an edge with the gamepad's own `timestamp` when the browser
//      provides one - it is the instant the browser read the device, which
//      is earlier and steadier than the instant this loop noticed.
//
// Browsers themselves sample gamepads at ~16 ms, so that is the floor. A
// press shorter than that can be missed entirely, and the range's levels
// are tuned so nothing needs to be shorter.

export const BUTTONS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y', 'SL', 'SR', 'START', 'SELECT'];

// "standard" gamepad mapping indices -> badge names. The DualShock 4 diamond
// lands where a Game Boy's would: cross = A, circle = B, square = X,
// triangle = Y.
const STANDARD = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'SL', 5: 'SR', 8: 'SELECT', 9: 'START',
                   12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };

// Keyboard stand-in. Arrows for the d-pad; Z X C V under the left hand for
// the diamond, Q / E for the shoulders, Enter / Backspace for Start / Select.
export const KEYS = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  z: 'A', x: 'B', c: 'X', v: 'Y', q: 'SL', e: 'SR', Enter: 'START', Backspace: 'SELECT',
};

// Firefox on Linux exposes the DualShock 4 with an empty mapping and the
// d-pad as a hat on axis 9, in eighths of a turn from -1 (N) to 1 (NW), with
// 9/7 meaning centred.
const HAT = [['UP'], ['UP', 'RIGHT'], ['RIGHT'], ['DOWN', 'RIGHT'], ['DOWN'], ['DOWN', 'LEFT'], ['LEFT'], ['UP', 'LEFT']];
function hatButtons(value) {
  if (value > 1.1) return [];
  const i = Math.round((value + 1) * 3.5);
  return HAT[i] ?? [];
}

function readGamepad(gp) {
  const held = new Set();
  for (const [i, name] of Object.entries(STANDARD)) {
    const b = gp.buttons[i];
    if (b && (b.pressed || b.value > 0.5)) held.add(name);
  }
  if (gp.mapping !== 'standard' && gp.axes.length > 9) {
    for (const name of hatButtons(gp.axes[9])) held.add(name);
  }
  return held;
}

export class Pad {
  constructor({ pollMs = 4 } = {}) {
    this.held = new Set();          // what is down right now, both sources merged
    this.listeners = new Set();
    this.device = null;             // { id, index, mapping } of the gamepad in use
    this.lastEdgeT = null;
    this.pollMs = pollMs;
    this._padHeld = new Set();
    this._keyHeld = new Set();
    this._lastStamp = 0;
    this._boundKeydown = (e) => this._key(e, true);
    this._boundKeyup = (e) => this._key(e, false);
  }

  /** Subscribe to edges: fn({ button, down, t, source }). Returns unsubscribe. */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** A synthetic edge from the page itself - an on-screen button, say. */
  inject(button, down, t = performance.now()) { this._emit(button, down, t, 'ui'); }

  start() {
    addEventListener('keydown', this._boundKeydown);
    addEventListener('keyup', this._boundKeyup);
    addEventListener('gamepadconnected', () => this._poll());
    const loop = () => { this._poll(); this._timer = setTimeout(loop, this.pollMs); };
    loop();
    return this;
  }

  stop() {
    clearTimeout(this._timer);
    removeEventListener('keydown', this._boundKeydown);
    removeEventListener('keyup', this._boundKeyup);
  }

  _emit(button, down, t, source) {
    const was = this.held.has(button);
    if (down) this.held.add(button); else this.held.delete(button);
    if (was === down) return;                    // the other source already had it
    this.lastEdgeT = t;
    for (const fn of this.listeners) fn({ button, down, t, source });
  }

  _key(e, down) {
    const name = KEYS[e.key] ?? KEYS[e.key.toLowerCase?.()];
    if (!name) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    e.preventDefault();
    if (e.repeat) return;
    const t = performance.now();
    if (down) this._keyHeld.add(name); else this._keyHeld.delete(name);
    this._emit(name, down, t, 'key');
  }

  _poll() {
    const pads = navigator.getGamepads?.() ?? [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }

    if (!gp) {
      if (this.device) {
        this.device = null;
        const now = performance.now();
        for (const b of [...this._padHeld]) { this._padHeld.delete(b); this._emit(b, false, now, 'pad'); }
      }
      return;
    }
    if (!this.device || this.device.index !== gp.index) {
      this.device = { id: gp.id, index: gp.index, mapping: gp.mapping };
    }

    const now = performance.now();
    const held = readGamepad(gp);
    // the browser's own read time, if it looks like one: same clock, recent
    const stamp = gp.timestamp;
    const t = (stamp > 0 && stamp <= now && now - stamp < 1000 && stamp !== this._lastStamp) ? stamp : now;
    let changed = false;
    for (const b of held) if (!this._padHeld.has(b)) { this._padHeld.add(b); this._emit(b, true, t, 'pad'); changed = true; }
    for (const b of [...this._padHeld]) if (!held.has(b)) { this._padHeld.delete(b); this._emit(b, false, t, 'pad'); changed = true; }
    if (changed) this._lastStamp = stamp;
  }
}
