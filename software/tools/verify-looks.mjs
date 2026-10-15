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

// ------------------------------------------------------------- the page turn ----
// src/tilt.js turns the page by data-flip on <html> when the phone is upside
// down: 180 when the OS left the page alone, 90 or 270 when auto-rotate took
// it to landscape on the way round and stopped there. The rules live in
// styles.css (shared by every look), the boot script honours the remembered
// hand switch before paint by the same arithmetic, and the sheet carries the
// switch. A look or a theme never names data-flip: the turn is the same
// whatever the page wears. Every page must reach src/tilt.js from its own
// module (it listens from load, no pad or gate needed), and on iOS the first
// tap on the ◐ chip must be the one that asks for the sensors.

const src = (p) => readFileSync(resolve(root, p), 'utf8');
const css = src('styles.css');
const rule = (sel, body, what) => { if (!new RegExp(`${sel.replace(/[.[\]"()]/g, '\\$&')} \\{[^}]*${body}`).test(css)) say(`styles.css: ${what}`); };
rule('html[data-flip="180"] body', 'transform: rotate\\(180deg\\)', 'no html[data-flip="180"] body rule turning the page a half turn');
rule('html[data-flip] body', 'position: fixed', 'the turned body must be a fixed box (fixed descendants turn with it)');
rule('html[data-flip]', 'overflow: hidden', 'the root must hide its overflow while turned, else the body\'s is propagated to the viewport and the body never scrolls');
rule('html[data-flip="90"] body, html[data-flip="270"] body', 'width: 100dvh; height: 100dvw', 'a quarter-turned body must be the viewport\'s height wide and its width tall (the OS parked the page in landscape)');
rule('html[data-flip="90"] body', 'rotate\\(90deg\\)', 'no html[data-flip="90"] body rule: a phone whose OS went to landscape on the way round needs a quarter turn on');
rule('html[data-flip="270"] body', 'rotate\\(-90deg\\)', 'no html[data-flip="270"] body rule: the other landscape needs a quarter turn back');
rule('html[data-flip="180"] dialog', 'rotate\\(180deg\\)', 'dialogs live in the top layer and must turn by themselves');
rule('html[data-flip="90"] dialog', 'rotate\\(90deg\\)', 'dialogs must turn a quarter too');
rule('html[data-flip="270"] dialog', 'rotate\\(-90deg\\)', 'dialogs must turn a quarter back too');
rule('html[data-flip="180"] .look-sheet', 'inset: 0 0 auto 0', 'the looks sheet must move to the top edge, the player\'s bottom once turned a half turn');
rule('html[data-flip="90"] .look-sheet', 'left: 0', 'the looks sheet must move to the left edge, the player\'s bottom under a quarter turn on');
rule('html[data-flip="270"] .look-sheet', 'left: 100%', 'the looks sheet must move to the right edge, the player\'s bottom under a quarter turn back');
rule('html[data-flip="90"] .gate, html[data-flip="270"] .gate', '92dvh', 'a quarter-turned gate dialog is sized by the viewport\'s height');
rule('html[data-flip="180"] .bar', 'safe-area-inset-bottom', 'the header must pad for the notch at its new end (safe-area-inset-bottom)');
rule('html[data-flip="180"] .touchpad', 'safe-area-inset-top', 'the on-screen pad must pad for the notch at its new end (safe-area-inset-top)');
rule('html[data-flip="90"] .bar', 'safe-area-inset-right', 'under a quarter turn on the header is at the viewport\'s right edge (safe-area-inset-right)');
rule('html[data-flip="90"] .touchpad', 'safe-area-inset-left', 'under a quarter turn on the notch is at the viewport\'s left edge (safe-area-inset-left)');
rule('html[data-flip="270"] .bar', 'safe-area-inset-left', 'under a quarter turn back the header is at the viewport\'s left edge (safe-area-inset-left)');
rule('html[data-flip="270"] .touchpad', 'safe-area-inset-right', 'under a quarter turn back the notch is at the viewport\'s right edge (safe-area-inset-right)');
rule('html[data-flip="90"] .gate-ways, html[data-flip="270"] .gate-ways', 'grid-template-columns: 1fr', 'a quarter-turned page sits in a landscape viewport, so the phone breakpoints must be forced (the gate\'s two ways in one column)');
const bootJs = src('src/look-boot.js');
if (!/alice\.flip/.test(bootJs)) say('src/look-boot.js: must honour localStorage alice.flip before paint');
if (!/screen\.orientation/.test(bootJs) || !/dataset\.flip = String\(turn\)/.test(bootJs)) say('src/look-boot.js: must set data-flip to the turn a remembered half turn still needs (180, or 90 / 270 when the page is in landscape), from screen.orientation');
const looksJs = src('src/looks.js');
if (!/flip-chip/.test(looksJs) || !/tilt\.manual = v/.test(looksJs)) say('src/looks.js: the sheet needs the page-turn switch (flip-chip) setting tilt.manual');
if (!/'Page turn'/.test(looksJs)) say('src/looks.js: the switch is about the page, and must say so ("Page turn")');
if (!/chip\?\.addEventListener\('click', [^\n]*tilt\.request\(\)/.test(looksJs)) say('src/looks.js: the ◐ chip must ask iOS for the sensors (tilt.request) on its tap');
const tiltJs = src('src/tilt.js');
if (!/^if \(globalThis\.document\) \{[^}]*tilt\.start\(\)/m.test(tiltJs)) say('src/tilt.js: must start listening when loaded in a browser, not wait for a pad or a gate');
if (!/tilt\.request\(\)/.test(src('src/gate.js'))) say('src/gate.js: the gate\'s Connect tap must ask iOS for the sensors');
if (!/tilt\.request\(\)/.test(src('src/glitch.js'))) say('src/glitch.js: a tap on the on-screen pad must ask iOS for the sensors');
for (const page of PAGES) {
  const mod = /<script type="module" src="([^"]+)"><\/script>/.exec(src(page))?.[1];
  if (!mod) { say(`${page}: loads no module script`); continue; }
  const seen = new Set();
  const reaches = (file) => {
    if (seen.has(file)) return false;
    seen.add(file);
    if (file === 'src/tilt.js') return true;
    const text = src(file);
    return [...text.matchAll(/from '\.\/([a-z-]+\.js)'/g)].some(m => reaches(`src/${m[1]}`));
  };
  if (!reaches(mod)) say(`${page}: ${mod} never reaches src/tilt.js, so the page would not turn with the phone`);
}
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
