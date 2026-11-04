// Alice in AI Land - a glitch range level as data: what one needs, and what can be said about it.
//
// Pure logic, no DOM, the same code in Node and in the browser: the verifier
// (software/tools/verify-range.mjs) judges the five shipped ranges' levels
// through it, verify-maker.mjs the community's, and the level maker's studio
// (src/level.js, in src/check-worker.js) a level being written. What the
// studio's Check says about a level is therefore what CI will say.
//
// A glitch level is one object:
//
//   { name, range, id, ...the range's fields, short?, blurb?, hand?, rows? }
//
//   range   which range it is for: watch | glass | lock | dog | wall
//   id      a slug; the rules seed a level's tune, password and canary from it
//   rows    the map, only when it differs from the range's own (RANGE_MAPS);
//           the range page draws the range's map either way
//
// and the fields per range are RANGE_FIELDS below - the same fields the
// shipped modules under stages/ carry per level (stages/rabbit-watch.js,
// looking-glass.js, caterpillar-lock.js, dormouse-watchdog.js, humpty-wall.js
// say what each means). The rules live in src/range.js, src/lock.js,
// src/watchdog.js and src/wall.js; this file only asks them questions.
//
// The budget: a human sustains 4-6 accurate presses a second and lands a
// timed press within about +/-40 ms (docs/GAME_DESIGN.md); the browser
// samples a gamepad every ~16 ms, so a replayed press needs >= 34 ms to be
// seen at all and a landing carries +/-8 ms of sampling jitter however good
// the badge is. `hand` on a level is the design intent; rangeCheck measures
// it and refuses a level that lies about it.

import { comboSequence, Combo, buildLevel, land, idealOffsetMs, Run } from './range.js';
import { secretFor, orderFor, comparisons, runAlong, buildLock, Lock, attack as pickLock, lcg, summarize } from './lock.js';
import { Watchdog, windowOf, idealGapMs, replay } from './watchdog.js';
import { Wall, judge, frameOf, canaryFor, withDefaults, attack as smash } from './wall.js';

export const RANGE_KINDS = ['watch', 'glass', 'lock', 'dog', 'wall'];
export const RANGE_NAMES = {
  watch: "The Rabbit's Pocket Watch", glass: 'The Looking-Glass Glitch', lock: "The Caterpillar's Lock",
  dog: "The Dormouse's Watchdog", wall: "Humpty Dumpty's Wall",
};
/** The shipped module of each range under stages/ (its id, as src/seal.js loadStage takes it). */
export const RANGE_FILES = { watch: 'rabbit-watch', glass: 'looking-glass', lock: 'caterpillar-lock', dog: 'dormouse-watchdog', wall: 'humpty-wall' };

/** The map of each range that has one: the same for every level of it, so a level need not carry one. */
export const RANGE_MAPS = {
  glass: [
    '#########',
    '#....#..#',
    '#A...G.T#',
    '#....#..#',
    '#########',
  ],
  lock: [
    '#######',
    '#.m...#',
    '#A...D#',
    '#...m.#',
    '#######',
  ],
  wall: [
    '#########',
    '#...#...#',
    '#A..H...#',
    '#...#...#',
    '#########',
  ],
};
/** What a range's map may hold beyond # . A, and which glyphs must appear exactly once. */
export const RANGE_GLYPHS = {
  glass: { G: 'the guard in the doorway', T: 'the treasure' },
  lock: { m: 'a mushroom', D: "the Caterpillar's door" },
  wall: { H: 'Humpty on the wall', D: 'the door' },
};
const SINGLE_GLYPHS = { glass: ['G', 'T'], lock: ['D'], wall: ['H'] };

/** The symbols a level's pool, button and address are drawn from: the badge's face and direction buttons. */
export const POOL_BUTTONS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y'];

export const BUDGET = {
  HAND_RATE: 6,          // presses / s
  HAND_JITTER_MS: 40,    // +/- on a timed press
  HAND_PRESSES: 150,     // about what a player types into one puzzle before it stops being fun
  HOST_SAMPLE_MS: 16,    // browser gamepad polling
  MIN_PRESS_MS: 34,      // HOST_SAMPLE_MS * 2 + 2: a press shorter than two samples may never be seen
};
/** How many passwords (lock) and frames (wall) the attacker is measured over, as CI does it. */
export const SEEDS = { lock: 40, wall: 8 };

// --------------------------------------------------------------- the fields ----
// One table per range: the field, its type and range, its default (the
// level the studio starts from). rangeLint reads it, normalize keeps to it,
// the studio's forms open on it.

const GLASS_LISTING = [
  'guard_wake:',
  '  led(RED)',
  '* stack_push(lr)',
  '  key = read_key(ALICE)',
  '  suit = key & 0x0f',
  '  delay(2)',
  '! if (suit != HEARTS) goto deny',
  '  door_open(TREASURE)',
  '  alice_jump(TREASURE)',
  '  goto done',
  'deny:',
  '  say("No key, no treasure.")',
  '  alice_bounce()',
  '  goto done',
  'done:',
  '* stack_pop(lr)',
  '  led(OFF)',
  '  ret',
];

export const RANGE_FIELDS = {
  watch: {
    pool:     { type: 'pool', min: 2, default: POOL_BUTTONS, about: 'the buttons the tune is made of' },
    length:   { type: 'int', min: 2, max: 32, default: 4, about: 'presses in the tune' },
    windowMs: { type: 'int', min: 50, max: 20000, default: 2000, about: 'from the first press to the last' },
    hand:     { type: 'bool', default: true, about: 'meant for a hand (4-6 presses a second), or for a take replayed faster' },
  },
  glass: {
    lineMs:        { type: 'int', min: 5, max: 2000, default: 120, about: 'one tick: one line of the routine' },
    pulseMaxLines: { type: 'int', min: 1, max: 10, default: 3, about: 'a pulse covering more lines browns the guard out' },
    listing:       { type: 'lines', default: GLASS_LISTING, about: "the guard's routine (see the legend)" },
    hidden:        { type: 'bool', default: false, optional: true, about: 'fade the listing: the player sees only its shape' },
    hand:          { type: 'bool', optional: true, about: 'a hand lands a tick of 80 ms or more; left out, that decides it' },
  },
  lock: {
    pool:        { type: 'pool', min: 2, default: ['UP', 'DOWN', 'LEFT', 'RIGHT'], about: 'the symbols of the password' },
    length:      { type: 'int', min: 2, max: 12, default: 4, about: 'symbols in the password' },
    tickMs:      { type: 'int', min: 10, max: 2000, default: 300, about: 'one comparison' },
    jitterTicks: { type: 'number', min: 0, max: 3, default: 0, about: 'noise on the answer time, in ticks (sigma)' },
    order:       { type: 'enum', values: ['prefix', 'secret'], default: 'prefix', about: 'compared first to last, or in an order of his own' },
    hand:        { type: 'bool', default: true, about: 'meant for a hand: the attacker types at most 150 presses' },
  },
  dog: {
    button:    { type: 'button', default: 'A', about: 'the nudge' },
    kicks:     { type: 'int', min: 1, max: 64, default: 6, about: 'good nudges in a row to win' },
    openMs:    { type: 'int', min: 1, max: 20000, default: 500, about: 'the window opens this long after the last nudge' },
    timeoutMs: { type: 'int', min: 2, max: 20000, default: 1000, about: 'and the Dormouse bites after this long' },
    hand:      { type: 'bool', default: true, about: 'meant for a hand: a window 80 ms or wider at 6 nudges a second or fewer' },
  },
  wall: {
    pool:    { type: 'pool', min: 2, default: POOL_BUTTONS, about: 'the symbols a name is typed in' },
    size:    { type: 'int', min: 1, max: 11, default: 4, about: 'the buffer, in symbols' },
    canary:  { type: 'bool', default: false, about: 'a symbol of his own between the name and lr (which one is per seed)' },
    address: { type: 'address', default: ['UP', 'RIGHT'], about: "open_wall's address: two symbols from the pool, printed in the listing" },
    gapMs:   { type: 'int', min: 20, max: 10000, default: 800, about: 'every symbol must follow the last within this' },
    hidden:  { type: 'bool', default: false, about: 'the listing shows name[?] instead of the size' },
    listing: { type: 'lines', default: null, about: "Humpty's listing: name[size] or name[?], and open_wall @ the address" },
    hand:    { type: 'bool', default: true, about: 'meant for a hand: 6 symbols a second or fewer' },
  },
};
const COMMON = { short: 16, blurb: 400 };   // optional strings and their lengths

/** Humpty's listing for a level, from its fields: the frame as he declares it, the address as the firmware image prints it. */
export function wallListing(level) {
  const glyph = { UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', A: 'A', B: 'B', X: 'X', Y: 'Y' };
  const addr = (level.address ?? ['UP', 'RIGHT']).map(a => glyph[a] ?? a).join(' ');
  const size = level.hidden ? '?' : level.size;
  return [
    'humpty_greet:',
    `  char name[${size}]`,
    ...(level.canary ? ['  canary = CANARY        // a symbol of his own'] : []),
    '  say("And what is your name?")',
    '  read_line(name)        // no bound',
    ...(level.canary ? ['  if (canary != CANARY) goto smashed'] : []),
    '  say("Pleased to meet you, " + name)',
    '  ret                    // to wherever lr says',
    ...(level.canary ? ['smashed:', '  say("*** stack smashing detected ***")', '  halt()'] : []),
    '',
    `open_wall:  @ ${addr}`,
    '  door_open(GARDEN)',
  ];
}

/** A level of `kind` with every field at its default, named `name`: what the studio starts a glitch level from. */
export function rangeBlank(kind, name = 'An Untitled Level') {
  const out = { name, range: kind };
  for (const [field, spec] of Object.entries(RANGE_FIELDS[kind] ?? {})) {
    if (spec.default === undefined || spec.default === null) continue;
    out[field] = Array.isArray(spec.default) ? [...spec.default] : spec.default;
  }
  if (kind === 'wall') out.listing = wallListing(out);
  return out;
}

/** The take the badge plays a watchdog level with: the speed and the tempo to record at (the first gap is the fire's offset). */
export function takeFor(level) {
  const ideal = idealGapMs(level);
  const speed = Math.pow(2, Math.max(0, Math.ceil(Math.log2(400 / ideal))));
  return { speed, recordMs: Math.round(ideal * speed), gapMs: ideal };
}

// ------------------------------------------------------------------ lint ----

const slug = /^[a-z0-9][a-z0-9-]*$/;
const distinct = (a) => new Set(a).size === a.length;

/**
 * What is wrong with a glitch level before any rule is asked: the range,
 * the id, every field's type and range, the listing's syntax, the map's
 * legend. Returns [] when nothing is. rangeCheck starts here.
 */
export function rangeLint(level) {
  const out = [];
  if (!level || typeof level !== 'object') return ['a level is an object'];
  const kind = level.range;
  if (!RANGE_KINDS.includes(kind)) return [`range must be one of ${RANGE_KINDS.join(' ')}`];
  if (!level.name || !String(level.name).trim()) out.push('the level needs a name');
  if (typeof level.id !== 'string' || !slug.test(level.id)) out.push('the level needs an id: lower-case letters, digits and dashes');
  const pool = Array.isArray(level.pool) ? level.pool : null;
  for (const [field, spec] of Object.entries(RANGE_FIELDS[kind])) {
    const v = level[field];
    if (v === undefined) { if (!spec.optional) out.push(`needs ${field}: ${spec.about}`); continue; }
    switch (spec.type) {
      case 'int':
        if (!Number.isInteger(v) || v < spec.min || v > spec.max) out.push(`${field} must be a whole number from ${spec.min} to ${spec.max}`);
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v) || v < spec.min || v > spec.max) out.push(`${field} must be a number from ${spec.min} to ${spec.max}`);
        break;
      case 'bool':
        if (typeof v !== 'boolean') out.push(`${field} must be true or false`);
        break;
      case 'enum':
        if (!spec.values.includes(v)) out.push(`${field} must be ${spec.values.join(' or ')}`);
        break;
      case 'pool':
        if (!Array.isArray(v) || v.length < spec.min || !v.every(b => POOL_BUTTONS.includes(b)) || !distinct(v))
          out.push(`${field} must be at least ${spec.min} different badge buttons (${POOL_BUTTONS.join(' ')})`);
        break;
      case 'button':
        if (!POOL_BUTTONS.includes(v)) out.push(`${field} must be a badge button (${POOL_BUTTONS.join(' ')})`);
        break;
      case 'address':
        if (!Array.isArray(v) || v.length !== 2 || !v.every(b => POOL_BUTTONS.includes(b))) out.push(`${field} must be two badge buttons`);
        else if (pool && !v.every(b => pool.includes(b))) out.push(`${field} must be two symbols from the pool (${pool.join(' ')})`);
        break;
      case 'lines':
        if (!Array.isArray(v) || !v.length || !v.every(l => typeof l === 'string')) out.push(`${field} must be a list of lines`);
        break;
    }
  }
  for (const [field, max] of Object.entries(COMMON)) {
    const v = level[field];
    if (v !== undefined && (typeof v !== 'string' || v.length > max)) out.push(`${field} is one line of text, up to ${max} characters`);
  }
  if (out.length) return out;

  // what the rules need of the fields together
  if (kind === 'glass') {
    try { buildLevel(level); }
    catch (e) { out.push(`the listing: ${e.message}`); }
  }
  if (kind === 'dog' && level.openMs >= level.timeoutMs) out.push(`the window must open (${level.openMs} ms) before the Dormouse bites (${level.timeoutMs} ms)`);
  if (kind === 'wall') {
    const f = frameOf(level);
    const maxLength = withDefaults(level).maxLength;
    if (maxLength < f.total + 2) out.push(`a name must be allowed to run past the frame: ${f.total} slots, names of up to ${maxLength}`);
    if (!level.listing.some(l => l.includes('open_wall') && l.includes('@'))) out.push("the listing must print open_wall's address: a line with open_wall and @");
    if (level.hidden && !level.listing.some(l => /name\[\?\]/.test(l))) out.push('a hidden level shows name[?] in the listing');
    if (!level.hidden && !level.listing.some(l => l.includes(`name[${level.size}]`))) out.push(`the listing shows the buffer's size: name[${level.size}]`);
  }
  // a map of its own: the range's legend, every single glyph once
  if (level.rows !== undefined) {
    const rows = level.rows;
    const legend = { '#': 1, '.': 1, A: 1, ...(RANGE_GLYPHS[kind] ?? {}) };
    if (!Array.isArray(rows) || !rows.length || rows.some(r => typeof r !== 'string' || !r.length)) out.push('rows must be a list of strings');
    else if (!RANGE_MAPS[kind]) out.push(`${RANGE_NAMES[kind]} has no map`);
    else {
      const w = rows[0].length;
      if (rows.some(r => r.length !== w)) out.push('every row must be the same length');
      const count = {};
      rows.forEach((r, y) => [...r].forEach((ch, x) => { if (!(ch in legend)) out.push(`unknown character '${ch}' at ${x},${y} (the legend is ${Object.keys(legend).join(' ')})`); count[ch] = (count[ch] ?? 0) + 1; }));
      for (const g of ['A', ...SINGLE_GLYPHS[kind]]) if ((count[g] ?? 0) !== 1) out.push(`the map needs exactly one ${g} (${legend[g] === 1 ? 'Alice' : legend[g]}), it has ${count[g] ?? 0}`);
    }
  }
  return out;
}

// ----------------------------------------------------------------- check ----

/**
 * The verifier's verdict on a glitch level: the budgets against what the
 * level claims (`hand`), a replay that wins and one that loses, a hand
 * simulated on it, the reference attacker on a lock and a wall with what it
 * cost, and the rules exercised on this very level. Every number the
 * verdict rests on is in `stats`; `notes` say them in words; `hand` is what
 * the budgets say (true: a hand can do it); `par` is the attacker's cost in
 * takes where there is one. `seeds` overrides how many passwords / frames
 * the attacker is measured over (SEEDS: what CI uses).
 *
 *   { ok, kind, problems, notes, hand, par, stats, ms }
 */
export function rangeCheck(level, { seeds } = {}) {
  const problems = rangeLint(level);
  const kind = level?.range;
  if (problems.length) return { ok: false, kind, problems, notes: [], hand: null, par: null, stats: {} };
  const t0 = performance.now();
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const r = CHECKS[kind](level, ok, seeds);
  const ms = Math.round(performance.now() - t0);
  return { ok: !problems.length, kind, problems, notes: r.notes, hand: r.hand, par: r.par ?? null, stats: r.stats, ms };
}

const { HAND_RATE, HAND_JITTER_MS, HAND_PRESSES, HOST_SAMPLE_MS, MIN_PRESS_MS } = BUDGET;
const pct = (x) => `${(x * 100).toFixed(0)} %`;

const CHECKS = {
  // the watch: the tune fits the window at a hand's rate or not, as marked;
  // a perfect replay wins, a slow one loses, a wrong press is named
  watch(level, ok) {
    const seq = comboSequence(level);
    const rate = (level.length - 1) / (level.windowMs / 1000);
    const perPress = level.windowMs / (level.length - 1);
    const hand = rate <= HAND_RATE;
    ok(seq.length === level.length, 'the tune is not as long as the level says');
    ok(comboSequence(level).join() === seq.join(), 'the tune is not deterministic');
    if (level.hand) ok(hand, `marked hand but needs ${rate.toFixed(1)}/s > ${HAND_RATE}/s`);
    else ok(!hand, `marked badge-only but ${rate.toFixed(1)}/s is within a hand's ${HAND_RATE}/s`);
    ok(perPress >= MIN_PRESS_MS, `${perPress.toFixed(0)} ms per press is under the ${MIN_PRESS_MS} ms the host can sample`);
    // a perfect replay, evenly spaced across the window, wins
    let c = new Combo(level, seq);
    let r = null;
    seq.forEach((b, i) => { r = c.press(b, 1000 + i * perPress * 0.98); });
    ok(r?.win === true, `an even replay inside the window should win, got ${r?.reason}`);
    // the same replay 10 % too slow loses on the last press
    c = new Combo(level, seq);
    seq.forEach((b, i) => { r = c.press(b, 1000 + i * perPress * 1.1); });
    ok(r?.win === false && /too slow/.test(r.reason), 'a slow replay should lose as too slow');
    // a wrong button loses immediately, with the step named
    c = new Combo(level, seq);
    const wrong = level.pool.find(b => b !== seq[1]);
    c.press(seq[0], 1000);
    r = c.press(wrong, 1010);
    ok(r?.win === false && /step 2/.test(r.reason), 'a wrong second press should name step 2');
    // START resets an open attempt, as the badge's fire tap does
    c = new Combo(level, seq);
    c.press(seq[0], 1000);
    c.press('START', 1005);
    ok(c.at === 0 && c.open, 'START should reset an open attempt');
    const notes = [
      `${level.length} presses in ${level.windowMs} ms = ${rate.toFixed(1)}/s, ${perPress.toFixed(0)} ms a press`,
      hand ? `a hand can do this (${HAND_RATE}/s is the budget)` : `a hand cannot (${HAND_RATE}/s is the budget): record the tune, play it faster`,
      `the tune: ${seq.join(' ')}`,
    ];
    return { notes, hand, stats: { sequence: seq, rate, perPress } };
  },

  // the glass: the glitched trace reaches the good ending, a pulse at the
  // ideal offset skips the check, a hand's jitter lands it or not by the
  // tick's length, the crash lines crash, a wide pulse browns out
  glass(level, ok) {
    const built = buildLevel(level);
    const ideal = idealOffsetMs(built);
    const width = built.lineMs * 1.5;
    const reaches = (steps, re) => steps.some(s => re.test(built.program.lines[s.line].text));
    ok(reaches(built.glitched, /alice_jump/), 'skipping the target must reach alice_jump (the good ending)');
    ok(!reaches(built.honest, /alice_jump/), 'the honest run must not reach alice_jump');
    ok(reaches(built.honest, /alice_bounce/), 'the honest run must bounce Alice (alice_bounce)');
    // a pulse one and a half lines wide, starting at the ideal offset, skips the check
    let r = land(built, { startMs: ideal, endMs: ideal + width });
    ok(r.verdict === 'skip', `the ideal pulse should skip, got ${r.verdict} on steps ${r.covered}`);
    // ... and still does under the host's sampling jitter, either way
    for (const j of [-HOST_SAMPLE_MS / 2, HOST_SAMPLE_MS / 2]) {
      r = land(built, { startMs: ideal + j, endMs: ideal + width + j });
      ok(r.verdict === 'skip', `the ideal pulse shifted ${j} ms should still skip, got ${r.verdict}`);
    }
    // a hand's jitter: a slow guard forgives it, a quick one does not
    const handHits = [];
    for (let j = -HAND_JITTER_MS; j <= HAND_JITTER_MS; j += 4) handHits.push(land(built, { startMs: ideal + j, endMs: ideal + width + j }).verdict === 'skip');
    const handRate = handHits.filter(Boolean).length / handHits.length;
    const hand = level.lineMs >= 2 * HAND_JITTER_MS;
    if (hand) ok(handRate === 1, `a tick of ${level.lineMs} ms is a hand level, but a hand lands it only ${pct(handRate)} of the time`);
    else ok(handRate < 0.6, `a hand lands this ${pct(handRate)} of the time, meant to be badge-only (a tick under ${2 * HAND_JITTER_MS} ms)`);
    if (level.hand !== undefined) ok(level.hand === hand, level.hand ? `marked hand but a tick of ${level.lineMs} ms is under the ${2 * HAND_JITTER_MS} ms a hand lands` : `marked badge-only but a tick of ${level.lineMs} ms is one a hand lands`);
    // the neighbours of the target are harmless, so a 2-line pulse never crashes on it
    const kinds = [-1, 1].map(d => built.program.lines[built.honest[built.targetStep + d]?.line]?.kind);
    ok(kinds.every(k => k && k !== 'crash'), `the target's neighbours must be harmless lines, got ${kinds}`);
    // the crash lines crash, a wide pulse browns out, a late pulse misses
    const crashStep = built.honest.findIndex(s => built.program.lines[s.line].kind === 'crash');
    ok(crashStep >= 0, 'the routine needs at least one crash line (*)');
    if (crashStep >= 0) {
      r = land(built, { startMs: built.honest[crashStep].tick * level.lineMs + 1, endMs: built.honest[crashStep].tick * level.lineMs + 2 });
      ok(r.verdict === 'crash', `a pulse on a crash line should crash, got ${r.verdict}`);
    }
    r = land(built, { startMs: 0, endMs: level.lineMs * (level.pulseMaxLines + 2) });
    ok(r.verdict === 'brownout', `a ${level.pulseMaxLines + 2}-line pulse should brown out, got ${r.verdict}`);
    r = land(built, { startMs: built.totalMs + 10, endMs: built.totalMs + 20 });
    ok(r.verdict === 'miss' && r.deltaLines === null, `a pulse after the end should miss, got ${r.verdict}`);
    r = land(built, { startMs: 0, endMs: level.lineMs / 2 });
    ok(r.verdict === 'nop' && r.deltaLines === -built.targetStep, `a pulse on step 0 should be a nop ${built.targetStep} lines early, got ${r.verdict} ${r.deltaLines}`);
    // the run driver: START, then a pulse at the ideal offset, ends in a skip; no pulse is a denial
    const run = new Run(built);
    run.edge({ button: 'START', down: true, t: 5000 });
    run.edge({ button: 'START', down: false, t: 5030 });
    run.edge({ button: 'X', down: true, t: 5000 + ideal });
    r = run.edge({ button: 'X', down: false, t: 5000 + ideal + width });
    ok(r?.verdict === 'skip', `a run with the pulse at the ideal offset should skip, got ${r?.verdict}`);
    const run2 = new Run(built);
    run2.edge({ button: 'START', down: true, t: 5000 });
    ok(run2.tick(5000 + built.totalMs + 60)?.verdict === 'denied', 'a run with no pulse should be denied');
    const stats = {
      steps: built.honest.length, totalTicks: built.totalTicks, totalMs: built.totalMs,
      targetStep: built.targetStep, targetLine: built.program.target + 1, targetTick: built.honest[built.targetStep].tick,
      targetStartMs: built.targetStartMs, targetEndMs: built.targetEndMs, idealOffsetMs: ideal, handRate, hidden: !!level.hidden,
    };
    const notes = [
      `${stats.steps} steps x ${level.lineMs} ms = ${stats.totalMs} ms a run; the check is step ${stats.targetStep} (line ${stats.targetLine}) at ${stats.targetStartMs}-${stats.targetEndMs} ms, ideal offset ${ideal} ms`,
      `by hand (+/-${HAND_JITTER_MS} ms): ${pct(handRate)} of attempts skip the check`,
      hand ? 'a hand can land this one' : 'a hand cannot: dial the offset in on the badge',
    ];
    if (level.hidden) notes.push('the listing is hidden: the player sees its shape only');
    return { notes, hand, stats };
  },

  // the lock: the leak is exact, the door answers when the rules say, the
  // jitter misleads one reading and not the median of five, and the
  // reference attacker falls it - cheaply by hand or only with the repeat
  lock(level, ok, seeds = SEEDS.lock) {
    const n = level.length, pool = level.pool;
    const secret = secretFor(level), perm = orderFor(level);
    const space = Math.pow(pool.length, n);
    ok(secret.length === n && secret.every(s => pool.includes(s)), `the password should be ${n} symbols from the pool`);
    ok(secretFor(level).join() === secret.join() && secretFor(level, 1).join() !== secret.join(), 'the password should be fixed per seed');
    ok(perm.length === n && [...perm].sort((a, b) => a - b).every((v, i) => v === i), 'the order should be a permutation');
    if (level.order === 'prefix') ok(perm.every((v, i) => v === i), 'prefix order should be first to last');
    else ok(!perm.every((v, i) => v === i) && orderFor(level).join() === perm.join(), 'a secret order should be a fixed shuffle, never the identity');
    // the leak: k symbols right along the order costs k + 1 comparisons (every one when all are right)
    const off = (s) => pool.find(x => x !== s);
    for (let k = 0; k <= n; k++) {
      const guess = secret.slice();
      for (let j = k; j < n; j++) guess[perm[j]] = off(secret[perm[j]]);
      const want = k === n ? n : k + 1;
      ok(comparisons(secret, guess, perm) === want && runAlong(secret, guess, perm) === k,
         `${k} right along the order should cost ${want} comparisons, got ${comparisons(secret, guess, perm)}`);
    }
    // the door: START opens, symbols fill, the last one submits, the answer is due (1 + comparisons) ticks later
    {
      const lock = new Lock(level, { secret, perm, rng: () => 0.5 });   // 0.5 x3 - 1.5 = 0: no jitter from the rng
      ok(lock.edge({ button: pool[0], down: true, t: 0 }) === null && !lock.entering, 'a symbol before START should be ignored');
      ok(lock.edge({ button: 'START', down: true, t: 10 })?.kind === 'open' && lock.entering, 'START should open a guess');
      ok(lock.edge({ button: 'START', down: false, t: 20 }) === null, 'releases should do nothing');
      ok(lock.edge({ button: 'SELECT', down: true, t: 25 }) === null && lock.guess.length === 0, 'a button outside the pool should be ignored');
      let r = null;
      secret.forEach((sym, i) => { r = lock.edge({ button: sym, down: true, t: 100 + i * 10 }); });
      const lastAt = 100 + (n - 1) * 10;
      ok(r?.kind === 'submitted' && lock.waiting, `the ${n}th symbol should submit`);
      ok(Math.abs(r.answerAt - (lastAt + (n + 1) * level.tickMs)) < 1e-6, `the right password should answer after ${n + 1} ticks, got ${r.answerAt - lastAt} ms`);
      ok(lock.tick(r.answerAt - 1) === null && lock.waiting, 'no answer before its time');
      const a = lock.tick(r.answerAt);
      ok(a?.kind === 'answer' && a.win && a.ticks === n + 1 && lock.opened, 'the door should open on the right password');
      const lock2 = new Lock(level, { secret, perm, rng: () => 0.5 });
      lock2.edge({ button: 'START', down: true, t: 0 });
      const wrong = secret.slice(); wrong[perm[n - 1]] = off(secret[perm[n - 1]]);
      wrong.forEach((sym, i) => lock2.edge({ button: sym, down: true, t: 1 + i }));
      const a2 = lock2.tick(1e9);
      ok(a2 && !a2.win && a2.ticks === n + 1 && a2.comparisons === n && !lock2.opened, 'wrong at the last position should still cost every comparison');
      const lock3 = new Lock(level, { secret, perm });
      lock3.edge({ button: 'START', down: true, t: 0 });
      lock3.edge({ button: pool[0], down: true, t: 1 });
      lock3.edge({ button: 'START', down: true, t: 2 });
      ok(lock3.entering && lock3.guess.length === 0, 'START mid-guess should start over');
    }
    // jitter: none on a hand level; on the others a single reading is often off by a tick, the median of five rarely
    let jitter = null;
    if (!level.jitterTicks) {
      const lock = buildLock(level, 0, { rng: Math.random });
      lock.edge({ button: 'START', down: true, t: 0 });
      secret.forEach((sym, i) => lock.edge({ button: sym, down: true, t: 1 + i }));
      ok(Math.abs(lock.tick(1e9).ms - (n + 1) * level.tickMs) < 1e-6, 'no jitter should mean an exact clock');
    } else {
      const rng = lcg(7);
      let one = 0, five = 0;
      const N = 500;
      for (let i = 0; i < N; i++) {
        const lock = new Lock(level, { secret, perm, rng });
        const guess = secret.slice(); guess[perm[Math.min(2, n - 1)]] = off(secret[perm[Math.min(2, n - 1)]]);
        const want = Math.min(2, n - 1) + 2;
        const seen = [];
        for (let r = 0; r < 5; r++) {
          lock.edge({ button: 'START', down: true, t: 0 });
          guess.forEach((sym, k) => lock.edge({ button: sym, down: true, t: 1 + k }));
          seen.push(Math.round(lock.tick(1e9).ms / level.tickMs));
        }
        one += seen[0] === want; five += summarize(seen).median === want;
      }
      jitter = { one: one / N, five: five / N };
      ok(jitter.one < 0.85, `with jitter a single reading should mislead now and then (${pct(jitter.one)} right)`);
      ok(jitter.five > 0.88, `the median of five should be right nearly always (${pct(jitter.five)})`);
    }
    // the attacker: a hand level falls to a hand, the others need the badge's repeat and still fall
    const repeats = level.jitterTicks ? 7 : 1;
    let solved = 0, guesses = 0, submissions = 0, presses = 0;
    for (let seed = 0; seed < seeds; seed++) {
      const r = pickLock(level, buildLock(level, seed, { rng: lcg(900 + seed) }), { repeats });
      solved += r.solved; guesses += r.guesses; submissions += r.submissions; presses += r.presses;
    }
    const avg = (x) => x / seeds;
    const hand = solved === seeds && avg(presses) <= HAND_PRESSES;
    if (level.hand) {
      ok(solved === seeds, `a hand level must always fall to the attacker, fell ${solved}/${seeds}`);
      ok(avg(presses) <= HAND_PRESSES, `marked hand but costs ${avg(presses).toFixed(0)} presses > ${HAND_PRESSES}`);
    } else {
      ok(solved >= seeds * 0.9, `the badge attacker should clear it nearly always, cleared ${solved}/${seeds}`);
      ok(avg(presses) > HAND_PRESSES * 3, `marked badge-only but a hand types only ${avg(presses).toFixed(0)} presses`);
      ok(avg(guesses) <= 80, `${avg(guesses).toFixed(0)} takes is more than a player records in a sitting`);
    }
    const stats = { space, secret, order: perm, jitter, repeats, seeds, solved, guesses: avg(guesses), submissions: avg(submissions), presses: avg(presses) };
    const notes = [
      `${n} of ${pool.length} (${space.toLocaleString('en')} passwords) x ${level.tickMs} ms, jitter ${level.jitterTicks} tick, order ${level.order}`,
      jitter ? `jitter: one reading right ${pct(jitter.one)}, the median of five ${pct(jitter.five)}` : 'no jitter: one reading is the truth',
      `the attacker x${repeats}: opened ${solved}/${seeds} doors, ${stats.guesses.toFixed(0)} guesses (takes), ${stats.submissions.toFixed(0)} submissions, ${stats.presses.toFixed(0)} presses by hand`,
      hand ? `a hand can do this (${HAND_PRESSES} presses is the budget)` : `a hand cannot (${HAND_PRESSES} presses is the budget): record a guess, hold the fire chord, read the median`,
    ];
    return { notes, hand, par: Math.round(stats.guesses), stats };
  },

  // the dog: the window is wide enough for a hand or not, as marked; a
  // replay with the host's sampling clears it; too soon stirs, too late bites
  dog(level, ok) {
    const w = windowOf(level);
    const ideal = idealGapMs(level);
    const rate = 1000 / ideal;
    ok(level.openMs > 0 && level.timeoutMs > level.openMs, 'the window must be a positive range');
    ok(ideal >= MIN_PRESS_MS, `${ideal} ms a nudge is under the ${MIN_PRESS_MS} ms the host can sample`);
    const hand = w.widthMs >= 2 * HAND_JITTER_MS && rate <= HAND_RATE;
    if (level.hand) {
      ok(w.widthMs >= 2 * HAND_JITTER_MS, `marked hand but the window is ${w.widthMs} ms, a hand needs ${2 * HAND_JITTER_MS}`);
      ok(rate <= HAND_RATE, `marked hand but needs ${rate.toFixed(1)}/s > ${HAND_RATE}/s`);
    } else {
      ok(!hand, `marked badge-only but a hand's ${HAND_RATE}/s and +/-${HAND_JITTER_MS} ms fit`);
    }
    // a perfect replay wins; one with the host's sampling jitter alternating either way still wins
    ok(replay(level).win, 'a perfect replay should win');
    const sampled = replay(level, { jitter: (i) => (i % 2 ? 1 : -1) * HOST_SAMPLE_MS / 2 });
    ok(sampled.win, `a replay under +/-${HOST_SAMPLE_MS / 2} ms of host sampling should still win, got ${sampled.verdict}`);
    ok(w.widthMs >= 2 * HOST_SAMPLE_MS, `the window (${w.widthMs} ms) is narrower than two host samples`);
    // a hand: random +/-40 ms per press. A hand level nearly always survives, the others nearly never
    const rng = lcg(31 + level.kicks);
    const N = 400;
    let wins = 0;
    for (let i = 0; i < N; i++) if (replay(level, { jitter: () => (rng() * 2 - 1) * HAND_JITTER_MS }).win) wins++;
    const handRate = wins / N;
    if (level.hand) ok(handRate > 0.9, `a hand should nearly always manage this one, managed ${pct(handRate)}`);
    else ok(handRate < 0.1, `a hand manages this ${pct(handRate)} of the time, meant to be badge-only`);
    // the rules: too soon stirs, too late bites, START re-arms, the right count wins
    const dog = new Watchdog(level);
    ok(dog.edge({ button: level.button, down: true, t: 0 }) === null && !dog.armed, 'a nudge before START should do nothing');
    dog.edge({ button: 'START', down: true, t: 100 });
    ok(dog.armed && dog.kicks === 0, 'START should arm');
    const other = POOL_BUTTONS.find(b => b !== level.button);
    ok(dog.edge({ button: other, down: true, t: 100 + ideal }) === null && dog.kicks === 0, 'another button should not be a nudge');
    let r = dog.edge({ button: level.button, down: true, t: 100 + level.openMs - 1 });
    ok(r?.verdict === 'early' && !r.win && Math.abs(r.gap - (level.openMs - 1)) < 1e-9, 'a nudge before the window opens should stir it');
    dog.edge({ button: 'START', down: true, t: 1000 });
    ok(dog.tick(1000 + level.timeoutMs) === null, 'no bite at the timeout itself');
    r = dog.tick(1000 + level.timeoutMs + 1);
    ok(r?.verdict === 'late' && !r.win, 'a missed window should bite');
    dog.edge({ button: 'START', down: true, t: 2000 });
    r = dog.edge({ button: level.button, down: true, t: 2000 + level.timeoutMs + 5 });
    ok(r?.verdict === 'late', 'a nudge after the timeout should be too late');
    const win = replay(level, { offset: level.openMs, gap: level.timeoutMs });
    ok(win.win && win.kicks === level.kicks && win.gaps.length === level.kicks, `nudges on both edges of the window should be accepted and ${level.kicks} of them win`);
    const take = takeFor(level);
    const stats = { widthMs: w.widthMs, idealGapMs: ideal, rate, handRate, take };
    const notes = [
      `${level.kicks} nudges on ${level.button}, window ${level.openMs}-${level.timeoutMs} ms (${w.widthMs} wide) = ${rate.toFixed(1)}/s at the ideal gap of ${ideal} ms`,
      `by hand (+/-${HAND_JITTER_MS} ms a press): ${pct(handRate)} of attempts keep it asleep`,
      hand ? 'a hand can do this' : `a hand cannot: record a tap every ${take.recordMs} ms and play it at ${take.speed}x`,
    ];
    return { notes, hand, stats };
  },

  // the wall: the overflow lands where the frame says, the answer changes at
  // the buffer's end and the canary's, the attacker opens it, the leash sorts
  // hand from badge
  wall(raw, ok, seeds = SEEDS.wall) {
    const level = withDefaults(raw);
    const f = frameOf(level);
    const rate = 1000 / level.gapMs;
    ok(level.maxLength >= f.total + 2, 'a name must be allowed to run past the frame');
    if (level.canary) {
      ok(level.pool.includes(level.canarySymbol) && level.canarySymbol !== level.pool[0], "the canary should be a pool symbol, never the first (a lazy name's filler)");
      ok(canaryFor(level, 1) !== undefined && canaryFor(level).length > 0, 'the canary should be fixed per seed');
    }
    ok(level.gapMs >= MIN_PRESS_MS, `${level.gapMs} ms a symbol is under what the host can sample`);
    const handRate = rate <= HAND_RATE;
    if (level.hand) ok(handRate, `marked hand but needs ${rate.toFixed(1)}/s > ${HAND_RATE}/s`);
    else ok(!handRate, `marked badge-only but ${rate.toFixed(1)}/s is within a hand's ${HAND_RATE}/s`);
    // the frame: polite up to the size, then the canary or the return
    const filler = level.pool[0];
    for (let n = 0; n <= f.size; n++) ok(judge(level, Array(n).fill(filler)).verdict === 'polite', `${n} symbols should be polite`);
    const one = judge(level, Array(f.size + 1).fill(filler));
    ok(one.verdict === (level.canary ? 'canary' : 'fall') && one.overflow === 1, `one past the buffer should ${level.canary ? 'trip the canary' : 'fall'}, got ${one.verdict}`);
    const name = Array(f.size).fill(filler);
    const guard = level.canary ? [level.canarySymbol] : [];
    if (level.canary) {
      ok(judge(level, [...name, level.canarySymbol]).verdict === 'polite', 'the right canary alone should be polite again');
      const wrong = level.pool.find(s => s !== level.canarySymbol);
      ok(judge(level, [...name, wrong, ...level.address]).verdict === 'canary', 'a wrong canary should mask a right address');
    }
    ok(judge(level, [...name, ...guard, level.address[0]]).verdict === 'fall', 'half an address should be a fall');
    const open = judge(level, [...name, ...guard, ...level.address]);
    ok(open.verdict === 'open' && open.win && open.lr.join() === level.address.join(), 'the address should open the wall');
    ok(judge(level, [...name, ...guard, ...level.address, filler, filler]).win, 'symbols past the frame should not spoil a good return');
    const other = [level.address[1], level.address[0]];
    if (other.join() !== level.address.join()) ok(judge(level, [...name, ...guard, ...other]).verdict === 'fall', 'the address backwards should be a fall');
    // the read: START prompts, the leash closes it, a stray before START waits for one
    const wall = new Wall(level);
    ok(wall.edge({ button: filler, down: true, t: 0 }) === null && !wall.listening, 'a symbol before START should be ignored');
    ok(wall.edge({ button: 'START', down: true, t: 10 })?.kind === 'open' && wall.listening, 'START should open the read');
    ok(wall.closesAt === 10 + level.firstMs, `the first symbol should have ${level.firstMs} ms`);
    ok(wall.tick(10 + level.firstMs - 1) === null, 'no answer while the leash runs');
    let t = 20;
    for (const sym of [...name, ...guard, ...level.address]) { wall.edge({ button: sym, down: true, t }); t += level.gapMs - 1; }
    ok(wall.listening && wall.closesAt === t - level.gapMs + 1 + level.gapMs, 'every symbol inside the gap should extend the leash');
    const a = wall.tick(t + level.gapMs);
    ok(a?.kind === 'answer' && a.win, 'the leash running out should answer, and the address open the wall');
    const late = new Wall(level);
    late.edge({ button: 'START', down: true, t: 0 });
    late.edge({ button: filler, down: true, t: 10 });
    const closed = late.edge({ button: filler, down: true, t: 10 + level.gapMs + 1 });
    ok(closed?.kind === 'answer' && closed.length === 1, 'a symbol after the leash should be a stray; the read had closed with 1 symbol');
    const empty = new Wall(level);
    empty.edge({ button: 'START', down: true, t: 0 });
    ok(empty.tick(level.firstMs + 1)?.verdict === 'polite', 'nothing typed should be a polite nothing');
    // the attacker: size, canary, address
    let solved = 0, submissions = 0, presses = 0;
    for (let seed = 0; seed < seeds; seed++) {
      const r = smash(raw, seed);
      solved += r.solved; submissions += r.submissions; presses += r.presses;
      ok(r.size === level.size, `the attacker should find size ${level.size}, found ${r.size}`);
      if (level.canary) ok(r.canary === canaryFor(raw, seed), `the attacker should find the canary for seed ${seed}`);
    }
    const avg = (x) => x / seeds;
    ok(solved === seeds, `the attacker must always open the wall, opened ${solved}/${seeds}`);
    const hand = handRate && avg(presses) <= HAND_PRESSES;
    if (level.hand) ok(avg(presses) <= HAND_PRESSES, `marked hand but costs ${avg(presses).toFixed(0)} presses > ${HAND_PRESSES}`);
    ok(avg(submissions) <= 30, `${avg(submissions).toFixed(0)} takes is more than a player records in a sitting`);
    const stats = { frame: f, canarySymbol: level.canarySymbol, rate, seeds, solved, submissions: avg(submissions), presses: avg(presses) };
    const notes = [
      `name[${level.size}]${level.canary ? ` canary ${level.canarySymbol}` : ''} lr -> ${level.address.join(' ')}: ${f.total} slots, ${level.gapMs} ms a symbol = ${rate.toFixed(1)}/s${level.hidden ? ', size hidden' : ''}`,
      `the attacker: opened ${solved}/${seeds} walls, ${stats.submissions.toFixed(0)} names (takes), ${stats.presses.toFixed(0)} presses by hand`,
      hand ? 'a thumb can type this' : 'a thumb cannot: the name is a take, fired with START as the trigger',
    ];
    return { notes, hand, par: Math.round(stats.submissions), stats };
  },
};
