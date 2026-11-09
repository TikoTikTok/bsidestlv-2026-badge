// Alice in AI Land - UF2 images, read the way the RP2040's bootloader reads
// them.
//
// A UF2 is a train of 512-byte blocks, each carrying up to 476 bytes of
// payload and the flash address it belongs at. The Pico SDK writes 256-byte
// payloads, one flash page each, back to back from 0x10000000. The bootloader
// erases flash in 4096-byte sectors and programs it in 256-byte pages, so
// before anything goes over USB the blocks are folded into whole sectors:
// that is what planSectors() returns, and what src/picoboot.js writes.
//
// This mirrors inspect_uf2() in software/tools/flash-badge.py; the two should
// agree on what counts as a UF2 for this badge.

export const UF2_MAGIC0 = 0x0A324655;
export const UF2_MAGIC1 = 0x9E5D5157;
export const UF2_MAGIC_END = 0x0AB16F30;
export const UF2_FLAG_NOT_MAIN_FLASH = 0x0001;
export const UF2_FLAG_FAMILY_ID = 0x2000;

export const FAMILY = {
  0xE48BFF56: 'RP2040',
  0xE48BFF59: 'RP2350 (ARM-S)',
  0xE48BFF5A: 'RP2350 (RISC-V)',
  0xE48BFF5B: 'RP2350 (ARM-NS)',
};
export const RP2040_FAMILY = 0xE48BFF56;

export const FLASH_BASE = 0x10000000;
export const FLASH_END = 0x11000000;     // 16 MB of address space; the badge's W25Q128 fills it
export const PAGE = 256;
export const SECTOR = 4096;

const hex = (n) => '0x' + (n >>> 0).toString(16).padStart(8, '0');

/**
 * Parse a UF2 and check it is one this badge can take.
 * Returns { blocks: [{ addr, data }], family, familyName, bytes } with the
 * blocks sorted by address. Throws with a reason a person can act on.
 */
export function parseUf2(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length === 0 || bytes.length % 512) {
    throw new Error(`not a UF2: ${bytes.length} bytes is not a multiple of 512`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.length / 512;
  const blocks = [];
  let family = null;
  for (let i = 0; i < count; i++) {
    const o = i * 512;
    const m0 = view.getUint32(o, true), m1 = view.getUint32(o + 4, true), end = view.getUint32(o + 508, true);
    if (m0 !== UF2_MAGIC0 || m1 !== UF2_MAGIC1 || end !== UF2_MAGIC_END) {
      throw new Error(`not a UF2: bad magic in block ${i}`);
    }
    const flags = view.getUint32(o + 8, true);
    const addr = view.getUint32(o + 12, true);
    const size = view.getUint32(o + 16, true);
    const blockNo = view.getUint32(o + 20, true);
    const numBlocks = view.getUint32(o + 24, true);
    const fam = view.getUint32(o + 28, true);
    if (numBlocks !== count) throw new Error(`UF2 declares ${numBlocks} blocks but holds ${count} - truncated download?`);
    if (blockNo !== i) throw new Error(`UF2 block ${i} is numbered ${blockNo}`);
    if (flags & UF2_FLAG_NOT_MAIN_FLASH) continue;
    const thisFam = (flags & UF2_FLAG_FAMILY_ID) ? fam : 0;
    if (family === null) family = thisFam;
    else if (family !== thisFam) throw new Error(`UF2 mixes families (${hex(family)} and ${hex(thisFam)})`);
    if (size === 0 || size > 476) throw new Error(`UF2 block ${i} carries ${size} bytes`);
    if (size % PAGE || addr % PAGE) throw new Error(`UF2 block ${i} (${size} bytes at ${hex(addr)}) is not page-aligned`);
    if (addr < FLASH_BASE || addr + size > FLASH_END) throw new Error(`UF2 block ${i} targets ${hex(addr)}, which is not flash`);
    blocks.push({ addr, data: bytes.slice(o + 32, o + 32 + size) });
  }
  if (!blocks.length) throw new Error('UF2 holds no flash blocks');
  if (family !== RP2040_FAMILY) {
    const name = FAMILY[family] ?? (family ? hex(family) : 'no family');
    throw new Error(`this image is for ${name}, the badge is an RP2040`);
  }
  blocks.sort((a, b) => a.addr - b.addr);
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].addr < blocks[i - 1].addr + blocks[i - 1].data.length) {
      throw new Error(`UF2 blocks overlap at ${hex(blocks[i].addr)}`);
    }
  }
  return { blocks, family, familyName: FAMILY[family], bytes: blocks.reduce((n, b) => n + b.data.length, 0) };
}

/**
 * Fold the blocks into whole 4096-byte sectors, in address order. Bytes no
 * block covers are 0xFF - what an erased sector reads as, so a hole costs
 * nothing and a read-back compares equal.
 */
export function planSectors({ blocks }) {
  const sectors = new Map();
  for (const { addr, data } of blocks) {
    let off = 0;
    while (off < data.length) {
      const base = (addr + off) & ~(SECTOR - 1);
      let sector = sectors.get(base);
      if (!sector) { sector = new Uint8Array(SECTOR).fill(0xFF); sectors.set(base, sector); }
      const at = addr + off - base;
      const n = Math.min(SECTOR - at, data.length - off);
      sector.set(data.subarray(off, off + n), at);
      off += n;
    }
  }
  return [...sectors.keys()].sort((a, b) => a - b).map(addr => ({ addr, data: sectors.get(addr) }));
}

/** The address span an image covers, for the log. */
export function describe(image) {
  const first = image.blocks[0].addr;
  const last = image.blocks[image.blocks.length - 1];
  return `${image.blocks.length} blocks, ${image.bytes} bytes, ${hex(first)}-${hex(last.addr + last.data.length)}`;
}

export { hex };
