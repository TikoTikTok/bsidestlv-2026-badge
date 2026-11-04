#!/usr/bin/env node
// Checks the level maker: src/level.js's judgement against the shipped
// stages and a few rooms built by hand (lint catches what it should, the
// module it writes reads back as the same room, a link carries it); the
// studio's tools, transforms, analysis, starters and generator; the
// studio's guided builds (MAKER_TUTORIALS) each walked on the events
// src/maker.js emits, every event a step waits on one it tells;
// that maker.html keeps the studio to a checkout (class dev-only) and the
// landing to the site (class site-only); the assistant's bridge (a server on
// a free port, a fake page on its event stream, the round trips, the
// guards) and the MCP server over stdio; and the community's levels - every
// one listed in stages/community/index.json exists, is well formed and
// solves (a room) or is what it claims to be (a glitch range level, judged
// by src/rangecheck.js as the shipped ranges are), and nothing in that
// folder goes unlisted. Part of `npm run verify`.
//
//   node software/tools/verify-maker.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { blank, setCell, resize, lint, check, kindOf, isGlitch, toModule, fromModule, encodeShare, decodeShare, shareUrl, shareInfo,
         SHARE_PARTS, SHARE_LONG, SHARE_TOO_LONG, idOf, normalize,
         lineCells, rectCells, regionCells, paintCells, mirrorCells, flipH, flipV, rotate, shift, analyse, difficulty,
         STARTERS, rng, generate, generateSolvable, lessonToText, lessonFromText } from '../../src/level.js';
import { rangeBlank, RANGE_KINDS, RANGE_FILES, BUDGET } from '../../src/rangecheck.js';
import { stageOf } from '../../src/seal.js';
import { MAKER_TUTORIAL, MAKER_TUTORIALS, Tutor, LESSON_EVENTS, LESSON_TITLES, lessonSteps } from '../../src/tutor.js';
import { startMaker, OPS } from './maker-server.mjs';
import { TEA_PARTY } from '../../stages/tea-party.js';
import { QUEENS_GAUNTLET } from '../../stages/queens-gauntlet.js';
import { RABBIT_WATCH } from '../../stages/rabbit-watch.js';
import { LOOKING_GLASS } from '../../stages/looking-glass.js';
import { CATERPILLAR_LOCK } from '../../stages/caterpillar-lock.js';
import { DORMOUSE_WATCHDOG } from '../../stages/dormouse-watchdog.js';
import { HUMPTY_WALL } from '../../stages/humpty-wall.js';
import { aiPrompt, prPrompt, prParts, prShort, repoParts, indexLineText } from '../../src/invite.js';

const SHIPPED_RANGES = { watch: RABBIT_WATCH, glass: LOOKING_GLASS, lock: CATERPILLAR_LOCK, dog: DORMOUSE_WATCHDOG, wall: HUMPTY_WALL };
/** A shipped range level as the data the maker holds: its range named, the watch's pool on the level. */
const asGlitch = (kind, level) => ({ ...level, range: kind, ...(kind === 'watch' ? { pool: SHIPPED_RANGES.watch.pool } : {}) });

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

// The five ranges' shipped levels, each turned into a glitch level as the
// studio would hold it, reach the verdict verify-range.mjs reaches through
// the same src/rangecheck.js: ok, and the hand as the level is marked.
console.log('the maker judges the shipped ranges\' levels as verify-range does');
{
  for (const kind of RANGE_KINDS) {
    const range = SHIPPED_RANGES[kind];
    for (const shipped of range.levels) {
      const level = asGlitch(kind, shipped);
      const marked = shipped.hand ?? shipped.lineMs >= 2 * BUDGET.HAND_JITTER_MS;
      ok(kindOf(level) === kind && isGlitch(level) && !isGlitch(shipped.rows ? { rows: shipped.rows } : TEA_PARTY), `${kind}/${shipped.id}: kindOf says ${kindOf(level)}; a room is not a glitch level`);
      ok(lint(level).length === 0, `${kind}/${shipped.id}: lint is clean (${lint(level).join('; ')})`);
      const r = check(level);
      ok(r.ok && r.kind === kind && r.hand === marked, `${kind}/${shipped.id}: ok, ${r.hand ? 'a hand level' : 'badge-only'} as marked${r.par ? `, the attacker's cost ${r.par} takes` : ''}`);
      ok(difficulty(r)?.label === (marked ? 'by hand' : 'badge only'), `${kind}/${shipped.id}: the difficulty is the hand / badge word`);
    }
    // one level of each kind round-trips: the module and the link
    const level = asGlitch(kind, range.levels[0]);
    const n = normalize(level);
    ok(n.range === kind && n.id === idOf(level) && !('rows' in n) && !('levels' in n), `${kind}: normalize names the range, derives the id (${n.id}) and drops the range's own map`);
    const src = toModule(level, { author: 'the verifier' });
    const back = await fromModule(src);
    ok(same(back, level) && back.range === kind, `${kind}: toModule -> fromModule is the identity`);
    ok(/^\/\/ Range level: /.test(src) && src.includes(`range: "${kind}"`) && src.includes('// By the verifier') && src.includes(`"kind": "${kind}"`), `${kind}: the module says which range, carries the header and the index line's kind`);
    ok(same(decodeShare(encodeShare(level)), level) && /^[A-Za-z0-9_-]+$/.test(encodeShare(level)), `${kind}: encodeShare -> decodeShare is the identity, URL-safe`);
    const blankLevel = rangeBlank(kind);
    ok(lint(blankLevel).length === 0 && check(blankLevel).ok && check(blankLevel).hand === true, `${kind}: the blank the studio starts from is a hand level (${check(blankLevel).problems.join('; ')})`);
  }
  // a map of its own travels; the range's own does not
  const custom = normalize({ ...asGlitch('lock', CATERPILLAR_LOCK.levels[0]), rows: ['#######', '#.....#', '#A...D#', '#.....#', '#######'] });
  ok(custom.rows?.length === 5 && same(await fromModule(toModule(custom)), custom) && !('rows' in normalize({ ...asGlitch('lock', CATERPILLAR_LOCK.levels[0]), rows: CATERPILLAR_LOCK.rows })), 'a lock level with a map of its own keeps it through the module; the range\'s map is dropped');
  // lint catches what it should
  const glass = asGlitch('glass', LOOKING_GLASS.levels[0]);
  ok(lint({ ...glass, listing: glass.listing.map(l => l.replace(/^!/, ' ')) }).some(p => /exactly one target/.test(p)), 'a glass listing without a target is reported');
  ok(lint({ ...asGlitch('dog', DORMOUSE_WATCHDOG.levels[0]), openMs: 1000, timeoutMs: 1000 }).some(p => /must open/.test(p)), 'a dog whose window opens as it bites is reported');
  ok(lint({ ...asGlitch('wall', HUMPTY_WALL.levels[0]), pool: ['UP', 'DOWN', 'LEFT'], address: ['UP', 'A'] }).some(p => /from the pool/.test(p)), 'a wall address outside the pool is reported');
  ok(lint({ ...asGlitch('watch', RABBIT_WATCH.levels[0]), length: 1 }).some(p => /length must be/.test(p)), 'a watch with a tune of one is reported');
  ok(lint({ range: 'croquet', name: 'x' }).some(p => /range must be one of/.test(p)) && kindOf({ range: 'croquet' }) === 'croquet', 'an unknown range is reported, and is still not a room');
  const liar = check({ ...asGlitch('watch', RABBIT_WATCH.levels[0]), windowMs: 200 });
  ok(!liar.ok && liar.problems.some(p => /marked hand but/.test(p)), 'a hand level given a badge-only window is refused by Check, as in CI');
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

console.log('a room in a link: both spellings, a pasted link, the old token, what is refused, how long it is');
{
  const index = JSON.parse(readFileSync(resolve(root, 'stages/community/index.json'), 'utf8'));
  const community = await Promise.all((index.stages ?? []).map(async (s) =>
    stageOf(await import(pathToFileURL(resolve(root, 'stages/community', `${s.id}.js`)).href))));
  for (const stage of [TEA_PARTY, QUEENS_GAUNTLET, ...community]) {
    for (const format of ['b64', 'json']) {
      const back = decodeShare(encodeShare(stage, { format }));
      ok(same(back, stage), `${stage.name}: encodeShare(${format}) -> decodeShare is the identity`);
      ok((back.lesson?.length ?? 0) === (stage.lesson?.length ?? 0) && (back.blurb ?? '') === (stage.blurb ?? '') && (back.hazards?.length ?? 0) === (stage.hazards?.length ?? 0) && (back.theme ?? '') === (stage.theme ?? ''),
         `${stage.name}: the lesson, the blurb, the cast and the dressing survive the ${format} link`);
      const url = shareUrl('http://localhost:8080/maker.html?old=1#top', stage, { format });
      ok(url.startsWith('http://localhost:8080/maker.html?level=') && !url.includes('old=') && !url.includes('#') && same(decodeShare(url), stage), `${stage.name}: a whole ${format} link decodes (the base's own query and hash dropped)`);
      ok(same(decodeShare(url.slice(url.indexOf('?'))), stage) && same(decodeShare(url.slice(url.indexOf('level='))), stage), `${stage.name}: a pasted ?level=… and a bare level=… decode too`);
    }
  }
  ok(encodeShare(TEA_PARTY) === encodeShare(TEA_PARTY, { format: 'b64' }) && encodeShare(TEA_PARTY, { format: 'json' }).startsWith('{'), 'the default is the compact token; the readable one is the JSON itself');
  const old = Buffer.from(JSON.stringify(normalize(TEA_PARTY)), 'utf8').toString('base64url');
  ok(same(decodeShare(old), TEA_PARTY), 'an old-style token (base64url of the JSON, no format) still decodes');
  ok(same(decodeShare(`/bsidestlv-2026-badge/index.html?room=x&level=${old}&play=1`), TEA_PARTY), 'a site path with other parameters around level= decodes');
  try { encodeShare(TEA_PARTY, { format: 'xml' }); fail('an unknown format should be refused'); } catch (e) { ok(/no such link format/.test(e.message), 'an unknown link format is refused'); }
  for (const [bad, re, what] of [
    ['', /empty/, 'an empty token'], ['   ', /empty/, 'blank'], ['not a token!', /not JSON and not/, 'garbage'],
    ['e30', /rows/, '{} (no rows)'], ['{"name":"x","rows":"####"}', /rows/, 'rows that are not a list'], ['{"name":"x","rows":[1,2]}', /rows/, 'rows that are not strings'],
    ['{"name":1,"rows":["####"]}', /name/, 'a name that is not a string'], ['[1,2]', /object/, 'a list'], ['"x"', /object/, 'a string'], ['{nope', /not valid JSON/, 'broken JSON'],
    ['{"rows":["####"],"hazards":[{"id":"q"}]}', /route/, 'a hazard with no route'], ['{"rows":["####"],"hazards":"q"}', /route/, 'hazards that are not a list'],
    ['{"rows":["####"],"lesson":"move"}', /lesson/, 'a lesson that is not a list'],
    ['http://x/maker.html?room=1', /no level=/, 'a link without level='], ['?level=', /empty/, 'a link with an empty level='], ['http://x/?level=%7Bnope', /not valid JSON/, 'a link whose JSON is broken'],
  ]) try { decodeShare(bad); fail(`${what} should be refused`); } catch (e) { ok(re.test(e.message), `${what} is refused: ${e.message}`); }
  // shareUrl: the parts turned off are stripped, play=1 only when asked
  const taught = { ...STARTERS.find(s => s.id === 'corridor').level(), theme: 'hall', blurb: 'one shove', lesson: [{ on: 'move', say: 'Walk.' }, { on: 'push', say: 'Shove.' }, { on: 'win', say: 'Out.' }] };
  const bare = decodeShare(shareUrl('http://x/maker.html', taught, { play: true, parts: { lesson: false, blurb: false, theme: false } }));
  ok(!('lesson' in bare) && !('blurb' in bare) && !('theme' in bare) && same(bare, { name: taught.name, rows: taught.rows }), 'shareUrl strips the parts turned off');
  ok(/[?&]play=1$/.test(shareUrl('http://x/maker.html', taught, { play: true })) && !/play=/.test(shareUrl('http://x/maker.html', taught)), 'play=1 rides along only when asked');
  const whole = decodeShare(shareUrl('http://x/index.html', taught, { parts: { lesson: true } }));
  ok(whole.lesson.length === 3 && whole.blurb === 'one shove' && whole.theme === 'hall', 'every part travels unless turned off');
  ok(SHARE_PARTS.join() === 'lesson,blurb,theme', 'the parts a link may leave out are the lesson, the blurb and the dressing');
  ok(shareUrl('index.html', taught).startsWith('index.html?level=') && same(decodeShare(shareUrl('index.html', taught)), taught), 'a relative base works too (the pages are relative on the site)');
  // shareInfo: the length, the spelling, the warnings
  const short = shareUrl('http://x/maker.html', TEA_PARTY);
  const info = shareInfo(short);
  ok(info.chars === short.length && info.format === 'b64' && info.warnings.length === 0, `shareInfo: ${info.chars} characters, compact, nothing to warn about`);
  ok(shareInfo(shareUrl('http://x/maker.html', TEA_PARTY, { format: 'json' })).format === 'json' && shareInfo(encodeShare(TEA_PARTY, { format: 'json' })).format === 'json' && shareInfo(encodeShare(TEA_PARTY)).format === 'b64', 'shareInfo tells the readable form from the compact one, in a link or bare');
  const wordy = { ...TEA_PARTY, blurb: 'x'.repeat(160), lesson: Array.from({ length: 12 }, () => ({ on: 'move', say: 'y'.repeat(150) })) };
  const long = shareUrl('http://x/maker.html', wordy);
  ok(long.length > SHARE_LONG && long.length <= SHARE_TOO_LONG && shareInfo(long).warnings.length === 1 && /cut/.test(shareInfo(long).warnings[0]), `a link of ${long.length} characters warns that chats and QR codes cut it`);
  ok(shareInfo('x'.repeat(SHARE_TOO_LONG + 1)).warnings.some(w => /not paste/.test(w)), `over ${SHARE_TOO_LONG} it may not paste at all`);
  ok(SHARE_LONG === 2000 && SHARE_TOO_LONG === 8000, 'the thresholds are 2,000 and 8,000 characters');
}

console.log('a blurb and a lesson travel with a room');
{
  const taught = { ...STARTERS.find(s => s.id === 'corridor').level(), blurb: 'one shove', lesson: [{ on: 'move', say: 'Walk.' }, { on: 'push', say: 'Shove.' }, { on: 'win', say: 'Out.' }] };
  ok(lint(taught).length === 0, 'a lesson of known events lints clean');
  const back = await fromModule(toModule(taught));
  ok(same(back, taught) && back.blurb === 'one shove' && back.lesson.length === 3 && back.lesson[1].say === 'Shove.', 'toModule -> fromModule keeps the blurb and the lesson');
  ok(same(decodeShare(encodeShare(taught)), taught), 'and so does a link');
  ok(!('lesson' in normalize({ ...taught, lesson: [] })) && !('blurb' in normalize({ ...taught, blurb: '' })), 'an empty lesson or blurb is dropped');
  ok(lint({ ...taught, lesson: [{ on: 'dance', say: 'x' }] }).some(p => /must be one of/.test(p)), 'an event no room produces is reported');
  ok(lint({ ...taught, lesson: [{ on: 'move', say: ' ' }] }).some(p => /needs something to say/.test(p)), 'a step with nothing to say is reported');
  ok(lint({ ...taught, lesson: 'move' }).some(p => /list/.test(p)) && lint({ ...taught, blurb: 'x'.repeat(161) }).some(p => /blurb/.test(p)), 'a lesson that is not a list, a blurb too long');
  ok(lessonToText(taught) === 'move: Walk.\npush: Shove.\nwin: Out.' && JSON.stringify(lessonFromText(lessonToText(taught))) === JSON.stringify(taught.lesson), 'the lesson as text, one step a line, and back');
  ok(lessonFromText('  move:   Walk.  \n\nnonsense line\n')[0].say === 'Walk.' && lessonFromText('nonsense line')[0].on === '?', 'the text form trims, skips blank lines and keeps a bad line visible to the lint');
  ok(LESSON_EVENTS.every(e => LESSON_TITLES[e]) && LESSON_EVENTS.includes('push') && LESSON_EVENTS.includes('wait') && LESSON_EVENTS.includes('win'), 'every lesson event has a title');
  const steps = lessonSteps(taught);
  ok(steps.length === 3 && steps[0].title === 'A step' && steps[1].title === 'A shove' && new Set(steps.map(s => s.id)).size === 3, 'lessonSteps: a Tutor step per line, titled by its event');
  const t = new Tutor(steps);
  ok(t.feed({ kind: 'tea', what: 'move' }) === null && t.feed({ kind: 'room', what: 'push' }) === null && t.feed({ kind: 'room', what: 'move' })?.id === steps[0].id, 'a lesson step completes on the room\'s event, and only that');
  t.feed({ kind: 'room', what: 'push' }); t.feed({ kind: 'room', what: 'win' });
  ok(t.done && lessonSteps(blank(9, 7)).length === 0, 'walked to the end; a room without a lesson has no steps');
}
try { await fromModule('export const X = 1;'); fail('a module with no stage should be refused'); } catch (e) { ok(/no stage/.test(e.message), 'a module with no stage is refused'); }

// ------------------------------------------------------------ the studio ----
console.log('the studio\'s tools paint what they say');
{
  const room = blank(9, 7);
  ok(lineCells(1, 1, 5, 1).length === 5 && lineCells(1, 1, 1, 4).length === 4 && lineCells(1, 1, 4, 4).length === 4, 'a line is every cell from one end to the other');
  ok(rectCells(1, 1, 4, 3).length === 10 && rectCells(1, 1, 4, 3, { filled: true }).length === 12 && rectCells(4, 3, 1, 1).length === 10, 'a rectangle is its outline, or all of it, whichever corner comes first');
  ok(regionCells(room, 2, 2).length === 7 * 5 - 2, 'a fill finds the whole floor (less Alice and the door)');
  ok(regionCells(room, 0, 0).length === 2 * 9 + 2 * 5, 'a fill of the wall finds the wall');
  const walled = paintCells(room, lineCells(4, 1, 4, 5), '#');
  ok(walled.rows.slice(1, 6).every(r => r[4] === '#') && regionCells(walled, 2, 2).length === 3 * 5 - 1, 'a painted line splits the floor');
  ok(mirrorCells(room, 1, 1, 'h').some(([x, y]) => x === 7 && y === 1) && mirrorCells(room, 1, 1, 'v').some(([x, y]) => x === 1 && y === 5) && mirrorCells(room, 1, 1, 'both').length === 4 && mirrorCells(room, 4, 3, 'both').length === 1, 'the mirror images of a cell');
  ok(paintCells(room, [[2, 2], [3, 3]], 'A').rows.join('').split('A').length === 2, 'painting Alice twice leaves one Alice');
}

console.log('the transforms keep the room a room');
{
  const gate = STARTERS.find(s => s.id === 'gate').level();
  const hall = STARTERS.find(s => s.id === 'hall').level();
  ok(same(flipH(flipH(gate)), gate) && same(flipV(flipV(gate)), gate), 'a flip twice is the identity');
  ok(same(rotate(rotate(rotate(rotate(gate)))), gate), 'four quarter turns are the identity');
  const turned = rotate(gate);
  ok(turned.rows.length === gate.rows[0].length && turned.rows[0].length === gate.rows.length, 'a quarter turn swaps width and height');
  ok(check(flipH(gate)).par === check(gate).par && check(rotate(gate)).ok, 'a flipped room solves in the same par, a turned one solves');
  ok(same(flipH(flipH(hall)), hall) && lint(rotate(hall)).length === 0 && check(rotate(hall)).ok, 'routes turn with the room and the turned hall still solves');
  const loose = setCell(setCell(setCell(setCell(setCell(setCell(blank(9, 7), 1, 1, '.'), 7, 5, '.'), 3, 3, 'A'), 4, 3, 'O'), 5, 3, 'b'), 5, 4, 'D');
  const moved = shift(loose, 1, 0);
  ok(moved.rows[3][4] === 'A' && moved.rows[3][5] === 'O' && moved.rows[4][6] === 'D' && lint(moved).length === 0, 'a shift moves the inside one cell');
  ok(same(shift(shift(loose, 1, 1), -1, -1), loose) && same(shift(shift(gate, 0, 0), 0, 0), gate), 'a shift there and back is the identity while nothing crosses the wall');
  const lost = shift(gate, -1, 0);
  ok(!lost.rows.join('').includes('A') && lint(lost).some(p => /one Alice/.test(p)), 'what crosses the wall is lost, and the lint says so');
}

console.log('the analysis is the solver\'s own bookkeeping');
{
  const gate = STARTERS.find(s => s.id === 'gate').level();
  const r = check(gate);
  const a = analyse(gate, r);
  ok(a && a.stuck.size > 0 && ![...a.stuck].some(i => gate.rows[(i / a.w) | 0][i % a.w] === 'b'), 'stuck cells exist and no button is one');
  ok(a.stuck.has(1 * a.w + 1), 'the corner behind Alice is a stuck cell');
  ok(a.reach.has(1 * a.w + 1) && !a.reach.has(2 * a.w + 4) && !a.reach.has(1 * a.w + 9), 'Alice reaches her side, not the gate, not the far side');
  ok(a.path.length === r.par + 1 && a.pushes > 0 && a.pushes < r.par, `the path is par + 1 cells with ${a.pushes} pushes`);
  ok(analyse(blank(9, 7)) === null, 'a malformed room has no analysis');
  ok(difficulty(r, a.pushes).label && difficulty({ ok: true, par: 8, explored: 5, kind: 'tea' }, 1).level === 1 && difficulty({ ok: true, par: 300, explored: 200000, kind: 'tea' }, 40).level === 5, 'difficulty runs from a stroll to a nightmare');
  ok(difficulty({ ok: false }) === null, 'no verdict, no difficulty');
}

console.log('every starter solves, and the generator draws the same room from the same seed');
{
  for (const s of STARTERS) {
    const l = s.level();
    const problems = lint(l);
    if (s.id === 'blank' || s.id === 'wide') ok(problems.length === 1 && /no rock/.test(problems[0]), `starter ${s.id}: a blank room, one rock short of a puzzle`);
    else { const r = check(l); ok(!problems.length && r.ok, `starter ${s.id}: ${l.name}, par ${r.par}`); }
  }
  const r1 = rng(42), r2 = rng(42);
  ok(r1() === r2() && r1() === r2() && r1() !== r1(), 'the seeded generator repeats itself and nothing else');
  ok(same(generate({ seed: 7 }), generate({ seed: 7 })) && !same(generate({ seed: 7 }), generate({ seed: 8 })), 'a seed names a room');
  const g = generate({ seed: 7, gate: true, timed: true, width: 13, height: 9, rocks: 2 });
  ok(g && g.rows.length === 9 && g.rows[0].length === 13 && g.rows.join('').includes('G') && g.hazards?.length >= 1 && g.tickMs === 320, 'the knobs are honoured: size, a gate, a cast');
  const found = generateSolvable({ seed: 7, rocks: 2 }, { tries: 30, minPar: 10 });
  ok(found && found.report.ok && found.report.par >= 10 && same(generate({ ...{ seed: found.seed, rocks: 2 } }), found.level), `generateSolvable finds one (seed ${found?.seed}, ${found?.tries} tries, par ${found?.report.par}) and it is the seed's room`);
  ok(generateSolvable({ seed: 1, rocks: 6, width: 5, height: 5 }, { tries: 3 }) === null, 'and says so when it cannot');
}

// --------------------------------------------------------------- the tutorials ----
// Every guided build in the catalogue: well formed (ids, chapters in order,
// panels, what the coach says at the end), every event a step waits on one
// src/maker.js tells and the list above the catalogue names, and a walk on
// synthetic events in order, each step shown to ignore what is not it.
console.log('the studio\'s guided builds tick on its events');
{
  const makerJs = readFileSync(resolve(root, 'src/maker.js'), 'utf8');
  const tutorJs = readFileSync(resolve(root, 'src/tutor.js'), 'utf8').replace(/\r\n/g, '\n');
  const told = new Set([...makerJs.matchAll(/tell\('([a-z]+)'/g)].map(m => m[1]));
  const listed = tutorJs.match(/Events from src\/maker\.js:\n((?:\/\/.*\n)+)/)?.[1] ?? '';
  ok(MAKER_TUTORIAL === MAKER_TUTORIALS[0].steps && MAKER_TUTORIALS[0].id === 'roses' && MAKER_TUTORIALS[0].title === 'Painting the Roses', 'MAKER_TUTORIAL is still "Painting the Roses", the first of the catalogue');
  ok(MAKER_TUTORIALS.length >= 4, `${MAKER_TUTORIALS.length} guided builds in the catalogue`);
  const tids = new Set();
  for (const t of MAKER_TUTORIALS) {
    ok(/^[a-z]+$/.test(t.id) && !tids.has(t.id), `tutorial ${t.id}: an id of its own`); tids.add(t.id);
    ok(typeof t.title === 'string' && t.title && typeof t.blurb === 'string' && t.blurb, `tutorial ${t.id}: a title and a blurb`);
    ok(t.finish && typeof t.finish.title === 'string' && typeof t.finish.say === 'string' && typeof t.finish.note === 'function' && typeof t.finish.note(0) === 'string' && /1 step skipped/.test(t.finish.note(1)) && /2 steps skipped/.test(t.finish.note(2)), `tutorial ${t.id}: what the coach says at the end`);
    ok(Array.isArray(t.steps) && t.steps.length >= 8, `tutorial ${t.id}: ${t.steps.length} steps`);
    const ids = new Set();
    for (const s of t.steps) {
      ok(!ids.has(s.id), `tutorial ${t.id}: duplicate step ${s.id}`); ids.add(s.id);
      ok(typeof s.say === 'string' && s.say.length && typeof s.why === 'string' && s.why.length, `tutorial ${t.id}/${s.id}: say and why`);
      ok(!!t.chapters[s.chapter] && ['edit', 'play', 'export', 'assistant'].includes(s.panel), `tutorial ${t.id}/${s.id}: a titled chapter and a panel`);
      const waits = [].concat(s.done.what ?? []);
      ok(waits.length > 0, `tutorial ${t.id}/${s.id}: done declares the event it waits on`);
      for (const w of waits) ok(told.has(w), `tutorial ${t.id}/${s.id}: src/maker.js tells '${w}'`);
      for (const w of waits) ok(listed.includes(`'${w}'`), `tutorial ${t.id}/${s.id}: '${w}' is in the events list above the catalogue`);
    }
    const chapters = t.steps.map(s => s.chapter);
    ok(chapters[0] === 1 && chapters.every((c, i) => !i || c >= chapters[i - 1]), `tutorial ${t.id}: the chapters come in order from one`);
    ok(t.steps.at(-1).id === 'export' || t.id === 'roses', `tutorial ${t.id}: ends by sending the room in`);
  }
  const ev = (what, extra = {}) => ({ ...extra, kind: 'maker', what });
  const edge = { kind: 'edge', button: 'A', down: true };
  const WALKS = {
    roses: [
      ['brush', ev('brush', { ch: '#' })], ['paint', ev('paint', { ch: '#', cells: 1, tool: 'pencil' })],
      ['rock', ev('paint', { ch: 'O', cells: 1, tool: 'pencil' })], ['button', ev('paint', { ch: 'b', cells: 1, tool: 'pencil' })],
      ['formed', ev('lint', { ok: true, problems: [] })], ['tool', ev('tool', { tool: 'rect', used: true })],
      ['overlay', ev('overlay', { overlay: 'reach', on: true })], ['surprise', ev('generate', { seed: 7, par: 23 })],
      ['check', ev('check', { ok: true, par: 23, rules: 'tea', gate: null })], ['play', ev('play', { rules: 'tea' })],
      ['move', ev('move', { dir: 'E' })], ['solution', ev('solution', { par: 23 })],
      ['shelf', ev('shelf', { did: 'save' })], ['lesson', ev('lesson', { steps: 2, malformed: 0 })], ['export', ev('export', { how: 'copy' })], ['assistant', ev('chat', { text: 'hi' })],
    ],
    gate: [
      ['blank', ev('load', { id: 'blank', from: 'starter' })], ['alice', ev('paint', { ch: 'A', cells: 1, tool: 'pencil' })],
      ['wall', ev('paint', { ch: '#', cells: 7, tool: 'line' })], ['gate', ev('paint', { ch: 'G', cells: 1, tool: 'pencil' })],
      ['lever', ev('paint', { ch: 'L', cells: 1, tool: 'pencil' })], ['rock', ev('paint', { ch: 'O', cells: 1, tool: 'pencil' })],
      ['button', ev('paint', { ch: 'b', cells: 1, tool: 'pencil' })], ['door', ev('paint', { ch: 'D', cells: 1, tool: 'pencil' })],
      ['formed', ev('lint', { ok: true, problems: [] })], ['check', ev('check', { ok: true, par: 21, rules: 'tea', gate: 'load-bearing' })],
      ['play', ev('play', { rules: 'tea' })], ['win', ev('win', { moves: 21 })], ['export', ev('export', { how: 'pr' })],
    ],
    clock: [
      ['corridor', ev('load', { id: 'corridor', from: 'starter' })], ['tick', ev('tick', { ms: 320, timed: true })],
      ['hazard', ev('hazard', { did: 'add', n: 0, route: [], sight: 3, character: 'queen' })],
      ['route', ev('hazard', { did: 'route', n: 0, route: [[1, 5], [7, 5]], sight: 3, character: 'queen' })],
      ['check', ev('check', { ok: true, par: 17, rules: 'chase', gate: null })], ['play', ev('play', { rules: 'chase' })],
      ['wait', ev('move', { dir: 'wait' })], ['caught', ev('caught', { ticks: 6 })], ['restart', ev('restart', { rules: 'chase' })],
      ['win', ev('win', { ticks: 17 })], ['export', ev('export', { how: 'download' })],
    ],
    teach: [
      ['room', ev('load', { id: 'gate', from: 'starter' })], ['name', ev('name', { name: 'The Lever Lesson' })],
      ['blurb', ev('blurb', { chars: 42 })], ['lesson', ev('lesson', { steps: 3, malformed: 0 })],
      ['check', ev('check', { ok: true, par: 26, rules: 'tea', gate: 'load-bearing' })], ['play', ev('play', { rules: 'tea' })],
      ['win', ev('win', { moves: 26 })], ['shelf', ev('shelf', { did: 'save' })], ['export', ev('export', { how: 'link' })],
    ],
  };
  // what no step of that build accepts: fed before every step, none may move
  const WRONG = {
    roses: [ev('brush', { ch: 'O' }), ev('paint', { ch: '.', cells: 1 }), ev('lint', { ok: false }), ev('tool', { tool: 'rect', used: false }), ev('check', { ok: false }), ev('move', { dir: 'wait' }), ev('shelf', { did: 'open' }), ev('lesson', { steps: 0, malformed: 1 }), edge],
    gate: [ev('load', { id: 'hall', from: 'starter' }), ev('paint', { ch: '.', cells: 1, tool: 'pencil' }), ev('paint', { ch: '#', cells: 2, tool: 'pencil' }), ev('lint', { ok: false, problems: ['x'] }), ev('check', { ok: true, par: 9, rules: 'tea', gate: 'decoration' }), ev('check', { ok: false, gate: null }), ev('export', { how: 'png' }), ev('move', { dir: 'E' }), ev('tick', { ms: 320, timed: true }), ev('hazard', { did: 'add', n: 0, route: [] }), edge],
    clock: [ev('load', { id: 'blank', from: 'starter' }), ev('tick', { ms: null, timed: false }), ev('hazard', { did: 'route', n: 0, route: [[1, 5]], sight: 3 }), ev('hazard', { did: 'edit', n: 0, route: [], sight: 2 }), ev('check', { ok: true, par: 9, rules: 'tea', gate: null }), ev('check', { ok: false, gate: null }), ev('play', { rules: 'tea' }), ev('move', { dir: 'E' }), ev('export', { how: 'png' }), ev('lint', { ok: false }), { kind: 'edge', button: 'Y', down: true }],
    teach: [ev('name', { name: 'An Untitled Room' }), ev('name', { name: 'Ab' }), ev('blurb', { chars: 4 }), ev('lesson', { steps: 2, malformed: 0 }), ev('lesson', { steps: 3, malformed: 1 }), ev('check', { ok: false, gate: null }), ev('shelf', { did: 'open' }), ev('export', { how: 'png' }), ev('paint', { ch: '#', cells: 1, tool: 'pencil' }), ev('move', { dir: 'E' }), edge],
  };
  for (const t of MAKER_TUTORIALS) {
    const walk = WALKS[t.id], wrong = WRONG[t.id];
    ok(walk && wrong, `tutorial ${t.id}: the verifier knows a walk for it`);
    if (!walk || !wrong) continue;
    ok(walk.length === t.steps.length, `tutorial ${t.id}: the walk is ${walk.length} events for ${t.steps.length} steps`);
    let at = 0;
    const tutor = new Tutor(t.steps, { load: () => 0, save: (n) => { at = n; } });
    for (const [id, e] of walk) {
      ok(tutor.step?.id === id, `tutorial ${t.id}: at ${id}`);
      for (const w of wrong) tutor.feed(w);
      ok(tutor.step?.id === id, `tutorial ${t.id}: ${id} ignores what is not it`);
      ok(tutor.feed(e)?.id === id, `tutorial ${t.id}: ${id} completes`);
    }
    ok(tutor.done && at === t.steps.length, `tutorial ${t.id}: done, progress saved`);
    tutor.restart(); ok(tutor.at === 0 && at === 0, `tutorial ${t.id}: start over`);
  }
}

// -------------------------------------------------------------- the invitation ----
console.log('the invitation and the pull-request brief tell an assistant everything it needs');
{
  const repo = 'https://github.com/someone/their-badge';
  const inv = aiPrompt(repo);
  ok(inv.includes(repo) && /npm run maker/.test(inv) && /__maker\/rpc/.test(inv) && /maker-mcp\.mjs|\.mcp\.json/.test(inv), 'the invitation names the repository, npm run maker, the bridge and the MCP server');
  ok(/"pr"/.test(inv) && /maker_pr_brief/.test(inv) && /op "pr", or maker_pr_brief/.test(inv), 'and says the page can hand over the pull-request brief: op pr, or maker_pr_brief');
  ok(repoParts(repo).owner === 'someone' && repoParts(repo).repo === 'their-badge' && repoParts('https://github.com/a/b.git').repo === 'b' && repoParts('not a url') === null, 'repoParts reads owner and repository from the URL');
  // a sample room: the tea party, with an author and a Check shaped as check() answers (the solve itself is verify-stage's)
  const level = normalize(TEA_PARTY);
  const author = 'the verifier';
  const report = { ok: true, kind: 'tea', par: 106, explored: 31000, ms: 300, notes: ['the gate is load-bearing'] };
  const d = { label: 'a labyrinth' };
  const id = idOf(level);
  const parts = prParts(level, { author });
  ok(parts.id === id && parts.file === `stages/community/${id}.js` && parts.branch === `community/${id}` && parts.source === toModule(level, { author }) &&
     JSON.stringify(parts.indexLine) === JSON.stringify({ id, name: level.name, author, kind: 'tea' }), 'prParts: id, file, source, index line and branch');
  ok(JSON.parse(indexLineText(parts.indexLine)).kind === 'tea' && readFileSync(resolve(root, 'stages/community/index.json'), 'utf8').includes('{ "id": "tick-tock", "name": "Tick Tock", "author": "the maker", "kind": "chase" }') &&
     indexLineText({ id: 'tick-tock', name: 'Tick Tock', author: 'the maker', kind: 'chase' }) === '{ "id": "tick-tock", "name": "Tick Tock", "author": "the maker", "kind": "chase" }', 'the index line is written as index.json writes one');
  const brief = prPrompt(repo, level, { author, report, difficulty: d });
  ok(brief.includes(`stages/community/${id}.js`) && brief.includes(indexLineText(parts.indexLine)) && /"kind": "tea"/.test(brief), 'the brief names the file and the index line with the right kind');
  ok(brief.includes(`git checkout -b community/${id} origin/main`) && brief.includes(`git push -u origin community/${id}`), 'the branch community/<id>, from main');
  ok(brief.includes('gh pr create --repo someone/their-badge --base main') && brief.includes(`https://github.com/someone/their-badge/compare/main...<your GitHub login>:community/${id}?expand=1`) && brief.includes('gh repo fork someone/their-badge'),
     'the repository\'s owner and name: gh pr create, the compare URL, the fork');
  ok(brief.includes(`npm run stage -- stages/community/${id}.js`) && /`npm run verify`/.test(brief), 'both run commands');
  ok(brief.includes('```js\n' + toModule(level, { author }) + '```'), 'the module source, verbatim, fenced');
  ok(brief.includes(`Community room: ${level.name}`) && (brief.match(new RegExp(`Community room: ${level.name}`, 'g')) ?? []).length >= 3, 'one commit and the title, "Community room: <name>"');
  ok(brief.includes('par 106 moves, a labyrinth') && brief.includes('the gate is load-bearing') && /the checks prove it solves/.test(brief), 'the par, the difficulty word and the notes when a Check is given, and that the checks prove it');
  const bare = prPrompt(repo, level, {});
  ok(!/par \d/.test(bare) && !bare.includes('a labyrinth') && !bare.includes('load-bearing') && /the checks prove it solves/.test(bare), 'and no par or difficulty without one');
  ok(/No author is set/.test(bare) && !/No author is set/.test(brief) && /"author": ""/.test(bare), 'no author: the brief says to ask for one');
  ok(/one room per pull request/.test(brief) && /one commit/.test(brief) && /nothing under src\//.test(brief) && /sorted by id/.test(brief), 'the handling rules: one room, one commit, nothing under src/, the index sorted');
  const timed = normalize({ ...QUEENS_GAUNTLET, lesson: [{ on: 'start', say: 'the clock' }, { on: 'wait', say: 'wait' }] });
  const tb = prPrompt(repo, timed, { author, report: { ok: true, kind: 'chase', par: 64, explored: 9000, ms: 50, notes: [] }, difficulty: { label: 'a riddle' } });
  ok(/"kind": "chase"/.test(tb) && /a timed room \(320 ms a tick\)/.test(tb) && /par 64 ticks, a riddle/.test(tb) && /lesson of 2 steps/.test(tb) && /Its lesson has 2 steps/.test(tb), 'a timed room: kind chase, ticks, the lesson\'s step count');
  ok(!/lesson/.test(brief.split('The module,')[0]), 'and no lesson line without one');
  const short = prShort(repo);
  ok(short.includes(repo) && /clipboard/.test(short) && /paste/.test(short) && encodeURIComponent(short).length < 1000 && encodeURIComponent(brief).length < 6000 && encodeURIComponent(inv).length < 6000,
     'the short form for a link says the brief is on the clipboard; the tea party\'s brief and the invitation fit a link themselves');
}

// ------------------------------------------------------------------ the bridge ----
console.log('the bridge carries commands to a page and its answers back');
{
  const { port, url, bridge, close } = await startMaker({ root, port: 0 });
  const api = async (method, path, body, headers = {}) => { const r = await fetch(`${url}/__maker${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  ok(port > 0 && (await api('GET', '/')).body.bridge === 1, `the bridge answers on a free port (${port})`);
  ok((await api('GET', '/')).body.ops.join() === OPS.join(), 'and names its ops');
  ok((await fetch(`${url}/maker.html`)).status === 200 && (await fetch(`${url}/src/level.js`)).headers.get('content-type').startsWith('text/javascript'), 'the static side still serves the page and its modules');
  let r = await api('POST', '/rpc', { op: 'get' });
  ok(r.status === 503 && /no maker page/.test(r.body.error), 'an rpc with no page open is refused with a hint');
  // a fake page: the event stream, run each command, answer
  const seen = [];
  const page = await fetch(`${url}/__maker/events`);
  const reader = page.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const pump = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = chunk.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const cmd = JSON.parse(line.slice(6));
        seen.push(cmd);
        if (cmd.id === undefined) continue;
        if (cmd.op === 'get') await api('POST', '/reply', { id: cmd.id, result: { level: TEA_PARTY, lint: [], tutorial: { id: 'roses', title: 'Painting the Roses', step: 'brush', at: 0, of: 16 } } });
        else if (cmd.op === 'set') await api('POST', '/reply', { id: cmd.id, result: { lint: lint(cmd.args.level) } });
        else if (cmd.op === 'tutorial') await api('POST', '/reply', { id: cmd.id, result: { id: cmd.args?.id ?? 'roses', title: cmd.args?.id ?? 'Painting the Roses', step: 'blank', at: 0, of: 13 } });
        else if (cmd.op === 'check') await api('POST', '/reply', { id: cmd.id, error: 'the room is malformed' });
        else if (cmd.op === 'share') { const url = shareUrl(`http://localhost/${cmd.args.where === 'stages' ? 'index' : 'maker'}.html`, TEA_PARTY, cmd.args); await api('POST', '/reply', { id: cmd.id, result: { url, token: new URL(url).searchParams.get('level'), ...shareInfo(url), where: cmd.args.where ?? 'studio' } }); }
        else if (cmd.op === 'pr') await api('POST', '/reply', { id: cmd.id, result: { ...prParts(TEA_PARTY, { author: cmd.args?.author }), brief: prPrompt('https://github.com/someone/their-badge', TEA_PARTY, { author: cmd.args?.author }) } });
        // 'play' is never answered: the timeout path
      }
    }
  })();
  const settle = () => new Promise(r => setTimeout(r, 80));
  await settle();
  ok(bridge.pages === 1 && seen[0]?.op === 'hello', 'a page attaches and is greeted');
  r = await api('POST', '/rpc', { op: 'get' });
  ok(r.status === 200 && r.body.result.level.name === TEA_PARTY.name, 'get: the page\'s answer comes back');
  r = await api('PUT', '/level', blank(9, 7));
  await settle();
  ok(r.status === 200 && seen.at(-1).op === 'set' && r.body.result.lint.length === 1, 'PUT /level is an rpc set, answered with the lint');
  r = await api('POST', '/rpc', { op: 'check' });
  ok(r.status === 422 && /malformed/.test(r.body.error), 'an error from the page is an error for the assistant');
  r = await api('POST', '/rpc', { op: 'play', timeoutMs: 1000 });
  ok(r.status === 504 && /did not answer/.test(r.body.error), 'a page that does not answer times out');
  r = await api('POST', '/rpc', { op: 'nope' });
  ok(r.status === 400 && /no such op/.test(r.body.error), 'an unknown op is refused with the list');
  r = await api('POST', '/hello', { name: 'the verifier' });
  await settle();
  ok(r.status === 200 && r.body.agents[0].name === 'the verifier' && seen.at(-1).op === 'hello' && seen.at(-1).args.name === 'the verifier', 'hello is shown to the page');
  // the chat: the page posts, the assistant long-polls
  const wait = api('GET', '/inbox?since=0&wait=5000');
  await new Promise(r => setTimeout(r, 50));
  await api('POST', '/post', { text: 'make it timed' });
  r = await wait;
  ok(r.status === 200 && r.body.messages.length === 1 && r.body.messages[0].text === 'make it timed' && r.body.messages[0].n === 1, 'a line the person typed wakes the long-poll');
  r = await api('GET', '/inbox?since=1');
  ok(r.body.messages.length === 0 && r.body.latest === 1, 'and is not repeated');
  // the mirror
  ok((await api('GET', '/level')).status === 404, 'no mirror until the page reports');
  await api('POST', '/state', { level: QUEENS_GAUNTLET, kind: 'chase' });
  ok((await api('GET', '/level')).body.name === QUEENS_GAUNTLET.name && (await api('GET', '/')).body.mirror.kind === 'chase', 'the mirror is what the page last reported');
  // the guards
  r = await api('POST', '/rpc', { op: 'get' }, { origin: 'http://evil.example' });
  ok(r.status === 403, 'a foreign origin is refused');
  r = await new Promise((res) => { const q = request({ host: '127.0.0.1', port, method: 'POST', path: '/__maker/rpc', headers: { host: 'evil.example', 'content-type': 'application/json' } }, (m) => { m.resume(); m.on('end', () => res({ status: m.statusCode })); }); q.end('{"op":"get"}'); });
  ok(r.status === 403, 'a foreign host is refused (DNS rebinding)');
  r = await api('POST', '/rpc', { op: 'get' }, { origin: `http://localhost:${port}` });
  ok(r.status === 200, 'the page\'s own origin is let through');
  ok((await fetch(`${url}/__maker/reply`, { method: 'POST', body: '{' })).status === 400, 'a body that is not JSON is refused');
  // the MCP server over stdio against this very server
  const mcp = spawn(process.execPath, [resolve(root, 'software/tools/maker-mcp.mjs')], { env: { ...process.env, MAKER_URL: url, MAKER_AGENT: 'the verifier over MCP' } });
  const replies = new Map(); let out = '';
  mcp.stdout.on('data', (d) => { out += d; let i; while ((i = out.indexOf('\n')) >= 0) { const l = out.slice(0, i); out = out.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); replies.get(m.id)?.(m); } } });
  let n = 0;
  const call = (method, params) => new Promise((res) => { const id = ++n; replies.set(id, res); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  ok(init.result?.serverInfo?.name === 'alice-maker' && init.result.capabilities.tools, 'mcp: initialize');
  const tools = (await call('tools/list')).result.tools;
  ok(tools.length >= 15 && tools.every(t => t.name.startsWith('maker_') && t.inputSchema?.type === 'object' && t.description), `mcp: ${tools.length} tools, all described`);
  ok(tools.some(t => t.name === 'maker_share' && t.inputSchema.properties.format?.enum?.includes('json') && t.inputSchema.properties.where?.enum?.includes('stages') && t.inputSchema.properties.parts), 'mcp: maker_share is a tool, with the format, the place and the parts');
  let c = await call('tools/call', { name: 'maker_status', arguments: {} });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).page === true, 'mcp: maker_status sees the page');
  c = await call('tools/call', { name: 'maker_get', arguments: {} });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).level.name === TEA_PARTY.name && (await api('GET', '/')).body.agents.some(a => a.name === 'the verifier over MCP'), 'mcp: maker_get goes through the bridge, and the server said hello first');
  c = await call('tools/call', { name: 'maker_check', arguments: {} });
  ok(c.result.isError && /malformed/.test(c.result.content[0].text), 'mcp: an error is an error result, not a crash');
  c = await call('tools/call', { name: 'maker_read_chat', arguments: { since: 0 } });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).messages[0].text === 'make it timed', 'mcp: maker_read_chat reads the inbox');
  c = await call('tools/call', { name: 'maker_share', arguments: { format: 'json', where: 'stages' } });
  const link = c.result.isError ? null : JSON.parse(c.result.content[0].text);
  ok(link && link.url.startsWith('http://localhost/index.html?level=') && link.format === 'json' && link.chars === link.url.length && same(decodeShare(link.url), TEA_PARTY) && seen.at(-1).op === 'share' && seen.at(-1).args.where === 'stages', 'mcp: maker_share asks the page for a link, and the link carries the room');
  ok(tools.some(t => t.name === 'maker_pr_brief' && /pull request/.test(t.description) && t.inputSchema.properties.author), 'mcp: maker_pr_brief is offered, with the author');
  c = await call('tools/call', { name: 'maker_pr_brief', arguments: { author: 'the verifier over MCP' } });
  const pr = c.result.isError ? null : JSON.parse(c.result.content[0].text);
  ok(pr && pr.branch === `community/${idOf(TEA_PARTY)}` && pr.file === `stages/community/${idOf(TEA_PARTY)}.js` && pr.indexLine.author === 'the verifier over MCP' && pr.brief.includes(pr.source) && seen.at(-1).op === 'pr',
     'mcp: maker_pr_brief is the op pr: the branch, the file, the index line and the brief with the module in it');
  const tut = tools.find(t => t.name === 'maker_tutorial');
  ok(tut && MAKER_TUTORIALS.every(t => tut.inputSchema.properties.id.enum.includes(t.id) && tut.description.includes(t.id)) && 'skip' in tut.inputSchema.properties && 'restart' in tut.inputSchema.properties, 'mcp: maker_tutorial names every guided build, skip and restart');
  c = await call('tools/call', { name: 'maker_tutorial', arguments: { id: 'gate' } });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).id === 'gate' && seen.at(-1).op === 'tutorial' && seen.at(-1).args.id === 'gate', 'mcp: maker_tutorial picks a guided build through the bridge');
  const unknown = await call('no/such');
  ok(unknown.error?.code === -32601, 'mcp: an unknown method is a JSON-RPC error');
  mcp.stdin.end();
  await new Promise(r => mcp.on('close', r));
  reader.cancel().catch(() => {});
  await pump.catch(() => {});
  await close();
  ok(true, 'the bridge closes');
}

// ------------------------------------------------------------------ the page ----
console.log('maker.html keeps the studio to a checkout and the landing to the site');
{
  const html = readFileSync(resolve(root, 'maker.html'), 'utf8');
  for (const id of ['editPanel', 'playPanel', 'exportPanel', 'assistantPanel', 'learnPanel'])
    ok(new RegExp(`<section class="panel dev-only" id="${id}">`).test(html), `#${id} is class dev-only`);
  ok(/<div id="coach" class="coach dev-only" hidden>/.test(html), 'the coach line is dev-only: the tutorial is the studio\'s');
  for (const id of ['coachTitle', 'coachCount', 'coachSay', 'coachSkip', 'coachOpen', 'learnProgress', 'learnCoach', 'learnSteps', 'learnSkip', 'learnRestart', 'learnStatus'])
    ok(new RegExp(`id="${id}"`).test(html), `the coach has #${id}`);
  for (const t of ['pencil', 'line', 'rect', 'fill', 'pick']) ok(new RegExp(`data-tool="${t}"`).test(html), `the studio bar has the ${t} tool`);
  for (const o of ['grid', 'coords', 'stuck', 'reach', 'path', 'sight']) ok(new RegExp(`data-overlay="${o}"`).test(html), `the board has the ${o} overlay`);
  for (const id of ['symmetry', 'flipH', 'flipV', 'rotateBtn', 'undoEdit', 'redoEdit', 'zoom', 'keysBtn', 'starters', 'genBtn', 'genSeed', 'shelf', 'shelfSave', 'autoCheck', 'pngBtn', 'verdict', 'chatLog', 'chatText', 'chatSend', 'bridgeChip', 'bridgeState', 'keysDialog', 'blurb', 'lesson'])
    ok(new RegExp(`id="${id}"`).test(html), `the studio has #${id}`);
  const mod = readFileSync(resolve(root, 'src/maker.js'), 'utf8');
  for (const op of OPS) ok(new RegExp(`^  ${op}: `, 'm').test(mod), `src/maker.js implements the bridge op '${op}'`);
  ok(/from '\.\/bridge\.js'/.test(mod) && /from '\.\/coach\.js'/.test(mod) && /MAKER_TUTORIAL/.test(mod), 'src/maker.js reaches the bridge, the coach and the tutorial');
  const inviteJs = readFileSync(resolve(root, 'src/invite.js'), 'utf8');
  ok(/__maker\//.test(inviteJs) && /maker-mcp\.mjs|\.mcp\.json/.test(inviteJs), 'the prompt tells the assistant about the bridge and the MCP server');
  ok(/from '\.\/invite\.js'/.test(mod) && !/export const aiPrompt/.test(mod) && /prompt: aiPrompt\(repo\)/.test(mod), 'the prompts live in src/invite.js, where Node can read them; window.__maker.prompt is still the invitation');
  // the fourth way to send a room in: the pull request, handed to an assistant
  ok(/<button type="button" id="shareBtn"[^>]*>[^<]*<\/button>\s*<button type="button" id="prBtn" class="btn ghost">Open a pull request with your AI<\/button>/.test(html), '#prBtn sits in the export\'s stage-bar after #shareBtn');
  ok(/<dialog id="aiDialog" class="ai" data-kind="invite">\s*<h2 id="aiTitle">/.test(html) && /<p class="note" id="aiNote">/.test(html), 'the dialog has a kind, and a title and a note the PR mode rewrites');
  ok(/dialog\.dataset\.kind = kind/.test(mod) && /invite\.show\('pr', brief, \{ short: prShort\(repo\) \}\)/.test(mod) && /show\('invite', aiPrompt\(repo\)\)/.test(mod), 'the button opens the dialog in PR mode with the brief and a short form; #aiBtn / #aiBtn2 reopen the invitation');
  ok(/LINK_MAX = 6000/.test(mod) && /press Copy first/.test(mod), 'a brief too long for a link sends the short form and says to Copy first');
  ok(/tell\('export', \{ how: 'pr' \}\)/.test(mod), 'the button reports export how pr to the tutorial');
  ok(/bridge\.post\(brief\)/.test(mod) && /asked \$\{who\.join\(', '\)\} to open the pull request/.test(mod), 'and posts the brief to whoever is on the bridge, with one act line in the chat');
  ok(/\$\('#prBtn'\)\.disabled = !!problems\.length/.test(mod) && /\$\('#prBtn'\)\.title = problems\.length \?/.test(mod), 'the button is disabled, with a title saying why, while lint has problems');
  ok(/Open a pull request with your AI<\/b> in the studio/.test(html.slice(html.indexOf('<ol class="steps three">'), html.indexOf('</ol>'))), 'the landing\'s step 3 says the button hands the assistant the room and the steps');
  const mcpJson = JSON.parse(readFileSync(resolve(root, '.mcp.json'), 'utf8'));
  ok(mcpJson.mcpServers?.['alice-maker']?.args?.includes('software/tools/maker-mcp.mjs'), '.mcp.json registers the MCP server for a clone opened in Claude Code');
  ok(!/\.mcp\.json|maker-mcp/.test(readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8')), 'pages.yml does not publish the MCP server or .mcp.json');
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
  ok(/lessonFromText/.test(js) && /tell\('lesson'/.test(js), 'the studio edits the lesson as text and tells the tutorial');
  // a room in a link: the Share dialog (the studio's, at the end of the page), the landing's note, the studio's part
  for (const id of ['shareBtn', 'shareDialog', 'shareUrl', 'shareCopy', 'shareOpen', 'sharePlay', 'shareStatus', 'shareJson', 'shareClose'])
    ok(new RegExp(`id="${id}"`).test(html), `the Share dialog has #${id}`);
  ok(/<dialog id="shareDialog" class="ai share dev-only"/.test(html) && html.indexOf('id="shareDialog"') > html.indexOf('id="keysDialog"'), 'the Share dialog is the studio\'s (dev-only) and comes after the keys dialog, at the end of the page');
  for (const p of SHARE_PARTS) ok(new RegExp(`<input type="checkbox" data-part="${p}" checked>`).test(html), `the Share dialog offers the ${p}, on by default`);
  ok(/name="shareFormat" value="b64" checked/.test(html) && /name="shareFormat" value="json"/.test(html), 'the Share dialog offers the compact and the readable link, compact by default');
  ok(/name="shareWhere" value="studio" checked/.test(html) && /name="shareWhere" value="stages"/.test(html), 'the Share dialog offers the studio and the stages page');
  ok(/<p id="sharedNote" class="note site-only[^"]*" hidden>/.test(html), '#sharedNote is the landing\'s (site-only), hidden until a link brings a room');
  ok(/shareUrl\(/.test(js) && /shareInfo\(/.test(js) && /decodeShare\(sharedToken\)/.test(js) && /SHARE_PARTS/.test(js), 'src/maker.js makes and reads the link through src/level.js');
  ok(/tell\('export', \{ how: 'link', format: /.test(js), 'the Share dialog tells the tutorial it made a link, with its format and length');
  ok(/share: \(opts\) => shareLink\(opts\)\.url/.test(js) && /^  share: \(a = \{\}\) => \{/m.test(js), 'window.__maker.share returns the link and the bridge op share returns { url, token, chars, warnings }');
  ok(/\(!dev && sharedOk\) \? sharedRoom : HERO/.test(js) && /check\(hero, \{ limit: 50_000 \}\)/.test(js), 'the landing paints a shared room in the hero and walks it only when the solver finds a way in time');
  ok(/get\('play'\) === '1'\) startPlay\(\)/.test(js), 'play=1 starts Run & debug on a checkout');
  ok(OPS.includes('share'), 'the bridge\'s op list has share');
  // the glitch category: a switch, a range picker, a form per range, the range page as the player
  for (const id of ['category', 'rangeKind', 'rangeStudio', 'rangeMap', 'rangeFacts', 'rangeLint', 'rangeStarters', 'rangeShort', 'tryRange', 'wallListingBtn'])
    ok(new RegExp(`id="${id}"`).test(html), `the studio has #${id} (the glitch category)`);
  for (const kind of RANGE_KINDS) ok(new RegExp(`<div class="range-form" data-range="${kind}">`).test(html), `a form for the ${kind} range (.range-form[data-range=${kind}])`);
  ok(/<option value="room">A room<\/option>\s*<option value="glitch">A glitch level<\/option>/.test(html), '#category offers a room or a glitch level');
  ok(/<button type="button" id="tryRange" class="btn glitch-only"/.test(html) && /<button type="button" id="playBtn" class="btn room-only"/.test(html), 'Run & debug is the room\'s, Try it on the range the glitch level\'s (by class, not removal)');
  ok(/<div class="studio-bar room-only"/.test(html) && /<div class="maker-board room-only">/.test(html) && /<div class="maker-range glitch-only" id="rangeStudio">/.test(html), 'the tools and the board hide by class in the glitch category; the range studio shows');
  ok(/from '\.\/rangecheck\.js'/.test(readFileSync(resolve(root, 'src/level.js'), 'utf8')) && /from '\.\/rangecheck\.js'/.test(js), 'src/level.js and src/maker.js reach src/rangecheck.js');
  ok(/glitch\.html\?level=\$\{encodeShare\(level\)\}/.test(js) && /window\.open\(tryUrl\(\)/.test(js), 'Try it on the range opens glitch.html?level=<the share token> in a new tab');
  ok(/dataset\.category = isGlitch\(level\) \? 'glitch' : 'room'/.test(js) && /if \(isGlitch\(level\)\) \{ renderRange\(\); return; \}/.test(js), 'render branches on the category and marks the panel');
  for (const op of ['paint', 'play', 'moves', 'generate']) ok(new RegExp(`^  ${op}: [^\\n]*if \\(isGlitch\\(level\\)\\) throw new Error`, 'm').test(js) || new RegExp(`^  ${op}: [\\s\\S]{0,80}\\n\\s+if \\(isGlitch\\(level\\)\\) throw new Error`, 'm').test(js), `the bridge op '${op}' refuses a glitch level with a message`);
  ok(/rangeLevelById/.test(js) && /<range>:<id>/.test(js), 'loadById takes a shipped range level as <range>:<id>');
  const mcp = readFileSync(resolve(root, 'software/tools/maker-mcp.mjs'), 'utf8');
  ok(/maker_load[^\n]*<range>:<id>[^\n]*tea-time[^\n]*kings-horses/.test(mcp) && /enum: \['watch', 'glass', 'lock', 'dog', 'wall'\]/.test(mcp), 'maker_load names the range ids and the level schema the range');
  const makerCssText = readFileSync(resolve(root, 'src/maker.css'), 'utf8');
  ok(/#editPanel\[data-category=glitch\] \.room-only \{ display: none !important; \}/.test(makerCssText) && /#editPanel:not\(\[data-category=glitch\]\) \.glitch-only \{ display: none !important; \}/.test(makerCssText), 'src/maker.css hides .room-only and .glitch-only by the panel\'s category');
  // the range page plays them: the community's levels as tabs, ?level= as yours, both after the gate
  const glitch = readFileSync(resolve(root, 'src/glitch.js'), 'utf8');
  ok(/from '\.\/rangecheck\.js'/.test(glitch) && /from '\.\/level\.js'/.test(glitch) && /decodeShare\(token\)/.test(glitch) && /get\('level'\)/.test(glitch), 'src/glitch.js decodes ?level= with decodeShare and lints it with rangeLint');
  ok(/base: 'stages\/community\/'/.test(glitch) && /stages\/community\/index\.json/.test(glitch) && /' · community'/.test(glitch) && /' · yours'/.test(glitch), 'src/glitch.js adds every listed range level as a "· community" tab and the address\'s as "· yours"');
  ok(glitch.indexOf('await openGate(') < glitch.indexOf("get('level')") && glitch.indexOf('window.__range.ready = ') > glitch.indexOf('requestAnimationFrame(tick);'), 'the token is read after the gate, and nothing on the page waits on it');
  ok(/community, shared, ready: null/.test(glitch), 'window.__range exposes community, shared and ready for headless checks');
  for (const k of RANGE_KINDS) ok(new RegExp(`${k}: add${k[0].toUpperCase()}${k.slice(1)}Tab`).test(glitch), `src/glitch.js can add a ${k} tab`);
  // the stages page plays the community's rooms
  const stages = readFileSync(resolve(root, 'index.html'), 'utf8');
  for (const id of ['roomsPanel', 'roomList', 'room', 'roomName', 'roomBlurb', 'roomLesson', 'roomStatus', 'roomUndo', 'roomReset', 'roomSolve'])
    ok(new RegExp(`id="${id}"`).test(stages), `index.html has #${id} (the community's rooms)`);
  const gallery = readFileSync(resolve(root, 'src/gallery.js'), 'utf8');
  ok(/from '\.\/room\.js'/.test(gallery) && /stages\/community\/index\.json/.test(gallery) && /base: 'stages\/community\/'/.test(gallery), 'src/gallery.js plays the listed rooms through src/room.js and src/seal.js');
  // and a room that came in a link, as a card of its own
  ok(/import \{ decodeShare, lint, kindOf, isGlitch \} from '\.\/level\.js'/.test(gallery) && /function openShared\(token\)/.test(gallery) && /openRoom, openShared \}/.test(gallery), 'src/gallery.js reads a ?level= link through src/level.js and exposes openShared');
  ok(/id: 'shared', name: level\.name, author: 'a link', kind: kindOf\(level\), shared: true/.test(gallery) && /`Shared · \$\{r\.name\}`/.test(gallery) && /room-card\$\{r\.shared \? ' shared' : ''\}/.test(gallery), 'the shared room is a card "Shared · <name>", class room-card shared, in rooms as id shared');
  ok(/q\.get\('level'\) !== null\) openShared\(q\.get\('level'\)\);\s*else if \(rooms\.some/.test(gallery), '?level= wins over ?room=');
  // a range level is not a room: Rooms lists only the index's rooms, and a link that carries a glitch level is sent to the range page
  ok(/\.filter\(s => !s\.kind \|\| s\.kind === 'tea' \|\| s\.kind === 'chase'\)/.test(gallery), 'the stages page lists the index\'s rooms only: a range level (kind = its range) is glitch.html\'s');
  ok(/if \(isGlitch\(level\)\) throw new Error\('it is a glitch range level/.test(gallery), 'a link that carries a glitch level is refused on the stages page, with where it does open');
  ok(/const sharedGlitch = /.test(js) && /&& !sharedGlitch;/.test(js) && /glitch\.html\?level=\$\{encodeURIComponent\(sharedToken\)\}/.test(js), 'the landing sends a shared glitch level to the range page and keeps it out of the hero');
  {
    const index = JSON.parse(readFileSync(resolve(root, 'stages/community/index.json'), 'utf8'));
    const kept = (index.stages ?? []).filter(s => !s.kind || s.kind === 'tea' || s.kind === 'chase');
    ok(kept.length > 0 && kept.every(s => !RANGE_KINDS.includes(s.kind)) && (index.stages ?? []).some(s => RANGE_KINDS.includes(s.kind)), `the index holds ${kept.length} room(s) for the stages page and at least one range level it leaves to glitch.html`);
  }
  ok(/the shared room could not be opened: \$\{e\.message\}`; \$\('#roomStatus'\)\.className = 'status hot'; return null;/.test(gallery), 'a link that is not a room is said so in #roomStatus (status hot) and nothing crashes');
  ok(/\.room-card\.shared \{/.test(css) && css.indexOf('.room-card.shared {') > css.indexOf('.room-card {'), 'styles.css styles the shared card next to .room-card');
  ok(/data-part="lesson"/.test(html) && !/shareDialog/.test(readFileSync(resolve(root, 'src/tutor.js'), 'utf8')), 'the dialog is the page\'s; the tutorial only hears the export event');
  const roomJs = readFileSync(resolve(root, 'src/room.js'), 'utf8');
  ok(/lessonSteps/.test(roomJs) && /kind: 'room'/.test(roomJs), 'src/room.js shows the lesson and reports as kind room');
  for (const what of LESSON_EVENTS) if (what !== 'open') ok(new RegExp(`tell\\('${what}'`).test(roomJs), `src/room.js reports '${what}', so a lesson can wait on it`);
  ok(/maker\.html/.test(readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8')), 'pages.yml publishes maker.html');
  const makerCss = readFileSync(resolve(root, 'src/maker.css'), 'utf8');
  ok(!/data-theme=|data-flip/.test(makerCss), 'src/maker.css paints from the variables and never names a theme or the turn');
  // the guided builds: the cards in the Learn panel, the choice kept, the bridge steering them
  for (const id of ['learnTitle', 'learnPick']) ok(new RegExp(`id="${id}"`).test(html), `the Learn panel has #${id} (the chosen build's title, the cards)`);
  ok(/<h2><span id="learnTitle">Painting the Roses<\/span> <span id="learnProgress"/.test(html), 'the Learn panel\'s heading is the chosen build\'s title, the first one before the page runs');
  ok(/MAKER_TUTORIALS/.test(mod) && /className = `learn-pick/.test(mod) && /setAttribute\('data-id', t\.id\)/.test(mod) && /' on'/.test(mod), 'src/maker.js draws a card per guided build (button.learn-pick[data-id], the chosen one .on)');
  ok(/'alice\.maker\.tutorial'/.test(mod) && /get\('tutorial'\)/.test(mod) && /'alice\.tutor\.maker'/.test(mod) && /`alice\.tutor\.maker\.\$\{id\}`/.test(mod), 'the choice is remembered (alice.maker.tutorial), ?tutorial= picks one, progress is per build and the first keeps its old key');
  ok(/tutorial: tutorialSummary\(\)/.test(mod) && /step: tutor\.step\?\.id \?\? 'done', at: tutor\.at, of: tutor\.steps\.length/.test(mod), 'get reports the tutorial as { id, title, step, at, of }');
  ok(OPS.includes('tutorial') && /\| "tutorial"/.test(aiPrompt('https://github.com/o/r')), 'the bridge has the tutorial op and the prompt names it');
  const coachJs = readFileSync(resolve(root, 'src/coach.js'), 'utf8');
  ok(/function use\(next/.test(coachJs) && /return \{ feed, render, skip, restart, use, get tutor\(\)/.test(coachJs) && /onRender\(\)/.test(coachJs), 'src/coach.js can put another tutorial under the same coach, and says when it redraws');
  ok(/mountCoach\(first, \{ looks, title = ''/.test(coachJs) && /\$\('#learnTitle'\)/.test(coachJs), 'src/coach.js keeps its API for the stages and the range, and fills #learnTitle where there is one');
  ok(/\.learn-picks \{/.test(makerCss) && /\.learn-pick\.on \{/.test(makerCss) && /html:not\(\[data-look=classic\]\) \.learn-picks \{/.test(makerCss), 'src/maker.css styles the cards, one column in the phone looks');
  const mcpJs = readFileSync(resolve(root, 'software/tools/maker-mcp.mjs'), 'utf8');
  ok(/name: 'maker_tutorial'/.test(mcpJs) && /case 'maker_tutorial': return rpc\('tutorial'/.test(mcpJs), 'the MCP server has maker_tutorial over the tutorial op');
}

// ------------------------------------------------------------- the community ----
// What src/room.js would report while the solver's moves are played, so a
// lesson is proved followable before it ships: the rules' own step functions.
import { parse as parseTea, step as teaStep, isGoal as teaGoal } from '../../src/puzzle.js';
import { parse as parseChase, step as chaseStep, isGoal as chaseGoal } from '../../src/chase.js';
function teaEvents(stage, moves) {
  const map = parseTea(stage.rows);
  let state = map.start;
  const out = [];
  const held = (s) => s.rocks.filter(r => map.buttons.has(r)).length;
  for (const m of moves) {
    const next = teaStep(map, state, m);
    if (!next) { out.push({ kind: 'room', what: 'blocked' }); continue; }
    out.push({ kind: 'room', what: 'move' });
    if (state.rocks.some((r, i) => r !== next.rocks[i])) out.push({ kind: 'room', what: 'push' });
    if (state.lever !== next.lever) out.push({ kind: 'room', what: 'lever' });
    if (held(next) > held(state)) out.push({ kind: 'room', what: 'button' });
    state = next;
    if (teaGoal(map, state)) out.push({ kind: 'room', what: 'win' });
  }
  return out;
}
function chaseEvents(stage, moves) {
  const map = parseChase(stage);
  let state = map.start;
  const out = [{ kind: 'room', what: 'start' }];
  const held = (s) => s.rocks.filter(r => map.buttons.has(r)).length;
  for (const m of moves) {
    const next = chaseStep(map, state, m);
    if (!next) { out.push({ kind: 'room', what: 'caught' }); break; }
    out.push({ kind: 'room', what: 'tick' });
    if (m === 'wait') out.push({ kind: 'room', what: 'wait' });
    if (held(next) > held(state)) out.push({ kind: 'room', what: 'button' });
    state = next;
    if (chaseGoal(map, state)) out.push({ kind: 'room', what: 'win' });
  }
  return out;
}
console.log('the community\'s rooms and range levels');
{
  const dir = resolve(root, 'stages/community');
  const index = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8'));
  const listed = new Set();
  const KINDS = ['tea', 'chase', ...RANGE_KINDS];
  // a community range level may not take a shipped level's id: the range page and its tutorial find a level by it
  const shippedIds = Object.fromEntries(RANGE_KINDS.map(k => [k, new Set(SHIPPED_RANGES[k].levels.map(l => l.id))]));
  ok(Array.isArray(index.stages), 'stages/community/index.json has a "stages" list');
  ok(/'watch' \| 'glass' \| 'lock' \| 'dog' \| 'wall'/.test(index._ ?? ''), 'the index says a range level\'s kind is its range');
  for (const s of index.stages ?? []) {
    const at = `community "${s?.id ?? '?'}"`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s?.id ?? '')) { fail(`${at}: id must be a lower-case slug`); continue; }
    if (listed.has(s.id)) fail(`${at}: duplicate id`);
    listed.add(s.id);
    for (const k of ['name', 'author']) if (typeof s[k] !== 'string' || !s[k].trim()) fail(`${at}: ${k} is required`);
    if (s.kind !== undefined && !KINDS.includes(s.kind)) fail(`${at}: kind must be one of ${KINDS.join(' ')}`);
    const file = resolve(dir, `${s.id}.js`);
    if (!existsSync(file)) { fail(`${at}: stages/community/${s.id}.js is missing`); continue; }
    let stage;
    try {
      const mod = await import(pathToFileURL(file).href);
      stage = stageOf(mod);
    } catch (e) { fail(`${at}: ${e.message}`); continue; }
    if (!stage) { fail(`${at}: exports no stage`); continue; }
    const problems = lint(stage);
    for (const p of problems) fail(`${at}: ${p}`);
    if (problems.length) continue;
    if (s.kind && s.kind !== kindOf(stage)) fail(`${at}: listed as ${s.kind} but the module is ${kindOf(stage)}`);
    if (isGlitch(stage)) {
      const kind = kindOf(stage);
      if (stage.id !== undefined && stage.id !== s.id) fail(`${at}: the module's id is ${stage.id}, the index's ${s.id}`);
      if (shippedIds[kind]?.has(s.id) || shippedIds[kind]?.has(stage.id)) fail(`${at}: ${s.id} is a shipped level's id in the ${kind} range; give it an id of its own`);
      const r = check(stage);
      if (!r.ok) for (const p of r.problems) fail(`${at}: ${p}`);
      else ok(true, `${at}: ${stage.name}, a ${kind} level, ${r.hand ? 'a hand can do it' : 'badge-only'}${r.par ? `, the attacker's cost ${r.par} takes` : ''}`);
      continue;
    }
    const r = check(stage, { limit: 2_000_000 });
    if (!r.ok) for (const p of r.problems) fail(`${at}: ${p}`);
    else ok(true, `${at}: ${stage.name}, ${kindOf(stage)}, par ${r.par}${stage.lesson ? `, a lesson of ${stage.lesson.length}` : ''}`);
    if (r.ok && stage.lesson) {
      // the lesson can be followed: the solver's answer, replayed as the room's events, completes every step in order
      const t = new Tutor(lessonSteps(stage));
      const events = r.kind === 'tea' ? teaEvents(stage, r.moves) : chaseEvents(stage, r.moves);
      for (const e of events) t.feed(e);
      ok(t.done, `${at}: the solution walks the whole lesson (${t.at} of ${t.steps.length} steps)`);
    }
  }
  const ids = (index.stages ?? []).map(s => s.id);
  ok(ids.join() === [...ids].sort().join(), 'the index is sorted by id');
  for (const f of readdirSync(dir)) {
    const m = /^([a-z0-9][a-z0-9-]*)\.js$/.exec(f);
    if (f.endsWith('.js') && !m) fail(`stages/community/${f}: the file name must be a lower-case slug`);
    if (m && !listed.has(m[1])) fail(`stages/community/${f} is not in index.json`);
  }
  ok(index.stages.some(s => RANGE_KINDS.includes(s.kind)) && index.stages.some(s => s.kind === 'tea' || s.kind === 'chase'), 'the index carries a room and a range level, so both paths are walked');
  // the refusals a community range level meets: a shipped id, a lie about its hand
  {
    const taken = { ...rangeBlank('watch', 'Tea time') };
    ok(shippedIds.watch.has(idOf(taken)) && !shippedIds.lock.has(idOf(rangeBlank('lock', 'Who are you?'))), 'a level named after a shipped one takes its id (the studio warns, CI refuses); a name of its own is an id of its own');
    ok(!check({ ...rangeBlank('dog'), openMs: 240, timeoutMs: 300 }).ok, 'a dog level marked hand with a 60 ms window is refused as a community level would be');
  }
  ok(true, `${listed.size} community level(s) listed`);
}

if (failed) { console.error(`verify-maker: ${failed} failure(s)`); process.exit(1); }
console.log('verify-maker: the maker judges, writes and reads rooms as the site does');
