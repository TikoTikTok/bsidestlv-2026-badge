// A model of the RP2040 ROM bootloader with WebUSB's shape, for exercising
// src/picoboot.js without a board: verify-flash.mjs runs the flasher through
// it under Node, and flash.html takes one through window.__flash.useDevice()
// so the page can be driven in a browser with nothing plugged in.
//
// It keeps the ROM's rules (bootrom/async_task.c): a 32-byte command with
// the magic; data in the direction the command id's top bit says; an empty
// ack the other way; erase, write and read of flash only after EXIT_XIP,
// sector-aligned erases, page-aligned transfers, addresses inside flash.
// Break one and the endpoint stalls and the status request says why, like
// the ROM. Programming can only clear bits, like the chip.

import { MAGIC, CMD, REQ, STATUS_TEXT, SECTOR, PAGE } from '../../src/picoboot.js';
import { FLASH_BASE, FLASH_END } from '../../src/uf2.js';

const STATUS = Object.fromEntries(STATUS_TEXT.map((t, i) => [t, i]));

export class FakeBootloader {
  constructor({ delayMs = 0 } = {}) {
    this.vendorId = 0x2E8A;
    this.productId = 0x0003;
    this.manufacturerName = 'Raspberry Pi';
    this.productName = 'RP2 Boot';
    this.serialNumber = 'E0C9125B0D9B';
    this.opened = false;
    this.configuration = null;
    this.configurations = [{
      configurationValue: 1,
      interfaces: [
        { interfaceNumber: 0, alternates: [{ alternateSetting: 0, interfaceClass: 0x08, endpoints: [
          { endpointNumber: 1, direction: 'out', type: 'bulk' }, { endpointNumber: 2, direction: 'in', type: 'bulk' }] }] },
        { interfaceNumber: 1, alternates: [{ alternateSetting: 0, interfaceClass: 0xFF, endpoints: [
          { endpointNumber: 3, direction: 'out', type: 'bulk' }, { endpointNumber: 4, direction: 'in', type: 'bulk' }] }] },
      ],
    }];
    this.delayMs = delayMs;        // per transfer, so a page shows its progress bar moving
    this.claimed = new Set();
    this.flash = new Map();        // sector base -> Uint8Array(4096); absent = never touched, reads 0xFF
    this.erased = [];
    this.writes = [];
    this.commands = [];
    this.exclusive = 0;
    this.xip = 'active';           // 'active' | 'exited' | 'cmd'
    this.halted = new Set();
    this.pending = null;           // the command waiting for its data or its ack
    this.lastStatus = { token: 0, status: 0, cmd: 0, inProgress: 0 };
    this.rebooted = null;
    this.resets = 0;
    this.corruptAt = null;         // an address whose read-back lies, for the verify test
  }

  async _tick() { if (this.delayMs) await new Promise(r => setTimeout(r, this.delayMs)); }

  async open() { this.opened = true; }
  async close() { this.opened = false; }
  async selectConfiguration(v) { this.configuration = this.configurations.find(c => c.configurationValue === v); }
  async claimInterface(n) {
    if (!this.configuration) throw new Error('no configuration selected');
    this.claimed.add(n);
  }
  async releaseInterface(n) { this.claimed.delete(n); }
  async clearHalt(dir, ep) { this.halted.delete(ep); }

  async controlTransferOut(setup) {
    if (setup.requestType !== 'vendor' || setup.recipient !== 'interface' || setup.index !== 1) throw new Error('bad control setup');
    if (setup.request === REQ.RESET) { this.resets++; this.pending = null; this.halted.clear(); return { status: 'ok', bytesWritten: 0 }; }
    return { status: 'stall', bytesWritten: 0 };
  }
  async controlTransferIn(setup, length) {
    if (setup.request !== REQ.CMD_STATUS || length !== 16) return { status: 'stall', data: new DataView(new ArrayBuffer(0)) };
    const v = new DataView(new ArrayBuffer(16));
    v.setUint32(0, this.lastStatus.token, true);
    v.setUint32(4, this.lastStatus.status, true);
    v.setUint8(8, this.lastStatus.cmd);
    v.setUint8(9, this.lastStatus.inProgress);
    return { status: 'ok', data: v };
  }

  _stall(ep, status, cmd = this.pending?.id ?? 0, token = this.pending?.token ?? 0) {
    this.lastStatus = { token, status, cmd, inProgress: 0 };
    this.halted.add(ep);
    this.pending = null;
    return { status: 'stall', bytesWritten: 0, data: new DataView(new ArrayBuffer(0)) };
  }

  async transferOut(ep, bytes) {
    if (!this.claimed.has(1)) throw new Error('interface 1 not claimed');
    if (ep !== 3) throw new Error(`OUT on endpoint ${ep}`);
    await this._tick();
    if (this.halted.has(3)) return { status: 'stall', bytesWritten: 0 };
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

    if (this.pending?.phase === 'data') return this._takeData(data);
    if (this.pending?.phase === 'ack-out') {
      // picotool sends one byte here; the ROM takes any OUT packet as the ack
      this.pending = null;
      return { status: 'ok', bytesWritten: data.length };
    }
    if (this.pending) return this._stall(3, STATUS['invalid state']);

    if (data.length !== 32) return this._stall(3, STATUS['invalid command length']);
    const v = new DataView(data.buffer, data.byteOffset, 32);
    if (v.getUint32(0, true) !== MAGIC) return this._stall(3, STATUS['unknown command']);
    const cmd = { token: v.getUint32(4, true), id: data[8], size: data[9], len: v.getUint32(12, true),
                  args: new DataView(data.buffer.slice(data.byteOffset + 16, data.byteOffset + 32)) };
    this.commands.push(cmd.id);
    const bad = this._check(cmd);
    if (bad) return this._stall(3, bad, cmd.id, cmd.token);
    this.pending = cmd;
    if (cmd.id & 0x80) { cmd.phase = 'data-in'; cmd.reply = this._execute(cmd); }
    else if (cmd.len) { cmd.phase = 'data'; cmd.buf = new Uint8Array(cmd.len); cmd.got = 0; }
    else { this._execute(cmd); cmd.phase = 'ack-in'; }
    return { status: 'ok', bytesWritten: 32 };
  }

  async transferIn(ep, length) {
    if (!this.claimed.has(1)) throw new Error('interface 1 not claimed');
    if (ep !== 4) throw new Error(`IN on endpoint ${ep}`);
    await this._tick();
    if (this.halted.has(4)) return { status: 'stall', data: new DataView(new ArrayBuffer(0)) };
    const p = this.pending;
    if (p?.phase === 'data-in') {
      const out = p.reply.subarray(0, Math.min(length, p.reply.length));
      p.reply = p.reply.subarray(out.length);
      if (!p.reply.length) p.phase = 'ack-out';
      return { status: 'ok', data: new DataView(out.slice().buffer) };
    }
    if (p?.phase === 'ack-in') {
      this.pending = null;
      return { status: 'ok', data: new DataView(new ArrayBuffer(0)) };   // the empty packet
    }
    return this._stall(4, STATUS['invalid state']);
  }

  _takeData(data) {
    const p = this.pending;
    const n = Math.min(data.length, p.len - p.got);
    p.buf.set(data.subarray(0, n), p.got);
    p.got += n;
    if (p.got === p.len) {
      const bad = this._execute(p);
      if (bad) return this._stall(3, bad);
      p.phase = 'ack-in';
    }
    return { status: 'ok', bytesWritten: n };
  }

  _check(cmd) {
    const arg = (i) => cmd.args.getUint32(i * 4, true);
    const inFlash = (a) => a >= FLASH_BASE && a < FLASH_END;
    switch (cmd.id) {
      case CMD.EXCLUSIVE_ACCESS: return cmd.size === 1 ? 0 : STATUS['invalid command length'];
      case CMD.REBOOT: return cmd.size === 12 ? 0 : STATUS['invalid command length'];
      case CMD.EXIT_XIP: case CMD.ENTER_CMD_XIP: return cmd.size === 0 ? 0 : STATUS['invalid command length'];
      case CMD.FLASH_ERASE: {
        if (cmd.size !== 8) return STATUS['invalid command length'];
        if (this.xip !== 'exited') return STATUS['invalid state'];
        if (arg(0) % SECTOR || arg(1) % SECTOR) return STATUS['bad alignment'];
        if (!inFlash(arg(0)) || !inFlash(arg(0) + arg(1) - 1)) return STATUS['invalid address'];
        return 0;
      }
      case CMD.WRITE: case CMD.READ: {
        if (cmd.size !== 8) return STATUS['invalid command length'];
        if (cmd.len !== arg(1)) return STATUS['invalid transfer length'];
        if (!inFlash(arg(0)) || !inFlash(arg(0) + arg(1) - 1)) return STATUS['invalid address'];
        if (this.xip !== 'exited') return STATUS['invalid state'];
        if (arg(0) % PAGE) return STATUS['bad alignment'];
        return 0;
      }
      default: return STATUS['unknown command'];
    }
  }

  _sector(base) {
    let s = this.flash.get(base);
    if (!s) { s = new Uint8Array(SECTOR).fill(0xFF); this.flash.set(base, s); }
    return s;
  }

  _execute(cmd) {
    const arg = (i) => cmd.args.getUint32(i * 4, true);
    switch (cmd.id) {
      case CMD.EXCLUSIVE_ACCESS: this.exclusive = cmd.args.getUint8(0); return 0;
      case CMD.EXIT_XIP: this.xip = 'exited'; return 0;
      case CMD.ENTER_CMD_XIP: this.xip = 'cmd'; return 0;
      case CMD.REBOOT: this.rebooted = { pc: arg(0), sp: arg(1), delayMs: arg(2) }; return 0;
      case CMD.FLASH_ERASE:
        for (let a = arg(0); a < arg(0) + arg(1); a += SECTOR) { this._sector(a).fill(0xFF); this.erased.push(a); }
        return 0;
      case CMD.WRITE: {
        const addr = arg(0);
        for (let off = 0; off < cmd.buf.length; off++) {
          const a = addr + off;
          const s = this._sector(a & ~(SECTOR - 1));
          s[a & (SECTOR - 1)] &= cmd.buf[off];     // programming only clears bits
        }
        this.writes.push({ addr, len: cmd.buf.length });
        return 0;
      }
      case CMD.READ: {
        const addr = arg(0), len = arg(1);
        const out = new Uint8Array(len);
        for (let k = 0; k < len; k++) {
          const a = addr + k;
          const s = this.flash.get(a & ~(SECTOR - 1));
          out[k] = s ? s[a & (SECTOR - 1)] : 0xFF;
          if (this.corruptAt === a) out[k] ^= 0x01;
        }
        return out;
      }
      default: return STATUS['unknown command'];
    }
  }
}
