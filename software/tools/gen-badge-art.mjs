#!/usr/bin/env node
// The badge as the player sees it, read off the board: writes src/badge-shape.js
// (the outline, every button, the LED and the USB-C) from
// hardware/badge/PhoneController.kicad_pcb, so the picture the pages use to
// say "press this" is the real board and follows it when it changes.
//
//   node software/tools/gen-badge-art.mjs            # rewrite src/badge-shape.js
//   node software/tools/gen-badge-art.mjs --check    # exit 1 if it is out of date (verify-badge.mjs runs this)
//
// What is read: the Edge.Cuts polygon of the outline footprint (the mushroom,
// the Caterpillar and the stalk, one closed contour), every SW footprint with
// the BTN_* net on its pads (which is the one truth of which switch is which
// - the silkscreen letters agree), the status LED and the USB-C.
//
// The view is the player's. The switches sit on the back copper, the side
// the player holds against their thumbs: the silkscreen there reads LEFT on
// the left and UP above DOWN only when the board is looked at from the back
// with the stalk - the USB-C plug - pointing up, into the phone. So x is
// mirrored and y kept: view x = -board x, view y = board y. That puts the
// d-pad under the left thumb, X / A / B / Y under the right (Nintendo's
// diamond: X up, A right, B down, Y left), START left of SELECT below them,
// and the two shoulders at the top - where the board's nets put BTN_SR on
// the left and BTN_SL on the right (they were named from the front). The
// firmware wires BTN_SL to the pin it calls SL, so the page's SL *is* the
// right-hand shoulder; the picture says so rather than the usual.
//
// Node only, no dependencies, like every tool here.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const PCB = resolve(root, 'hardware/badge/PhoneController.kicad_pcb');
const OUT = resolve(root, 'src/badge-shape.js');
const check = process.argv.includes('--check');

const src = readFileSync(PCB, 'utf8');

// ------------------------------------------------------------- s-expressions ----
// Just enough: every top-level-or-nested block that starts with "(<head>", by
// paren matching (strings in a KiCad file never hold an unbalanced paren).

function blocks(s, head) {
  const out = [];
  let i = 0;
  for (;;) {
    const j = s.indexOf('(' + head, i);
    if (j < 0) break;
    let depth = 0, k = j;
    for (; k < s.length; k++) {
      const c = s[k];
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    out.push(s.slice(j, k + 1));
    i = k + 1;
  }
  return out;
}
const num = (s) => Math.round(parseFloat(s) * 1000) / 1000;
const at = (b) => { const m = /\n\t\t\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)/.exec(b); return m ? { x: num(m[1]), y: num(m[2]), rot: m[3] ? num(m[3]) : 0 } : null; };
const prop = (b, name) => new RegExp(`\\(property "${name}" "([^"]*)"`).exec(b)?.[1] ?? null;
const nets = (b) => new Set([...b.matchAll(/\(net \d+ "([^"]+)"\)/g)].map(m => m[1]));

// ------------------------------------------------------------------ the parts ----

const NAMES = {
  BTN_UP: 'UP', BTN_DN: 'DOWN', BTN_LT: 'LEFT', BTN_RT: 'RIGHT',
  BTN_A: 'A', BTN_B: 'B', BTN_X: 'X', BTN_Y: 'Y',
  BTN_SL: 'SL', BTN_SR: 'SR', BTN_STRT: 'START', BTN_SLCT: 'SELECT',
  '~{USB_BOOT}': 'BOOT', RUN: 'RESET',
};

const footprints = blocks(src, 'footprint "');
const keys = {};
let led = null, usb = null, outline = null;
for (const fp of footprints) {
  const ref = prop(fp, 'Reference') ?? '';
  const pos = at(fp);
  if (!pos) continue;
  if (/^SW\d+$/.test(ref)) {
    const name = [...nets(fp)].map(n => NAMES[n]).find(Boolean);
    if (!name) throw new Error(`${ref}: no button net on its pads`);
    if (keys[name]) throw new Error(`${name}: both ${keys[name].ref} and ${ref}`);
    keys[name] = { ref, x: -pos.x, y: pos.y };
  } else if (ref === 'D1') {
    led = { x: -pos.x, y: pos.y };
  } else if (ref === 'USB1') {
    usb = { x: -pos.x, y: pos.y };
  } else if (fp.includes('(layer "Edge.Cuts")')) {
    const poly = blocks(fp, 'fp_poly').find(p => p.includes('(layer "Edge.Cuts")'));
    if (!poly) continue;
    if (outline) throw new Error('two outline footprints');
    outline = [...poly.matchAll(/\(xy ([-\d.]+) ([-\d.]+)\)/g)].map(m => ({ x: -(pos.x + num(m[1])), y: pos.y + num(m[2]) }));
  }
}
for (const name of Object.values(NAMES)) if (!keys[name]) throw new Error(`no switch found for ${name}`);
if (!led || !usb || !outline) throw new Error('missing the LED, the USB-C or the outline');

// ----------------------------------------------------------------- the outline ----
// Ramer-Douglas-Peucker to a fifth of a millimetre: the fab's curve has 712
// points, the picture needs a few hundred bytes less.

function simplify(pts, tol) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = 0, idx = -1;
    const ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i].y) - (ax - pts[i].x) * (by - ay)) / len;
      if (d > far) { far = d; idx = i; }
    }
    if (far > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const pts = simplify(outline, 0.2);
const f = (n) => String(Math.round(n * 100) / 100);
const path = 'M' + pts.map(p => `${f(p.x)} ${f(p.y)}`).join('L') + 'Z';
const box = pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }),
                       { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });

// the cap: the part under the thumbs, from the shoulders to just under
// SELECT / START, as wide as the shoulders are apart plus a margin
const ky = Object.values(keys).map(k => k.y), kx = Object.values(keys).map(k => k.x);
const cap = { x0: Math.min(...kx) - 6, y0: Math.min(...ky) - 5, x1: Math.max(...kx) + 6, y1: Math.max(...ky) + 6 };

// ------------------------------------------------------------------- the file ----

const line = (k) => `  ${k.padEnd(6)}: { x: ${f(keys[k].x).padStart(6)}, y: ${f(keys[k].y).padStart(5)} },  // ${keys[k].ref}`;
const ORDER = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'X', 'A', 'B', 'Y', 'SL', 'SR', 'START', 'SELECT', 'BOOT', 'RESET'];
const text = `// Alice in AI Land - the badge's shape, as the player holds it.
//
// GENERATED by software/tools/gen-badge-art.mjs from
// hardware/badge/PhoneController.kicad_pcb - do not edit; re-run the tool
// when the board changes (verify-badge.mjs fails when this file is stale).
//
// Millimetres, in the player's view: the board looked at from the back (the
// side with the switches) with the stalk - the USB-C plug - pointing up into
// the phone. So x = -(board x), y = board y, and y grows downwards as in SVG.
// The d-pad is under the left thumb, the X / A / B / Y diamond under the
// right (X up, A right, B down, Y left), START left of SELECT below them,
// the two shoulders at the top: SR on the left and SL on the right - that is
// how the board's nets wire them, and the firmware follows the nets.
// src/prompt.js draws it.

/** The outline, one closed path: the Caterpillar's mushroom, its stalk, and the smoke. ${pts.length} points. */
export const OUTLINE = '${path}';

/** The outline's bounds. */
export const BOX = { x0: ${f(box.x0)}, y0: ${f(box.y0)}, x1: ${f(box.x1)}, y1: ${f(box.y1)} };

/** The cap: the part the thumbs cover, shoulders to SELECT / START. */
export const CAP = { x0: ${f(cap.x0)}, y0: ${f(cap.y0)}, x1: ${f(cap.x1)}, y1: ${f(cap.y1)} };

/** Where each switch sits (its centre). BOOT and RESET are the two tiny ones at the cap's edge. */
export const KEYS = {
${ORDER.map(line).join('\n')}
};

/** The status LED, between the two diamonds. */
export const LED = { x: ${f(led.x)}, y: ${f(led.y)} };

/** The USB-C plug at the tip of the stalk. */
export const USB = { x: ${f(usb.x)}, y: ${f(usb.y)} };
`;

if (check) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';   // a Windows checkout may hold CRLF
  if (have !== text) { console.error(`src/badge-shape.js is out of date: run node software/tools/gen-badge-art.mjs`); process.exit(1); }
  console.log(`src/badge-shape.js is in step with the board (${pts.length} outline points, ${Object.keys(keys).length} switches)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote src/badge-shape.js: ${pts.length} outline points (from ${outline.length}), ${Object.keys(keys).length} switches, box ${f(box.x0)}..${f(box.x1)} x ${f(box.y0)}..${f(box.y1)} mm`);
}
