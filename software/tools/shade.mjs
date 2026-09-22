// Turns a flat material mask into shaded pixel art.
//
// The mask says WHAT each pixel is ('H' hair, 'F' face, 'D' dress...). This
// decides HOW it is lit, by one rule copied from the reference art:
//   - the outer silhouette is the material's own darkest tone (never black),
//   - a pixel whose neighbour above/left is a different material catches light,
//   - a pixel whose neighbour below/right is a different material falls to shadow,
//   - everything else is base tone.
// So a face is round without anyone hand-picking 300 pixels.

import { RAMP_KEYS } from '../assets/palette.js';

/** mats({ H: 'hair' }) -> { H: auto hair, h: hair forced to shadow } */
export function mats(spec) {
  const out = {};
  for (const [ch, ramp] of Object.entries(spec)) {
    out[ch] = { ramp };
    const lower = ch.toLowerCase();
    if (lower !== ch && !(lower in spec)) out[lower] = { ramp, tone: 1 };
  }
  return out;
}

/** flats({ E: 'u' }) -> characters that skip shading and emit a palette char. */
export function flats(spec) {
  const out = {};
  for (const [ch, key] of Object.entries(spec)) out[ch] = { flat: key };
  return out;
}

export function shade(grid, spec) {
  const w = grid.w, h = grid.h;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : grid.get(x, y));
  const rampOf = (ch) => spec[ch]?.ramp ?? null;

  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const ch = at(x, y);
      const def = spec[ch];
      if (ch === '.' || !def) { row += '.'; continue; }
      if (def.flat) { row += def.flat; continue; }

      const keys = RAMP_KEYS[def.ramp];
      if (!keys) throw new Error(`unknown ramp '${def.ramp}' for mask char '${ch}'`);
      if (def.tone !== undefined) { row += keys[def.tone]; continue; }

      const mine = def.ramp;
      const solid = (nx, ny) => at(nx, ny) !== '.' && !!spec[at(nx, ny)];
      const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      if (edge) { row += keys[0]; continue; }

      const diff = (nx, ny) => rampOf(at(nx, ny)) !== mine;
      const lit = diff(x, y - 1) || diff(x - 1, y) || diff(x - 1, y - 1);
      const dark = diff(x, y + 1) || diff(x + 1, y) || diff(x + 1, y + 1);
      row += lit && !dark ? keys[3] : dark && !lit ? keys[1] : keys[2];
    }
    rows.push(row);
  }
  return rows;
}

/** Emit a sprite entry as source text. */
export function emit(id, sprite) {
  const frames = sprite.frames.map(f => `      [\n${f.map(r => `        '${r}',`).join('\n')}\n      ],`).join('\n');
  return `  ${id}: {
    label: ${JSON.stringify(sprite.label)},
    blurb: ${JSON.stringify(sprite.blurb)},
    w: ${sprite.w}, h: ${sprite.h},${sprite.anim ? `\n    anim: ${JSON.stringify(sprite.anim)},` : ''}${sprite.flip ? `\n    flip: ${JSON.stringify(sprite.flip)},` : ''}${sprite.tags ? `\n    tags: ${JSON.stringify(sprite.tags)},` : ''}
    frames: [
${frames}
    ],
  },`;
}
