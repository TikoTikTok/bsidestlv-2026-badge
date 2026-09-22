// Sanity-check every sprite: rectangular rows, known palette chars.
// Run: node tools/validate.mjs
import { PALETTE } from '../legacy/assets/palette.js';
import { SPRITES } from '../legacy/assets/sprites.js';

let errors = 0, frames = 0, sprites = 0;
const known = new Set(Object.keys(PALETTE));

for (const [id, s] of Object.entries(SPRITES)) {
  sprites++;
  s.frames.forEach((rows, fi) => {
    frames++;
    if (rows.length !== s.h) {
      console.error(`${id}[${fi}]: has ${rows.length} rows, expected ${s.h}`);
      errors++;
    }
    rows.forEach((row, ri) => {
      if (row.length !== s.w) {
        console.error(`${id}[${fi}] row ${ri}: len ${row.length}, expected ${s.w}  |${row}|`);
        errors++;
      }
      for (const ch of row) {
        if (!known.has(ch)) {
          console.error(`${id}[${fi}] row ${ri}: unknown palette char '${ch}'`);
          errors++;
        }
      }
    });
  });
  for (const [name, idxs] of Object.entries(s.anim || {})) {
    for (const i of idxs) {
      if (i < 0 || i >= s.frames.length) {
        console.error(`${id}: anim '${name}' references missing frame ${i}`);
        errors++;
      }
    }
  }
}

console.log(`${sprites} sprites, ${frames} frames, ${errors} errors`);
process.exit(errors ? 1 : 0);
