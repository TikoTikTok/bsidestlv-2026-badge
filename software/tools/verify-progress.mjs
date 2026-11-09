#!/usr/bin/env node
// Checks the stages page's progress and prizes (src/progress.js): a level's
// key is the puzzle and nothing else, the facts read off a map are right,
// every prize is won by what it says and by nothing else, a solver's win
// earns nothing, a par that arrives late still counts, a saved state from an
// older page is mended, and the page (index.html, src/gallery.js) draws every
// prize and feeds every event. Part of `npm run verify`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Progress, ACHIEVEMENTS, ACHIEVEMENT_IDS, STORE_KEY, levelKey, factsOf, factsLine, evaluate, fresh, mend, memoryStore } from '../../src/progress.js';
import { TEA_PARTY } from '../../stages/tea-party.js';
import { QUEENS_GAUNTLET } from '../../stages/queens-gauntlet.js';
import { THE_FIRST_LESSON } from '../../stages/community/the-first-lesson.js';
import { TICK_TOCK } from '../../stages/community/tick-tock.js';

const root = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const moduleOnly = process.argv.includes('--module-only');   // verify-obfuscate runs this over the obfuscated copy, whose source the page pins cannot read
let failed = 0;
const ok = (cond, what) => { if (!cond) { failed++; console.error(`  ✗ ${what}`); } };

// ------------------------------------------------------------------ keys ----
console.log('a level is known by its puzzle');
{
  const k = levelKey(TEA_PARTY);
  ok(/^[0-9a-z]{1,7}$/.test(k), `the key is a short base-36 word (${k})`);
  ok(levelKey({ ...TEA_PARTY, name: 'Renamed', blurb: 'x', lesson: [{ on: 'move', say: 'y' }], theme: 'court' }) === k, 'the name, the blurb, the lesson and the dressing are not the puzzle');
  ok(levelKey({ ...TEA_PARTY, rows: TEA_PARTY.rows.map((r, i) => (i === 2 ? r.replace('O', '.') : r)) }) !== k, 'a changed map is another level');
  ok(levelKey({ ...TEA_PARTY, tickMs: 320 }) !== k, 'a clock makes it another level');
  ok(levelKey(QUEENS_GAUNTLET) !== levelKey({ ...QUEENS_GAUNTLET, hazards: QUEENS_GAUNTLET.hazards.slice(1) }), 'the cast is part of the puzzle');
  const four = new Set([TEA_PARTY, QUEENS_GAUNTLET, THE_FIRST_LESSON, TICK_TOCK].map(levelKey));
  ok(four.size === 4, 'the four shipped rooms have four keys');
}

// ----------------------------------------------------------------- facts ----
console.log('the facts are read off the map');
{
  const f = factsOf(TEA_PARTY);
  ok(f.kind === 'tea' && f.w === 13 && f.h === 9 && f.rocks === 3 && f.buttons === 3 && f.gates === 1 && f.levers === 1 && f.cast === 0 && f.tickMs === null, `the tea party: untimed 13x9, 3 rocks, 3 buttons, a gate (${JSON.stringify(f)})`);
  const g = factsOf(QUEENS_GAUNTLET);
  ok(g.kind === 'chase' && g.w === 9 && g.h === 8 && g.rocks === 2 && g.buttons === 2 && g.cast === 3 && g.watchers === 1 && g.tickMs === 320, `the gauntlet: timed 9x8 at 320 ms, 2 rocks, a cast of 3 with one watcher (${JSON.stringify(g)})`);
  ok(factsLine(f).join(' · ') === 'untimed · 13×9 · 3 rocks · 3 buttons · a gate', `the tea party's line (${factsLine(f).join(' · ')})`);
  ok(factsLine(g).join(' · ') === 'timed · 320 ms a tick · 9×8 · 2 rocks · 2 buttons · a gate · a cast of 3', `the gauntlet's line (${factsLine(g).join(' · ')})`);
  ok(factsLine(factsOf(THE_FIRST_LESSON)).join(' · ') === 'untimed · 9×7 · 1 rock · 1 button · a gate', 'one rock, one button, singular');
  ok(factsOf({ ...TICK_TOCK, tickMs: undefined }).tickMs === 320, 'a timed room with no tickMs runs at 320 ms');
}

// ---------------------------------------------------------------- prizes ----
console.log('every prize is won by what it says');
{
  ok(ACHIEVEMENTS.length === 13 && new Set(ACHIEVEMENT_IDS).size === ACHIEVEMENTS.length, `${ACHIEVEMENTS.length} prizes, every id its own`);
  for (const a of ACHIEVEMENTS) ok(a.icon && a.title && /\.$/.test(a.say) && typeof a.test === 'function', `prize ${a.id}: an icon, a title, a sentence on how, a test`);
  ok(evaluate(fresh(), []).length === 0, 'a fresh state has won nothing');

  const L = (id, level, group) => ({ id, key: levelKey(level), group, kind: level.hazards ? 'chase' : 'tea', par: null });
  const tea = L('tea-party', TEA_PARTY, 'stages'), chase = L('queens-gauntlet', QUEENS_GAUNTLET, 'stages');
  const lesson = L('the-first-lesson', THE_FIRST_LESSON, 'community'), tick = L('tick-tock', TICK_TOCK, 'community');
  const shared = L('shared', { ...THE_FIRST_LESSON, rows: THE_FIRST_LESSON.rows.map((r, i) => (i === 2 ? r.replace('b', '.') : r)) }, 'shared');
  const list = [tea, chase, lesson, tick];
  const ev = (what, extra = {}) => ({ kind: 'room', what, ...extra });

  let got = [];
  const store = memoryStore();
  const p = new Progress(store, { now: () => '2026-11-09T12:00:00.000Z' });
  p.catalogue(list);
  p.on(({ unlocked }) => got.push(...unlocked.map(a => a.id)));
  ok(p.feed(ev('open'), tea).length === 0 && p.feed(ev('blocked'), tea).length === 0, 'opening and bumping win nothing');
  ok(p.feed(ev('move', { moves: 1 }), tea).map(a => a.id).join() === 'first-step' && got.join() === 'first-step', 'the first move: Down the rabbit hole, and the listener hears it');
  ok(store.load().prizes['first-step'] === '2026-11-09T12:00:00.000Z' && store.load().totals.moves === 1, 'saved with the date and the count');
  ok(p.feed(ev('move', { moves: 2 }), tea).length === 0, 'a prize is won once');

  // the solver's win earns nothing; the player's does
  p.feed(ev('solve', { par: 106 }), tea);
  ok(p.feed(ev('win', { moves: 106 }), tea).length === 0 && !p.record(tea.key), 'a win after Solve ran is not recorded');
  p.feed(ev('reset'), tea);
  p.feed(ev('undo', { moves: 3 }), tea);
  const won = p.feed(ev('win', { moves: 120 }), tea).map(a => a.id);
  ok(won.join() === 'tea-served', `the tea party won by hand: Tea is served (${won.join()})`);
  ok(p.record(tea.key).wins === 1 && p.record(tea.key).best === 120 && p.record(tea.key).clean === false, 'recorded: one win, best 120, not clean (an undo was taken)');
  // the par comes later from the worker: the best is over it, so nothing; a better run under it is the prize
  ok(p.parKnown(tea.key, 106).length === 0 && p.record(tea.key).par === 106, 'the par arrives late and is kept; 120 is over it');
  p.feed(ev('reset'), tea);
  const clean = p.feed(ev('win', { moves: 106 }), tea).map(a => a.id).sort();
  ok(clean.join() === 'clean,par', `a clean run in par: No regrets and The best known answer (${clean.join()})`);
  ok(p.record(tea.key).best === 106 && p.record(tea.key).wins === 2 && p.record(tea.key).clean === true, 'the best came down, the win count up, clean once is clean');

  // the gauntlet: caught, then out
  p.feed(ev('open'), chase);
  ok(p.feed(ev('caught', { ticks: 5 }), chase).map(a => a.id).join() === 'seen', 'caught once: Seen');
  p.feed(ev('restart'), chase);
  for (let i = 0; i < 20; i++) p.feed(ev('wait', { ticks: i }), chase);
  ok(got.includes('patient'), 'twenty waits: Standing still');
  const out = p.feed(ev('win', { ticks: 64 }), chase).map(a => a.id);
  ok(out.join() === 'not-today', `the gauntlet won: Not today, Your Majesty (${out.join()})`);
  ok(p.record(chase.key).clean === false, 'a timed level is never "clean": undo is not a move there');

  // the community: a lesson followed, both rooms won
  p.feed(ev('open'), lesson);
  ok(p.feed(ev('lesson', { steps: 5 }), lesson).map(a => a.id).join() === 'lesson', 'a lesson followed to its end: The first lesson');
  ok(p.feed(ev('win', { moves: 19 }), lesson).length === 0, 'one community room of two: no caucus yet');
  p.feed(ev('open'), tick);
  const caucus = p.feed(ev('win', { ticks: 14 }), tick).map(a => a.id).sort();
  ok(caucus.join() === 'caucus,everything', `every room and every level won: A caucus race and A prize for everyone (${caucus.join()})`);
  const s = p.summary();
  ok(s.won === 4 && s.of === 4 && s.prizes === 10 && s.prizesOf === 13, `the summary: 4 of 4 won, 10 of 13 prizes (${JSON.stringify(s)})`);

  // a room from a link: it counts for its own prize, not for "every level"
  p.catalogue([...list, shared]);
  ok(p.summary().of === 4, 'a shared room is not one of the page\'s levels to win');
  p.feed(ev('open'), shared);
  ok(p.feed(ev('win', { moves: 12 }), shared).map(a => a.id).join() === 'looking-glass' && p.record(shared.key).shared === true, 'a shared room won: Through the looking glass');
  ok(p.tutorialDone().map(a => a.id).join() === 'tutorial' && p.tutorialDone().length === 0, 'the tutorial finished: The Caucus Race, run - once');
  for (let i = 0; i < 500; i++) p.feed(ev('move', { moves: i }), tea);
  ok(got.includes('walker') && got.length === 13 && new Set(got).size === 13, `every prize won on the way, each once (${got.length})`);

  // forgotten
  p.reset();
  ok(p.summary().won === 0 && p.summary().prizes === 0 && store.load().totals.moves === 0, 'reset forgets everything, and saves the empty state');

  // an older or broken save is mended, never trusted
  const m = mend({ levels: { abc: { id: 'x', wins: '2', best: 'nope', clean: 1 }, bad: null }, totals: { moves: -4, waits: '3' }, prizes: { 'first-step': 'yesterday', nope: 'x', seen: 5 }, tutorial: 'yes' });
  ok(m.levels.abc.wins === 2 && m.levels.abc.best === null && m.levels.abc.clean === true && !('bad' in m.levels), 'a level record is made whole');
  ok(m.totals.moves === 0 && m.totals.waits === 3 && m.totals.caught === 0, 'the totals are numbers, never negative, every counter present');
  ok(Object.keys(m.prizes).join() === 'first-step' && m.tutorial === true, 'only known prizes with a date survive');
  ok(mend(null).totals.moves === 0 && mend('garbage').prizes && Object.keys(mend([]).levels).length === 0, 'anything that is not a state is a fresh one');
  const p2 = new Progress({ load: () => ({ levels: { [tea.key]: { id: 'tea-party', wins: 1, best: 106, clean: true, par: 106 } }, prizes: {} }), save() {} });
  p2.catalogue(list);
  ok(Object.keys(p2.state.prizes).sort().join() === 'clean,par,tea-served', `a state saved before the prizes existed wins them on load (${Object.keys(p2.state.prizes).sort().join()})`);
  ok(STORE_KEY === 'alice.progress', 'the store is localStorage alice.progress');
}

// ------------------------------------------------------------------ page ----
if (!moduleOnly) {
  console.log('the page draws it');
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const js = readFileSync(resolve(root, 'src/gallery.js'), 'utf8');
  const room = readFileSync(resolve(root, 'src/room.js'), 'utf8');
  ok(/from '\.\/progress\.js'/.test(js) && /new Progress\(localStore\(\)\)/.test(js), 'src/gallery.js keeps the progress in localStorage through src/progress.js');
  ok(/progress\.feed\(ev, \{ id: current\.id, key: current\.key, group: current\.group, kind: current\.kind, par: current\.par \}\)/.test(js), 'every event of the open level is fed with the level it happened in');
  ok(/progress\.parKnown\(entry\.key, par\)/.test(js) && /progress\.tutorialDone\(\)/.test(js) && /progress\.begin\(\)/.test(js), 'the par from the worker, the tutorial\'s end and a fresh open reach the progress');
  ok(/for \(const a of ACHIEVEMENTS\)/.test(js) && /id="prizes"/.test(html) && /id="progressLine"/.test(html) && /id="toast"/.test(html), 'every prize is drawn, won or not; the summary line and the toast have their places');
  ok(/progress\.on\(\(\{ unlocked, reset \}\)/.test(js) && /confirm\('Forget every win and prize on this device\?'\)/.test(js), 'a prize won is toasted; forgetting asks first');
  ok(/tell\('lesson', \{ steps: lesson\.steps\.length \}\)/.test(room) && /tell\('solve', \{ par: found\.moves\.length \}\)/.test(room), 'src/room.js reports a lesson followed to its end, and the solver\'s run, so the progress can judge both');
  ok(/par: nextPar = null/.test(room) && /setPar\(n\)/.test(room) && /parNote\(\)/.test(room), 'src/room.js says the par with a win, and takes one that arrives late');
}

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nprogress: the prizes are earned by play, and only by play');
