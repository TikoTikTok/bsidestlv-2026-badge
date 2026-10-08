// A model of the badge's vault, as the browser sees it - the counterpart of
// fake-bootloader.mjs for src/vault.js. It answers feature report 0xF1 the
// way software/controller/src/vault.c does (same tag, same offsets, same
// write policy) and spells the beacon on four axes the way the firmware's
// hid_task does, normalised to the floats a Gamepad object carries.
//
// It is what verify-badge.mjs drives, and a page can be pointed at it too
// (badge.html's `window.__vault.useDevice`) to walk the UI without a board.

import { REPORT_ID, REPORT_LEN, KEY_LEN, LABEL_LEN, STATE, CMD, BEACON, beaconFrame, beaconAxes, hex } from '../../src/vault.js';

const TAG = [0x41, 0x4C, 0x49, 0x43, 0x45];   // "ALICE"
const toFloat = (b) => b / 127.5 - 1;

export class FakeBadge {
  constructor({ serial = Uint8Array.from([0xE6, 0x60, 0x58, 0x38, 0x83, 0x4B, 0x5A, 0x2E]), key = null, label = '' } = {}) {
    this.serial = serial;
    this.key = key;                 // Uint8Array(32) or null
    this.label = label;
    this.selectHeld = false;        // the physical presence chord
    this.lastWrite = 0;
    this.writes = [];               // every store/erase the flash would have seen
    this.chordSince = null;         // SELECT+Y: beacon start time (ms)
    this.opened = false;
    this.vendorId = 0x054C; this.productId = 0x09CC; this.productName = 'Wireless Controller';
  }

  get provisioned() { return !!this.key; }

  // --- WebHID surface ---------------------------------------------------

  async open() { this.opened = true; }
  async close() { this.opened = false; }

  async receiveFeatureReport(id) {
    if (id !== REPORT_ID) return new DataView(new Uint8Array(REPORT_LEN + 1).fill(0).buffer);
    const out = new Uint8Array(REPORT_LEN + 1);
    out[0] = REPORT_ID;
    const p = out.subarray(1);
    p.set(TAG, 0);
    p[5] = 1;
    p[6] = (this.provisioned ? STATE.PROVISIONED : 0) | (this.selectHeld ? STATE.SELECT_HELD : 0) | this.lastWrite;
    p[7] = KEY_LEN;
    p.set(this.serial, 8);
    if (this.provisioned) {
      p.set(this.key, 16);
      p.set(Uint8Array.from(this.label, c => c.charCodeAt(0)).subarray(0, LABEL_LEN), 48);
    }
    return new DataView(out.buffer);
  }

  async sendFeatureReport(id, data) {
    if (id !== REPORT_ID) return;
    const b = new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length);
    if (b.length < 38 + LABEL_LEN) return;
    if (!TAG.every((t, i) => b[i] === t)) return;
    const cmd = b[5];
    if (cmd !== CMD.STORE && cmd !== CMD.ERASE) return;
    if (this.provisioned && !this.selectHeld) { this.lastWrite = STATE.WRITE_DENIED; return; }
    if (cmd === CMD.ERASE) {
      this.key = null; this.label = ''; this.lastWrite = STATE.WRITE_OK;
      this.writes.push({ op: 'erase' });
      return;
    }
    const key = b.slice(6, 6 + KEY_LEN);
    if (key.every(x => x === 0)) { this.lastWrite = STATE.WRITE_DENIED; return; }
    this.key = key;
    const lb = b.slice(38, 38 + LABEL_LEN);
    const end = lb.indexOf(0);
    this.label = String.fromCharCode(...lb.subarray(0, end < 0 ? lb.length : end));
    this.lastWrite = STATE.WRITE_OK;
    this.writes.push({ op: 'store', key: hex(key), label: this.label });
  }

  // --- the beacon -------------------------------------------------------

  /** Hold or release SELECT+Y at time `tMs`. */
  chord(down, tMs) { this.chordSince = down ? (this.chordSince ?? tMs) : null; }

  frame() { return beaconFrame({ serial: this.serial, key: this.key, provisioned: this.provisioned }); }

  /** Stick bytes at `tMs`, centred unless the chord is held. */
  axesBytes(tMs) {
    if (this.chordSince === null) return [BEACON.CENTER, BEACON.CENTER, BEACON.CENTER, BEACON.CENTER];
    return beaconAxes(this.frame(), tMs - this.chordSince);
  }

  /** What navigator.getGamepads() would hold at `tMs`: a standard-mapping pad with centred buttons. */
  gamepad(tMs) {
    return {
      id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
      index: 0, connected: true, mapping: 'standard', timestamp: tMs,
      axes: this.axesBytes(tMs).map(toFloat),
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
  }
}
