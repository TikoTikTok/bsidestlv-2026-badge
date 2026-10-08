#!/usr/bin/env node
// Checks the glitch range's looks manifest against the files it describes,
// so a look that is listed but missing (or shipped but unlisted) fails the
// deploy instead of a phone. Part of `npm run verify`; see src/looks/index.json.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dir = resolve(root, 'src/looks');
const problems = [];
const say = (s) => problems.push(s);

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

// the page's touch-screen default names a listed phone look
const html = readFileSync(resolve(root, 'glitch.html'), 'utf8');
const touch = /data-look-touch="([^"]*)"/.exec(html)?.[1];
if (!touch) say('glitch.html: <html> needs data-look-touch="<id>"');
else if (!ids.has(touch)) say(`glitch.html: data-look-touch="${touch}" is not a listed look`);
else if (!looks.find(l => l.id === touch)?.phone) say(`glitch.html: data-look-touch="${touch}" is not a phone look`);

console.log('looks');
for (const l of looks ?? []) console.log(`  ${l.id.padEnd(9)} ${String(l.shape).padEnd(7)} ${l.phone ? 'phone' : 'desk '} ${l.id === 'classic' ? 'styles.css alone' : `src/looks/${l.id}.css`}`);
console.log(`  touch-screen default: ${touch}`);
if (problems.length) {
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log('\nlooks: the manifest and the files agree');
