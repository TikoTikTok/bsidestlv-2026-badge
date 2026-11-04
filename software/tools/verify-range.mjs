// Proves the glitch range's levels are what they claim: the hand levels fit a
// hand, the badge levels do not, and every level is winnable with the badge.
//
//   node software/tools/verify-range.mjs
//
// The judgement itself is src/rangecheck.js's rangeCheck - the budgets
// (docs/GAME_DESIGN.md: a human sustains 4-6 accurate presses a second and
// lands a timed press within about +/-40 ms; the browser samples gamepads
// every ~16 ms, so a replayed press needs >= 34 ms to be seen and a landing
// carries +/-8 ms of sampling jitter), a replay that wins and one that loses,
// a hand simulated on the level, the reference attacker on the lock and the
// wall with its cost, and the rules exercised on the level. The level maker's
// Check and verify-maker.mjs run the same function on a community level, so
// this file only prints what it measured and insists on its verdict - and
// that a level which lies about itself is refused.

import { RABBIT_WATCH } from '../../stages/rabbit-watch.js';
import { LOOKING_GLASS } from '../../stages/looking-glass.js';
import { CATERPILLAR_LOCK } from '../../stages/caterpillar-lock.js';
import { DORMOUSE_WATCHDOG } from '../../stages/dormouse-watchdog.js';
import { HUMPTY_WALL } from '../../stages/humpty-wall.js';
import { rangeCheck, rangeLint, rangeBlank, RANGE_KINDS, RANGE_NAMES, RANGE_MAPS, RANGE_FILES, BUDGET, SEEDS } from '../../src/rangecheck.js';
import { TUTORIAL, STAGES_TUTORIAL, Tutor } from '../../src/tutor.js';
import { stageOf } from '../../src/seal.js';
import { TEA_PARTY } from '../../stages/tea-party.js';
import { QUEENS_GAUNTLET } from '../../stages/queens-gauntlet.js';

const { HAND_JITTER_MS } = BUDGET;

let failed = 0;
const fail = (msg) => { failed++; console.error(`  FAIL ${msg}`); };
const ok = (cond, msg) => { if (!cond) fail(msg); };

// A shipped level as the data the checker takes: the range named, the
// watch's pool (per range in the module) on the level.
const SHIPPED = { watch: RABBIT_WATCH, glass: LOOKING_GLASS, lock: CATERPILLAR_LOCK, dog: DORMOUSE_WATCHDOG, wall: HUMPTY_WALL };
const asLevel = (kind, level) => ({ ...level, range: kind, ...(kind === 'watch' ? { pool: level.pool ?? SHIPPED.watch.pool } : {}) });
const handMarked = (kind, level) => level.hand ?? (kind === 'glass' ? level.lineMs >= 2 * HAND_JITTER_MS : null);

// what each range prints per level, from the checker's numbers
const LINES = {
  watch: (level, s) => [`${level.name.padEnd(24)} ${String(level.length).padStart(2)} presses in ${String(level.windowMs).padStart(4)} ms = ${s.rate.toFixed(1)}/s   ${s.sequence.join(' ')}`],
  glass: (level, s) => [
    `${level.name.padEnd(18)} ${s.steps} steps x ${level.lineMs} ms = ${s.totalMs} ms; target is step ${s.targetStep} (line ${s.targetLine}) at ${s.targetStartMs}-${s.targetEndMs} ms; ideal offset ${s.idealOffsetMs} ms${s.hidden ? '; listing hidden' : ''}`,
    `    by hand (+/-${HAND_JITTER_MS} ms): ${(s.handRate * 100).toFixed(0)} % of attempts skip`,
  ],
  lock: (level, s) => [
    `${level.name.padEnd(18)} ${level.length} of ${level.pool.length} (${s.space.toLocaleString('en')} passwords) x ${level.tickMs} ms, jitter ${level.jitterTicks} tick, order ${level.order}${level.order === 'secret' ? ' ' + s.order.join('') : ''}; password ${s.secret.join(' ')}`,
    ...(s.jitter ? [`    jitter: one reading right ${(s.jitter.one * 100).toFixed(0)} %, the median of five ${(s.jitter.five * 100).toFixed(0)} %`] : []),
    `    attacker x${s.repeats}: solved ${s.solved}/${s.seeds}, ${s.guesses.toFixed(0)} distinct guesses (takes), ${s.submissions.toFixed(0)} submissions, ${s.presses.toFixed(0)} presses by hand`,
  ],
  dog: (level, s) => [
    `${level.name.padEnd(18)} ${String(level.kicks).padStart(2)} nudges, window ${level.openMs}-${level.timeoutMs} ms (${s.widthMs} wide) = ${s.rate.toFixed(1)}/s at the ideal gap of ${s.idealGapMs} ms`,
    `    by hand (+/-${HAND_JITTER_MS} ms a press): ${(s.handRate * 100).toFixed(0)} % of attempts keep it asleep`,
  ],
  wall: (level, s) => [
    `${level.name.padEnd(22)} name[${level.size}]${level.canary ? ` canary ${s.canarySymbol}` : ''} lr -> ${level.address.join(' ')}, ${level.gapMs} ms a symbol = ${s.rate.toFixed(1)}/s${level.hidden ? '; size hidden' : ''}`,
    `    attacker: solved ${s.solved}/${s.seeds}, ${s.submissions.toFixed(0)} names (takes), ${s.presses.toFixed(0)} presses by hand`,
  ],
};

// ---------------------------------------------------------- every range ----
// Each shipped level through the checker: it must pass, and the budgets must
// agree with the design intent the level is marked with.

for (const kind of RANGE_KINDS) {
  const range = SHIPPED[kind];
  console.log(`${kind === 'watch' ? '' : '\n'}${range.name}`);
  ok(range.name === RANGE_NAMES[kind], `${kind}: the module is called ${range.name}, RANGE_NAMES says ${RANGE_NAMES[kind]}`);
  for (const shipped of range.levels) {
    const level = asLevel(kind, shipped);
    const r = rangeCheck(level);
    for (const line of LINES[kind](level, r.stats ?? {})) console.log(`  ${line}`);
    ok(r.kind === kind, `${shipped.id}: judged as ${r.kind}, is ${kind}`);
    for (const p of r.problems) fail(`${shipped.id}: ${p}`);
    if (r.ok) ok(r.hand === handMarked(kind, shipped), `${shipped.id}: marked ${handMarked(kind, shipped) ? 'hand' : 'badge-only'} but the budgets say ${r.hand ? 'a hand can do it' : 'badge-only'}`);
    ok(Array.isArray(r.notes) && r.notes.length >= 2, `${shipped.id}: the verdict says something`);
    if (kind === 'lock') ok(r.stats.seeds === SEEDS.lock && r.par === Math.round(r.stats.guesses), `${shipped.id}: the attacker is measured over ${SEEDS.lock} passwords and its cost is the par`);
    if (kind === 'wall') ok(r.stats.seeds === SEEDS.wall && r.par === Math.round(r.stats.submissions), `${shipped.id}: the attacker is measured over ${SEEDS.wall} frames and its cost is the par`);
  }
}

// ---------------------------------------------------------- the refusals ----
// A level that lies about itself is refused: a hand level given a badge-only
// window, a badge level a hand could do, a window too narrow for the host, a
// listing with no check, a dog whose window never opens, an address outside
// the pool. The maker's lint and Check reach the same refusals.

console.log('\nthe refusals');
{
  const refused = (what, level, re) => {
    const r = rangeCheck(level);
    ok(!r.ok && r.problems.some(p => re.test(p)), `${what}: should be refused with ${re}, got ${r.ok ? 'ok' : r.problems.join(' | ')}`);
    return r;
  };
  const teaTime = asLevel('watch', RABBIT_WATCH.levels[0]);
  refused('a hand watch level with a badge-only window', { ...teaTime, windowMs: 200 }, /marked hand but needs/);
  refused('a badge watch level with a hand-sized window', { ...asLevel('watch', RABBIT_WATCH.levels[2]), windowMs: 5000 }, /marked badge-only but/);
  refused('a window too narrow for the host to sample', { ...teaTime, length: 32, windowMs: 100 }, /the host can sample/);
  refused('a hand glass level at 40 ms a tick', { ...asLevel('glass', LOOKING_GLASS.levels[1]), hand: true }, /marked hand but a tick/);
  refused('a hand dog level with a 40 ms window', { ...asLevel('dog', DORMOUSE_WATCHDOG.levels[0]), openMs: 500, timeoutMs: 540 }, /marked hand but the window/);
  refused('a hand wall level at 100 ms a symbol', { ...asLevel('wall', HUMPTY_WALL.levels[0]), gapMs: 100 }, /marked hand but needs/);
  refused('a hand lock level the attacker cannot clear by hand', { ...asLevel('lock', CATERPILLAR_LOCK.levels[1]), hand: true }, /marked hand but costs/);
  // what lint alone refuses, before any rule is asked
  const lints = (what, level, re) => { const p = rangeLint(level); ok(p.some(x => re.test(x)), `${what}: lint should say ${re}, said ${p.join(' | ') || 'nothing'}`); };
  lints('a listing without a target', { ...asLevel('glass', LOOKING_GLASS.levels[0]), listing: LOOKING_GLASS.levels[0].listing.map(l => l.replace(/^!/, ' ')) }, /exactly one target/);
  lints('a goto to nowhere', { ...asLevel('glass', LOOKING_GLASS.levels[0]), listing: LOOKING_GLASS.levels[0].listing.map(l => l.replace('goto done', 'goto nowhere')) }, /no such label/);
  lints('a dog whose window never opens', { ...asLevel('dog', DORMOUSE_WATCHDOG.levels[0]), openMs: 1000, timeoutMs: 1000 }, /must open/);
  lints('a wall address outside the pool', { ...asLevel('wall', HUMPTY_WALL.levels[0]), pool: ['UP', 'DOWN', 'LEFT'], address: ['UP', 'A'] }, /from the pool/);
  lints('a watch with a tune of one', { ...teaTime, length: 1 }, /length must be/);
  lints('a pool of one', { ...teaTime, pool: ['A'] }, /at least 2 different/);
  lints('a button that is not the badge\'s', { ...asLevel('dog', DORMOUSE_WATCHDOG.levels[0]), button: 'FIRE' }, /badge button/);
  lints('no range', { name: 'x', id: 'x' }, /range must be one of/);
  lints('no id', { ...teaTime, id: undefined }, /needs an id/);
  lints('a map with two Alices', { ...asLevel('lock', CATERPILLAR_LOCK.levels[0]), rows: ['#######', '#A.A..#', '#....D#', '#######'] }, /exactly one A/);
  lints('a map for a range without one', { ...teaTime, rows: ['###', '#A#', '###'] }, /has no map/);
  ok(rangeLint(asLevel('lock', { ...CATERPILLAR_LOCK.levels[0], rows: CATERPILLAR_LOCK.rows })).length === 0, 'a level carrying its range\'s own map lints clean');
  for (const kind of RANGE_KINDS) {
    const blank = { ...rangeBlank(kind), id: 'blank' };
    const r = rangeCheck(blank);
    ok(rangeLint(blank).length === 0 && r.ok && r.hand === true, `${kind}: the blank level the studio starts from is a hand level that checks clean (${r.problems.join(' | ')})`);
  }
  console.log('  a level that lies about its hand, its window, its listing or its pool is refused');
}

// ------------------------------------------------------------------ the tutorial ----
// Every step names a range and level that exist, and the engine walks them.

console.log('\nthe tutorial');
{
  const byRange = SHIPPED;
  const ids = new Set();
  for (const s of TUTORIAL) {
    ok(!ids.has(s.id), `tutorial: duplicate step ${s.id}`); ids.add(s.id);
    ok(typeof s.say === 'string' && s.say.length && typeof s.why === 'string' && s.why.length, `tutorial ${s.id}: say and why`);
    ok(s.chapter === 1 || s.chapter === 2, `tutorial ${s.id}: chapter 1 or 2`);
    if (s.range) {
      ok(byRange[s.range], `tutorial ${s.id}: no such range ${s.range}`);
      const lv = byRange[s.range]?.levels.find(l => l.id === s.level);
      ok(lv, `tutorial ${s.id}: no level ${s.level} in ${s.range}`);
      const hand = lv ? (lv.hand ?? lv.lineMs >= 2 * HAND_JITTER_MS) : true;   // the glass marks hand levels by tick length
      if (lv) ok(hand || s.badge, `tutorial ${s.id}: level ${s.level} is badge-only but the step is not marked badge`);
    }
  }
  ok(TUTORIAL.findIndex(s => s.chapter === 2) === TUTORIAL.filter(s => s.chapter === 1).length, 'tutorial: chapter one comes first, whole');
  let saved = 0;
  const tutor = new Tutor(TUTORIAL, { load: () => 0, save: (at) => { saved = at; } });
  ok(tutor.at === 0 && tutor.step.id === 'wake', 'tutorial: starts at the first step');
  ok(tutor.feed({ kind: 'edge', button: 'A', down: false }) === null, 'tutorial: a release is not a wake');
  ok(tutor.feed({ kind: 'edge', button: 'A', down: true })?.id === 'wake' && saved === 1, 'tutorial: a press wakes, and is saved');
  ok(tutor.feed({ kind: 'edge', button: 'A', down: true }) === null, 'tutorial: the trigger wants START');
  ok(tutor.feed({ kind: 'edge', button: 'START', down: true })?.id === 'trigger', 'tutorial: START is the trigger');
  ok(tutor.feed({ kind: 'watch', level: 'late', result: { win: true } }) === null, 'tutorial: a win on another level does not count');
  ok(tutor.feed({ kind: 'watch', level: 'tea-time', result: { win: false } }) === null, 'tutorial: a loss does not count');
  ok(tutor.feed({ kind: 'watch', level: 'tea-time', result: { win: true } })?.id === 'tea-time', 'tutorial: the tea-time win counts');
  ok(tutor.skip()?.id === 'miss' && tutor.skipped.has('miss') && tutor.step.id === 'skip', 'tutorial: skip moves on and remembers');
  tutor.goto(TUTORIAL.length);
  ok(tutor.done && tutor.step === null, 'tutorial: past the end is done');
  tutor.restart();
  ok(tutor.at === 0 && saved === 0 && tutor.skipped.size === 0, 'tutorial: restart clears');
  const resumed = new Tutor(TUTORIAL, { load: () => 5 });
  ok(resumed.at === 5, 'tutorial: resumes from the store');
  console.log(`  ${TUTORIAL.length} steps, ${TUTORIAL.filter(s => s.chapter === 1).length} by hand, ${TUTORIAL.filter(s => s.badge).length} with the badge`);
}

// The stages' tutorial, A Caucus Race (index.html): every step names a stage,
// the tea party's chapter comes first, and the events src/gallery.js emits
// walk it from end to end.
console.log('\nthe stages\' tutorial');
{
  const ids = new Set();
  for (const s of STAGES_TUTORIAL) {
    ok(!ids.has(s.id), `stages tutorial: duplicate step ${s.id}`); ids.add(s.id);
    ok(typeof s.say === 'string' && s.say.length && typeof s.why === 'string' && s.why.length, `stages tutorial ${s.id}: say and why`);
    ok(['tea', 'chase', 'rooms'].includes(s.stage), `stages tutorial ${s.id}: stage tea, chase or rooms`);
    ok({ 1: 'tea', 2: 'chase', 3: 'rooms' }[s.chapter] === s.stage, `stages tutorial ${s.id}: chapter one is the tea party, chapter two the gauntlet, chapter three the community's rooms`);
    ok(!s.badge, `stages tutorial ${s.id}: nothing here needs the quick-glitch layer`);
  }
  ok(STAGES_TUTORIAL.findIndex(s => s.chapter === 2) === STAGES_TUTORIAL.filter(s => s.chapter === 1).length, 'stages tutorial: chapter one comes first, whole');
  ok(STAGES_TUTORIAL.findIndex(s => s.chapter === 3) === STAGES_TUTORIAL.filter(s => s.chapter < 3).length && STAGES_TUTORIAL.at(-1).chapter === 3, 'stages tutorial: chapter three comes last, whole');
  let saved = null;
  const t = new Tutor(STAGES_TUTORIAL, { load: () => 0, save: (at) => { saved = at; } });
  const walk = [
    ['wake',    { kind: 'edge', button: 'LEFT', down: true }],
    ['walk',    { kind: 'tea', what: 'move', buttons: 0, moves: 1 }],
    ['shove',   { kind: 'tea', what: 'push', buttons: 0, moves: 2 }],
    ['lever',   { kind: 'tea', what: 'lever', buttons: 0, moves: 3 }],
    ['button',  { kind: 'tea', what: 'button', buttons: 1, moves: 4 }],
    ['undo',    { kind: 'tea', what: 'undo', moves: 3 }],
    ['reset',   { kind: 'tea', what: 'reset' }],
    ['tea',     { kind: 'tea', what: 'win', buttons: 3, moves: 106 }],
    ['clock',   { kind: 'chase', what: 'start', ticks: 0 }],
    ['wait',    { kind: 'chase', what: 'wait', ticks: 2 }],
    ['seen',    { kind: 'chase', what: 'caught', ticks: 5 }],
    ['restart', { kind: 'chase', what: 'restart' }],
    ['cross',   { kind: 'chase', what: 'button', ticks: 20 }],
    ['out',     { kind: 'chase', what: 'win', ticks: 64 }],
    ['room',    { kind: 'room', id: 'the-first-lesson', what: 'open', name: 'The First Lesson', rules: 'tea' }],
    ['lesson',  { kind: 'room', id: 'the-first-lesson', what: 'win', moves: 19 }],
  ];
  ok(walk.length === STAGES_TUTORIAL.length, 'stages tutorial: the walk covers every step');
  ok(t.feed({ kind: 'tea', what: 'move' }) === null, 'stages tutorial: a move before a press is not a wake');
  ok(t.feed({ kind: 'edge', button: 'A', down: false }) === null, 'stages tutorial: a release is not a wake');
  for (const [id, ev] of walk) {
    ok(t.step?.id === id, `stages tutorial: at ${id} (is ${t.step?.id})`);
    ok(t.feed({ kind: 'tea', what: 'blocked' }) === null, `stages tutorial ${id}: a bump completes nothing`);
    ok(t.feed({ kind: 'chase', what: 'tick', ticks: 1 }) === null, `stages tutorial ${id}: a plain tick completes nothing`);
    ok(t.feed({ kind: 'room', id: 'x', what: 'move', moves: 1 }) === null, `stages tutorial ${id}: a step in a community room completes nothing`);
    ok(t.feed(ev)?.id === id, `stages tutorial: ${id} completes on its event`);
  }
  ok(t.done && saved === STAGES_TUTORIAL.length, 'stages tutorial: walked to the end, and saved');
  const t2 = new Tutor(STAGES_TUTORIAL, { load: () => 0 });
  t2.feed({ kind: 'edge', button: 'A', down: true });
  ok(t2.feed({ kind: 'tea', what: 'push' }) === null && t2.feed({ kind: 'tea', what: 'move' })?.id === 'walk', 'stages tutorial: a push is also a move, fed as move first');
  console.log(`  ${STAGES_TUTORIAL.length} steps, ${STAGES_TUTORIAL.filter(s => s.stage === 'tea').length} in the tea party, ${STAGES_TUTORIAL.filter(s => s.stage === 'chase').length} in the gauntlet, ${STAGES_TUTORIAL.filter(s => s.stage === 'rooms').length} in the community's rooms`);
}

// ------------------------------------------------------------ the loader ----
// glitch.html opens every range through src/seal.js's loadStage, which finds
// the export in the module by its shape. The watch and the dog carry no map,
// so a finder that wants `rows` (as the one that came with the community
// rooms did, 2026-10-31 to 2026-11-04) refuses the whole page: pin the shape
// of every shipped module here. And the maps src/rangecheck.js carries for
// the studio are the shipped modules' own, so the two never drift.

console.log('the loader');
{
  const shipped = { 'rabbit-watch': RABBIT_WATCH, 'looking-glass': LOOKING_GLASS, 'caterpillar-lock': CATERPILLAR_LOCK,
                    'dormouse-watchdog': DORMOUSE_WATCHDOG, 'humpty-wall': HUMPTY_WALL, 'tea-party': TEA_PARTY, 'queens-gauntlet': QUEENS_GAUNTLET };
  for (const [id, stage] of Object.entries(shipped)) {
    const mod = await import(`../../stages/${id}.js`);
    ok(stageOf(mod) === stage, `stages/${id}.js: loadStage finds its export (${stage.name})`);
  }
  ok(stageOf({ a: 1, b: null, c: { name: 'no map, no levels' } }) === undefined, 'a module with neither rows nor levels exports no stage');
  for (const kind of RANGE_KINDS) {
    ok(SHIPPED[kind] === shipped[RANGE_FILES[kind]], `RANGE_FILES.${kind} names the shipped module (${RANGE_FILES[kind]})`);
    if (RANGE_MAPS[kind]) ok(RANGE_MAPS[kind].join('\n') === SHIPPED[kind].rows.join('\n'), `RANGE_MAPS.${kind} is the shipped map`);
    else ok(SHIPPED[kind].rows === undefined, `${kind}: no map in src/rangecheck.js, none in the module`);
  }
  console.log(`  ${Object.keys(shipped).length} shipped modules found by shape; the five ranges' maps and files agree with src/rangecheck.js`);
}

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nrange: every level is what it says it is');
