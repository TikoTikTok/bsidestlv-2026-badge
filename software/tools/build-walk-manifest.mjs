// Scans a character folder of walk frames and writes the manifest the page reads.
//
// Filenames are <dir><frame>.png in any case: s1.png, N1.png, SW2.png, ne3.png.
// Direction is the longest matching prefix, frame is the trailing number.
// Frame 1 is the standing pose; 2 and 3 are the walk pair.
//
//   node tools/build-walk-manifest.mjs assets/characters/alice2 alice2

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const dir = process.argv[2] ?? 'assets/characters/alice2';
const name = process.argv[3] ?? basename(dir);

const DIRECTIONS = ['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w'];   // longest first
const ORDER = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** Width and height straight out of the PNG header. */
function pngSize(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const found = {};
let size = null;
for (const file of readdirSync(dir)) {
  if (!file.toLowerCase().endsWith('.png')) continue;
  const stem = file.slice(0, -4).toLowerCase();
  const m = stem.match(/^([a-z]+)(\d+)$/);
  if (!m) { console.warn(`skipping ${file}: not <dir><frame>.png`); continue; }
  const [, d, n] = m;
  if (!DIRECTIONS.includes(d)) { console.warn(`skipping ${file}: unknown direction '${d}'`); continue; }
  const dim = pngSize(join(dir, file));
  if (!size) size = dim;
  else if (dim.w !== size.w || dim.h !== size.h)
    throw new Error(`${file} is ${dim.w}x${dim.h}, expected ${size.w}x${size.h} - frames must match`);
  (found[d] ||= [])[+n - 1] = file;
}

const missing = [];
for (const d of ORDER) {
  const frames = found[d];
  if (!frames) { missing.push(`${d} (no frames)`); continue; }
  for (let i = 0; i < 3; i++) if (!frames[i]) missing.push(`${d}${i + 1}`);
}
if (missing.length) throw new Error(`missing frames: ${missing.join(', ')}`);

const manifest = {
  name,
  frameWidth: size.w,
  frameHeight: size.h,
  // stand, step, stand, other step - four beats out of three drawings
  cycle: [0, 1, 0, 2],
  directions: Object.fromEntries(ORDER.map(d => [d.toUpperCase(), found[d]])),
};

writeFileSync(join(dir, `${name}.json`), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${name}.json: ${ORDER.length} directions x 3 frames at ${size.w}x${size.h}`);
