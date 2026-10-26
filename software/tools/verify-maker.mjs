#!/usr/bin/env node
// Checks the level maker: src/level.js's judgement against the shipped
// stages and a few rooms built by hand (lint catches what it should, the
// module it writes reads back as the same room, a link carries it); that
// maker.html keeps the editor to a checkout (class dev-only) and the landing
// to the site (class site-only); and the community's rooms - every one
// listed in stages/community/index.json exists, is well formed and solves,
// and nothing in that folder goes unlisted. Part of `npm run verify`.
//
//   node software/tools/verify-maker.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { blank, setCell, resize, lint, check, kindOf, toModule, fromModule, encodeShare, decodeShare, idOf, normalize } from '../../src/level.js';
import { TEA_PARTY } from '../../stages/tea-party.js';
import { QUEENS_GAUNTLET } from '../../stages/queens-gauntlet.js';

const root = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
let failed = 0;
const fail = (m) => { failed++; console.error(`  FAIL ${m}`); };
const ok = (c, m) => { if (c) console.log(`  ok   ${m}`); else fail(m); };
const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

// ------------------------------------------------------------- the judgement ----
console.log('the maker judges the shipped stages as the verifiers do');
{
  const tea = check(TEA_PARTY);
  ok(tea.ok && tea.kind === 'tea' && tea.par === 106, `the tea party: untimed, par ${tea.par} (106)`);
  ok(tea.notes.includes('the gate is load-bearing'), 'the tea party: the gate is load-bearing');
  const chase = check(QUEENS_GAUNTLET);
  ok(chase.ok && chase.kind === 'chase' && chase.par === 64, `the gauntlet: timed, par ${chase.par} (64)`);
  ok(chase.notes.some(n => /costs 23 tick/.test(n)), 'the gauntlet: the cast costs 23 ticks over an empty room');
}

console.log('lint says what is wrong, and nothing when nothing is');
{
  const b = blank(9, 7);
  ok(lint(b).length === 1 && /no rock/.test(lint(b)[0]), 'a blank room is a walk, not a puzzle');
  let l = setCell(setCell(b, 3, 3, 'O'), 5, 3, 'b');
  ok(lint(l).length === 0, 'a rock and a button make it well formed');
  ok(check(l).ok && check(l).par === 10, `and solvable in ${check(l).par} moves`);
  ok(lint(setCell(l, 2, 2, 'O')).some(p => /rock\(s\) but/.test(p)), 'a spare rock is reported');
  ok(lint(setCell(l, 4, 0, '.')).some(p => /top and bottom/.test(p)), 'a hole in the top wall is reported');
  ok(lint({ ...l, rows: l.rows.map((r, i) => (i === 2 ? r + '.' : r)) }).some(p => /same length/.test(p)), 'a ragged row is reported');
  ok(lint(setCell(l, 6, 2, 'G')).some(p => /no lever/.test(p)), 'a gate without a lever is reported');
  ok(lint({ ...l, rows: l.rows.map(r => r.replace('D', '.')) }).some(p => /one door/.test(p)), 'a missing door is reported');
  const walled = setCell(setCell(l, 1, 1, '.'), 1, 2, 'A');
  const boxed = setCell(setCell(setCell(walled, 2, 2, '#'), 1, 3, '#'), 2, 1, '#');
  const r = check(boxed);
  ok(!r.ok && /unsolvable/.test(r.problems[0]), 'Alice walled in is unsolvable, and says so');
  // Alice and the door are single: painting another moves the first
  const moved = setCell(l, 4, 4, 'A');
  ok(moved.rows.join('').split('A').length === 2 && moved.rows[4][4] === 'A', 'painting Alice elsewhere moves her');
  const big = resize(l, 12, 9);
  ok(big.rows.length === 9 && big.rows.every(r => r.length === 12) && big.rows[3][3] === 'O' && lint(big).length === 0, 'resizing keeps the room and walls the new edge');
  const small = resize(l, 6, 7);
  ok(small.rows.every(r => r.length === 6) && lint(small).some(p => /rock\(s\) but/.test(p)), 'shrinking over a button is reported, not hidden');
  // routes
  const timed = { ...l, tickMs: 320, hazards: [{ id: 'queen', route: [[1, 5], [7, 5]], sight: 3 }] };
  ok(lint(timed).length === 0 && kindOf(timed) === 'chase', 'a hazard on a straight loop makes a timed room');
  ok(lint({ ...timed, hazards: [{ id: 'queen', route: [[1, 5], [7, 4]] }] }).some(p => /not in a line/.test(p)), 'a diagonal route is reported');
  ok(lint({ ...timed, hazards: [{ id: 'queen', route: [[1, 5], [1, 0]] }] }).some(p => /through a wall/.test(p)), 'a route through a wall is reported');
  ok(lint({ ...timed, hazards: [{ id: 'queen', route: [[1, 5]] }] }).some(p => /two points/.test(p)), 'a one-point route is reported');
  const tr = check(timed);
  ok(tr.ok && tr.kind === 'chase' && tr.par >= 10, `the timed room solves in ${tr.par} ticks`);
}

console.log('the module the maker writes reads back as the same room, and so does a link');
for (const stage of [TEA_PARTY, QUEENS_GAUNTLET]) {
  const src = toModule(stage, { author: 'the verifier' });
  const back = await fromModule(src);
  ok(same(back, stage), `${stage.name}: toModule -> fromModule is the identity`);
  ok(/^\/\/ Stage: /.test(src) && src.includes('// By the verifier') && src.includes('#  wall'), `${stage.name}: the module carries the header and the legend`);
  ok(same(decodeShare(encodeShare(stage)), stage), `${stage.name}: encodeShare -> decodeShare is the identity`);
  ok(/^[A-Za-z0-9_-]+$/.test(encodeShare(stage)), `${stage.name}: the share token is URL-safe`);
}
ok(idOf({ name: "The Queen's Gauntlet" }) === 'the-queens-gauntlet', 'the id of a name drops the apostrophe');
try { await fromModule('export const X = 1;'); fail('a module with no stage should be refused'); } catch (e) { ok(/no stage/.test(e.message), 'a module with no stage is refused'); }

// ------------------------------------------------------------------ the page ----
console.log('maker.html keeps the editor to a checkout and the landing to the site');
{
  const html = readFileSync(resolve(root, 'maker.html'), 'utf8');
  for (const id of ['editPanel', 'playPanel', 'exportPanel'])
    ok(new RegExp(`<section class="panel dev-only" id="${id}">`).test(html), `#${id} is class dev-only`);
  ok(/id="padDevice" class="pad-device dev-only"/.test(html), 'the controller name in the header is dev-only');
  ok((html.match(/class="panel site-only"/g) ?? []).length >= 3, 'the landing prose panels are class site-only');
  ok(/<section class="panel hero" id="hero">/.test(html), 'the hero is on both faces');
  for (const id of ['aiDialog', 'aiPrompt', 'aiCopy', 'aiClaude', 'aiChatGPT', 'aiBtn', 'repoClone', 'docsLink'])
    ok(new RegExp(`id="${id}"`).test(html), `the invitation has #${id}`);
  ok(!/id="modes"/.test(html), 'no mode bar: the maker is one column in the phone looks');
  const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
  ok(/html\[data-host=dev\] \.site-only \{ display: none !important; \}/.test(css), 'styles.css hides .site-only on a dev host');
  ok(/<link rel="stylesheet" href="src\/maker\.css">/.test(html), 'the page loads src/maker.css');
  const js = readFileSync(resolve(root, 'src/maker.js'), 'utf8');
  ok(/const dev = mode === 'dev'/.test(js) && /if \(!dev\) \{/.test(js) && /new Pad\(\{ sources: sourcesFor\(true\) \}\)/.test(js), 'the pad with every source is built on a dev host only');
  ok(/stages\/community\/index\.json/.test(js), 'the maker lists the community rooms');
  ok(/maker\.html/.test(readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8')), 'pages.yml publishes maker.html');
  const makerCss = readFileSync(resolve(root, 'src/maker.css'), 'utf8');
  ok(!/data-theme=|data-flip/.test(makerCss), 'src/maker.css paints from the variables and never names a theme or the turn');
}

// ------------------------------------------------------------- the community ----
console.log('the community\'s rooms');
{
  const dir = resolve(root, 'stages/community');
  const index = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8'));
  const listed = new Set();
  ok(Array.isArray(index.stages), 'stages/community/index.json has a "stages" list');
  for (const s of index.stages ?? []) {
    const at = `community "${s?.id ?? '?'}"`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s?.id ?? '')) { fail(`${at}: id must be a lower-case slug`); continue; }
    if (listed.has(s.id)) fail(`${at}: duplicate id`);
    listed.add(s.id);
    for (const k of ['name', 'author']) if (typeof s[k] !== 'string' || !s[k].trim()) fail(`${at}: ${k} is required`);
    const file = resolve(dir, `${s.id}.js`);
    if (!existsSync(file)) { fail(`${at}: stages/community/${s.id}.js is missing`); continue; }
    let stage;
    try {
      const mod = await import(pathToFileURL(file).href);
      stage = Object.values(mod).find(v => v && Array.isArray(v.rows));
    } catch (e) { fail(`${at}: ${e.message}`); continue; }
    if (!stage) { fail(`${at}: exports no stage`); continue; }
    const problems = lint(stage);
    for (const p of problems) fail(`${at}: ${p}`);
    if (problems.length) continue;
    if (s.kind && s.kind !== kindOf(stage)) fail(`${at}: listed as ${s.kind} but the module is ${kindOf(stage)}`);
    const r = check(stage, { limit: 2_000_000 });
    if (!r.ok) for (const p of r.problems) fail(`${at}: ${p}`);
    else ok(true, `${at}: ${stage.name}, ${kindOf(stage)}, par ${r.par}`);
  }
  for (const f of readdirSync(dir)) {
    const m = /^([a-z0-9][a-z0-9-]*)\.js$/.exec(f);
    if (f.endsWith('.js') && !m) fail(`stages/community/${f}: the file name must be a lower-case slug`);
    if (m && !listed.has(m[1])) fail(`stages/community/${f} is not in index.json`);
  }
  ok(true, `${listed.size} community room(s) listed`);
}

if (failed) { console.error(`verify-maker: ${failed} failure(s)`); process.exit(1); }
console.log('verify-maker: the maker judges, writes and reads rooms as the site does');
