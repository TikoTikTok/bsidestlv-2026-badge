// Alice in AI Land - which way up the phone is, from its own sensors.
//
// The badge is a grip the phone sits in. Held the other way up, the badge
// is upside down and so is the phone - and the phone pages are portrait
// layouts, which an iPhone and most Android phones (Samsung among them)
// never rotate to "portrait-secondary". What the OS does instead depends on
// auto-rotate: locked, the page stays on its head; unlocked, the OS turns it
// to landscape as the phone passes a quarter turn and leaves it there, since
// that is as far as it goes - and a player holding the phone over then sees
// the page on its side. So this module reads gravity instead, decides
// whether the *phone* is upside down whatever the OS did, and turns the page
// by what the OS left undone: data-flip on <html> is that turn in degrees,
// 180 when the OS did nothing, 90 or 270 when it stopped at landscape, and
// styles.css does the rest. src/pad.js turns the badge's buttons by the
// same decision; the page turn does not need it.
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
// The phone's angle from upright is the angle of "up" in the device frame:
// 0 upright, +-90 on its side, +-180 upside down. The state flips past
// FLIP_AT (150 deg) and comes back under BACK_AT (30 deg), so a phone waved
// about does not flap; a phone lying flat (up within FLAT of the screen's
// normal, about 17 deg) says nothing and the state holds. When the OS turns
// the page (screen.orientation's change) the state is read again at once:
// it stays upside down only if the phone is still past FLIP_AT, so a phone
// coming back round never shows a half turn in the moment between the OS
// going back to portrait and the state letting go.
//
// The page's turn is then a half turn less the OS's own (screen.orientation.angle,
// or the old window.orientation), one of 0, 90, 180, 270 clockwise - and 0
// on the phones that do turn a page upside down, where there is nothing
// left to do.
//
// The player can also say so by hand: localStorage alice.flip is 'auto'
// (the sensors decide), '0' (never turn) or '180' (always turned); the chip
// in the looks sheet sets it, src/look-boot.js honours '180' before paint,
// and both the page turn and the pad read `turned`.
//
// Listening starts with the page: this module calls tilt.start() as soon as
// it is loaded in a browser, so every page turns from its first reading,
// with or without a pad, a gate or a badge. Android needs nothing more.
// iOS asks before it shares the sensors: DeviceOrientationEvent.requestPermission
// must be called from a user gesture, so start() waits there until request()
// has been granted. request() is that call; the first tap anywhere sensible
// makes it - the header's ◐ chip, the sheet's page-turn switch, the gate's
// Connect button and the on-screen pad.

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

/** The angle the OS has already turned the page by: screen.orientation.angle, else window.orientation, else 0. */
export function screenTurn({ orientation = globalThis.screen?.orientation, angle = globalThis.orientation } = {}) {
  if (typeof orientation?.angle === 'number') return orientation.angle;
  return typeof angle === 'number' ? angle : 0;
}

/**
 * Degrees the phone itself is turned from upright, in (-180, 180]: 0 upright,
 * +90 with its top to the left, 180 upside down; null when it lies flat. Up
 * is in the device frame and in units of g. Whatever the OS did with the
 * page is not in here.
 */
export function deviceAngle(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < FLAT) return null;
  const a = Math.atan2(x, y) * DEG;
  return a === -180 ? 180 : a;
}

/**
 * The turn the page needs, clockwise in degrees, so that a player holding the
 * phone the other way up sees it the right way up: a half turn less what the
 * OS already turned it by, one of 0, 90, 180, 270. 180 where the OS left the
 * page alone, 90 or 270 where it went to landscape on the way round and
 * stopped, 0 where it turned the page all the way itself - or where the phone
 * is not upside down at all.
 */
export function pageTurn(upsideDown, screen = screenTurn()) {
  if (!upsideDown) return 0;
  const s = Number.isFinite(screen) ? screen : 0;
  return ((180 - s) % 360 + 360) % 360;
}

export class Tilt {
  constructor({ flipAt = FLIP_AT, backAt = BACK_AT } = {}) {
    this.flipAt = flipAt;
    this.backAt = backAt;
    this.upsideDown = false;   // what the sensors say of the phone itself, with hysteresis
    this.angle = null;         // the phone's last angle from upright, null while flat or before the first reading
    this.screen = 0;           // the OS's own turn of the page, as of the last reading or the last orientation change
    this.readings = 0;
    this.permission = null;    // iOS: 'granted' | 'denied' once asked; null where there is nothing to ask
    this.listeners = new Set();
    this._manual = 'auto';
    try { const v = localStorage.getItem(FLIP_KEY); if (MANUAL.has(v)) this._manual = v; } catch { /* storage may be off */ }
    this._started = false;
  }

  /** Subscribe to changes of `turned`, `turn` or the sensor state: fn(tilt). Returns unsubscribe. */
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

  /** Whether the phone is held the other way up, so the page (and the badge's buttons) are turned: the hand override, else the sensors. */
  get turned() { return this._manual === 'auto' ? this.upsideDown : this._manual === '180'; }

  /** The turn the page needs, clockwise: 0, 90, 180 or 270 - what `turned` asks for, less what the OS has already done. */
  get turn() { return pageTurn(this.turned, this.screen); }

  /** apply() and tell the listeners if the state or the page's turn moved from `was`. */
  _settle(was) {
    if (this.upsideDown === was.upsideDown && this.turn === was.turn) return;
    this.apply();
    this._tell();
  }

  /** One reading: the device's up in the device frame (units of g), and the OS's turn. Returns `upsideDown`. */
  feed(x, y, screen = screenTurn()) {
    this.readings++;
    const was = { upsideDown: this.upsideDown, turn: this.turn };
    this.screen = screen;
    const a = deviceAngle(x, y);
    this.angle = a;
    if (a !== null) {
      const m = Math.abs(a);
      if (!this.upsideDown && m >= this.flipAt) this.upsideDown = true;
      else if (this.upsideDown && m <= this.backAt) this.upsideDown = false;
    }
    this._settle(was);
    return this.upsideDown;
  }

  /** A deviceorientation reading. */
  orientation(beta, gamma, screen) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return this.upsideDown;
    const u = upVector(beta, gamma);
    return this.feed(u.x, u.y, screen);
  }

  /**
   * The OS turned the page (screen.orientation's change, or orientationchange).
   * The page's turn is redone from the new angle, and the state is read again
   * on the last reading: the phone is upside down only if it is still past
   * flipAt, since the OS has just made its own mind up from the same gravity.
   */
  screenChanged(screen = screenTurn()) {
    const was = { upsideDown: this.upsideDown, turn: this.turn };
    this.screen = screen;
    if (this.upsideDown && this.angle !== null && Math.abs(this.angle) < this.flipAt) this.upsideDown = false;
    this._settle(was);
    return this.upsideDown;
  }

  /** data-flip="<turn>" on <html> while the page needs turning; styles.css turns the page by it. */
  apply() {
    const html = globalThis.document?.documentElement;
    if (!html) return;
    const t = this.turn;
    if (t) html.dataset.flip = String(t); else delete html.dataset.flip;
  }

  /** True where the sensors still need a tap to ask for them (iOS 13+, and any browser with requestPermission that has not said yes). */
  get needsPermission() { return typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function' && this.permission !== 'granted'; }

  /**
   * Listen to the sensors, and to the OS turning the page. Idempotent. The
   * listener goes on whether or not the browser has been asked: where no
   * asking is needed the readings come at once, and where it is (iOS) they
   * simply do not come until request() has been granted - a listener without
   * permission is harmless.
   */
  start() {
    if (this._started || typeof addEventListener !== 'function') return this;
    this._started = true;
    addEventListener('deviceorientation', (e) => this.orientation(e.beta, e.gamma));
    globalThis.screen?.orientation?.addEventListener?.('change', () => this.screenChanged());
    addEventListener('orientationchange', () => this.screenChanged());
    this.screen = screenTurn();
    this.apply();
    return this;
  }

  /**
   * Try the permission without a gesture, at load. Chrome (152 on, Android
   * included) has requestPermission too and answers at once, 'granted' where
   * the page may read the sensors; iOS rejects outside a gesture. Only a
   * 'granted' is kept: a refusal here is not the player's, so a tap still
   * asks. Resolves to whether readings will come without one.
   */
  async probe() {
    if (!this.needsPermission) { this.start(); return true; }
    let answer = null;
    try { answer = await DeviceOrientationEvent.requestPermission(); } catch { answer = null; }
    if (answer !== 'granted') return false;
    this.permission = 'granted';
    this._tell();
    this.start();
    return true;
  }

  /** Ask for the sensors from a user gesture (the iOS prompt), then listen. Resolves true when readings will come. */
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

// In a browser the page listens from the moment this module loads (and shows
// a remembered '180' at once), and tries the permission without a tap; where
// a tap is needed (iOS) the first one on the chip, the switch, the gate or
// the pad asks. In Node (the verifiers) there is no document and nothing happens.
if (globalThis.document) { tilt.start(); tilt.probe(); }
