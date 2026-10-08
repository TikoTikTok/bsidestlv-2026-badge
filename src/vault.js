// Alice in AI Land - the badge's vault, from the browser.
//
// The badge keeps a 32-byte stage key (software/controller/src/vault.h).
// This module gets it out, two ways, and is the only place the page knows
// the wire formats:
//
//   WebHID    Chrome / Edge on a computer. Feature report 0xF1 is one of
//             the vendor reports the DualShock 4 descriptor already
//             declares, so one receiveFeatureReport() is the whole exchange.
//             A real DualShock 4 answers it too - with no "ALICE" tag, which
//             is how a controller is told from a badge. sendFeatureReport()
//             on the same ID provisions a badge (badge.html).
//
//   Beacon    Everything else with a Gamepad API: phones, Firefox, Safari.
//             While SELECT + Y is held the badge spells the same payload on
//             the four stick axes. Left X is a clock that flips every 50 ms
//             symbol; left Y, right X and right Y each carry a nibble as one
//             of 16 levels spaced 16/255 apart, so whatever float a browser
//             normalises the byte to, the nearest level is unambiguous.
//             31 symbols, then a 250 ms gap of centred sticks, repeat. The
//             decoder samples navigator.getGamepads() (src/pad.js does, 4 ms)
//             and closes a frame when the clock returns to centre.
//
// Nothing here decides what the key opens - src/seal.js does - and nothing
// here persists it. The key lives in the badge and in the page's memory.

export const BADGE_VID = 0x054C;
export const BADGE_PID = 0x09CC;
export const HID_FILTERS = [{ vendorId: BADGE_VID, productId: BADGE_PID }];

export const REPORT_ID = 0xF1;
export const REPORT_LEN = 63;
export const KEY_LEN = 32;
export const LABEL_LEN = 15;
export const SERIAL_LEN = 8;
const TAG = 'ALICE';
export const VERSION = 1;

export const STATE = { PROVISIONED: 0x01, SELECT_HELD: 0x02, WRITE_DENIED: 0x04, WRITE_OK: 0x08 };
export const CMD = { STORE: 1, ERASE: 2 };

// GET report offsets (payload, after the report ID)
const R = { TAG: 0, VER: 5, STATE: 6, KEYLEN: 7, SERIAL: 8, KEY: 16, LABEL: 48 };
// SET report offsets
const S = { TAG: 0, CMD: 5, KEY: 6, LABEL: 38 };

// Beacon
export const BEACON = {
  SYMBOL_MS: 50, FRAME_BYTES: 46, SYMBOLS: 31, GAP_MS: 250,
  PERIOD_MS: 31 * 50 + 250,
  CENTER: 0x80, CLOCK_LO: 0x30, CLOCK_HI: 0xD0,
  level: (n) => 8 + 16 * n,
};

// ------------------------------------------------------------------ bytes ----

export const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export function unhex(str) {
  const clean = String(str).replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) throw new Error('odd-length hex');
  return Uint8Array.from(clean.match(/../g) ?? [], h => parseInt(h, 16));
}

/** CRC-32 (IEEE 802.3), the same one vault.c computes. */
export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

const ascii = (s) => Uint8Array.from(s, c => c.charCodeAt(0));
const isZero = (bytes) => bytes.every(b => b === 0);
const labelText = (bytes) => { const end = bytes.indexOf(0); return String.fromCharCode(...bytes.subarray(0, end < 0 ? bytes.length : end)); };

// ---------------------------------------------------------------- reports ----

/**
 * Parse a GET 0xF1 payload. Accepts the 63 payload bytes, or 64 with the
 * report ID in front (what WebHID's receiveFeatureReport hands back).
 * @returns {{ version, state, provisioned, selectHeld, writeDenied, writeOk, serial: Uint8Array, serialHex, key: Uint8Array|null, label }}
 * @throws if the device is not a badge (no ALICE tag)
 */
export function parseVaultReport(data) {
  let bytes = data instanceof DataView ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
  if (bytes.length === REPORT_LEN + 1 && bytes[0] === REPORT_ID) bytes = bytes.subarray(1);
  if (bytes.length < REPORT_LEN) throw new Error(`vault report is ${bytes.length} bytes, expected ${REPORT_LEN}`);
  if (String.fromCharCode(...bytes.subarray(R.TAG, R.TAG + 5)) !== TAG) throw new Error('not a badge: no vault tag in report 0xF1');
  const version = bytes[R.VER];
  if (version !== VERSION) throw new Error(`vault report version ${version}, this page speaks ${VERSION}`);
  if (bytes[R.KEYLEN] !== KEY_LEN) throw new Error(`vault key is ${bytes[R.KEYLEN]} bytes, expected ${KEY_LEN}`);
  const state = bytes[R.STATE];
  const key = bytes.slice(R.KEY, R.KEY + KEY_LEN);
  const provisioned = !!(state & STATE.PROVISIONED) && !isZero(key);
  const serial = bytes.slice(R.SERIAL, R.SERIAL + SERIAL_LEN);
  return {
    version, state, provisioned,
    selectHeld: !!(state & STATE.SELECT_HELD),
    writeDenied: !!(state & STATE.WRITE_DENIED),
    writeOk: !!(state & STATE.WRITE_OK),
    serial, serialHex: hex(serial),
    key: provisioned ? key : null,
    label: provisioned ? labelText(bytes.slice(R.LABEL, R.LABEL + LABEL_LEN)) : '',
  };
}

/** The SET 0xF1 payload that stores `key` (32 bytes) under `label`, or erases. */
export function buildSetReport(cmd, key = null, label = '') {
  const out = new Uint8Array(REPORT_LEN);
  out.set(ascii(TAG), S.TAG);
  out[S.CMD] = cmd;
  if (cmd === CMD.STORE) {
    if (!(key instanceof Uint8Array) || key.length !== KEY_LEN) throw new Error(`key must be ${KEY_LEN} bytes`);
    if (isZero(key)) throw new Error('an all-zero key is no key');
    out.set(key, S.KEY);
    const lb = ascii(label);
    if (lb.length > LABEL_LEN) throw new Error(`label is ${lb.length} bytes, at most ${LABEL_LEN}`);
    out.set(lb, S.LABEL);
  } else if (cmd !== CMD.ERASE) {
    throw new Error(`unknown vault command ${cmd}`);
  }
  return out;
}

// ----------------------------------------------------------------- WebHID ----

export const hasHid = () => typeof navigator !== 'undefined' && !!navigator.hid;

/** Chooser, then open. Needs a user gesture. Resolves to the HIDDevice or null if the user cancelled. */
export async function requestBadgeHid() {
  const devices = await navigator.hid.requestDevice({ filters: HID_FILTERS });
  const device = devices[0];
  if (!device) return null;
  if (!device.opened) await device.open();
  return device;
}

/** Devices this page was already granted, opened. */
export async function grantedBadgesHid() {
  const devices = (await navigator.hid.getDevices()).filter(d => d.vendorId === BADGE_VID && d.productId === BADGE_PID);
  for (const d of devices) if (!d.opened) await d.open().catch(() => {});
  return devices.filter(d => d.opened);
}

/** Read the vault over WebHID. Throws if the device is a plain controller. */
export async function readVaultHid(device) {
  const view = await device.receiveFeatureReport(REPORT_ID);
  return parseVaultReport(view);
}

/**
 * Provision over WebHID, then read back. The badge writes after the transfer
 * completes (a sector erase takes tens of ms), so the read-back waits.
 */
export async function writeVaultHid(device, cmd, key, label, { settleMs = 600 } = {}) {
  await device.sendFeatureReport(REPORT_ID, buildSetReport(cmd, key, label));
  await new Promise(r => setTimeout(r, settleMs));
  return readVaultHid(device);
}

// ----------------------------------------------------------------- beacon ----

/** The 46-byte frame the badge spells out, for a model of it (fake-badge.mjs). */
export function beaconFrame({ serial, key, provisioned }) {
  const out = new Uint8Array(BEACON.FRAME_BYTES);
  out[0] = VERSION;
  out[1] = provisioned ? STATE.PROVISIONED : 0;
  out.set(serial, 2);
  if (provisioned && key) out.set(key, 10);
  new DataView(out.buffer).setUint32(42, crc32(out.subarray(0, 42)), true);
  return out;
}

/** The four stick bytes at `tMs` since the chord went down, exactly as vault.c does it. */
export function beaconAxes(frame, tMs) {
  const symbol = Math.floor((tMs % BEACON.PERIOD_MS) / BEACON.SYMBOL_MS);
  if (symbol >= BEACON.SYMBOLS) return [BEACON.CENTER, BEACON.CENTER, BEACON.CENTER, BEACON.CENTER];
  const nib = (i) => i >= BEACON.FRAME_BYTES * 2 ? 0 : (i & 1 ? frame[i >> 1] & 0x0F : frame[i >> 1] >> 4);
  return [symbol & 1 ? BEACON.CLOCK_HI : BEACON.CLOCK_LO,
          BEACON.level(nib(symbol * 3)), BEACON.level(nib(symbol * 3 + 1)), BEACON.level(nib(symbol * 3 + 2))];
}

/** A frame's fields, or null if the CRC does not check. */
export function parseBeaconFrame(frame) {
  if (frame.length !== BEACON.FRAME_BYTES) return null;
  const crc = new DataView(frame.buffer, frame.byteOffset).getUint32(42, true);
  if (crc !== crc32(frame.subarray(0, 42))) return null;
  if (frame[0] !== VERSION) return null;
  const key = frame.slice(10, 42);
  const provisioned = !!(frame[1] & STATE.PROVISIONED) && !isZero(key);
  const serial = frame.slice(2, 10);
  return { version: frame[0], state: frame[1], provisioned, serial, serialHex: hex(serial), key: provisioned ? key : null, label: '', source: 'beacon' };
}

// A browser hands the page a float in -1..1; the badge sent a byte.
const toByte = (v) => Math.round((v + 1) * 127.5);
const clockOf = (b) => b < 88 ? 0 : b > 168 ? 1 : -1;

/**
 * Feed it gamepad axes as they are sampled; `sample()` returns a parsed
 * frame once one decodes, else null. `progress` is 0..1 through the current
 * frame, for a bar.
 */
export class BeaconDecoder {
  constructor() { this.reset(); this.frames = 0; this.bad = 0; }
  reset() { this._clock = -1; this._nibbles = []; this._bad = false; }
  get progress() { return Math.min(1, this._nibbles.length / (BEACON.SYMBOLS * 3)); }
  get active() { return this._clock !== -1; }

  sample(axes) {
    if (!axes || axes.length < 4) return null;
    const clock = clockOf(toByte(axes[0]));
    if (clock === this._clock) return null;
    if (clock === -1) return this._close();
    if (this._clock === -1) { this._nibbles = []; this._bad = false; }
    this._clock = clock;
    for (let a = 1; a < 4; a++) {
      const b = toByte(axes[a]);
      const n = Math.round((b - 8) / 16);
      if (n < 0 || n > 15 || Math.abs(b - BEACON.level(n)) > 5) this._bad = true;
      this._nibbles.push(n & 15);
    }
    if (this._nibbles.length > BEACON.SYMBOLS * 3) this._bad = true;
    return null;
  }

  _close() {
    const nibbles = this._nibbles, bad = this._bad;
    this.reset();
    if (bad || nibbles.length !== BEACON.SYMBOLS * 3) { if (nibbles.length) this.bad++; return null; }
    const frame = new Uint8Array(BEACON.FRAME_BYTES);
    for (let i = 0; i < frame.length; i++) frame[i] = (nibbles[2 * i] << 4) | nibbles[2 * i + 1];
    const parsed = parseBeaconFrame(frame);
    if (parsed) this.frames++; else this.bad++;
    return parsed;
  }
}
