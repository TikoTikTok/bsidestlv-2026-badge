// Alice in AI Land - sprite renderer.
// Sprites live as ASCII rows; this bakes them into canvases once and then
// blits them. Nearest-neighbour everywhere - no smoothing, ever.

import { PALETTE, RECOLORS } from '../assets/palette.js';
import { SPRITES } from '../assets/sprites.js';

const cache = new Map();

function makeCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
                                                   : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

/** Bake one frame at 1x into a canvas. `recolor` maps palette keys to new hex. */
export function bakeFrame(id, frame = 0, recolor = null) {
  const key = `${id}|${frame}|${recolor ? JSON.stringify(recolor) : ''}`;
  if (cache.has(key)) return cache.get(key);

  const sprite = SPRITES[id];
  if (!sprite) throw new Error(`unknown sprite: ${id}`);
  const rows = sprite.frames[frame];
  if (!rows) throw new Error(`${id} has no frame ${frame}`);

  const { canvas, ctx } = makeCanvas(sprite.w, sprite.h);
  const img = ctx.createImageData(sprite.w, sprite.h);
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const ch = rows[y][x];
      const hex = (recolor && recolor[ch]) || PALETTE[ch];
      const o = (y * sprite.w + x) * 4;
      if (!hex) { img.data[o + 3] = 0; continue; }
      img.data[o]     = parseInt(hex.slice(1, 3), 16);
      img.data[o + 1] = parseInt(hex.slice(3, 5), 16);
      img.data[o + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, canvas);
  return canvas;
}

/**
 * Draw a sprite frame.
 * opts: { scale, flipX, flipY, rotate (0|90|180|270), recolor (name or map), alpha }
 */
export function drawSprite(ctx, id, frame, x, y, opts = {}) {
  const { scale = 1, flipX = false, flipY = false, rotate = 0, alpha = 1 } = opts;
  const recolor = typeof opts.recolor === 'string' ? RECOLORS[opts.recolor] : opts.recolor;
  const src = bakeFrame(id, frame, recolor && Object.keys(recolor).length ? recolor : null);
  const s = SPRITES[id];
  const w = s.w * scale, h = s.h * scale;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2, y + h / 2);
  if (rotate) ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(flipX ? -scale : scale, flipY ? -scale : scale);
  ctx.drawImage(src, -s.w / 2, -s.h / 2);
  ctx.restore();
}

/** Resolve an animation state to a frame index for a given time. */
export function frameAt(id, state, timeMs, fps = 6) {
  const s = SPRITES[id];
  let seq = s.anim?.[state];
  if (!seq && s.flip?.[state]) seq = s.anim[s.flip[state]];
  if (!seq) seq = [0];
  return seq[Math.floor(timeMs / (1000 / fps)) % seq.length];
}

/** True when the state is drawn by mirroring another state (e.g. left <- side). */
export function needsFlip(id, state) {
  return state === 'left' && !!SPRITES[id]?.flip?.left;
}

/** Fill a rect by tiling a 16x16 tile - used for floors and walls. */
export function fillTiles(ctx, id, frame, x, y, cols, rows, scale = 1) {
  const s = SPRITES[id];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      drawSprite(ctx, id, frame, x + i * s.w * scale, y + j * s.h * scale, { scale });
}

export { SPRITES, PALETTE, RECOLORS };
