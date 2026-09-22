// Render one or more sprites big, on a checker, for eyeballing.
// Usage: node tools/preview.mjs out.png 6 alice rabbit queen
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PALETTE } from '../assets/palette.js';
import { SPRITES } from '../assets/sprites.js';

const [, , outPath = 'preview.png', scaleArg = '6', ...ids] = process.argv;
const SC = +scaleArg;
const list = ids.length ? ids : Object.keys(SPRITES);

const frames = [];
for (const id of list) SPRITES[id].frames.forEach((rows, i) => frames.push({ id, i, rows, s: SPRITES[id] }));

const cellW = Math.max(...frames.map(f => f.s.w)) * SC + 8;
const cellH = Math.max(...frames.map(f => f.s.h)) * SC + 8;
const cols = Math.min(frames.length, 8);
const rowsN = Math.ceil(frames.length / cols);
const W = cols * cellW, H = rowsN * cellH;
const px = new Uint8Array(W * H * 4);

const put = (x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
  put(x, y, on ? 0x1b : 0x25, on ? 0x24 : 0x2f, on ? 0x36 : 0x44);
}
frames.forEach((f, n) => {
  const ox = (n % cols) * cellW + 4, oy = Math.floor(n / cols) * cellH + 4;
  f.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const hex = PALETTE[ch];
    if (!hex) return;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    for (let j = 0; j < SC; j++) for (let i = 0; i < SC; i++) put(ox + x * SC + i, oy + y * SC + j, r, g, b);
  }));
});

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); return Buffer.concat([l, body, c]); };
const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(outPath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log(`${outPath}: ${W}x${H}, ${frames.length} frames`);
