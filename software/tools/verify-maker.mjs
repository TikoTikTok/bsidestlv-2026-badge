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
// folder goes unlisted; and the White Rabbit's guide (src/guide.js): every
// step of the three ways names ops the page has and resolves its
// placeholders, the plans paint sensible cells, the answers do what they
// say, the bridge serves it (the pick, the wait, the answers, the Rabbit
// following the page's build), the MCP server offers it, the page has the
// welcome banner and the invitation says fork first. Part of `npm run verify`.
//
//   node software/tools/verify-maker.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { blank, setCell, resize, lint, check, kindOf, isGlitch, toModule, fromModule, encodeShare, decodeShare, shareUrl, shareInfo, sharePage, SHARE_WHERE,
         SHARE_PARTS, SHARE_LONG, SHARE_TOO_LONG, idOf, normalize,
         lineCells, rectCells, regionCells, paintCells, mirrorCells, flipH, flipV, rotate, shift, analyse, difficulty,
         STARTERS, rng, generate, generateSolvable, lessonToText, lessonFromText } from '../../src/level.js';
import { rangeBlank, RANGE_KINDS, RANGE_FILES, BUDGET } from '../../src/rangecheck.js';
import { stageOf } from '../../src/seal.js';
import { MAKER_TUTORIAL, MAKER_TUTORIALS, Tutor, LESSON_EVENTS, LESSON_TITLES, lessonSteps } from '../../src/tutor.js';
import { startMaker, OPS, repoFacts } from './maker-server.mjs';
import { GUIDE_MODES, GUIDE_IDS, GUIDE_OPS, GUIDE_RULES, PLATFORMS, BROWSER_FIRST, modeById, guideSteps, guideStep, guideText, guideWelcome, applyAnswer, parseSize, fill, boardLine } from '../../src/guide.js';
import { TEA_PARTY } from '../../stages/tea-party.js';
import { QUEENS_GAUNTLET } from '../../stages/queens-gauntlet.js';
import { RABBIT_WATCH } from '../../stages/rabbit-watch.js';
import { LOOKING_GLASS } from '../../stages/looking-glass.js';
import { CATERPILLAR_LOCK } from '../../stages/caterpillar-lock.js';
import { DORMOUSE_WATCHDOG } from '../../stages/dormouse-watchdog.js';
import { HUMPTY_WALL } from '../../stages/humpty-wall.js';
import { aiPrompt, prPrompt, prParts, prShort, repoParts, indexLineText, pagesUrl, roomUrl } from '../../src/invite.js';

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
  // sharePage: where a link opens - play (the default) is the page that plays the level
  const lockLevel = rangeBlank('lock', 'Which way?'), door = (a, b) => JSON.stringify(a) === JSON.stringify(b);   // same() reads rooms; a door is { where, page }
  ok(SHARE_WHERE.join() === 'play,studio,stages,range', 'the places a link may open: play (the default), studio, stages, range');
  ok(door(sharePage(TEA_PARTY), { where: 'stages', page: 'index.html' }) && door(sharePage(TEA_PARTY, 'play'), { where: 'stages', page: 'index.html' }) && door(sharePage(TEA_PARTY, 'stages'), { where: 'stages', page: 'index.html' }), 'play, for a room, is the stages page');
  ok(door(sharePage(lockLevel), { where: 'range', page: 'glitch.html' }) && door(sharePage(lockLevel, 'range'), { where: 'range', page: 'glitch.html' }), 'play, for a glitch level, is the range page');
  ok(sharePage(TEA_PARTY, 'studio').page === 'maker.html' && sharePage(lockLevel, 'studio').page === 'maker.html', 'studio is maker.html for either');
  for (const [lvl, where, re, what] of [[TEA_PARTY, 'range', /a room plays on the stages page/, 'a room sent to the range page'], [lockLevel, 'stages', /a glitch level plays on the range page/, 'a glitch level sent to the stages page'], [TEA_PARTY, 'landing', /no such place 'landing'/, 'a place that is not one']])
    try { sharePage(lvl, where); fail(`${what} should be refused`); } catch (e) { ok(re.test(e.message), `${what} is refused: ${e.message}`); }
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
    rabbit: [
      ['blank', ev('load', { id: 'blank', from: 'starter' })], ['name', ev('name', { name: 'The Pantry' })],
      ['wall', ev('paint', { ch: '#', cells: 3, tool: 'pencil' })], ['rock', ev('paint', { ch: 'O', cells: 1, tool: 'pencil' })],
      ['button', ev('paint', { ch: 'b', cells: 1, tool: 'pencil' })], ['formed', ev('lint', { ok: true, problems: [] })],
      ['check', ev('check', { ok: true, par: 12, rules: 'tea', gate: null })], ['play', ev('play', { rules: 'tea' })],
      ['move', ev('move', { dir: 'E' })], ['win', ev('win', { moves: 12 })], ['blurb', ev('blurb', { chars: 30 })], ['export', ev('export', { how: 'link' })],
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
    rabbit: [ev('load', { id: 'gate', from: 'starter' }), ev('name', { name: 'An Untitled Room' }), ev('name', { name: 'Ab' }), ev('paint', { ch: '.', cells: 1, tool: 'pencil' }), ev('lint', { ok: false, problems: ['x'] }), ev('check', { ok: false, gate: null }), ev('move', { dir: 'wait' }), ev('blurb', { chars: 4 }), ev('export', { how: 'png' }), edge],
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

// ----------------------------------------------------------------- the guide ----
// The White Rabbit's guide: the three ways, every step well formed and naming
// ops the page has, the plans worked out against a room, the answers, the
// text a small model follows, and what each platform has.
console.log("the White Rabbit's guide tells an assistant what to say, ask and do, one step at a time");
{
  const room = normalize({ name: 'The Pantry', rows: ['#########', '#A......#', '#.......#', '#.......#', '#.......#', '#......D#', '#########'] });
  const report = { ok: true, kind: 'tea', par: 9, moves: ['E', 'E', 'S', 'S', 'E', 'E', 'E', 'E', 'S'], notes: [] };
  const ctx = { vars: { name: 'The Pantry', width: 11, height: 8, flavour: 'garden', theme: 'garden', blurb: 'A first room.', starter: 'corridor', author: 'me', where: 'fork', difficulty: 'a stroll' },
                level: room, lint: [], report, tutorial: { id: 'rabbit', at: 0, of: 12, step: 'blank' }, assistant: 'the verifier', fork: 'someone/their-badge', upstream: 'bsidestlv/bsidestlv-2026-badge', login: 'someone', page: 'https://someone.github.io/their-badge/', repo: 'https://github.com/bsidestlv/bsidestlv-2026-badge' };
  ok(GUIDE_MODES.length === 3 && GUIDE_IDS.join() === 'tutorial,fast,basic' && GUIDE_MODES.every(m => m.icon && m.title && m.kicker && m.blurb && m.time), 'three ways, each with an icon, a title, a kicker, a blurb and a time');
  ok(modeById('tutorial').tutorial === 'rabbit' && MAKER_TUTORIALS.some(t => t.id === 'rabbit') && modeById('nope') === null, 'the Rabbit rides on the page\'s guided build "rabbit"');
  ok(GUIDE_RULES.length >= 8 && GUIDE_RULES.some(r => /one step at a time/i.test(r)) && GUIDE_RULES.some(r => /AskUserQuestion/.test(r)) && GUIDE_RULES.some(r => /their hands|do it for me/i.test(r)), 'the rules: one step at a time, option buttons where they exist, their hands on the brush');
  for (const mode of GUIDE_IDS) {
    const steps = guideSteps(mode);
    ok(steps.length >= 7, `${mode}: ${steps.length} steps`);
    const ids = new Set();
    steps.forEach((s, i) => {
      ok(!ids.has(s.id), `${mode}/${s.id}: an id of its own`); ids.add(s.id);
      ok(s.title && s.say && s.done && ['answer', 'auto', 'page'].includes(s.next), `${mode}/${s.id}: a title, a say, a done, a next`);
      if (s.ask) ok(s.ask.q && s.ask.options.length >= 2 && s.ask.options.length <= 4 && s.ask.options.every(o => o.label && o.then) && s.ask.other?.hint && s.ask.other?.then, `${mode}/${s.id}: one question, 2 to 4 options with a then, and room for their own words`);
      const c = guideStep(mode, i, ctx);
      ok(c.at === i && c.of === steps.length && c.id === s.id && !c.over, `${mode}/${s.id}: guideStep is step ${i + 1} of ${steps.length}`);
      for (const d of [...c.do, ...(c.help?.do ?? [])]) ok(GUIDE_OPS.includes(d.op) && OPS.includes(d.op) && typeof d.args === 'object', `${mode}/${s.id}: the plan's op '${d.op}' is one the page has`);
      const text = guideText(mode, i, ctx);
      ok(!/<\w+\?>/.test(c.say) && !/<\w+\?>/.test(text) && !/<\w+\?>/.test(JSON.stringify(c.ask ?? {})), `${mode}/${s.id}: every placeholder resolves`);
      ok(/SAY to the person/.test(text) && /DONE WHEN:/.test(text) && (!c.ask || /ASK one question/.test(text)) && (!c.help || /HELP - when they ask/.test(text)), `${mode}/${s.id}: the text says what to say, ask, help and when it is done`);
    });
    ok(steps.at(-1).id === 'finish' && steps.some(s => s.id === 'publish') && steps.find(s => s.id === 'publish').work.length >= 5, `${mode}: ends with the person's page and a finish; the publish step spells out the repository work`);
    ok(guideStep(mode, steps.length, ctx).over === true && /done/.test(guideText(mode, steps.length, ctx)), `${mode}: past the end it is over`);
    ok(/HOW TO BEHAVE/.test(guideText(mode, 0, ctx)) && !/HOW TO BEHAVE/.test(guideText(mode, 1, ctx)) && /RULES:/.test(guideText(mode, 1, ctx)), `${mode}: the rules are spelled out on the first step and one line after`);
  }
  // the Rabbit's steps are the page's, step for step, each with a help plan
  const rabbit = MAKER_TUTORIALS.find(t => t.id === 'rabbit');
  const rs = guideSteps('tutorial');
  ok(rabbit.steps.every((s, i) => rs[i].id === s.id && rs[i].page === i && rs[i].help && rs[i].next === 'page') && rs.length === rabbit.steps.length + 2, 'the Rabbit narrates every step of the page\'s build, each with a help plan, then the page and the finish');
  ok(rs.every((s, i) => i >= rabbit.steps.length || /moved past this step/.test(guideStep('tutorial', i, ctx).done)), 'a Rabbit step is done when the page\'s tutorial moves past it');
  // the plans, against the room
  const plan = (mode, i, c = {}) => guideStep(mode, i, { ...ctx, ...c });
  const wall = plan('tutorial', 2).help.do;
  ok(wall.length === 1 && wall[0].op === 'paint' && wall[0].args.cells.length === 3 && wall[0].args.cells.every(([x, y, ch]) => ch === '#' && room.rows[y][x] === '.'), 'the wall plan paints three floor cells in a line');
  let next = room; for (const [x, y, ch] of wall[0].args.cells) next = setCell(next, x, y, ch);
  const rock = plan('tutorial', 3, { level: next }).help.do;
  ok(rock[0].op === 'paint' && rock[0].args.cells.length === 1 && rock[0].args.cells[0][2] === 'O' && ((c) => next.rows[c[1]][c[0] - 1] === '.' && next.rows[c[1]][c[0] + 1] === '.')(rock[0].args.cells[0]), 'the rock plan puts a rock where it can be pushed');
  next = setCell(next, ...rock[0].args.cells[0]);
  const button = plan('tutorial', 4, { level: next }).help.do;
  ok(button[0].args.cells[0][2] === 'b' && button[0].args.cells[0][1] === rock[0].args.cells[0][1] && Math.abs(button[0].args.cells[0][0] - rock[0].args.cells[0][0]) >= 2, 'the button plan puts the button in the rock\'s row, two or more cells away');
  next = setCell(next, ...button[0].args.cells[0]);
  ok(lint(next).length === 0 && plan('tutorial', 5, { level: next }).help.do.length === 0, 'the three plans leave a well-formed room, so the formed plan has nothing to do');
  const twoRocks = setCell(next, 2, 4, 'O');
  const formed = plan('tutorial', 5, { level: twoRocks }).help.do;
  ok(formed[0].op === 'paint' && formed[0].args.cells.length === 1 && formed[0].args.cells[0][2] === 'b', 'the formed plan paints the button a second rock lacks');
  ok(plan('tutorial', 8).help.do[0].op === 'moves' && plan('tutorial', 8).help.do[0].args.moves.join() === 'E' && plan('tutorial', 9).help.do.map(d => d.op).join() === 'play,moves' && plan('tutorial', 9).help.do[1].args.moves.length === report.moves.length, 'the move plan plays the first move of the solution, the win plan starts the run over and plays all of them');
  ok(plan('tutorial', 9, { report: null }).help.do.map(d => d.op).join() === 'check,play,moves' && /</.test(plan('tutorial', 9, { report: null }).help.do[2].args.moves[0]), 'without a Check the win plan checks first and leaves the moves to fill');
  ok(plan('tutorial', 0).help.do[0].op === 'load' && plan('tutorial', 1).help.do[0].op === 'patch' && plan('tutorial', 1).help.do[0].args.name === 'The Pantry' && plan('tutorial', 10).help.do[0].args.blurb === 'A first room.' && plan('tutorial', 11).help.do[0].op === 'share', 'the blank, name, blurb and export plans: load, patch, patch, share');
  const paint = plan('fast', 4, { vars: { ...ctx.vars, flavour: 'gate', width: 13, height: 9 } });
  ok(paint.before && paint.do.map(d => d.op).join() === 'generate,patch,check,snapshot' && paint.do[0].args.gate === true && paint.do[0].args.width === 13 && paint.do[0].args.rocks === 2 && paint.do[1].args.name === 'The Pantry' && paint.do[1].args.theme === 'garden', 'the fast lane\'s paint plan: generate with the knobs, patch the name and dressing, check, a picture');
  ok(plan('fast', 4, { vars: { ...ctx.vars, flavour: 'chase' } }).do[0].args.timed === true && plan('fast', 4, { vars: { ...ctx.vars, width: 17, height: 11 } }).do[0].args.rocks === 3, 'a chase is timed, a grand room gets a rock more');
  ok(plan('basic', 1).do.map(d => d.op).join() === 'load,patch,check,snapshot' && plan('basic', 1).do[0].args.id === 'corridor' && plan('basic', 2).do[0].args.theme === 'garden', 'the one-bite starter: load the starter, name it, check, a picture; then the dressing');
  ok(plan('fast', 8).do[0].op === 'pr' && plan('fast', 8).work.some(w => /gh pr create --repo someone\/their-badge --base main/.test(w)) && plan('fast', 8).work.some(w => /build_type=workflow/.test(w) && /gh workflow enable pages\.yml/.test(w)) && plan('fast', 8).work.some(w => /https:\/\/someone\.github\.io\/their-badge\/index\.html\?room=the-pantry/.test(w)) && plan('fast', 8).work.some(w => /--repo bsidestlv\/bsidestlv-2026-badge --base main --head someone:community\/the-pantry/.test(w)),
     'the publish step: the brief, the pull request on the fork, the site switched on, the room\'s address on their page, the pull request upstream');
  // the answers
  const shape = plan('fast', 1);
  ok(applyAnswer(shape, '2', {}).vars.width === 13 && applyAnswer(shape, 'Grand', {}).vars.height === 11 && applyAnswer(shape, '11x8', {}).vars.width === 11 && applyAnswer(shape, '11 by 8', {}).vars.height === 8 && applyAnswer(shape, 'enormous', {}).then === 'stay', 'a size: by number, by label, by 11x8, and a word that is not one stays');
  ok(parseSize('11x8').width === 11 && parseSize('3x3').width === 5 && parseSize('99×40').height === 24 && parseSize('big') === null, 'parseSize clamps to 5..24');
  const flavour = plan('fast', 2);
  ok(applyAnswer(flavour, 'A locked gate', {}).vars.flavour === 'gate' && applyAnswer(flavour, 'something with the queen chasing', {}).vars.flavour === 'chase' && ['garden', 'gate', 'chase'].includes(applyAnswer(flavour, 'Surprise me', {}).vars.flavour), 'a flavour: by label, by a word, and the dice');
  const fp = plan('fast', 4, { vars: { ...ctx.vars, minPar: 16, rocks: 2 } });
  const harder = applyAnswer(fp, 'Harder', { minPar: 16, rocks: 2 });
  ok(harder.then === 'again' && harder.vars.minPar === 24 && harder.vars.rocks === 3 && applyAnswer(fp, 'Easier', { minPar: 16, rocks: 2 }).vars.rocks === 1 && applyAnswer(fp, 'Keep it', {}).then === 'next' && /Kept/.test(applyAnswer(fp, '1', {}).say) && applyAnswer(fp, 'Roll again', { roll: 1 }).vars.roll === 2 && applyAnswer(fp, 'more walls please', {}).then === 'again', 'the knobs: harder, easier, keep, roll again, a wish in words');
  const name = plan('fast', 0);
  ok(applyAnswer(name, "The Mad Hatter's Pantry", {}).vars.name === "The Mad Hatter's Pantry" && applyAnswer(name, '1', {}).vars.name === name.ask.options[0].label && applyAnswer(name, 'ab', {}).then === 'stay', 'a name: their own words, or a borrowed one; too short stays');
  const rname = plan('tutorial', 1);
  ok(applyAnswer(rname, 'The Pantry', {}).then === 'help' && applyAnswer(rname, 'The Pantry', {}).vars.name === 'The Pantry' && applyAnswer(rname, 'I typed one ✓', {}).then === 'check' && applyAnswer(rname, 'Why does this matter?', {}).then === 'why' && applyAnswer(rname, 'do it for me', {}).then === 'help' && applyAnswer(rname, 'skip', {}).then === 'skip' && applyAnswer(rname, 'ok', {}).then === 'check',
     'on the Rabbit a name typed to the assistant is help; done-, why-, help- and skip-shaped answers are what they mean, whatever the step\'s options');
  const where = plan('fast', 7);
  ok(applyAnswer(where, 'On my GitHub page', {}).vars.where === 'fork' && applyAnswer(where, 'Just the link for now', {}).then === 'finish' && applyAnswer(where, 'both please', {}).vars.where === 'both', 'where it lives: the fork, the link (straight to the finish), both');
  ok(applyAnswer(plan('fast', 9), 'The full tour', {}).then === 'mode:tutorial' && applyAnswer(plan('fast', 9), 'Another room', {}).then === 'restart' && applyAnswer(plan('tutorial', 13), 'A Room with a Gate', {}).then === 'tutorial:gate', 'the finish offers the other ways and the next build');
  // the text, worded for the platform
  ok(/use your option buttons \(AskUserQuestion\)/.test(guideText('fast', 1, { ...ctx, platform: 'claude' })) && /list the options numbered/.test(guideText('fast', 1, { ...ctx, platform: 'codex' })) && /list the options numbered/.test(guideText('fast', 1, ctx)), 'the ask is worded for the platform: buttons on Claude Code, a numbered list elsewhere and by default');
  ok(GUIDE_IDS.every(id => [...Array(guideStep(id, 0, {}).of).keys()].every(i => typeof guideStep(id, i, {}).why === 'string' && guideStep(id, i, {}).why.length > 40)), 'every step of every way has a why: the page\'s card shows it, "why?" says it');
  ok(/the page shows this step too/.test(guideText('fast', 1, ctx)) && /the page carries the step/.test(guideText('fast', 1, ctx)) && GUIDE_RULES.some(r => /Every step is on the page too/.test(r) && /Do it for me/.test(r) && /a line a step/.test(r)), 'the text and the rules say the page carries every step, so the assistant adds a line and does not repeat it');
  ok(typeof BROWSER_FIRST === 'string' && /own browser pane first/.test(BROWSER_FIRST) && /default browser/.test(BROWSER_FIRST) && boardLine({ url: 'http://localhost:8090' }).includes('http://localhost:8090/maker.html') && boardLine({}).includes(BROWSER_FIRST) && /preview_start/.test(boardLine({})) && /maker_open \{ browser: true \}/.test(boardLine({})) && /http:\/\/localhost:8080\/maker\.html/.test(boardLine({})),
     'with no page open the board line says where to open it: the assistant\'s own browser pane first, the person\'s browser last, the address');
  ok(/maker_guide \{"run": true\}/.test(guideText('fast', 4, ctx)) && /POST \/__maker\/guide \{"run": true\}/.test(guideText('fast', 4, ctx)) && /maker_guide \{"answer": "<what they said>", "at": 0\}/.test(guideText('fast', 0, ctx)) && /maker_guide \{"next": true\}/.test(guideText('fast', 8, ctx)), 'the text names both doors: the MCP tool and the HTTP route, for run, answer and next');
  ok(/page tutorial "rabbit" at 0 of 12/.test(boardLine(ctx)) && /checked: par 9 moves/.test(boardLine(ctx)) && /nothing reported yet/.test(boardLine({})), 'the board line says what is on the board');
  ok(fill('{name} in {theme}', { name: 'x', theme: 'y' }) === 'x in y' && fill('{gone}', {}) === '<gone?>', 'fill leaves a visible gap for an unknown placeholder');
  const welcome = guideWelcome(ctx);
  ok(GUIDE_MODES.every(m => welcome.includes(m.title)) && /waitMs/.test(welcome) && /the verifier/.test(welcome) && /HOW TO BEHAVE/.test(welcome), 'the welcome names the three ways, how to wait for the pick, who the assistant is, and the rules');
  ok(PLATFORMS.length >= 8 && PLATFORMS.every(p => p.id && p.name && p.connect && p.ask && p.run && typeof p.browser === 'string' && p.browser.length > 20 && typeof p.buttons === 'boolean') && ['claude', 'codex', 'cursor', 'copilot', 'gemini', 'hermes', 'grok', 'chatgpt', 'any'].every(id => PLATFORMS.some(p => p.id === id)) && PLATFORMS.filter(p => p.buttons).map(p => p.id).join() === 'claude',
     'every platform: how it connects, asks, runs the maker and which browser of its own opens the page; Claude Code is the one with option buttons');
  ok(/preview_start/.test(PLATFORMS.find(p => p.id === 'claude').browser) && /Simple Browser/.test(PLATFORMS.find(p => p.id === 'cursor').browser) && /Simple Browser/.test(PLATFORMS.find(p => p.id === 'copilot').browser) && PLATFORMS.filter(p => /first/.test(p.run) && /--no-open/.test(p.run)).length >= 6 && PLATFORMS.filter(p => /default browser/.test(p.browser)).length >= 6,
     'the pane first: Claude Code\'s built-in browser, the editors\' Simple Browser, --no-open then the page in its own browser on every platform that has one, the person\'s default browser last');
  for (const [id, file] of [['claude', '.mcp.json'], ['codex', '.codex/config.toml'], ['cursor', '.cursor/mcp.json'], ['copilot', '.vscode/mcp.json'], ['gemini', '.gemini/settings.json']])
    ok(PLATFORMS.find(p => p.id === id).connect.includes(file) && existsSync(resolve(root, file)), `${id}: its configuration file ${file} is named and in the repository`);
}

// -------------------------------------------------------------- the invitation ----
console.log('the invitation and the pull-request brief tell an assistant everything it needs');
{
  const repo = 'https://github.com/someone/their-badge';
  const inv = aiPrompt(repo);
  ok(inv.includes(repo) && /npm run maker/.test(inv) && /__maker\/rpc/.test(inv) && /maker-mcp\.mjs|\.mcp\.json/.test(inv), 'the invitation names the repository, npm run maker, the bridge and the MCP server');
  ok(/"pr"/.test(inv) && /maker_pr_brief/.test(inv), 'and says the page can hand over the pull-request brief: op pr, or maker_pr_brief');
  ok(/^1\. Fork first/m.test(inv) && inv.includes('gh repo fork someone/their-badge --clone') && /cd their-badge/.test(inv) && /gh api -X POST repos\/<my-login>\/their-badge\/pages -f build_type=workflow/.test(inv) && /gh workflow enable pages\.yml/.test(inv) && /https:\/\/<my-login>\.github\.io\/their-badge\//.test(inv),
     'fork first: gh repo fork --clone, the fork\'s Pages switched on (build_type=workflow, the workflow enabled), the address of their page');
  ok(/AGENTS\.md/.test(inv) && /welcome banner/.test(inv) && /Follow the White Rabbit/.test(inv) && /Drink Me/.test(inv) && /Eat Me/.test(inv) && /maker_guide \{"waitMs": 120000\}/.test(inv) && /GET \/__maker\/guide\?wait=120000/.test(inv) && /"mode": "tutorial" \| "fast" \| "basic"/.test(inv),
     'the invitation says AGENTS.md is the map, names the banner and the three ways, and how to wait for the pick or pick');
  ok(/maker_guide \{"answer": "\.\.\."\}/.test(inv) && /\{"run": true\}/.test(inv) && /\{"help": true, "run": true\}/.test(inv) && /AskUserQuestion/.test(inv) && /numbered list/.test(inv) && /maker_say/.test(inv), 'and how to follow a step: the answer back, run, help, option buttons or a numbered list, the page\'s chat');
  for (const f of ['.mcp.json', '.cursor/mcp.json', '.codex/config.toml', '.gemini/settings.json', '.vscode/mcp.json']) ok(inv.includes(f), `the invitation names ${f}`);
  ok(/npm run maker -- --no-open/.test(inv) && /YOUR OWN browser first/.test(inv) && /built-in browser pane/.test(inv) && /Simple Browser/.test(inv) && /maker_open \{"browser": true\}/.test(inv) && /my default browser/.test(inv) && /Every step is on the page too/.test(inv) && /a line a step/.test(inv),
     'the invitation says to open the page in the assistant\'s own browser pane first (the person\'s browser only when it has none) and that every step is on the page');
  ok(/index\.html\?room=<id>/.test(inv) && /pull request on my fork/.test(inv) && /offers it to someone\/their-badge/.test(inv), 'and ends on their page, then the site');
  ok(pagesUrl('me', repo) === 'https://me.github.io/their-badge/' && roomUrl('me', repo, TEA_PARTY) === `https://me.github.io/their-badge/index.html?room=${idOf(TEA_PARTY)}` && roomUrl('me', repo, { name: 'x', range: 'lock' }) === 'https://me.github.io/their-badge/glitch.html', 'pagesUrl and roomUrl: where a fork\'s site is and where a room plays on it');
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
  ok(brief.includes(`https://<your GitHub login>.github.io/their-badge/index.html?room=${id}`) && /against the fork's main, merged, puts the room on my page/.test(brief) && /do that first when I ask for my page/.test(brief), 'the brief knows a fork\'s own pull request puts the room on the fork\'s page');
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
  const { port, url, bridge, close } = await startMaker({ root, port: 0, facts: { fork: 'someone/their-badge', upstream: 'bsidestlv/bsidestlv-2026-badge', login: 'someone', page: 'https://someone.github.io/their-badge/', repo: 'https://github.com/bsidestlv/bsidestlv-2026-badge' } });
  const api = async (method, path, body, headers = {}) => { const r = await fetch(`${url}/__maker${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  ok(port > 0 && (await api('GET', '/')).body.bridge === 1, `the bridge answers on a free port (${port})`);
  ok((await api('GET', '/')).body.ops.join() === OPS.join(), 'and names its ops');
  ok((await fetch(`${url}/maker.html`)).status === 200 && (await fetch(`${url}/src/level.js`)).headers.get('content-type').startsWith('text/javascript'), 'the static side still serves the page and its modules');
  let r = await api('POST', '/rpc', { op: 'get' });
  ok(r.status === 503 && /no maker page/.test(r.body.error), 'an rpc with no page open is refused with a hint');
  // a fake page: the event stream, run each command, answer
  const seen = [], patched = [], guided = [], asked = [], generated = [];
  let lastTutorial = { id: 'roses', title: 'Painting the Roses', step: 'brush', at: 0, of: 16 };
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
        if (cmd.op === 'guide' && cmd.id === undefined) { guided.push(cmd.args); continue; }   // the bridge tells the page of a pick made for the person
        if (cmd.op === 'ask' && cmd.id === undefined) { asked.push(cmd.args); continue; }      // the guide's question, to the page as buttons
        if (cmd.id === undefined) continue;
        if (cmd.op === 'get') await api('POST', '/reply', { id: cmd.id, result: { level: TEA_PARTY, lint: [], tutorial: lastTutorial } });   // the guide reads the page fresh through get
        else if (cmd.op === 'set') await api('POST', '/reply', { id: cmd.id, result: { lint: lint(cmd.args.level) } });
        else if (cmd.op === 'tutorial') await api('POST', '/reply', { id: cmd.id, result: { id: cmd.args?.id ?? 'roses', title: cmd.args?.id ?? 'Painting the Roses', step: 'blank', at: 0, of: 13 } });
        else if (cmd.op === 'check') await api('POST', '/reply', { id: cmd.id, error: 'the room is malformed' });
        else if (cmd.op === 'share') { const door = sharePage(TEA_PARTY, cmd.args.where ?? 'play'); const url = shareUrl(new URL(door.page, cmd.args.at === 'site' ? cmd.args.site : 'http://localhost/').href, TEA_PARTY, cmd.args); await api('POST', '/reply', { id: cmd.id, result: { url, token: new URL(url).searchParams.get('level'), ...shareInfo(url), where: door.where, at: cmd.args.at ?? 'here', page: door.page } }); }
        else if (cmd.op === 'pr') await api('POST', '/reply', { id: cmd.id, result: { ...prParts(TEA_PARTY, { author: cmd.args?.author }), brief: prPrompt('https://github.com/someone/their-badge', TEA_PARTY, { author: cmd.args?.author }) } });
        else if (cmd.op === 'patch') { patched.push(cmd.args); await api('POST', '/state', { level: { ...TEA_PARTY, ...cmd.args }, lint: [], report: null, tutorial: lastTutorial }); await api('POST', '/reply', { id: cmd.id, result: { level: { ...TEA_PARTY, ...cmd.args }, lint: [], kind: 'tea' } }); }
        else if (cmd.op === 'load') await api('POST', '/reply', { id: cmd.id, result: { level: blank(9, 7), lint: lint(blank(9, 7)) } });
        else if (cmd.op === 'guide') { guided.push(cmd.args); if (cmd.id !== undefined) await api('POST', '/reply', { id: cmd.id, result: { mode: cmd.args?.mode ?? null, open: !!cmd.args?.show } }); }
        else if (cmd.op === 'snapshot') await api('POST', '/reply', { id: cmd.id, result: { png: 'data:image/png;base64,AAAA', note: 'a picture' } });
        else if (cmd.op === 'generate') { generated.push(cmd.args); await api('POST', '/reply', { id: cmd.id, result: { level: TEA_PARTY, seed: 7, report: { ok: true, kind: 'tea', par: 106, moves: [] } } }); }
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
  // the guide: nothing picked, the page picks, the wait wakes, the answers drive it, the Rabbit follows the page
  r = await api('GET', '/guide');
  ok(r.status === 200 && r.body.mode === null && r.body.modes.length === 3 && /waiting for the person's pick/.test(r.body.text) && (await api('GET', '/')).body.guide.mode === null, 'no way picked: the welcome, the three ways, and the status says so');
  ok((await api('POST', '/guide', { answer: 'x' })).body.did === 'nothing picked yet', 'an answer before the pick is told so');
  r = await api('POST', '/guide', { mode: 'nope' });
  ok(r.status === 400 && /no such way/.test(r.body.error), 'an unknown way is refused with the list');
  const waitPick = api('GET', '/guide?wait=5000');
  await new Promise(r => setTimeout(r, 50));
  const before = (await api('GET', '/inbox?since=0')).body.latest;
  r = await api('POST', '/guide', { mode: 'fast', from: 'page' });
  ok(r.status === 200 && r.body.did === 'picked' && r.body.mode === 'fast' && r.body.at === 0 && r.body.of === 10 && r.body.step.id === 'name' && /step 1 of 10/.test(r.body.text) && /HOW TO BEHAVE/.test(r.body.text), 'the page picks Drink Me: step 1 of 10, the rules spelled out');
  r = await waitPick;
  ok(r.status === 200 && r.body.mode === 'fast' && r.body.step.id === 'name', 'the assistant\'s wait for the pick wakes with the first step');
  r = await api('GET', `/inbox?since=${before}`);
  ok(r.body.messages.length === 1 && r.body.messages[0].kind === 'guide' && r.body.messages[0].data.mode === 'fast' && /picked "Drink Me"/.test(r.body.messages[0].text), 'and the inbox has the pick as a line of kind guide');
  await settle();
  ok(guided.length === 0, 'a pick from the page is not echoed back to it');
  ok(asked.length === 1 && asked[0].id === 'name' && asked[0].at === 0 && asked[0].of === 10 && asked[0].options.length === 3 && /call your room/.test(asked[0].q) && asked[0].other, 'the first question goes to the page as a card: the step, its options, room for their own words');
  ok(/title on the stages page/.test(asked[0].why) && /^Board: /.test(asked[0].board) && asked[0].next === 'answer' && asked[0].before === false && Array.isArray(asked[0].does) && asked[0].work === null && asked[0].options.every(o => o.then === 'next'), 'and the whole step with it: the why, the board in a line, what moves on, what the assistant does, each option\'s then');
  r = await api('POST', '/guide', { mode: 'basic' });
  ok(r.body.did === 'already picked on the page' && r.body.mode === 'fast' && /picked "Drink Me" on the banner/.test(r.body.say), 'an assistant picking another way right after the person picked on the banner is told, not obeyed');
  r = await api('POST', '/guide', { answer: 'The Mad Hatter\'s Pantry' });
  ok(r.body.did === 'next' && r.body.at === 1 && r.body.step.id === 'shape' && r.body.vars.name === 'The Mad Hatter\'s Pantry' && /"The Mad Hatter's Pantry" - lovely/.test(r.body.step.say), 'an answer in their own words is kept and the guide moves on, filling the next say with it');
  r = await api('POST', '/guide', { answer: '2' });
  ok(r.body.did === 'next' && r.body.vars.width === 13 && r.body.vars.height === 9, 'an option by number');
  r = await api('POST', '/guide', { answer: 'gate', at: 2 });
  ok(r.body.did === 'next' && r.body.vars.flavour === 'gate' && r.body.step.id === 'dressing', 'an option by value, for the step the assistant was shown');
  r = await api('POST', '/guide', { answer: 'The court', at: 2 });
  ok(r.body.did === 'moved' && r.body.step.id === 'dressing' && /✓ A flavour/.test(r.body.say), 'an answer for a step already passed is not taken for the next one');
  await settle();
  ok(asked.at(-1).id === 'dressing' && asked.filter(a => a.id === 'dressing').length === 1 && asked.map(a => a.id).join() === 'name,shape,flavour,dressing', 'every step\'s question reached the page once, in order');
  // the person presses a button on the page: applied at once, the next step's work done before its question, the assistant told
  const n0 = (await api('GET', '/inbox?since=0')).body.latest;
  r = await api('POST', '/guide', { answer: 'The hall', at: 3, from: 'page' });
  await settle();
  ok(r.body.did === 'next' && r.body.vars.theme === 'hall' && r.body.step.id === 'paint' && Array.isArray(r.body.ranNext) && r.body.ranNext[0].op === 'generate' && generated.length === 1 && generated[0].gate === true, 'a press on the page answers the step and the paint plan runs before the page is asked to keep or roll');
  const pressed = (await api('GET', `/inbox?since=${n0}`)).body.messages.find(m => m.kind === 'answer');
  ok(pressed && pressed.data.option === 'The hall' && pressed.data.at === 3 && /pressed "The hall" on the page/.test(pressed.text), 'and the inbox tells the assistant what was pressed');
  ok(asked.at(-1).id === 'paint' && asked.at(-1).options.map(o => o.label)[0] === 'Keep it ✓' && asked.at(-1).before === true && asked.at(-1).does.includes('generate') && /checked|not checked/.test(asked.at(-1).board) && asked.at(-1).options[1].then === 'again' && /dice/.test(asked.at(-1).help), 'the keep-or-roll question is on the page, with what the plan did, the board and the help');
  r = await api('POST', '/guide', { answer: 'The court', at: 3 });
  ok(r.body.did === 'moved' && /they answered "The hall" on the page/.test(r.body.say) && r.body.last.by === 'page' && r.body.last.answer === 'The hall', 'the assistant\'s late answer is told what the person chose on the page');
  r = await api('POST', '/guide', { answer: 'The court' });   // no at: the assistant answers the current step (paint) with a dressing - a wish, so the step rolls again
  ok(r.body.did === 'again' && r.body.step.id === 'paint', 'back on the paint step');
  ok(r.body.step.id === 'paint' && r.body.step.before && r.body.step.do[0].op === 'generate' && r.body.step.do[0].args.gate === true && r.body.step.do[0].args.width === 13 && r.body.step.do[1].args.theme === 'hall', 'the paint step\'s plan is worked out from the four answers');
  r = await api('POST', '/guide', { answer: 'Harder' });
  ok(r.body.did === 'again' && r.body.at === 4 && r.body.vars.minPar === 24 && r.body.step.do[0].args.minPar === 24 && r.body.step.do[0].args.rocks === 3, 'Harder turns the knobs and stays on the step');
  await settle();
  ok(asked.filter(a => a.id === 'paint').length >= 2, 'a roll puts the keep-or-roll question on the page again');
  r = await api('POST', '/guide', { answer: 'Keep it' });
  ok(r.body.did === 'next' && r.body.step.id === 'play' && /Kept!/.test(r.body.say), 'Keep it moves on with a word');
  r = await api('POST', '/guide', { step: 6 });
  ok(r.body.at === 6 && r.body.step.id === 'words', 'a jump to a step');
  r = await api('POST', '/guide', { answer: 'A tiny room with a big idea.', run: true });
  await settle();
  ok(r.body.did === 'next' && r.body.ran?.length === 1 && r.body.ran[0].op === 'patch' && patched.at(-1)?.blurb === 'A tiny room with a big idea.' && r.body.step.id === 'keep', 'run: the bridge does the step\'s plan through the page (patch) and moves on');
  ok(applyAnswer(guideStep('fast', 6, {}), 'Push, think, push again.', {}).vars.blurb === 'Push, think, push again. Mind the corners.', 'a prefix of an option is that option');
  r = await api('POST', '/guide', { run: true });
  ok(r.body.did === 'ran' && r.body.ran[0].op === 'share' && r.body.ran[0].result.url.startsWith('https://someone.github.io/their-badge/index.html?level=') && seen.at(-1).op === 'share' && seen.at(-1).args.where === 'play' && seen.at(-1).args.at === 'site' && seen.at(-1).args.site === 'https://someone.github.io/their-badge/', 'run on a step with a plan before its ask: the share link, where the room plays, at the fork\'s published page');
  r = await api('POST', '/guide', { answer: 'Just the link for now' });
  ok(r.body.did === 'finish' && r.body.step.id === 'finish', 'Just the link skips to the finish');
  r = await api('POST', '/guide', { answer: 'The full tour' });
  await settle();
  ok(r.body.did === 'picked' && r.body.mode === 'tutorial' && r.body.at === 0 && r.body.of === 14 && r.body.step.id === 'blank' && guided.at(-1)?.mode === 'tutorial' && guided.at(-1)?.by === 'agent', 'the finish can start another way; a pick from the assistant is sent to the page as op guide');
  // the Rabbit follows the page's own build
  lastTutorial = { id: 'rabbit', title: 'Follow the White Rabbit', step: 'name', at: 1, of: 12 };
  await api('POST', '/state', { level: TEA_PARTY, lint: [], report: null, tutorial: lastTutorial });
  r = await api('GET', '/guide');
  ok(r.body.at === 1 && r.body.step.id === 'name' && /page tutorial "rabbit" at 1 of 12/.test(r.body.text), 'the Rabbit\'s step is the page\'s');
  const askedBefore = asked.length;
  lastTutorial = { id: 'rabbit', title: 'Follow the White Rabbit', step: 'wall', at: 2, of: 12 };
  await api('POST', '/post', { text: '✓ Name it (2 of 12)', kind: 'tutorial', data: { id: 'rabbit', step: 'name', at: 2, of: 12 } });
  await settle();
  ok(asked.length === askedBefore + 1 && asked.at(-1).id === 'wall' && asked.at(-1).options[0].label === 'Wall painted ✓' && asked.at(-1).help, 'a step the person finishes on the page brings the next question (and its help) to the page at once');
  lastTutorial = { id: 'rabbit', title: 'Follow the White Rabbit', step: 'name', at: 1, of: 12 };
  await api('POST', '/state', { level: TEA_PARTY, lint: [], report: null, tutorial: lastTutorial });
  r = await api('POST', '/guide', { answer: 'I typed one ✓' });
  ok(r.body.did === 'not yet' && /has not seen it yet/.test(r.body.say), 'did it, but the page has not moved: said kindly');
  r = await api('POST', '/guide', { answer: 'The Pantry' });
  await settle();
  ok(r.body.did === 'help' && r.body.ran?.[0]?.op === 'patch' && patched.at(-1)?.name === 'The Pantry', 'a name told to the assistant on the Rabbit is typed in for them (help, run by default)');
  r = await api('POST', '/guide', { help: true });
  ok(r.body.did === 'help' && r.body.help.do[0].op === 'patch' && !r.body.ran, 'help without run only shows the plan');
  // "Do it for me" pressed on the page: the help plan runs, the assistant is told; a stale card runs nothing
  const nh = (await api('GET', '/inbox?since=0')).body.latest;
  r = await api('POST', '/guide', { help: true, run: true, from: 'page', at: 1 });
  await settle();
  const helped = (await api('GET', `/inbox?since=${nh}`)).body.messages.find(m => m.kind === 'answer');
  ok(r.body.did === 'help' && r.body.ran?.[0]?.op === 'patch' && helped?.data.option === 'Do it for me' && helped.data.then === 'help' && helped.data.ran?.[0] === 'patch' && /pressed "Do it for me" on the page/.test(helped.text), '"Do it for me" pressed on the page runs the help plan and tells the assistant in the inbox');
  const np = patched.length;
  r = await api('POST', '/guide', { help: true, run: true, from: 'page', at: 0 });
  ok(r.body.did === 'moved' && /✓ A blank room/.test(r.body.say) && patched.length === np, 'Do it for me from the card of a step already passed runs nothing and says the step is done');
  r = await api('POST', '/guide', { answer: 'Why does this matter?' });
  ok(r.body.did === 'why' && /title on the stages page/.test(r.body.say), 'why: the step\'s why');
  r = await api('POST', '/guide', { next: true });
  await settle();
  ok(r.body.did === 'next' && seen.at(-1).op === 'tutorial' && seen.at(-1).args.skip === 1, 'next on a Rabbit step skips it on the page');
  lastTutorial = { id: 'rabbit', title: 'Follow the White Rabbit', step: 'done', at: 12, of: 12 };
  await api('POST', '/state', { level: TEA_PARTY, lint: [], report: null, tutorial: lastTutorial });
  await api('POST', '/post', { text: '✓ Send it in (12 of 12)', kind: 'tutorial', data: { id: 'rabbit', step: 'export', at: 12, of: 12 } });
  await settle();
  r = await api('GET', '/guide');
  ok(r.body.at === 12 && r.body.step.id === 'publish' && r.body.step.ask && r.body.step.work.length >= 5, 'the page\'s build done, the bridge\'s own steps follow: the person\'s page');
  ok(asked.at(-1).id === 'publish' && asked.at(-1).work?.length >= 5 && asked.at(-1).does[0] === 'pr' && /pull request/.test(asked.at(-1).why) && asked.at(-1).q, 'the publish step reaches the page with the repository work spelled out');
  r = await api('POST', '/guide', { answer: 'Not now' });
  ok(r.body.step.id === 'finish', 'not now: the finish');
  r = await api('POST', '/guide', { answer: "That's all for now" });
  ok(r.body.did === 'end' && r.body.over === true && r.body.step === null && /done/.test(r.body.text), 'the end: over, and the text says so');
  r = await api('POST', '/guide', { show: true });
  await settle();
  ok(r.body.did === 'shown' && guided.at(-1)?.show === true, 'show: the banner again, through the page');
  r = await api('GET', '/guide?mode=basic&step=1&platform=codex');
  ok(r.body.preview === true && r.body.step.id === 'starter' && r.body.step.ask.options.map(o => o.label).join() === 'The corridor,The gate,Two rooms' && /list the options numbered/.test(r.body.text) && (await api('GET', '/guide')).body.mode === 'tutorial', 'a preview of any step, worded for a platform, changes nothing');
  ok((await api('GET', '/platforms')).body.platforms.length === PLATFORMS.length && (await api('GET', '/guide?platforms=1')).body.platforms[0].id === 'claude', 'the platforms are served');
  r = await api('POST', '/post', { text: '✓ A rock (4 of 12)', kind: 'tutorial', data: { id: 'rabbit', step: 'rock', at: 4, of: 12 } });
  ok(r.body.kind === 'tutorial' && r.body.data.step === 'rock' && (await api('GET', `/inbox?since=${r.body.n - 1}`)).body.messages[0].kind === 'tutorial', 'the page posts a step done as a line of kind tutorial');
  ok((await api('POST', '/post', { text: 'plain' })).body.kind === 'chat', 'a line the person typed is kind chat');
  const facts = repoFacts(root);
  ok(facts.fork === null || (/^[\w.-]+\/[\w.-]+$/.test(facts.fork) && facts.page.startsWith('https://') && facts.repo.startsWith('https://github.com/')), 'repoFacts reads the fork, the upstream and the page from the remotes, or nothing');
  ok((await api('GET', '/')).body.repo.fork === 'someone/their-badge' && (await api('GET', '/')).body.guide.modes.join() === GUIDE_IDS.join(), 'the status carries the facts it was given and the ways');
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
  ok(tools.some(t => t.name === 'maker_share' && t.inputSchema.properties.format?.enum?.includes('json') && t.inputSchema.properties.where?.enum?.join() === 'play,studio,stages,range' && t.inputSchema.properties.at?.enum?.join() === 'here,site' && t.inputSchema.properties.site && t.inputSchema.properties.parts && /"play" \(the default\)/.test(t.description)), 'mcp: maker_share is a tool, with the format, the place (play by default), the address and the parts');
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
  c = await call('tools/call', { name: 'maker_share', arguments: { at: 'site', site: 'https://someone.github.io/their-badge/' } });
  const siteLink = c.result.isError ? null : JSON.parse(c.result.content[0].text);
  ok(siteLink && siteLink.url.startsWith('https://someone.github.io/their-badge/index.html?level=') && siteLink.where === 'stages' && siteLink.at === 'site' && seen.at(-1).args.at === 'site', 'mcp: maker_share with nothing but the site makes the link where the room plays, at the published site');
  ok(tools.some(t => t.name === 'maker_pr_brief' && /pull request/.test(t.description) && t.inputSchema.properties.author), 'mcp: maker_pr_brief is offered, with the author');
  c = await call('tools/call', { name: 'maker_pr_brief', arguments: { author: 'the verifier over MCP' } });
  const pr = c.result.isError ? null : JSON.parse(c.result.content[0].text);
  ok(pr && pr.branch === `community/${idOf(TEA_PARTY)}` && pr.file === `stages/community/${idOf(TEA_PARTY)}.js` && pr.indexLine.author === 'the verifier over MCP' && pr.brief.includes(pr.source) && seen.at(-1).op === 'pr',
     'mcp: maker_pr_brief is the op pr: the branch, the file, the index line and the brief with the module in it');
  const tut = tools.find(t => t.name === 'maker_tutorial');
  ok(tut && MAKER_TUTORIALS.every(t => tut.inputSchema.properties.id.enum.includes(t.id) && tut.description.includes(t.id)) && 'skip' in tut.inputSchema.properties && 'restart' in tut.inputSchema.properties, 'mcp: maker_tutorial names every guided build, skip and restart');
  c = await call('tools/call', { name: 'maker_tutorial', arguments: { id: 'gate' } });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).id === 'gate' && seen.at(-1).op === 'tutorial' && seen.at(-1).args.id === 'gate', 'mcp: maker_tutorial picks a guided build through the bridge');
  const guideTool = tools.find(t => t.name === 'maker_guide');
  ok(guideTool && GUIDE_IDS.every(id => guideTool.inputSchema.properties.mode.enum.includes(id) && guideTool.description.includes(id)) && ['waitMs', 'answer', 'at', 'run', 'help', 'next', 'back', 'restart', 'step', 'show', 'vars', 'platform'].every(k => k in guideTool.inputSchema.properties) && /SAY/.test(guideTool.description) && /ASK/.test(guideTool.description),
     'mcp: maker_guide names the three ways and every knob, and says what a step is');
  c = await call('tools/call', { name: 'maker_guide', arguments: {} });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).mode === 'tutorial' && JSON.parse(c.result.content[0].text).over === true, 'mcp: maker_guide reads where the guide stands');
  c = await call('tools/call', { name: 'maker_guide', arguments: { mode: 'basic' } });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).did === 'picked' && JSON.parse(c.result.content[0].text).step.id === 'name' && /use your option buttons/.test(JSON.parse(c.result.content[0].text).text), 'mcp: maker_guide picks a way, and the text is worded for Claude Code by default');
  c = await call('tools/call', { name: 'maker_guide', arguments: { answer: 'The Verifier\'s Room', platform: 'codex' } });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).did === 'next' && JSON.parse(c.result.content[0].text).vars.name === 'The Verifier\'s Room' && /list the options numbered/.test(JSON.parse(c.result.content[0].text).text), 'mcp: maker_guide passes the answer and words the next ask for the platform given');
  ok(tools.some(t => t.name === 'maker_patch' && t.inputSchema.properties.theme?.enum?.includes('court') && 'blurb' in t.inputSchema.properties), 'mcp: maker_patch is a tool, with the dressing and the blurb');
  c = await call('tools/call', { name: 'maker_patch', arguments: { name: 'Patched' } });
  await settle();
  ok(!c.result.isError && seen.at(-1).op === 'patch' && seen.at(-1).args.name === 'Patched', 'mcp: maker_patch is the op patch');
  ok(/maker_guide \{ waitMs: 120000 \}/.test(init.result.instructions) && /welcome banner/.test(init.result.instructions) && /own browser pane first/.test(init.result.instructions) && /a line a step/.test(init.result.instructions), 'mcp: the server\'s instructions send a new assistant to the guide, its own browser pane first, a line a step');
  const openTool = tools.find(t => t.name === 'maker_open');
  ok(openTool && openTool.inputSchema.properties.browser?.type === 'boolean' && /does NOT open a browser by itself/.test(openTool.description) && /browser: true/.test(openTool.description) && /preview_start/.test(openTool.description) && /Every step is shown on the page too/.test(guideTool.description), 'mcp: maker_open takes browser and says to open the page in the assistant\'s own pane first; maker_guide says the page carries every step');
  const unknown = await call('no/such');
  ok(unknown.error?.code === -32601, 'mcp: an unknown method is a JSON-RPC error');
  mcp.stdin.end();
  await new Promise(r => mcp.on('close', r));
  // a port held by something that is not the bridge (a proxy such as Burp on 8080): said so, and maker_open goes next door
  {
    const { createServer } = await import('node:http');
    const proxy = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<html><head><title>Burp Suite</title></head><body>Welcome</body></html>'); });
    await new Promise(r => proxy.listen(0, '127.0.0.1', r));
    const held = `http://localhost:${proxy.address().port}`;
    const mcp2 = spawn(process.execPath, [resolve(root, 'software/tools/maker-mcp.mjs')], { env: { ...process.env, MAKER_URL: held, MAKER_AGENT: 'the verifier behind a proxy' } });
    const replies2 = new Map(); let out2 = '';
    mcp2.stdout.on('data', (d) => { out2 += d; let i; while ((i = out2.indexOf('\n')) >= 0) { const l = out2.slice(0, i); out2 = out2.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); replies2.get(m.id)?.(m); } } });
    let n2 = 0;
    const call2 = (method, params) => new Promise((res) => { const id = ++n2; replies2.set(id, res); mcp2.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    await call2('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
    let c2 = await call2('tools/call', { name: 'maker_status', arguments: {} });
    const st = JSON.parse(c2.result.content[0].text);
    ok(!c2.result.isError && st.up === false && /not the maker's bridge/.test(st.reason) && /Burp Suite/.test(st.reason) && /maker_open \{ port: \d+ \}/.test(st.hint), 'mcp: a proxy on the port is not taken for the bridge; the status names it and says to open on another port');
    c2 = await call2('tools/call', { name: 'maker_get', arguments: {} });
    ok(c2.result.isError && /not the maker's bridge/.test(c2.result.content[0].text), 'mcp: a tool behind the proxy fails with the same plain reason, not with a parse error');
    // maker_open with the test bridge's port: the bridge is already there, so nothing is started (on Windows a second server would bind the busy port and linger) - the session switches to it
    c2 = await call2('tools/call', { name: 'maker_open', arguments: { port } });
    const opened = c2.result.isError ? null : JSON.parse(c2.result.content[0].text);
    ok(opened && opened.bridge === 1 && opened.page === true && /already serving port/.test(opened.note) && /held by another server/.test(opened.note) && /talks to it from now on/.test(opened.note), 'mcp: maker_open with another port finds the bridge already there, starts nothing and says the first port was held');
    c2 = await call2('tools/call', { name: 'maker_get', arguments: {} });
    ok(!c2.result.isError && JSON.parse(c2.result.content[0].text).level.name === TEA_PARTY.name, 'mcp: and the tools talk to the new port from then on');
    mcp2.stdin.end();
    await new Promise(r => mcp2.on('close', r));
    await new Promise(r => proxy.close(r));
  }
  // a bridge with no page open: the status and maker_open name the page and say to open it in the assistant's own pane first; no browser is opened
  {
    const bare = await startMaker({ root, port: 0, log: () => {}, facts: {} });
    const mcp3 = spawn(process.execPath, [resolve(root, 'software/tools/maker-mcp.mjs')], { env: { ...process.env, MAKER_URL: bare.url, MAKER_AGENT: 'the verifier with no page' } });
    const replies3 = new Map(); let out3 = '';
    mcp3.stdout.on('data', (d) => { out3 += d; let i; while ((i = out3.indexOf('\n')) >= 0) { const l = out3.slice(0, i); out3 = out3.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); replies3.get(m.id)?.(m); } } });
    let n3 = 0;
    const call3 = (method, params) => new Promise((res) => { const id = ++n3; replies3.set(id, res); mcp3.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    await call3('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
    let c3 = await call3('tools/call', { name: 'maker_status', arguments: {} });
    let st3 = JSON.parse(c3.result.content[0].text);
    ok(!c3.result.isError && st3.bridge === 1 && st3.page === false && st3.url === `${bare.url}/maker.html` && st3.opened === null && /own browser pane first/.test(st3.hint) && /preview_start/.test(st3.hint) && /maker_open \{ browser: true \}/.test(st3.hint), 'mcp: the server up and no page: maker_status names the page and says to open it in the assistant\'s own pane first');
    c3 = await call3('tools/call', { name: 'maker_open', arguments: {} });
    st3 = JSON.parse(c3.result.content[0].text);
    ok(!c3.result.isError && st3.bridge === 1 && st3.page === false && st3.opened === null && /own browser pane first/.test(st3.hint), 'mcp: maker_open without browser: true opens nothing and says the same');
    mcp3.stdin.end();
    await new Promise(r => mcp3.on('close', r));
    await bare.close();
  }
  reader.cancel().catch(() => {});
  await pump.catch(() => {});
  await close();
  ok(true, 'the bridge closes');
}

// ------------------------------------------------------------------ the page ----
console.log('maker.html keeps the studio to a checkout and the landing to the site');
{
  const html = readFileSync(resolve(root, 'maker.html'), 'utf8');
  const MODE_OF = { editPanel: 'edit', playPanel: 'play', exportPanel: 'export', assistantPanel: 'assistant', learnPanel: 'learn' };
  for (const id of Object.keys(MODE_OF))
    ok(new RegExp(`<section class="panel ${id === 'learnPanel' ? 'side ' : id === 'assistantPanel' ? 'dock ' : ''}dev-only" id="${id}" data-mode="${MODE_OF[id]}">`).test(html), `#${id} is class dev-only, the ${MODE_OF[id]} mode on a phone${id === 'learnPanel' ? ', and class side (the column beside the board)' : id === 'assistantPanel' ? ', and class dock (the foot of the column)' : ''}`);
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
  ok(/<section class="panel hero" id="hero" data-mode="home">/.test(html), 'the hero is on both faces, "home" on a phone');
  for (const id of ['aiDialog', 'aiPrompt', 'aiCopy', 'aiClaude', 'aiChatGPT', 'aiBtn', 'repoClone', 'docsLink'])
    ok(new RegExp(`id="${id}"`).test(html), `the invitation has #${id}`);
  // the phone looks: a mode bar of the studio's own (dev-only), one panel at a time, the landing all "home"
  ok(/<nav id="modes" class="modes dev-only" aria-label="what is on screen">/.test(html), 'the mode bar is the studio\'s (class dev-only): the site\'s landing is one page');
  for (const m of ['learn', 'edit', 'play', 'export', 'assistant', 'home']) ok(new RegExp(`class="mode[^"]*" data-mode="${m}"`).test(html), `the mode bar has a ${m} button`);
  ok(/<html [^>]*data-mode="home"[^>]*data-learn="side" data-learn-host="dev"/.test(html), '<html> opens on the landing (data-mode="home") with the guide beside the board (data-learn="side"), the studio\'s only (data-learn-host="dev": look-boot drops it on the site)');
  ok((html.match(/class="panel (?:hero|site-only)"[^>]*data-mode="home"/g) ?? []).length === 4, 'the hero and the three landing panels are all "home"');
  ok(/<\/nav>\s*(<!--[^]*?-->\s*)?<div id="coach"/.test(html), 'the coach line sits between the mode bar and main');
  ok(/const MODES = \['home', 'learn', 'edit', 'play', 'export', 'assistant'\]/.test(mod) && /html\.dataset\.mode = m;/.test(mod) && /onMode\(m\) \{ if \(dev\) try \{ localStorage\.setItem\(MODE, m\)/.test(mod), 'src/maker.js opens the mode bar where it was left (alice.maker.mode, set on <html> before paint) and keeps it');
  const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
  ok(/html\[data-host=dev\] \.site-only \{ display: none !important; \}/.test(css), 'styles.css hides .site-only on a dev host');
  ok(/<link rel="stylesheet" href="src\/maker\.css">/.test(html), 'the page loads src/maker.css');
  const js = readFileSync(resolve(root, 'src/maker.js'), 'utf8');
  ok(/const dev = mode === 'dev'/.test(js) && /if \(!dev\) \{/.test(js) && /new Pad\(\{ sources: sourcesFor\(true\) \}\)/.test(js), 'the pad with every source is built on a dev host only');
  ok(/stages\/community\/index\.json/.test(js), 'the maker lists the community rooms');
  ok(/lessonFromText/.test(js) && /tell\('lesson'/.test(js), 'the studio edits the lesson as text and tells the tutorial');
  // a room in a link: the Share dialog (the studio's, at the end of the page), the landing's note, the studio's part
  for (const id of ['shareBtn', 'shareDialog', 'shareTitle', 'shareWhat', 'shareUrl', 'shareCopy', 'shareOpen', 'sharePlay', 'sharePlayPage', 'shareHere', 'shareSite', 'shareStatus', 'shareJson', 'shareClose'])
    ok(new RegExp(`id="${id}"`).test(html), `the Share dialog has #${id}`);
  ok(/<dialog id="shareDialog" class="ai share dev-only"/.test(html) && html.indexOf('id="shareDialog"') > html.indexOf('id="keysDialog"'), 'the Share dialog is the studio\'s (dev-only) and comes after the keys dialog, at the end of the page');
  for (const p of SHARE_PARTS) ok(new RegExp(`<input type="checkbox" data-part="${p}" checked>`).test(html), `the Share dialog offers the ${p}, on by default`);
  ok(/name="shareFormat" value="b64" checked/.test(html) && /name="shareFormat" value="json"/.test(html), 'the Share dialog offers the compact and the readable link, compact by default');
  ok(/name="shareWhere" value="play" checked/.test(html) && /name="shareWhere" value="studio"/.test(html) && html.indexOf('name="shareWhere"') < html.indexOf('data-part="lesson"') && html.indexOf('name="shareWhere"') < html.indexOf('name="shareFormat"'), 'the Share dialog offers play it (the default) and edit it, before what goes in and how the link reads');
  ok(/name="shareAt" value="here" checked/.test(html) && /name="shareAt" value="site"/.test(html) && /<input id="shareSite" type="text"/.test(html), 'the Share dialog offers this checkout\'s address (the default) and the published site\'s, with a box for the site');
  ok(/<button type="button" id="shareBtn" class="btn ghost">Share a link<\/button>/.test(html) && /<h2 id="shareTitle">Share this room<\/h2>/.test(html) && /<b>Play it<\/b> is the\s+page the badge plays it on/.test(html), 'the export\'s button says Share a link, and the dialog says what play it and edit it mean');
  ok(/function shareLink\(\{ format = 'b64', where = 'play', at = 'here', site, play = false, parts = \{\} \} = \{\}, room = level\)/.test(js) && /const door = sharePage\(room, where\);/.test(js) && /play: !!play && door\.where === 'studio'/.test(js), 'shareLink defaults to play it at this address, resolves the page through sharePage, and play=1 rides along for the studio only');
  ok(/const SITE_URL = pagesUrl\(repoParts\(repo\)\?\.owner \?\? 'bsidestlv', repo\);/.test(js) && /prefs\.share = \{ at: 'here', site: ''/.test(js) && /if \(i\.name === 'shareAt'\) \{ prefs\.share\.at = i\.value; savePrefs\(\); \}/.test(js), 'the published site is the page\'s own, and the address picked is remembered');
  ok(/\$\('#shareTitle'\)\.textContent = glitch \? 'Share this level' : 'Share this room';/.test(js) && /\$\('#sharePlayPage'\)\.textContent = glitch \? 'the range page' : 'the stages page';/.test(js) && /\$\('#sharePlay'\)\.disabled = o\.where !== 'studio';/.test(js) && /shareSiteEl\.disabled = o\.at !== 'site';/.test(js), 'the dialog\'s words follow the category, and Run & debug and the site\'s box are live only when they apply');
  ok(/playLink\(`index\.html\?level=\$\{encodeURIComponent\(sharedToken\)\}`, 'Play it on the stages page'\)/.test(js) && /className: 'btn', textContent: text/.test(js), 'the landing\'s note makes Play it the button');
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
  ok(/'that is a room, not a glitch level'/.test(glitch) && /if \(level\?\.rows && !isGlitch\(level\)\) watchStatus\.append\(' - ', Object\.assign\(document\.createElement\('a'\), \{ href: `index\.html\?level=\$\{encodeURIComponent\(token\)\}`, textContent: 'play it on the stages page' \}\)\);/.test(glitch), 'a room\'s token on the range page is refused with a link to the stages page that plays it');
  ok(/^\.status a \{ color: var\(--accent\); \}/m.test(css), 'styles.css colours a link inside a status line');
  for (const k of RANGE_KINDS) ok(new RegExp(`${k}: add${k[0].toUpperCase()}${k.slice(1)}Tab`).test(glitch), `src/glitch.js can add a ${k} tab`);
  // the stages page plays the community's rooms: one player (src/room.js) for every level, the explorer lists them
  const stages = readFileSync(resolve(root, 'index.html'), 'utf8');
  for (const id of ['playPanel', 'levelsPanel', 'levelGroups', 'room', 'levelName', 'levelFacts', 'roomBlurb', 'roomLesson', 'roomStatus', 'roomUndo', 'roomReset', 'roomSolve', 'shareBtn'])
    ok(new RegExp(`id="${id}"`).test(stages), `index.html has #${id} (the player and the explorer)`);
  const gallery = readFileSync(resolve(root, 'src/gallery.js'), 'utf8');
  ok(/from '\.\/room\.js'/.test(gallery) && /stages\/community\/index\.json/.test(gallery) && /base: 'stages\/community\/'/.test(gallery), 'src/gallery.js plays the listed rooms through src/room.js and src/seal.js');
  ok(/mountRoom\(\{/.test(gallery) && !/parse\(TEA_PARTY\.rows\)/.test(gallery) && /entryOf\('tea-party', TEA_PARTY/.test(gallery) && /entryOf\('queens-gauntlet', QUEENS_GAUNTLET/.test(gallery), 'the two stages go through the same player as the community\'s rooms, as levels of the catalogue');
  // and a room that came in a link, as a card of its own
  ok(/import \{ decodeShare, lint, kindOf, isGlitch, shareUrl, shareInfo, analyse, difficulty \} from '\.\/level\.js'/.test(gallery) && /function openShared\(token\)/.test(gallery) && /levels, open, openShared, progress/.test(gallery), 'src/gallery.js reads a ?level= link through src/level.js and exposes open and openShared');
  ok(/entryOf\('shared', level, \{ author: 'a link', group: 'shared' \}\)/.test(gallery) && /\['shared', 'Shared with you'/.test(gallery) && /level-card\$\{entry\.group === 'shared' \? ' shared' : ''\}/.test(gallery), 'the shared room is a card of its own group "Shared with you", class level-card shared, in levels as id shared');
  ok(/q\.get\('level'\) !== null\) openShared\(q\.get\('level'\)\);\s*else if \(q\.get\('room'\) !== null\)/.test(gallery), '?level= wins over ?room=');
  ok(gallery.includes("const say = (text, kind = '', link = null)") && gallery.includes("is a glitch level, not a room: `, 'hot', { href: 'glitch.html'") && gallery.includes('no level "${wanted}"'), '?room= naming a glitch level, or nothing in the index, is said so in the status - the range page linked');
  // a range level is not a room: the explorer lists only the index's rooms, and a link that carries a glitch level is sent to the range page
  ok(/\.filter\(s => !s\.kind \|\| s\.kind === 'tea' \|\| s\.kind === 'chase'\)/.test(gallery), 'the stages page lists the index\'s rooms only: a range level (kind = its range) is glitch.html\'s');
  ok(/if \(isGlitch\(level\)\) \{ say\(`the link carries a glitch level/.test(gallery) && /glitch\.html\?level=\$\{encodeURIComponent\(token\)\}/.test(gallery), 'a link that carries a glitch level is refused on the stages page, with a link to where it does open');
  ok(/const sharedGlitch = /.test(js) && /&& !sharedGlitch;/.test(js) && /glitch\.html\?level=\$\{encodeURIComponent\(sharedToken\)\}/.test(js), 'the landing sends a shared glitch level to the range page and keeps it out of the hero');
  {
    const index = JSON.parse(readFileSync(resolve(root, 'stages/community/index.json'), 'utf8'));
    const kept = (index.stages ?? []).filter(s => !s.kind || s.kind === 'tea' || s.kind === 'chase');
    ok(kept.length > 0 && kept.every(s => !RANGE_KINDS.includes(s.kind)) && (index.stages ?? []).some(s => RANGE_KINDS.includes(s.kind)), `the index holds ${kept.length} room(s) for the stages page and at least one range level it leaves to glitch.html`);
  }
  ok(/say\(`the shared room could not be opened: \$\{e\.message\}`, 'hot'\); return null;/.test(gallery), 'a link that is not a room is said so in #roomStatus (status hot) and nothing crashes');
  ok(/\.level-card\.shared \{/.test(css) && css.indexOf('.level-card.shared {') > css.indexOf('.level-card {'), 'styles.css styles the shared card next to .level-card');
  // the page shares a level both ways: played here, or carried on in the maker, with the same tokens the maker writes
  ok(/shareUrl\(base\('index\.html'\), current\.level\)/.test(gallery) && /shareUrl\(base\('maker\.html'\), current\.level\)/.test(gallery) && /id="sharePlayUrl"/.test(stages) && /id="shareEditUrl"/.test(stages), 'the stages page\'s Share dialog makes the play link and the maker link through src/level.js shareUrl');
  ok(/\$\('#shareBtn'\)\.hidden = entry\.sealed/.test(gallery) && /sealedIds\('stages\/'\)/.test(gallery), 'a sealed stage is never shared as a link (its plaintext stays on the badge)');
  ok(/data-part="lesson"/.test(html) && !/shareDialog/.test(readFileSync(resolve(root, 'src/tutor.js'), 'utf8')), 'the dialog is the page\'s; the tutorial only hears the export event');
  const roomJs = readFileSync(resolve(root, 'src/room.js'), 'utf8');
  ok(/lessonSteps/.test(roomJs) && /kind: 'room'/.test(roomJs), 'src/room.js shows the lesson and reports as kind room');
  for (const what of LESSON_EVENTS) if (what !== 'open') ok(new RegExp(`tell\\('${what}'`).test(roomJs), `src/room.js reports '${what}', so a lesson can wait on it`);
  ok(/maker\.html/.test(readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8')), 'pages.yml publishes maker.html');
  const makerCss = readFileSync(resolve(root, 'src/maker.css'), 'utf8');
  ok(!/data-theme=|data-flip/.test(makerCss), 'src/maker.css paints from the variables and never names a theme or the turn');
  ok(/\.steps\.three li > b:first-child \{ display: block;/.test(makerCss) && !/\.steps\.three li b \{[^}]*display: block/.test(makerCss),
     'on the landing only a step\'s title is a line of its own: a bold word in its prose stays in the sentence');
  ok((/<ol class="steps three">[\s\S]*?<\/ol>/.exec(html)?.[0].match(/<li><b>/g) ?? []).length === 3, 'each of the three steps opens with its title in bold');
  // the guided builds: the cards in the Learn panel, the choice kept, the bridge steering them
  for (const id of ['learnTitle', 'learnPick']) ok(new RegExp(`id="${id}"`).test(html), `the Learn panel has #${id} (the chosen build's title, the cards)`);
  ok(/<h2><span id="learnTitle">Painting the Roses<\/span> <span id="learnProgress"/.test(html), 'the Learn panel\'s heading is the chosen build\'s title, the first one before the page runs');
  // the guide beside the board (the classic look): the column, the drawer, the page are every page's - styles.css and src/coach.js,
  // pinned by verify-looks.mjs; the maker only carries the markup, keeps nothing of its own in src/maker.css, and goes to a panel by its key
  for (const id of ['learnPin', 'learnClose']) ok(new RegExp(`id="${id}"`).test(html), `the Learn panel has #${id}`);
  ok(/id="coachOpen" class="btn ghost" aria-controls="learnPanel" aria-expanded="false"/.test(html), 'the coach line\'s "learn" names the panel it opens (aria-controls, aria-expanded)');
  ok(!/data-learn|learn-pin|learn-close|#learnPanel/.test(makerCss), 'src/maker.css has no rule of the guide\'s place: the column, the drawer and the pin are styles.css\'s, every page\'s');
  ok(!/alice\.maker\.learn|function openLearn|function setLearn|matchMedia\('\(min-width/.test(mod) && /function goTo\(key\)/.test(mod),
     'src/maker.js keeps no guide-place code of its own (the coach wires #learnPin / #learnClose / the drawer) and goes to a panel by its key');
  ok(/if \(looks\.look\.id !== 'classic'\) \{ looks\.setMode\(key\); return; \}/.test(mod) && (mod.match(/scrollIntoView\(/g) ?? []).length === 1 && /goTo\('play'\)/.test(mod) && /goTo\('edit'\)/.test(mod) && /goTo\('assistant'\)/.test(mod) && /if \(show && step\?\.panel\) goTo\(step\.panel\)/.test(mod),
     'every way to a panel goes through goTo (the mode bar on a phone, a scroll on the classic page): Run & debug, back to the editor, the welcome, a tutorial step');
  ok(/goTo, setLearn: \(\.\.\.a\) => coach\.setLearn\(\.\.\.a\), openLearn: \(\.\.\.a\) => coach\.openLearn\(\.\.\.a\), get learn\(\) \{ return coach\.learn; \}/.test(mod), 'window.__maker exposes goTo, and the coach\'s setLearn, openLearn and learn');
  // the chat as a dock in the classic look: class dock on the panel, the heading's count and fold button; the maker opens it on an
  // assistant's hello, on the guide's question and on goTo('assistant'), counts what comes in while it is folded, and measures what it
  // takes (--dock-h); the dock's place is styles.css's (verify-looks.mjs), src/maker.css keeps only the chat's insides
  ok(/<section class="panel dock dev-only" id="assistantPanel" data-mode="assistant">\s*<h2>The assistant <span id="bridgeState" class="tag">[^<]*<\/span>\s*<span id="chatNew" class="dock-new" hidden><\/span>\s*<button type="button" id="chatFold" class="dock-fold" aria-expanded="false" aria-controls="chatLog" aria-label="open the chat" title="open the chat">▴<\/button><\/h2>/.test(html),
     '#assistantPanel is class dock; its heading carries the count (#chatNew) and the fold button (#chatFold: aria-expanded, aria-controls="chatLog")');
  ok(/function openDock\(open = !\('dockOpen' in html\.dataset\)\)/.test(mod) && /html\.dataset\.dockOpen = ''/.test(mod) && /delete html\.dataset\.dockOpen/.test(mod) && /dockFold\.setAttribute\('aria-expanded', String\(on\)\)/.test(mod)
     && /setProperty\('--dock-h', dock\.offsetHeight \? `calc\(\$\{dock\.offsetHeight\}px \+ 1rem\)` : '0px'\)/.test(mod) && /new ResizeObserver\(measure\)\.observe\(dock\)/.test(mod) && /dock\.querySelector\('h2'\)\.addEventListener\('click', \(\) => openDock\(\)\)/.test(mod),
     'src/maker.js opens and folds the dock (html[data-dock-open], aria-expanded on the button, the heading toggles) and measures what it takes at the bottom of the screen (--dock-h: its height and the gap)');
  ok(/if \(key === 'assistant'\) \{ openDock\(true\); return; \}/.test(mod), 'goTo(\'assistant\') opens the dock in the classic look: the chat is never scrolled to');
  ok(/onHello: \(name\) => \{[^\n]*openDock\(true\); \},/.test(mod) && /if \(!dockGreeted\) \{ dockGreeted = true; openDock\(true\); \}/.test(mod) && /if \(looks\.look\.id === 'classic'\) openDock\(true\);/.test(mod) && /if \(who !== 'you'\) dockNews\(\);/.test(mod),
     'an assistant\'s hello (or one found on the bridge) and the guide\'s question open the dock; a line that arrives while it is folded is counted on the heading');
  ok(/openDock, get dock\(\) \{ return \{ open: 'dockOpen' in html\.dataset, unread \}; \}/.test(mod), 'window.__maker exposes openDock and the dock\'s state');
  ok(/html\[data-look=classic\] \.dock \.chat \{ flex: 1 1 auto; min-height: 0; max-height: none;/.test(makerCss) && /html\[data-look=classic\] \.dock:has\(\.chat:not\(:empty\)\) > \.note \{ display: none; \}/.test(makerCss)
     && /html\[data-look=classic\] \.dock \.chat li\.ask > \.ask-row \{ order: -1;/.test(makerCss) && !/\.dock[^\n]*(position: (fixed|sticky)|grid-column|max-height: min)/.test(makerCss),
     'src/maker.css gives the chat its dock insides (the log takes the room, the note only while it is empty, the card\'s buttons first) and nothing of the dock\'s place, which is styles.css\'s');
  const coachSrc = readFileSync(resolve(root, 'src/coach.js'), 'utf8');
  ok(/function openLearn\(/.test(coachSrc) && /function setLearn\(/.test(coachSrc) && /setProperty\('--coach-h'/.test(coachSrc) && /next\?\.range \?\? next\?\.stage \?\? next\?\.panel/.test(coachSrc) && /setLearn, openLearn, get learn\(\)/.test(coachSrc),
     'src/coach.js owns the guide\'s place (openLearn, setLearn, learn), measures the line (--coach-h), and follows a step to its panel on a phone');
  ok(/MAKER_TUTORIALS/.test(mod) && /className = `learn-pick/.test(mod) && /setAttribute\('data-id', t\.id\)/.test(mod) && /' on'/.test(mod), 'src/maker.js draws a card per guided build (button.learn-pick[data-id], the chosen one .on)');
  ok(/'alice\.maker\.tutorial'/.test(mod) && /get\('tutorial'\)/.test(mod) && /'alice\.tutor\.maker'/.test(mod) && /`alice\.tutor\.maker\.\$\{id\}`/.test(mod), 'the choice is remembered (alice.maker.tutorial), ?tutorial= picks one, progress is per build and the first keeps its old key');
  ok(/tutorial: tutorialSummary\(\)/.test(mod) && /step: tutor\.step\?\.id \?\? 'done', at: tutor\.at, of: tutor\.steps\.length/.test(mod), 'get reports the tutorial as { id, title, step, at, of }');
  ok(OPS.includes('tutorial') && OPS.includes('guide') && OPS.includes('patch') && /maker_guide/.test(aiPrompt('https://github.com/o/r')) && /maker_patch/.test(aiPrompt('https://github.com/o/r')), 'the bridge has the tutorial, guide and patch ops and the prompt names the guide and patch');
  const coachJs = readFileSync(resolve(root, 'src/coach.js'), 'utf8');
  ok(/function use\(next/.test(coachJs) && /return \{ feed, render, skip, restart, use, get tutor\(\)/.test(coachJs) && /onRender\(\)/.test(coachJs), 'src/coach.js can put another tutorial under the same coach, and says when it redraws');
  ok(/mountCoach\(first, \{ looks, title = ''/.test(coachJs) && /\$\('#learnTitle'\)/.test(coachJs), 'src/coach.js keeps its API for the stages and the range, and fills #learnTitle where there is one');
  ok(/\.learn-picks \{/.test(makerCss) && /\.learn-pick\.on \{/.test(makerCss) && /html:not\(\[data-look=classic\]\) \.learn-picks \{/.test(makerCss), 'src/maker.css styles the cards, one column in the phone looks');
  const mcpJs = readFileSync(resolve(root, 'software/tools/maker-mcp.mjs'), 'utf8');
  ok(/name: 'maker_tutorial'/.test(mcpJs) && /case 'maker_tutorial': return rpc\('tutorial'/.test(mcpJs), 'the MCP server has maker_tutorial over the tutorial op');
  // the welcome banner and the guide on the page
  ok(/<dialog id="guideDialog" class="ai guide dev-only" aria-labelledby="guideTitle">/.test(html) && html.indexOf('id="guideDialog"') > html.indexOf('id="shareDialog"'), 'the welcome banner is a dev-only dialog after the Share dialog');
  for (const id of ['guideTitle', 'guideNote', 'guidePicks', 'guideLater', 'guideStatus']) ok(new RegExp(`id="${id}"`).test(html), `the banner has #${id}`);
  ok(/from '\.\/guide\.js'/.test(mod) && /for \(const m of GUIDE_MODES\)/.test(mod) && /b\.dataset\.mode = m\.id/.test(mod) && /className = 'guide-pick'/.test(mod), 'src/maker.js draws a card per way from GUIDE_MODES (button.guide-pick[data-mode])');
  ok(/function showGuide\(name, \{ again = false \} = \{\}\)/.test(mod) && /function pickGuide\(mode, \{ from = 'page' \} = \{\}\)/.test(mod) && /showGuide\(name\); dockGreeted = true; openDock\(true\); \},/.test(mod) && /if \(b\.connected && b\.agents\.length\) \{[^\n]*\n\s*showGuide\(b\.agents\.at\(-1\)\);/.test(mod), 'the banner comes up on an assistant\'s hello, and when one was here before the page');
  ok(/if \(from === 'page'\) bridge\?\.guide\(m\.id\)/.test(mod) && /if \(m\.tutorial\) \{ pickTutorial\(m\.tutorial\); if \(tutor\.done\) coach\.restart\(\); \}/.test(mod), 'a pick on the page goes up the bridge and puts the Rabbit\'s build under the coach; a pick from the assistant is not echoed');
  ok(/kind: 'tutorial', data: \{ id: picked, step: s\.id, at: tutor\.at, of: tutor\.steps\.length, done: tutor\.done \}/.test(mod) && /guideMode === 'tutorial' && bridge\?\.available/.test(mod), 'on the Rabbit a step done goes up the bridge as a line of kind tutorial');
  ok(/tutorial: tutorialSummary\(\), guide: guideMode \}/.test(mod), 'the mirror carries the page\'s tutorial and the way picked, so the bridge\'s Rabbit follows the page');
  ok(/tell\('export', \{ how: 'link', format: r\.format, chars: r\.chars, where: r\.where, at: r\.at \}\)/.test(mod) && /tell\('export', \{ how: 'pr' \}\)/.test(mod.slice(mod.indexOf('  pr: ('))), 'a link or a brief taken by the assistant counts as the room sent in');
  ok(/if \(\/\^\(guide\|welcome\|rabbit\)\\W\*\$\/i\.test\(text\)\)/.test(mod) && /get\('guide'\) === '1'\) showGuide\(null, \{ again: true \}\)/.test(mod), '"guide" typed in the chat, or ?guide=1, brings the banner back');
  ok(/guide: \{ show: \(name, o\) => showGuide\(name, o\), pick: pickGuide, get mode\(\)/.test(mod), 'window.__maker.guide for headless checks');
  ok(/self\.guideMode = cmd\.args\?\.guide \?\? null/.test(readFileSync(resolve(root, 'src/bridge.js'), 'utf8')) && /if \(b\.guideMode && b\.guideMode !== guideMode && modeById\(b\.guideMode\)\) adoptGuide\(b\.guideMode\)/.test(mod) && /^function adoptGuide\(mode\) \{/m.test(mod) && mod.indexOf('adoptGuide(b.guideMode)') < mod.indexOf('showGuide(b.agents.at(-1));'),
     'a page that (re)attaches mid-walk takes up the way the bridge holds before the banner would pop, so a reload neither asks again nor loses the walk');
  const guideJs = readFileSync(resolve(root, 'src/guide.js'), 'utf8');
  ok(!/document\.|window\.|fetch\(/.test(guideJs) && /from '\.\/tutor\.js'/.test(guideJs) && /from '\.\/level\.js'/.test(guideJs), 'src/guide.js is pure: no DOM, no fetch; it reads the page\'s builds and the starters');
  ok(/\.guide-picks \{/.test(makerCss) && /\.guide-pick \{/.test(makerCss) && /html:not\(\[data-look=classic\]\) \.guide-picks \{/.test(makerCss), 'src/maker.css styles the cards, one column in the phone looks');
  // the question on the page: op ask, a card with buttons, a press answered through the bridge
  ok(OPS.includes('ask') && /^  ask: \(\{ mode, title, at, of, step, say, why, board, next, q, options = \[\], other, help, does = \[\], before, work, over \} = \{\}\) => \{/m.test(mod) && /className = 'btn ghost ask-pick'/.test(mod) && /bridge\?\.answer\(o\.label, at\)/.test(mod), 'src/maker.js draws the guide\'s step as a card with the question\'s buttons and answers a press through the bridge');
  ok(/el\('span', 'ask-why', why\)/.test(mod) && /el\('span', 'ask-board'/.test(mod) && /className = 'ask-work'/.test(mod) && /className = 'btn ghost ask-help'/.test(mod) && /bridge\?\.help\(at\)/.test(mod) && /!options\.some\(o => o\.then === 'help' \|\| o\.then === 'again'\)/.test(mod) && /or type your own answer below/.test(mod) && /\['why', 'stay', 'not yet', 'help'\]\.includes\(r\.did\)/.test(mod),
     'the card carries the why, the board, the repository work and Do it for me (unless an option is that already), and an answer that keeps the step leaves its buttons live');
  const bridgeJs = readFileSync(resolve(root, 'src/bridge.js'), 'utf8');
  ok(/async function answer\(text, at\)/.test(bridgeJs) && /from: 'page', run: true/.test(bridgeJs) && /async function help\(at\)/.test(bridgeJs) && /help: true, run: true, at, from: 'page'/.test(bridgeJs), 'src/bridge.js posts a press as the page\'s answer, with the step and run, and Do it for me as the step\'s help');
  ok(/\.chat li\.ask \{/.test(makerCss) && /\.ask-row \{/.test(makerCss) && /\.chat li\.ask\.stale, \.chat li\.ask\.answered \{/.test(makerCss) && /\.chat li\.ask \.ask-why/.test(makerCss) && /\.ask-pick, \.ask-help \{/.test(makerCss) && /\.chat li\.ask\.busy::after/.test(makerCss), 'src/maker.css styles the step card - the why, the board, Do it for me, working… - and dims one answered or superseded');
  ok(GUIDE_RULES.some(r => /Every step is on the page too/.test(r)) && /do not ask again/.test(guideText('fast', 1, {})), 'the rules and the text tell the assistant the person may answer on the page');
  ok(/Fork, then clone\./.test(html) && /Follow the White Rabbit<\/b>/.test(html) && /Drink Me<\/b>/.test(html) && /Eat Me<\/b>/.test(html) && /fork the repository for you/.test(html) && /own browser pane/.test(html) && /every step is on the page/.test(html), 'the landing says fork first, the assistant\'s own browser pane, every step on the page, and names the three ways; the dialog\'s note says what the assistant will do');
  // the assistants' own doors
  const cursor = JSON.parse(readFileSync(resolve(root, '.cursor/mcp.json'), 'utf8')), gemini = JSON.parse(readFileSync(resolve(root, '.gemini/settings.json'), 'utf8')), vscode = JSON.parse(readFileSync(resolve(root, '.vscode/mcp.json'), 'utf8'));
  ok(cursor.mcpServers?.['alice-maker']?.args?.[0] === 'software/tools/maker-mcp.mjs' && gemini.mcpServers?.['alice-maker']?.args?.[0] === 'software/tools/maker-mcp.mjs' && vscode.servers?.['alice-maker']?.type === 'stdio' && vscode.servers['alice-maker'].args[0] === 'software/tools/maker-mcp.mjs', 'Cursor, Gemini CLI and VS Code Copilot register the same server');
  const codex = readFileSync(resolve(root, '.codex/config.toml'), 'utf8');
  ok(/\[mcp_servers\.alice-maker\]/.test(codex) && /software\/tools\/maker-mcp\.mjs/.test(codex), 'Codex registers it too');
  ok(/^\.vscode\/\*$/m.test(readFileSync(resolve(root, '.gitignore'), 'utf8')) && /^!\.vscode\/mcp\.json$/m.test(readFileSync(resolve(root, '.gitignore'), 'utf8')), '.gitignore keeps .vscode/mcp.json and nothing else of .vscode');
  const pagesYml = readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8');
  ok(!/\.cursor|\.gemini|\.vscode|\.codex|AGENTS\.md/.test(pagesYml), 'pages.yml publishes none of the assistants\' files');
  const agents = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
  ok(/maker_guide/.test(agents) && /Fork first/.test(agents) && /gh repo fork/.test(agents) && /build_type=workflow/.test(agents) && /Follow the White Rabbit/.test(agents) && /npm run maker -- --no-open/.test(agents) && /own browser first/.test(agents) && /every step is on the page/i.test(agents) && /CLAUDE\.md/.test(agents), 'AGENTS.md is the short map: fork first, the studio in the assistant\'s own browser, the guide on the page, the rules');
  const doc = readFileSync(resolve(root, 'software/docs/LEVEL_MAKER.md'), 'utf8');
  ok(/## Building with an AI, step by step/.test(doc) && /Follow the White Rabbit/.test(doc) && /\/__maker\/guide/.test(doc) && /maker_guide/.test(doc) && /gh repo fork/.test(doc) && /--no-open/.test(doc) && /Its own browser/.test(doc) && /Do it for me/.test(doc) && PLATFORMS.every(p => doc.includes(p.name.split(' (')[0])), 'LEVEL_MAKER.md has the guided way, the endpoint, the tool, fork first, the pane first, the card, every platform with its browser');
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

// ------------------------------------------------------------ open a level ----
// The studio's picker: what to work on when it is not a new room - a copy of
// a stage, one of the community's, the shelf, or a share link pasted in - from
// Open… in the stage bar, the welcome banner, ?open=1 and a first visit.
console.log('the studio opens an existing level to carry on');
{
  const html = readFileSync(resolve(root, 'maker.html'), 'utf8');
  const js = readFileSync(resolve(root, 'src/maker.js'), 'utf8');
  const css = readFileSync(resolve(root, 'src/maker.css'), 'utf8');
  for (const id of ['openDialog', 'openBtn', 'guideOpen', 'openNew', 'openStages', 'openCommunity', 'openShelf', 'openLink', 'openLinkBtn', 'openClose', 'openStatus'])
    ok(new RegExp(`id="${id}"`).test(html), `maker.html has #${id} (the level picker)`);
  ok(/<dialog id="openDialog" class="ai open-level dev-only"/.test(html), 'the picker is a dialog of the checkout\'s studio (dev-only)');
  ok(html.indexOf('id="guideOpen"') > html.indexOf('id="guidePicks"') && html.indexOf('id="guideOpen"') < html.indexOf('id="guideLater"'), 'the welcome banner offers an existing level under the three ways');
  ok(/function showOpen\(\)/.test(js) && /\$\('#openBtn'\)\.addEventListener\('click', showOpen\)/.test(js) && /\$\('#guideOpen'\)\.addEventListener\('click', showOpen\)/.test(js), 'Open… and the banner\'s button open the picker');
  ok(/for \(const \[id, name\] of SHIPPED\) openPick\(/.test(js) && /for \(const s of community\) openPick\(/.test(js) && /for \(const item of shelf\) openPick\(/.test(js) && /for \(const kind of RANGE_KINDS\) openPick\(/.test(js), 'the picker lists a new room and a new level of each range, the shipped stages, the community\'s levels and the shelf');
  ok(/const lv = decodeShare\(\$\('#openLink'\)\.value\)/.test(js) && /tell\('load', \{ id: idOf\(lv\), from: 'link' \}\)/.test(js), 'a share link pasted in opens through decodeShare, and the build hears a load from a link');
  ok(/const firstVisit = sharedRoom === null && loadJson\(STORE, null\) === null/.test(js) && /q\.get\('open'\) === '1' \|\| \(firstVisit && q\.get\('guide'\) !== '1'\)\) showOpen\(\)/.test(js), 'the picker opens by itself on ?open=1 and on a device\'s first visit (unless the guide was asked for)');
  ok(/if \(guideDialog\.open\) guideDialog\.close\(\);\s*if \(!openDialog\.open\) openDialog\.showModal\(\);/.test(js), 'the picker takes the banner\'s place, never stacks on it');
  ok(/openLevel: showOpen/.test(js), 'window.__maker.openLevel opens the picker for a scripted check');
  for (const sel of ['.open-level {', '.open-grid {', '.open-pick {', '.guide-else {', 'html:not([data-look=classic]) .open-grid {']) ok(css.includes(sel), `src/maker.css has ${sel}`);
}

if (failed) { console.error(`verify-maker: ${failed} failure(s)`); process.exit(1); }
console.log('verify-maker: the maker judges, writes and reads rooms as the site does');
