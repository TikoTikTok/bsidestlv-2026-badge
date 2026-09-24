// Proves the glitch range's levels are what they claim: the hand levels fit a
// hand, the badge levels do not, and every level is winnable with the badge.
//
//   node software/tools/verify-range.mjs
//
// The budget numbers come from docs/GAME_DESIGN.md: a human sustains 4-6
// accurate presses a second and lands a timed press within about +/-40 ms.
// The floor under everything is the browser: gamepads are sampled every
// ~16 ms, so a replayed press needs >= 34 ms per press to be seen at all and
// a landing carries +/-8 ms of sampling jitter however good the badge is.

import { RABBIT_WATCH } from '../../stages/rabbit-watch.js';
import { LOOKING_GLASS } from '../../stages/looking-glass.js';
import { comboSequence, Combo, buildLevel, land, idealOffsetMs, Run } from '../../src/range.js';

const HAND_RATE = 6;          // presses / s
const HAND_JITTER_MS = 40;    // +/- on a timed press
const HOST_SAMPLE_MS = 16;    // browser gamepad polling
const MIN_PRESS_MS = HOST_SAMPLE_MS * 2 + 2;

let failed = 0;
const fail = (msg) => { failed++; console.error(`  FAIL ${msg}`); };
const ok = (cond, msg) => { if (!cond) fail(msg); };

// ------------------------------------------------------------- the watch ----

console.log(`${RABBIT_WATCH.name}`);
for (const level of RABBIT_WATCH.levels) {
  const seq = comboSequence({ ...level, pool: RABBIT_WATCH.pool });
  const rate = (level.length - 1) / (level.windowMs / 1000);
  const perPress = level.windowMs / (level.length - 1);
  console.log(`  ${level.name.padEnd(24)} ${String(level.length).padStart(2)} presses in ${String(level.windowMs).padStart(4)} ms` +
              ` = ${rate.toFixed(1)}/s   ${seq.join(' ')}`);

  ok(seq.length === level.length, `${level.id}: sequence length`);
  ok(comboSequence({ ...level, pool: RABBIT_WATCH.pool }).join() === seq.join(), `${level.id}: sequence is deterministic`);
  if (level.hand) ok(rate <= HAND_RATE, `${level.id}: marked hand but needs ${rate.toFixed(1)}/s > ${HAND_RATE}/s`);
  else ok(rate > HAND_RATE, `${level.id}: marked badge-only but ${rate.toFixed(1)}/s is within a hand's ${HAND_RATE}/s`);
  ok(perPress >= MIN_PRESS_MS, `${level.id}: ${perPress.toFixed(0)} ms per press is under the ${MIN_PRESS_MS} ms the host can sample`);

  // a perfect replay, evenly spaced across the window, wins
  const full = { ...level, pool: RABBIT_WATCH.pool };
  let c = new Combo(full, seq);
  let r = null;
  seq.forEach((b, i) => { r = c.press(b, 1000 + i * perPress * 0.98); });
  ok(r?.win === true, `${level.id}: an even replay inside the window should win, got ${r?.reason}`);

  // the same replay 10 % too slow loses on the last press
  c = new Combo(full, seq);
  seq.forEach((b, i) => { r = c.press(b, 1000 + i * perPress * 1.1); });
  ok(r?.win === false && /too slow/.test(r.reason), `${level.id}: a slow replay should lose as too slow`);

  // a wrong button loses immediately, with the step named
  c = new Combo(full, seq);
  const wrong = RABBIT_WATCH.pool.find(b => b !== seq[1]);
  c.press(seq[0], 1000);
  r = c.press(wrong, 1010);
  ok(r?.win === false && /step 2/.test(r.reason), `${level.id}: a wrong second press should name step 2`);

  // START resets an open attempt, as the badge's fire tap does
  c = new Combo(full, seq);
  c.press(seq[0], 1000);
  c.press('START', 1005);
  ok(c.at === 0 && c.open, `${level.id}: START resets`);
}

// ------------------------------------------------------- the looking glass ----

console.log(`\n${LOOKING_GLASS.name}`);
for (const level of LOOKING_GLASS.levels) {
  let built;
  try { built = buildLevel(level); }
  catch (e) { fail(`${level.id}: ${e.message}`); continue; }

  const ideal = idealOffsetMs(built);
  const width = built.lineMs * 1.5;
  console.log(`  ${level.name.padEnd(18)} ${built.honest.length} steps x ${level.lineMs} ms = ${built.totalMs} ms` +
              `; target is step ${built.targetStep} (line ${built.program.target + 1}) at ${built.targetStartMs}-${built.targetEndMs} ms` +
              `; ideal offset ${ideal} ms${level.hidden ? '; listing hidden' : ''}`);

  // the glitched trace reaches the good ending, the honest one does not
  const reaches = (steps, re) => steps.some(s => re.test(built.program.lines[s.line].text));
  ok(reaches(built.glitched, /alice_jump/), `${level.id}: skipping the target must reach alice_jump`);
  ok(!reaches(built.honest, /alice_jump/), `${level.id}: the honest run must not reach alice_jump`);
  ok(reaches(built.honest, /alice_bounce/), `${level.id}: the honest run must bounce Alice`);

  // a pulse one and a half lines wide, starting at the ideal offset, skips the check
  let r = land(built, { startMs: ideal, endMs: ideal + width });
  ok(r.verdict === 'skip', `${level.id}: ideal pulse should skip, got ${r.verdict} on steps ${r.covered}`);

  // ... and still does under the host's sampling jitter, either way
  for (const j of [-HOST_SAMPLE_MS / 2, HOST_SAMPLE_MS / 2]) {
    r = land(built, { startMs: ideal + j, endMs: ideal + width + j });
    ok(r.verdict === 'skip', `${level.id}: ideal pulse shifted ${j} ms should still skip, got ${r.verdict}`);
  }

  // a hand's jitter: the sleepy guard forgives it, the others do not
  const handHits = [];
  for (let j = -HAND_JITTER_MS; j <= HAND_JITTER_MS; j += 4) {
    handHits.push(land(built, { startMs: ideal + j, endMs: ideal + width + j }).verdict === 'skip');
  }
  const handRate = handHits.filter(Boolean).length / handHits.length;
  const handLevel = level.lineMs >= 2 * HAND_JITTER_MS;
  console.log(`      by hand (+/-${HAND_JITTER_MS} ms): ${(handRate * 100).toFixed(0)} % of attempts skip`);
  if (handLevel) ok(handRate === 1, `${level.id}: a hand should always land this one`);
  else ok(handRate < 0.6, `${level.id}: a hand lands this ${(handRate * 100).toFixed(0)} % of the time, meant to be badge-only`);

  // the neighbours of the target are harmless, so a 2-line pulse never crashes on it
  const kinds = [-1, 1].map(d => built.program.lines[built.honest[built.targetStep + d]?.line]?.kind);
  ok(kinds.every(k => k && k !== 'crash'), `${level.id}: the target's neighbours must be harmless, got ${kinds}`);

  // the crash lines crash, a wide pulse browns out, a late pulse misses
  const crashStep = built.honest.findIndex(s => built.program.lines[s.line].kind === 'crash');
  ok(crashStep >= 0, `${level.id}: needs at least one crash line`);
  r = land(built, { startMs: built.honest[crashStep].tick * level.lineMs + 1, endMs: built.honest[crashStep].tick * level.lineMs + 2 });
  ok(r.verdict === 'crash', `${level.id}: a pulse on a crash line should crash, got ${r.verdict}`);
  r = land(built, { startMs: 0, endMs: level.lineMs * (level.pulseMaxLines + 2) });
  ok(r.verdict === 'brownout', `${level.id}: a ${level.pulseMaxLines + 2}-line pulse should brown out, got ${r.verdict}`);
  r = land(built, { startMs: built.totalMs + 10, endMs: built.totalMs + 20 });
  ok(r.verdict === 'miss' && r.deltaLines === null, `${level.id}: a pulse after the end should miss, got ${r.verdict}`);
  r = land(built, { startMs: 0, endMs: level.lineMs / 2 });
  ok(r.verdict === 'nop' && r.deltaLines === -built.targetStep, `${level.id}: a pulse on step 0 should be a nop ${built.targetStep} lines early, got ${r.verdict} ${r.deltaLines}`);

  // the run driver: START, then a pulse at the ideal offset, ends in a skip
  const run = new Run(built);
  run.edge({ button: 'START', down: true, t: 5000 });
  run.edge({ button: 'START', down: false, t: 5030 });
  run.edge({ button: 'X', down: true, t: 5000 + ideal });
  r = run.edge({ button: 'X', down: false, t: 5000 + ideal + width });
  ok(r?.verdict === 'skip', `${level.id}: Run should land a skip, got ${r?.verdict}`);
  const run2 = new Run(built);
  run2.edge({ button: 'START', down: true, t: 5000 });
  ok(run2.tick(5000 + built.totalMs + 60)?.verdict === 'denied', `${level.id}: a run with no pulse is denied`);
}

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nrange: every level is what it says it is');
