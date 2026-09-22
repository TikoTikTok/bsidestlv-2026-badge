// Tiny pixel-grid helper shared by the sprite generators.
// Guarantees every emitted row is exactly `w` characters wide.
export class Grid {
  constructor(w = 16, h = 16, fill = '.') {
    this.w = w; this.h = h;
    this.px = Array.from({ length: h }, () => Array(w).fill(fill));
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c;
    return this;
  }
  get(x, y) { return this.px[Math.round(y)]?.[Math.round(x)]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  frame(x, y, w, h, c) {
    for (let i = 0; i < w; i++) { this.set(x + i, y, c); this.set(x + i, y + h - 1, c); }
    for (let j = 0; j < h; j++) { this.set(x, y + j, c); this.set(x + w - 1, y + j, c); }
    return this;
  }
  hline(x, y, len, c) { for (let i = 0; i < len; i++) this.set(x + i, y, c); return this; }
  vline(x, y, len, c) { for (let j = 0; j < len; j++) this.set(x, y + j, c); return this; }
  dots(list, c) { for (const [x, y] of list) this.set(x, y, c); return this; }
  // Stamp an ASCII pattern; '.' in the pattern means "leave what's there".
  blit(rows, ox = 0, oy = 0, transparent = ' ') {
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== transparent) this.set(ox + i, oy + j, ch); }));
    return this;
  }
  clone() { const g = new Grid(this.w, this.h); g.px = this.px.map(r => r.slice()); return g; }
  rows() { return this.px.map(r => r.join('')); }
}

// --- shape primitives, added for the character rebuild --------------------
// Curves beat hand-counted rows: a face drawn as an ellipse stays round when
// you nudge it by a pixel, ASCII art does not.

Grid.prototype.ellipse = function (cx, cy, rx, ry, c, { from = -Infinity, to = Infinity } = {}) {
  for (let y = Math.max(0, Math.ceil(cy - ry)); y <= Math.min(this.h - 1, Math.floor(cy + ry)); y++) {
    if (y < from || y > to) continue;
    for (let x = Math.max(0, Math.ceil(cx - rx)); x <= Math.min(this.w - 1, Math.floor(cx + rx)); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) this.set(x, y, c);
    }
  }
  return this;
};

/** Vertically swept shape: width goes from wTop at yTop to wBot at yBot. */
Grid.prototype.taper = function (cx, yTop, yBot, wTop, wBot, c, curve = 1) {
  for (let y = yTop; y <= yBot; y++) {
    const t = (y - yTop) / Math.max(1, yBot - yTop);
    const half = (wTop + (wBot - wTop) * Math.pow(t, curve)) / 2;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) this.set(x, y, c);
  }
  return this;
};

Grid.prototype.poly = function (points, c) {
  const ys = points.map(p => p[1]);
  for (let y = Math.max(0, Math.ceil(Math.min(...ys))); y <= Math.min(this.h - 1, Math.floor(Math.max(...ys))); y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y))
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2)
      for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.set(x, y, c);
  }
  return this;
};

Grid.prototype.line = function (x1, y1, x2, y2, c, thick = 1) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + ((x2 - x1) * i) / steps);
    const y = Math.round(y1 + ((y2 - y1) * i) / steps);
    for (let t = 0; t < thick; t++) this.set(x + t, y, c);
  }
  return this;
};

/** Replace one character with another everywhere (cheap palette-swap on masks). */
Grid.prototype.swap = function (from, to) {
  for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
    if (this.get(x, y) === from) this.set(x, y, to);
  return this;
};

/** Mirror the left half onto the right - used for symmetric faces and bosses. */
Grid.prototype.mirrorRight = function () {
  for (let y = 0; y < this.h; y++)
    for (let x = 0; x < Math.floor(this.w / 2); x++)
      this.set(this.w - 1 - x, y, this.get(x, y));
  return this;
};

/** Shift the whole image (used for walk-cycle bob). */
Grid.prototype.shifted = function (dx, dy) {
  const g = new Grid(this.w, this.h);
  for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
    const v = this.get(x, y);
    if (v !== '.') g.set(x + dx, y + dy, v);
  }
  return g;
};
