// Bakes every sprite to PNG: a packed atlas + JSON frame map for the game,
// individual frame PNGs, and a 4x contact sheet for eyeballing the art.
// Pure node - hand-rolled PNG encoder, no dependencies.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PALETTE } from '../legacy/assets/palette.js';
import { SPRITES, GROUPS } from '../legacy/assets/sprites.js';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** rgba: Uint8Array of w*h*4 */
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                                  // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4)
      .copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

class Surface {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4); }
  px(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.d[o] = r; this.d[o + 1] = g; this.d[o + 2] = b; this.d[o + 3] = a;
  }
  fill(r, g, b, a = 255) { for (let i = 0; i < this.w * this.h; i++) { this.d[i * 4] = r; this.d[i * 4 + 1] = g; this.d[i * 4 + 2] = b; this.d[i * 4 + 3] = a; } }
  rect(x, y, w, h, r, g, b, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, r, g, b, a); }
  png() { return encodePNG(this.w, this.h, this.d); }
}

const hexToRGB = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

function stamp(surface, rows, ox, oy, scale = 1) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const hex = PALETTE[ch];
    if (!hex) return;
    const [r, g, b] = hexToRGB(hex);
    for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++)
      surface.px(ox + x * scale + i, oy + y * scale + j, r, g, b, 255);
  }));
}

const out = new URL('../legacy/dist/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(new URL('./frames/', out), { recursive: true });

// ---- packed atlas (row-major, 16px grid, 32px sprites take two cells) ----
const entries = [];
for (const [id, s] of Object.entries(SPRITES))
  s.frames.forEach((rows, i) => entries.push({ id, i, rows, w: s.w, h: s.h }));

const COLS = 16, CELL = 32;
const atlasW = COLS * CELL;
const atlasH = Math.ceil(entries.length / COLS) * CELL;
const atlas = new Surface(atlasW, atlasH);
const map = {};
entries.forEach((e, n) => {
  const x = (n % COLS) * CELL, y = Math.floor(n / COLS) * CELL;
  stamp(atlas, e.rows, x, y, 1);
  (map[e.id] ||= { w: e.w, h: e.h, frames: [] }).frames[e.i] = { x, y, w: e.w, h: e.h };
  writeFileSync(new URL(`./frames/${e.id}_${e.i}.png`, out), (() => {
    const s = new Surface(e.w, e.h); stamp(s, e.rows, 0, 0, 1); return s.png();
  })());
});
writeFileSync(new URL('./atlas.png', out), atlas.png());
writeFileSync(new URL('./atlas.json', out), JSON.stringify({ cell: CELL, sprites: map }, null, 2));

// ---- contact sheet: 4x, grouped, checkered background ----
const SC = 4, PAD = 6;
let sheetRows = [];
for (const group of GROUPS) {
  for (const [id, s] of Object.entries(group.set)) sheetRows.push({ id, s, group: group.label });
}
const perRow = 8;
const cellW = 32 * SC + PAD * 2, cellH = 32 * SC + PAD * 2;
const sheetW = perRow * cellW;
const sheetH = Math.ceil(sheetRows.length / perRow) * cellH;
const sheet = new Surface(sheetW, sheetH);
sheet.fill(0x12, 0x18, 0x24);
sheetRows.forEach((item, n) => {
  const cx = (n % perRow) * cellW, cy = Math.floor(n / perRow) * cellH;
  for (let j = 0; j < cellH; j++) for (let i = 0; i < cellW; i++) {
    const on = (Math.floor(i / 8) + Math.floor(j / 8)) % 2 === 0;
    sheet.px(cx + i, cy + j, on ? 0x1b : 0x24, on ? 0x24 : 0x2e, on ? 0x36 : 0x42);
  }
  const rows = item.s.frames[0];
  const ox = cx + PAD + ((32 - item.s.w) * SC) / 2;
  const oy = cy + PAD + ((32 - item.s.h) * SC) / 2;
  stamp(sheet, rows, ox, oy, SC);
});
writeFileSync(new URL('./contact-sheet.png', out), sheet.png());

console.log(`atlas ${atlasW}x${atlasH}, ${entries.length} frames -> dist/atlas.png`);
console.log(`contact sheet ${sheetW}x${sheetH} -> dist/contact-sheet.png`);
