#!/usr/bin/env node
// Checks the looks: the manifest against the files it describes, so a look
// that is listed but missing (or shipped but unlisted) fails the deploy
// instead of a phone; and every page against the picker, so a page cannot
// ship without the boot script, the chip, or a touch-screen default. Pages
// with a mode bar must name a button for every panel and for the mode they
// open on. Part of `npm run verify`; see src/looks/index.json, src/looks.js.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dir = resolve(root, 'src/looks');
const problems = [];
const say = (s) => problems.push(s);

// ------------------------------------------------------------ the manifest ----

const manifest = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8'));
const looks = manifest.looks;
if (!Array.isArray(looks) || !looks.length) say('index.json: "looks" must be a non-empty array');

const ids = new Set();
const SHAPES = new Set(['page', 'sheet', 'device', 'dock']);
for (const l of looks ?? []) {
  const at = `look "${l?.id ?? '?'}"`;
  if (!/^[a-z][a-z0-9-]*$/.test(l?.id ?? '')) say(`${at}: id must be a lower-case slug`);
  if (ids.has(l.id)) say(`${at}: duplicate id`);
  ids.add(l.id);
  for (const k of ['label', 'blurb']) if (typeof l[k] !== 'string' || !l[k].trim()) say(`${at}: ${k} is required`);
  if (!Array.isArray(l.swatch) || l.swatch.length !== 2 || !l.swatch.every(c => /^#[0-9a-f]{6}$/i.test(c)))
    say(`${at}: swatch must be two #rrggbb colours (ground, tint)`);
  if (!SHAPES.has(l.shape)) say(`${at}: shape must be one of ${[...SHAPES].join(' | ')}`);
  if (typeof l.phone !== 'boolean') say(`${at}: phone must be true or false`);
  if (l.id !== 'classic') {
    const file = resolve(dir, `${l.id}.css`);
    if (!existsSync(file)) say(`${at}: src/looks/${l.id}.css is missing`);
    else {
      const css = readFileSync(file, 'utf8');
      if (!css.trim()) say(`${at}: src/looks/${l.id}.css is empty`);
      if (!css.includes(`[data-theme=${l.id}]`)) say(`${at}: src/looks/${l.id}.css has no [data-theme=${l.id}] rule`);
    }
  }
}
if (!ids.has('classic')) say('index.json: the "classic" look (styles.css alone) must be listed');

// every shipped look file is listed, so nothing dead rides along
for (const f of readdirSync(dir)) {
  const m = /^([a-z][a-z0-9-]*)\.css$/.exec(f);
  if (m && !ids.has(m[1])) say(`src/looks/${f} is not in index.json`);
}

// --------------------------------------------------------------- the pages ----

const PAGES = ['index.html', 'glitch.html', 'flash.html', 'badge.html'];
const pages = [];
for (const page of PAGES) {
  const html = readFileSync(resolve(root, page), 'utf8');
  const tag = /<html\b[^>]*>/.exec(html)?.[0] ?? '';
  const attr = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
  const theme = attr('data-theme'), touch = attr('data-look-touch'), mode = attr('data-mode');

  if (theme !== 'classic') say(`${page}: <html> must open as data-theme="classic" (src/look-boot.js sets the real one before paint)`);
  if (!touch) say(`${page}: <html> needs data-look-touch="<id>", the look a touch screen opens on`);
  else if (!ids.has(touch)) say(`${page}: data-look-touch="${touch}" is not a listed look`);
  else if (!looks.find(l => l.id === touch)?.phone) say(`${page}: data-look-touch="${touch}" is not a phone look`);
  if (!/<script src="src\/look-boot\.js"><\/script>/.test(html)) say(`${page}: <head> must load src/look-boot.js before the body`);
  if (!/id="lookChip"/.test(html)) say(`${page}: the header needs the look chip (#lookChip)`);
  if (/id="lookSheet"/.test(html)) say(`${page}: the picker sheet is built by src/looks.js; do not put it in the page`);

  // a mode bar: every panel's mode has a button, and the page opens on one of them
  const buttons = [...html.matchAll(/<button[^>]*class="mode[^"]*"[^>]*data-mode="([^"]+)"/g)].map(m => m[1]);
  const panels = [...html.matchAll(/<section class="panel[^"]*"[^>]*data-mode="([^"]+)"/g)].map(m => m[1]);
  if (buttons.length || panels.length || mode) {
    if (!mode) say(`${page}: has a mode bar but <html> names no data-mode to open on`);
    else if (!buttons.includes(mode)) say(`${page}: opens on data-mode="${mode}" but the mode bar has no such button`);
    for (const pm of new Set(panels)) if (!buttons.includes(pm)) say(`${page}: a panel is data-mode="${pm}" but the mode bar has no such button`);
    for (const b of buttons) if (!panels.includes(b)) say(`${page}: the mode bar's "${b}" shows no panel`);
    const bare = [...html.matchAll(/<section class="panel[^"]*"(?![^>]*data-mode=)/g)].length;
    if (bare) say(`${page}: ${bare} panel(s) carry no data-mode and would stay on screen in every mode`);
  }
  pages.push({ page, touch, mode, modes: buttons });
}

// ---------------------------------------------------------------- report ----

console.log('looks');
for (const l of looks ?? []) console.log(`  ${l.id.padEnd(9)} ${String(l.shape).padEnd(7)} ${l.phone ? 'phone' : 'desk '} ${l.id === 'classic' ? 'styles.css alone' : `src/looks/${l.id}.css`}`);
console.log('pages');
for (const p of pages) console.log(`  ${p.page.padEnd(12)} touch default ${String(p.touch).padEnd(9)} ${p.mode ? `opens on ${p.mode}; modes ${p.modes.join(' ')}` : 'no mode bar'}`);
if (problems.length) {
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log('\nlooks: the manifest, the files and the pages agree');
