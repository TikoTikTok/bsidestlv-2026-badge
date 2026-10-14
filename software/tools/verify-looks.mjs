#!/usr/bin/env node
// Checks the looks and the themes: each manifest against the files it
// describes, so a look or theme that is listed but missing (or shipped but
// unlisted) fails the deploy instead of a phone; that a theme only paints and
// a look only shapes (a theme file never names data-look, a look file never
// data-theme); and every page against the picker, so a page cannot ship
// without the boot script, the chip, a touch-screen look or a default theme.
// Pages with a mode bar must name a button for every panel and for the mode
// they open on. Part of `npm run verify`; see src/looks/index.json,
// src/themes/index.json, src/looks.js.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const problems = [];
const say = (s) => problems.push(s);
const slug = /^[a-z][a-z0-9-]*$/;
const hex = /^#[0-9a-f]{6}$/i;

// ----------------------------------------------------------- the manifests ----

function manifest(kind, dir, list, check) {
  const at0 = `src/${dir}/index.json`;
  const items = JSON.parse(readFileSync(resolve(root, 'src', dir, 'index.json'), 'utf8'))[list];
  if (!Array.isArray(items) || !items.length) { say(`${at0}: "${list}" must be a non-empty array`); return { items: [], ids: new Set() }; }
  const ids = new Set();
  for (const it of items) {
    const at = `${kind} "${it?.id ?? '?'}"`;
    if (!slug.test(it?.id ?? '')) say(`${at}: id must be a lower-case slug`);
    if (ids.has(it.id)) say(`${at}: duplicate id`);
    ids.add(it.id);
    for (const k of ['label', 'blurb']) if (typeof it[k] !== 'string' || !it[k].trim()) say(`${at}: ${k} is required`);
    check(it, at);
    if (it.id === 'classic') continue;    // styles.css alone, no file of its own
    const file = resolve(root, 'src', dir, `${it.id}.css`);
    if (!existsSync(file)) { say(`${at}: src/${dir}/${it.id}.css is missing`); continue; }
    const css = readFileSync(file, 'utf8');
    if (!css.trim()) say(`${at}: src/${dir}/${it.id}.css is empty`);
    if (!css.includes(`[data-${kind}=${it.id}]`)) say(`${at}: src/${dir}/${it.id}.css has no [data-${kind}=${it.id}] rule`);
    const other = kind === 'look' ? 'theme' : 'look';
    if (css.includes(`[data-${other}=`)) say(`${at}: src/${dir}/${it.id}.css names data-${other}; a ${kind} ${kind === 'look' ? 'shapes' : 'paints'} and leaves the ${other} alone`);
  }
  if (!ids.has('classic')) say(`${at0}: the "classic" ${kind} (styles.css alone) must be listed`);
  // every shipped file is listed, so nothing dead rides along
  for (const f of readdirSync(resolve(root, 'src', dir))) {
    const m = /^([a-z][a-z0-9-]*)\.css$/.exec(f);
    if (m && !ids.has(m[1])) say(`src/${dir}/${f} is not in ${at0}`);
  }
  return { items, ids };
}

const SHAPES = new Set(['page', 'sheet', 'device', 'dock']);
const looks = manifest('look', 'looks', 'looks', (l, at) => {
  if (!SHAPES.has(l.shape)) say(`${at}: shape must be one of ${[...SHAPES].join(' | ')}`);
  if (typeof l.phone !== 'boolean') say(`${at}: phone must be true or false`);
  if ('padAlwaysOut' in l && typeof l.padAlwaysOut !== 'boolean') say(`${at}: padAlwaysOut must be true or false`);
});
const themes = manifest('theme', 'themes', 'themes', (t, at) => {
  if (!Array.isArray(t.swatch) || t.swatch.length !== 5 || !t.swatch.every(c => hex.test(c)))
    say(`${at}: swatch must be five #rrggbb colours (page, panel, accent, good, text)`);
});

// --------------------------------------------------------------- the pages ----

const PAGES = ['index.html', 'glitch.html', 'flash.html', 'badge.html'];
const pages = [];
for (const page of PAGES) {
  const html = readFileSync(resolve(root, page), 'utf8');
  const tag = /<html\b[^>]*>/.exec(html)?.[0] ?? '';
  const attr = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
  const look = attr('data-look'), theme = attr('data-theme'), touch = attr('data-look-touch'), dflt = attr('data-theme-default'), mode = attr('data-mode');

  if (look !== 'classic') say(`${page}: <html> must open as data-look="classic" (src/look-boot.js sets the real one before paint)`);
  if (theme !== 'classic') say(`${page}: <html> must open as data-theme="classic" (src/look-boot.js sets the real one before paint)`);
  if (!touch) say(`${page}: <html> needs data-look-touch="<id>", the look a touch screen opens on`);
  else if (!looks.ids.has(touch)) say(`${page}: data-look-touch="${touch}" is not a listed look`);
  else if (!looks.items.find(l => l.id === touch)?.phone) say(`${page}: data-look-touch="${touch}" is not a phone look`);
  if (!dflt) say(`${page}: <html> needs data-theme-default="<id>", the theme the page opens on`);
  else if (!themes.ids.has(dflt)) say(`${page}: data-theme-default="${dflt}" is not a listed theme`);
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
  pages.push({ page, touch, dflt, mode, modes: buttons });
}
if (new Set(pages.map(p => p.dflt)).size > 1) say(`the pages open on different default themes: ${pages.map(p => `${p.page} ${p.dflt}`).join(', ')}`);

// ----------------------------------------------------- the phone upside down ----
// src/tilt.js turns the page by data-flip="180" on <html>; the rule lives in
// styles.css (shared by every look), the boot script honours the remembered
// hand switch before paint, and the sheet carries the switch. A look or a
// theme never names data-flip: the turn is the same whatever the page wears.

const src = (p) => readFileSync(resolve(root, p), 'utf8');
if (!/html\[data-flip="180"\] body \{[^}]*transform: rotate\(180deg\)/.test(src('styles.css'))) say('styles.css: no html[data-flip="180"] body rule turning the page');
if (!/html\[data-flip="180"\] dialog \{[^}]*rotate\(180deg\)/.test(src('styles.css'))) say('styles.css: dialogs live in the top layer and must turn by themselves');
if (!/alice\.flip/.test(src('src/look-boot.js'))) say('src/look-boot.js: must honour localStorage alice.flip before paint');
if (!/data-flip="180"|dataset\.flip = '180'/.test(src('src/look-boot.js'))) say('src/look-boot.js: must set data-flip="180" for a remembered turn');
if (!/flip-chip/.test(src('src/looks.js')) || !/tilt\.manual = v/.test(src('src/looks.js'))) say('src/looks.js: the sheet needs the turn-over switch (flip-chip) setting tilt.manual');
for (const [kind, dir] of [['look', 'looks'], ['theme', 'themes']])
  for (const f of readdirSync(resolve(root, 'src', dir)))
    if (f.endsWith('.css') && /data-flip/.test(src(`src/${dir}/${f}`))) say(`src/${dir}/${f}: a ${kind} must not name data-flip; the turn is styles.css's`);

// ---------------------------------------------------------------- report ----

console.log('looks');
for (const l of looks.items) console.log(`  ${l.id.padEnd(9)} ${String(l.shape).padEnd(7)} ${l.phone ? 'phone' : 'desk '} ${l.id === 'classic' ? 'styles.css alone' : `src/looks/${l.id}.css`}`);
console.log('themes');
for (const t of themes.items) console.log(`  ${t.id.padEnd(9)} ${(t.swatch ?? []).slice(0, 3).join(' ')} ${t.id === 'classic' ? 'styles.css alone' : `src/themes/${t.id}.css`}`);
console.log('pages');
for (const p of pages) console.log(`  ${p.page.padEnd(12)} opens ${String(p.dflt).padEnd(9)} touch ${String(p.touch).padEnd(9)} ${p.mode ? `on ${p.mode}; modes ${p.modes.join(' ')}` : 'no mode bar'}`);
if (problems.length) {
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log('\nlooks and themes: the manifests, the files and the pages agree');
