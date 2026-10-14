// Alice in AI Land - which way up the phone is, from its own sensors.
//
// The badge is a grip the phone sits in. Held the other way up, the badge
// is upside down and so is the phone - and the phone pages are portrait
// layouts, which an iPhone and most Android phones (Samsung among them)
// never rotate to "portrait-secondary". screen.orientation stays where it
// was, the page stays on its head, and src/pad.js's orientation test never
// fires. So this module reads gravity instead and says whether the device
// is upside down *relative to what the screen shows*; src/pad.js turns the
// badge's buttons by it and src/looks.js turns the page (data-flip="180" on
// <html>, styles.css does the rest).
//
// Gravity comes from `deviceorientation`, not `devicemotion`: iOS Safari
// reports accelerationIncludingGravity with the opposite sign to Android
// (flat on a table reads z = -9.81 there, +9.81 everywhere else, since
// 2014), and a sign you cannot trust is exactly the thing this module must
// get right. The orientation event's beta / gamma agree across platforms,
// and the device's "up" vector falls out of them: up = (-cos b sin g, sin b,
// cos b cos g), which is (0, 1, 0) upright, (0, -1, 0) upside down, (0, 0, 1)
// flat. The gimbal lock at vertical does not bite because gamma is scaled
// by cos b, which is zero there. The pure maths takes the vector, so a
// devicemotion feed (or a test) can supply one directly.
//
// In the screen's frame: the angle of "up" in the device frame, minus the
// angle the OS has already turned the content by (screen.orientation.angle,
// or the old window.orientation). 0 is upright, +-180 upside down. The state
// flips past FLIP_AT (150 deg) and comes back under BACK_AT (30 deg), so a
// phone waved about does not flap; a phone lying flat (up within FLAT of
// the screen's normal, about 17 deg) says nothing and the state holds.
//
// The player can also say so by hand: localStorage alice.flip is 'auto'
// (the sensors decide), '0' (never turn) or '180' (always turned); the chip
// in the looks sheet sets it, src/look-boot.js honours '180' before paint,
// and both the page turn and the pad read `turned`.
//
// iOS asks before it shares the sensors: DeviceOrientationEvent.requestPermission
// must be called from a user gesture. request() is that call; the gate's
// Connect button, the sheet's turn-over chip and the on-screen pad make it.

export const FLIP_KEY = 'alice.flip';
export const FLIP_AT = 150;   // degrees from upright past which the phone counts as upside down
export const BACK_AT = 30;    // ... and under which it counts as the right way up again
export const FLAT = 0.3;      // |up| in the screen plane under this (as a fraction of g) is "lying flat": no opinion

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const MANUAL = new Set(['auto', '0', '180']);

/** The device's "up" unit vector, device frame (x right, y to the top of the screen, z out of it), from deviceorientation's beta / gamma. */
export function upVector(beta, gamma) {
  const b = beta * RAD, g = gamma * RAD;
  return { x: -Math.cos(b) * Math.sin(g), y: Math.sin(b), z: Math.cos(b) * Math.cos(g) };
}

/** The angle the OS has already turned the content by: screen.orientation.angle, else window.orientation, else 0. */
export function screenTurn({ orientation = globalThis.screen?.orientation, angle = globalThis.orientation } = {}) {
  if (typeof orientation?.angle === 'number') return orientation.angle;
  return typeof angle === 'number' ? angle : 0;
}

/** Degrees between the screen's up and the device's up, in (-180, 180]; null when the phone lies flat. Up is in the device frame and in units of g. */
export function screenAngle(x, y, turn = screenTurn()) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < FLAT) return null;
  let a = Math.atan2(x, y) * DEG - turn;
  a = ((a + 180) % 360 + 360) % 360 - 180;    // into (-180, 180]
  return a === -180 ? 180 : a;
}

export class Tilt {
  constructor({ flipAt = FLIP_AT, backAt = BACK_AT } = {}) {
    this.flipAt = flipAt;
    this.backAt = backAt;
    this.upsideDown = false;   // what the sensors say, with hysteresis
    this.angle = null;         // the last reading in the screen's frame, null while flat or before the first
    this.readings = 0;
    this.permission = null;    // iOS: 'granted' | 'denied' once asked; null where there is nothing to ask
    this.listeners = new Set();
    this._manual = 'auto';
    try { const v = localStorage.getItem(FLIP_KEY); if (MANUAL.has(v)) this._manual = v; } catch { /* storage may be off */ }
    this._started = false;
  }

  /** Subscribe to changes of `turned` or of the sensor state: fn(tilt). Returns unsubscribe. */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _tell() { for (const fn of this.listeners) fn(this); }

  /** The hand override: 'auto' | '0' | '180', remembered on the device. */
  get manual() { return this._manual; }
  set manual(v) {
    if (!MANUAL.has(v)) v = 'auto';
    if (v === this._manual) return;
    this._manual = v;
    try { if (v === 'auto') localStorage.removeItem(FLIP_KEY); else localStorage.setItem(FLIP_KEY, v); } catch { /* storage may be off */ }
    this.apply();
    this._tell();
  }

  /** Whether the page (and the badge's buttons) should be turned a half turn: the hand override, else the sensors. */
  get turned() { return this._manual === 'auto' ? this.upsideDown : this._manual === '180'; }

  /** One reading: the device's up in the device frame (units of g), and the OS's turn. Returns `upsideDown`. */
  feed(x, y, turn = screenTurn()) {
    this.readings++;
    const a = screenAngle(x, y, turn);
    this.angle = a;
    if (a === null) return this.upsideDown;
    const m = Math.abs(a);
    const was = this.upsideDown;
    if (!was && m >= this.flipAt) this.upsideDown = true;
    else if (was && m <= this.backAt) this.upsideDown = false;
    if (this.upsideDown !== was) { this.apply(); this._tell(); }
    return this.upsideDown;
  }

  /** A deviceorientation reading. */
  orientation(beta, gamma, turn) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return this.upsideDown;
    const u = upVector(beta, gamma);
    return this.feed(u.x, u.y, turn);
  }

  /** data-flip="180" on <html> while turned; styles.css turns the page by it. */
  apply() {
    const html = globalThis.document?.documentElement;
    if (!html) return;
    if (this.turned) html.dataset.flip = '180'; else delete html.dataset.flip;
  }

  /** True where the sensors need asking first (iOS 13+). */
  get needsPermission() { return typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function' && this.permission !== 'granted'; }

  /** Listen to the sensors. Idempotent; on iOS it does nothing until request() has been granted. */
  start() {
    if (this._started || typeof addEventListener !== 'function') return this;
    if (this.needsPermission) return this;
    this._started = true;
    addEventListener('deviceorientation', (e) => this.orientation(e.beta, e.gamma));
    this.apply();
    return this;
  }

  /** Ask iOS for the sensors - from a user gesture only - then start. Resolves true when readings will come. */
  async request() {
    if (!this.needsPermission) { this.start(); return this._started; }
    try { this.permission = await DeviceOrientationEvent.requestPermission(); }
    catch { this.permission = 'denied'; }
    this._tell();
    if (this.permission !== 'granted') return false;
    this.start();
    return true;
  }
}

/** The one Tilt every module on a page shares. */
export const tilt = new Tilt();
