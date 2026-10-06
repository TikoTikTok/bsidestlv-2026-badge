// Alice in AI Land - PICOBOOT over WebUSB: the RP2040's ROM bootloader,
// spoken to from a browser.
//
// Hold BootSel while plugging the badge in (or hold SELECT+START for two
// seconds on the quick-glitch firmware) and the RP2040 boots its ROM instead
// of flash. The ROM enumerates as 2e8a:0003 with two interfaces: a mass
// storage drive called RPI-RP2 that takes a UF2 by copy, and a vendor
// interface - PICOBOOT - that takes commands over a pair of bulk endpoints.
// picotool uses the second; so does this, because a browser can claim a
// vendor interface through WebUSB but cannot write to a drive.
//
// The protocol, as picotool's picoboot_connection.c does it:
//
//   - a command is 32 bytes on the OUT endpoint: magic, a token, the command
//     id (bit 7 set when the device sends data back), the argument size, the
//     transfer length and up to 16 bytes of arguments;
//   - the data, if any, follows on the OUT endpoint (WRITE) or comes back on
//     the IN endpoint (READ);
//   - the device acknowledges with an empty packet in the opposite direction
//     to the data. picotool reads that ack into a one-byte buffer and sends
//     the OUT ack as one byte; this does the same.
//   - an error stalls the endpoint; the status request (0x42) says why.
//
// Flash is erased in 4096-byte sectors and programmed in 256-byte pages.
// Erase, write and read-back all go to the flash as serial commands, which
// only work once EXIT_XIP has taken the chip out of execute-in-place mode -
// so that comes first, as in picotool. REBOOT with pc 0 boots whatever is in
// flash, after a delay so the ack gets out.
//
// Nothing here touches the DOM, and the device is any object with WebUSB's
// shape - software/tools/verify-flash.mjs drives it with a fake that models
// the ROM.

export const BOOT_VID = 0x2E8A;
export const BOOT_PID_RP2040 = 0x0003;
export const BOOT_FILTERS = [{ vendorId: BOOT_VID, productId: BOOT_PID_RP2040 }];

export const MAGIC = 0x431FD10B;
export const CMD = {
  EXCLUSIVE_ACCESS: 0x01,
  REBOOT: 0x02,
  FLASH_ERASE: 0x03,
  READ: 0x84,
  WRITE: 0x05,
  EXIT_XIP: 0x06,
  ENTER_CMD_XIP: 0x07,
};
export const REQ = { RESET: 0x41, CMD_STATUS: 0x42 };
export const EXCLUSIVE = { NO: 0, YES: 1, AND_EJECT: 2 };
export const STATUS_TEXT = [
  'ok', 'unknown command', 'invalid command length', 'invalid transfer length', 'invalid address',
  'bad alignment', 'interleaved write', 'rebooting', 'unknown error', 'invalid state', 'not permitted',
  'invalid argument', 'buffer too small', 'precondition not met', 'modified data', 'invalid data',
  'not found', 'unsupported modification',
];

export const SRAM_END_RP2040 = 0x20042000;
export const SECTOR = 4096;
export const PAGE = 256;

const CMD_TIMEOUT_MS = 3000;
const DATA_TIMEOUT_MS = 10000;

const hex = (n) => '0x' + (n >>> 0).toString(16).padStart(8, '0');

/** The 32-byte command block. `args` is at most 16 bytes. */
export function encodeCommand({ token, id, args = new Uint8Array(0), transferLength = 0 }) {
  if (args.length > 16) throw new Error('PICOBOOT arguments are at most 16 bytes');
  const out = new Uint8Array(32);
  const v = new DataView(out.buffer);
  v.setUint32(0, MAGIC, true);
  v.setUint32(4, token >>> 0, true);
  out[8] = id;
  out[9] = args.length;
  v.setUint32(12, transferLength >>> 0, true);
  out.set(args, 16);
  return out;
}

const u32s = (...words) => {
  const b = new Uint8Array(words.length * 4);
  const v = new DataView(b.buffer);
  words.forEach((w, i) => v.setUint32(i * 4, w >>> 0, true));
  return b;
};

/**
 * The PICOBOOT interface on a WebUSB device: the vendor-class (0xff)
 * interface with one bulk OUT and one bulk IN endpoint. Returns null when the
 * device has none - a badge running the controller firmware, say.
 */
export function findPicoboot(device) {
  for (const config of device.configurations ?? []) {
    for (const iface of config.interfaces ?? []) {
      for (const alt of iface.alternates ?? []) {
        if (alt.interfaceClass !== 0xFF) continue;
        const bulk = (alt.endpoints ?? []).filter(e => e.type === 'bulk');
        const out = bulk.find(e => e.direction === 'out');
        const inp = bulk.find(e => e.direction === 'in');
        if (!out || !inp) continue;
        return {
          configurationValue: config.configurationValue,
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          outEp: out.endpointNumber,
          inEp: inp.endpointNumber,
        };
      }
    }
  }
  return null;
}

export class PicobootError extends Error {
  constructor(message, { status, cmd } = {}) {
    super(message);
    this.name = 'PicobootError';
    this.status = status;
    this.cmd = cmd;
  }
}

function withTimeout(promise, ms, what) {
  let timer;
  const bomb = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new PicobootError(`${what}: no reply in ${ms} ms`)), ms);
  });
  return Promise.race([promise, bomb]).finally(() => clearTimeout(timer));
}

export class Picoboot {
  constructor(device) {
    this.device = device;
    this.iface = null;
    this.token = 1;
    this.log = () => {};
  }

  /** Open the device, claim the PICOBOOT interface, reset its state machine. */
  async open() {
    const d = this.device;
    if (!d.opened) await d.open();
    const iface = findPicoboot(d);
    if (!iface) throw new PicobootError('this device has no PICOBOOT interface - is the badge in the bootloader?');
    if (!d.configuration || d.configuration.configurationValue !== iface.configurationValue) {
      await d.selectConfiguration(iface.configurationValue);
    }
    await d.claimInterface(iface.interfaceNumber);
    this.iface = iface;
    await this.reset();
    return iface;
  }

  async close() {
    const d = this.device;
    if (this.iface) {
      try { await d.releaseInterface(this.iface.interfaceNumber); } catch { /* the board may already be gone */ }
      this.iface = null;
    }
    try { if (d.opened) await d.close(); } catch { /* likewise */ }
  }

  /** PICOBOOT_IF_RESET: clear halts, abort anything in flight, reset the queue. */
  async reset() {
    const { interfaceNumber, inEp, outEp } = this.iface;
    for (const [dir, ep] of [['in', inEp], ['out', outEp]]) {
      try { await this.device.clearHalt(dir, ep); } catch { /* not halted, or cannot tell */ }
    }
    const r = await this.device.controlTransferOut({
      requestType: 'vendor', recipient: 'interface', request: REQ.RESET, value: 0, index: interfaceNumber,
    });
    if (r.status !== 'ok') throw new PicobootError(`interface reset: ${r.status}`);
  }

  /** PICOBOOT_IF_CMD_STATUS: why the last command stalled. */
  async status() {
    const r = await this.device.controlTransferIn({
      requestType: 'vendor', recipient: 'interface', request: REQ.CMD_STATUS, value: 0, index: this.iface.interfaceNumber,
    }, 16);
    if (r.status !== 'ok' || r.data.byteLength < 16) throw new PicobootError(`command status: ${r.status}`);
    const v = r.data;
    return { token: v.getUint32(0, true), status: v.getUint32(4, true), cmd: v.getUint8(8), inProgress: !!v.getUint8(9) };
  }

  async exclusiveAccess(level = EXCLUSIVE.YES) {
    this.log(`EXCLUSIVE_ACCESS ${level}`);
    await this._cmd(CMD.EXCLUSIVE_ACCESS, new Uint8Array([level]));
  }

  async exitXip() {
    this.log('EXIT_XIP');
    await this._cmd(CMD.EXIT_XIP);
  }

  async enterCmdXip() {
    this.log('ENTER_CMD_XIP');
    await this._cmd(CMD.ENTER_CMD_XIP);
  }

  async flashErase(addr, size) {
    if (addr % SECTOR || size % SECTOR) throw new PicobootError(`erase ${hex(addr)}+${size} is not sector-aligned`);
    this.log(`FLASH_ERASE ${hex(addr)}+${hex(size)}`);
    await this._cmd(CMD.FLASH_ERASE, u32s(addr, size));
  }

  async write(addr, data) {
    if (addr % PAGE || data.length % PAGE) throw new PicobootError(`write ${hex(addr)}+${data.length} is not page-aligned`);
    this.log(`WRITE ${hex(addr)}+${hex(data.length)}`);
    await this._cmd(CMD.WRITE, u32s(addr, data.length), { data });
  }

  async read(addr, size) {
    this.log(`READ ${hex(addr)}+${hex(size)}`);
    return this._cmd(CMD.READ, u32s(addr, size), { length: size });
  }

  /** pc 0 boots flash; the delay lets the ack reach the host first. */
  async reboot(pc = 0, sp = SRAM_END_RP2040, delayMs = 500) {
    this.log(`REBOOT ${hex(pc)} ${hex(sp)} ${delayMs} ms`);
    await this._cmd(CMD.REBOOT, u32s(pc, sp, delayMs));
  }

  async _cmd(id, args = new Uint8Array(0), { data = null, length = 0 } = {}) {
    const d = this.device;
    const { inEp, outEp } = this.iface;
    const isIn = !!(id & 0x80);
    const transferLength = isIn ? length : (data ? data.length : 0);
    const token = this.token++;
    const block = encodeCommand({ token, id, args, transferLength });
    const name = Object.entries(CMD).find(([, v]) => v === id)?.[0] ?? hex(id);

    const sent = await withTimeout(d.transferOut(outEp, block), CMD_TIMEOUT_MS, name);
    if (sent.status !== 'ok' || sent.bytesWritten !== 32) await this._fail(name, sent.status, 'command');

    let result = null;
    if (transferLength) {
      if (isIn) {
        const r = await withTimeout(d.transferIn(inEp, transferLength), DATA_TIMEOUT_MS, `${name} data`);
        if (r.status !== 'ok') await this._fail(name, r.status, 'data');
        if (r.data.byteLength !== transferLength) {
          throw new PicobootError(`${name}: got ${r.data.byteLength} of ${transferLength} bytes`, { cmd: id });
        }
        result = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      } else {
        const r = await withTimeout(d.transferOut(outEp, data), DATA_TIMEOUT_MS, `${name} data`);
        if (r.status !== 'ok') await this._fail(name, r.status, 'data');
        if (r.bytesWritten !== transferLength) {
          throw new PicobootError(`${name}: sent ${r.bytesWritten} of ${transferLength} bytes`, { cmd: id });
        }
      }
    }

    // the ack: an empty packet in the direction opposite to the data
    const ackTimeout = transferLength ? CMD_TIMEOUT_MS : DATA_TIMEOUT_MS;
    const ack = isIn
      ? await withTimeout(d.transferOut(outEp, new Uint8Array(1)), ackTimeout, `${name} ack`)
      : await withTimeout(d.transferIn(inEp, 1), ackTimeout, `${name} ack`);
    if (ack.status !== 'ok') await this._fail(name, ack.status, 'ack');
    return result;
  }

  async _fail(name, transferStatus, phase) {
    let why = `${transferStatus} during ${phase}`;
    let status;
    try {
      const s = await this.status();
      status = s.status;
      why = `${STATUS_TEXT[s.status] ?? `status ${s.status}`} (${transferStatus} during ${phase})`;
    } catch { /* no status either */ }
    try { await this.reset(); } catch { /* best effort */ }
    throw new PicobootError(`${name}: ${why}`, { status });
  }
}

/**
 * Write a planned image (src/uf2.js planSectors) to flash, read it back,
 * and reboot the board into it.
 *
 *   onProgress({ phase: 'erase'|'write'|'verify'|'reboot', done, total, addr })
 */
export async function flashSectors(conn, sectors, { onProgress = () => {}, verify = true } = {}) {
  const total = sectors.length;
  await conn.exclusiveAccess(EXCLUSIVE.YES);
  await conn.exitXip();
  for (let i = 0; i < total; i++) {
    const { addr, data } = sectors[i];
    onProgress({ phase: 'erase', done: i, total, addr });
    await conn.flashErase(addr, SECTOR);
    onProgress({ phase: 'write', done: i, total, addr });
    await conn.write(addr, data);
  }
  onProgress({ phase: 'write', done: total, total });
  if (verify) {
    for (let i = 0; i < total; i++) {
      const { addr, data } = sectors[i];
      onProgress({ phase: 'verify', done: i, total, addr });
      const back = await conn.read(addr, data.length);
      for (let k = 0; k < data.length; k++) {
        if (back[k] !== data[k]) {
          throw new PicobootError(`verify: ${hex(addr + k)} reads ${hex(back[k]).slice(-2)}, wrote ${hex(data[k]).slice(-2)}`);
        }
      }
    }
    onProgress({ phase: 'verify', done: total, total });
  }
  onProgress({ phase: 'reboot', done: total, total });
  await conn.reboot(0, SRAM_END_RP2040, 500);
}

export { hex };
