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
import { CATERPILLAR_LOCK } from '../../stages/caterpillar-lock.js';
import { DORMOUSE_WATCHDOG } from '../../stages/dormouse-watchdog.js';
import { HUMPTY_WALL } from '../../stages/humpty-wall.js';
import { comboSequence, Combo, buildLevel, land, idealOffsetMs, Run } from '../../src/range.js';
import { secretFor, orderFor, comparisons, runAlong, buildLock, Lock, attack, lcg, summarize } from '../../src/lock.js';
import { Watchdog, windowOf, idealGapMs, replay } from '../../src/watchdog.js';
import { Wall, judge, frameOf, canaryFor, withDefaults, attack as smash } from '../../src/wall.js';
import { TUTORIAL, Tutor } from '../../src/tutor.js';

const HAND_RATE = 6;          // presses / s
const HAND_JITTER_MS = 40;    // +/- on a timed press
const HAND_PRESSES = 150;     // about what a player types into one puzzle before it stops being fun
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

// ------------------------------------------------------- the caterpillar's lock ----
// The leak is exact, the door is deterministic given its seed and noise, and
// a reference attacker that reads the clock the way the level invites has to
// clear every level - cheaply by hand on the hand level, only with the
// badge's repeat on the others.

console.log(`\n${CATERPILLAR_LOCK.name}`);
const MEASURE_SEEDS = 40;
for (const level of CATERPILLAR_LOCK.levels) {
  const n = level.length, pool = level.pool;
  const secret = secretFor(level), perm = orderFor(level);
  const space = Math.pow(pool.length, n);
  console.log(`  ${level.name.padEnd(18)} ${n} of ${pool.length} (${space.toLocaleString('en')} passwords) x ${level.tickMs} ms` +
              `, jitter ${level.jitterTicks} tick, order ${level.order}${level.order === 'secret' ? ' ' + perm.join('') : ''}` +
              `; password ${secret.join(' ')}`);

  ok(secret.length === n && secret.every(s => pool.includes(s)), `${level.id}: the password is ${n} symbols from the pool`);
  ok(secretFor(level).join() === secret.join() && secretFor(level, 1).join() !== secret.join(), `${level.id}: the password is fixed per seed`);
  ok(perm.length === n && [...perm].sort((a, b) => a - b).every((v, i) => v === i), `${level.id}: the order is a permutation`);
  if (level.order === 'prefix') ok(perm.every((v, i) => v === i), `${level.id}: prefix order is first to last`);
  else ok(!perm.every((v, i) => v === i) && orderFor(level).join() === perm.join(), `${level.id}: a secret order is a fixed shuffle, never the identity`);

  // the leak: k symbols right along the order costs k + 1 comparisons (every one when all are right)
  const off = (s) => pool.find(x => x !== s);
  for (let k = 0; k <= n; k++) {
    const guess = secret.slice();
    for (let j = k; j < n; j++) guess[perm[j]] = off(secret[perm[j]]);
    const want = k === n ? n : k + 1;
    ok(comparisons(secret, guess, perm) === want && runAlong(secret, guess, perm) === k,
       `${level.id}: ${k} right along the order should cost ${want} comparisons, got ${comparisons(secret, guess, perm)}`);
  }

  // the door: START opens, symbols fill, the last one submits, the answer is due (1 + comparisons) ticks later
  {
    const lock = new Lock(level, { secret, perm, rng: () => 0.5 });   // 0.5 x3 - 1.5 = 0: no jitter from the rng
    ok(lock.edge({ button: pool[0], down: true, t: 0 }) === null && !lock.entering, `${level.id}: a symbol before START is ignored`);
    ok(lock.edge({ button: 'START', down: true, t: 10 })?.kind === 'open' && lock.entering, `${level.id}: START opens a guess`);
    ok(lock.edge({ button: 'START', down: false, t: 20 }) === null, `${level.id}: releases do nothing`);
    ok(lock.edge({ button: 'SELECT', down: true, t: 25 }) === null && lock.guess.length === 0, `${level.id}: a button outside the pool is ignored`);
    let r = null;
    secret.forEach((sym, i) => { r = lock.edge({ button: sym, down: true, t: 100 + i * 10 }); });
    const lastAt = 100 + (n - 1) * 10;
    ok(r?.kind === 'submitted' && lock.waiting, `${level.id}: the ${n}th symbol submits`);
    ok(Math.abs(r.answerAt - (lastAt + (n + 1) * level.tickMs)) < 1e-6, `${level.id}: the right password answers after ${n + 1} ticks, got ${r.answerAt - lastAt} ms`);
    ok(lock.tick(r.answerAt - 1) === null && lock.waiting, `${level.id}: no answer before its time`);
    const a = lock.tick(r.answerAt);
    ok(a?.kind === 'answer' && a.win && a.ticks === n + 1 && lock.opened, `${level.id}: the door opens on the right password`);
    // a wrong last symbol: n comparisons, no
    const lock2 = new Lock(level, { secret, perm, rng: () => 0.5 });
    lock2.edge({ button: 'START', down: true, t: 0 });
    const wrong = secret.slice(); wrong[perm[n - 1]] = off(secret[perm[n - 1]]);
    wrong.forEach((sym, i) => lock2.edge({ button: sym, down: true, t: 1 + i }));
    const a2 = lock2.tick(1e9);
    ok(a2 && !a2.win && a2.ticks === n + 1 && a2.comparisons === n && !lock2.opened, `${level.id}: wrong at the last position still costs every comparison`);
    // START mid-guess starts over
    const lock3 = new Lock(level, { secret, perm });
    lock3.edge({ button: 'START', down: true, t: 0 });
    lock3.edge({ button: pool[0], down: true, t: 1 });
    lock3.edge({ button: 'START', down: true, t: 2 });
    ok(lock3.entering && lock3.guess.length === 0, `${level.id}: START mid-guess starts over`);
  }

  // jitter: none on a hand level; on the others a single reading is often off by a tick, the median of five rarely
  if (!level.jitterTicks) {
    const lock = buildLock(level, 0, { rng: Math.random });
    lock.edge({ button: 'START', down: true, t: 0 });
    secret.forEach((sym, i) => lock.edge({ button: sym, down: true, t: 1 + i }));
    ok(Math.abs(lock.tick(1e9).ms - (n + 1) * level.tickMs) < 1e-6, `${level.id}: no jitter means an exact clock`);
  } else {
    const rng = lcg(7);
    let one = 0, five = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      const lock = new Lock(level, { secret, perm, rng });
      const guess = secret.slice(); guess[perm[2]] = off(secret[perm[2]]);
      const seen = [];
      for (let r = 0; r < 5; r++) {
        lock.edge({ button: 'START', down: true, t: 0 });
        guess.forEach((sym, k) => lock.edge({ button: sym, down: true, t: 1 + k }));
        seen.push(Math.round(lock.tick(1e9).ms / level.tickMs));
      }
      one += seen[0] === 4; five += summarize(seen).median === 4;
    }
    console.log(`      jitter: one reading right ${(one / N * 100).toFixed(0)} %, the median of five ${(five / N * 100).toFixed(0)} %`);
    ok(one / N < 0.85, `${level.id}: with jitter a single reading should mislead now and then (${(one / N * 100).toFixed(0)} % right)`);
    ok(five / N > 0.88, `${level.id}: the median of five should be right nearly always (${(five / N * 100).toFixed(0)} %)`);
  }

  // the attacker: the hand level falls to a hand, the others need the badge's repeat and still fall
  const repeats = level.jitterTicks ? 7 : 1;
  let solved = 0, guesses = 0, submissions = 0, presses = 0;
  for (let seed = 0; seed < MEASURE_SEEDS; seed++) {
    const r = attack(level, buildLock(level, seed, { rng: lcg(900 + seed) }), { repeats });
    solved += r.solved; guesses += r.guesses; submissions += r.submissions; presses += r.presses;
  }
  const avg = (x) => (x / MEASURE_SEEDS).toFixed(0);
  console.log(`      attacker x${repeats}: solved ${solved}/${MEASURE_SEEDS}, ${avg(guesses)} distinct guesses (takes), ${avg(submissions)} submissions, ${avg(presses)} presses by hand`);
  if (level.hand) {
    ok(solved === MEASURE_SEEDS, `${level.id}: a hand level must always fall to the attacker, fell ${solved}/${MEASURE_SEEDS}`);
    ok(presses / MEASURE_SEEDS <= HAND_PRESSES, `${level.id}: marked hand but costs ${avg(presses)} presses > ${HAND_PRESSES}`);
  } else {
    ok(solved >= MEASURE_SEEDS * 0.9, `${level.id}: the badge attacker should clear it nearly always, cleared ${solved}/${MEASURE_SEEDS}`);
    ok(presses / MEASURE_SEEDS > HAND_PRESSES * 3, `${level.id}: marked badge-only but a hand types only ${avg(presses)} presses`);
    ok(guesses / MEASURE_SEEDS <= 80, `${level.id}: ${avg(guesses)} takes is more than a player records in a sitting`);
  }
}

// ------------------------------------------------------- the dormouse's watchdog ----
// A window watchdog. Two presses of a hand are each +/-40 ms off their
// schedule, so a gap between them is off by up to 80 ms: a hand level's
// window has to be wider than that, a badge level's narrower - and a replay
// with the host's +/-8 ms of sampling has to clear every level.

console.log(`\n${DORMOUSE_WATCHDOG.name}`);
for (const level of DORMOUSE_WATCHDOG.levels) {
  const w = windowOf(level);
  const ideal = idealGapMs(level);
  const rate = 1000 / ideal;
  console.log(`  ${level.name.padEnd(18)} ${String(level.kicks).padStart(2)} nudges, window ${level.openMs}-${level.timeoutMs} ms (${w.widthMs} wide)` +
              ` = ${rate.toFixed(1)}/s at the ideal gap of ${ideal} ms`);

  ok(level.openMs > 0 && level.timeoutMs > level.openMs, `${level.id}: the window must be a positive range`);
  ok(ideal >= MIN_PRESS_MS, `${level.id}: ${ideal} ms a nudge is under the ${MIN_PRESS_MS} ms the host can sample`);
  if (level.hand) {
    ok(w.widthMs >= 2 * HAND_JITTER_MS, `${level.id}: marked hand but the window is ${w.widthMs} ms, a hand needs ${2 * HAND_JITTER_MS}`);
    ok(rate <= HAND_RATE, `${level.id}: marked hand but needs ${rate.toFixed(1)}/s > ${HAND_RATE}/s`);
  } else {
    ok(w.widthMs < 2 * HAND_JITTER_MS || rate > HAND_RATE, `${level.id}: marked badge-only but a hand's ${HAND_RATE}/s and +/-${HAND_JITTER_MS} ms fit`);
  }

  // a perfect replay wins; one with the host's sampling jitter alternating either way still wins
  ok(replay(level).win, `${level.id}: a perfect replay should win`);
  const sampled = replay(level, { jitter: (i) => (i % 2 ? 1 : -1) * HOST_SAMPLE_MS / 2 });
  ok(sampled.win, `${level.id}: a replay under +/-${HOST_SAMPLE_MS / 2} ms of host sampling should still win, got ${sampled.verdict}`);
  ok(w.widthMs >= 2 * HOST_SAMPLE_MS, `${level.id}: the window (${w.widthMs} ms) is narrower than two host samples`);

  // a hand: random +/-40 ms per press. The hand level nearly always survives, the others nearly never
  const rng = lcg(31 + level.kicks);
  const N = 400;
  let wins = 0;
  for (let i = 0; i < N; i++) if (replay(level, { jitter: () => (rng() * 2 - 1) * HAND_JITTER_MS }).win) wins++;
  const handRate = wins / N;
  console.log(`      by hand (+/-${HAND_JITTER_MS} ms a press): ${(handRate * 100).toFixed(0)} % of attempts keep it asleep`);
  if (level.hand) ok(handRate > 0.9, `${level.id}: a hand should nearly always manage this one, managed ${(handRate * 100).toFixed(0)} %`);
  else ok(handRate < 0.1, `${level.id}: a hand manages this ${(handRate * 100).toFixed(0)} % of the time, meant to be badge-only`);

  // the rules: too soon stirs, too late bites, START re-arms, the right count wins
  const dog = new Watchdog(level);
  ok(dog.edge({ button: level.button, down: true, t: 0 }) === null && !dog.armed, `${level.id}: a nudge before START does nothing`);
  dog.edge({ button: 'START', down: true, t: 100 });
  ok(dog.armed && dog.kicks === 0, `${level.id}: START arms`);
  ok(dog.edge({ button: 'B', down: true, t: 100 + ideal }) === null && dog.kicks === 0, `${level.id}: another button is not a nudge`);
  let r = dog.edge({ button: level.button, down: true, t: 100 + level.openMs - 1 });
  ok(r?.verdict === 'early' && !r.win && Math.abs(r.gap - (level.openMs - 1)) < 1e-9, `${level.id}: a nudge before the window opens stirs it`);
  dog.edge({ button: 'START', down: true, t: 1000 });
  ok(dog.tick(1000 + level.timeoutMs) === null, `${level.id}: no bite at the timeout itself`);
  r = dog.tick(1000 + level.timeoutMs + 1);
  ok(r?.verdict === 'late' && !r.win, `${level.id}: a missed window bites`);
  dog.edge({ button: 'START', down: true, t: 2000 });
  r = dog.edge({ button: level.button, down: true, t: 2000 + level.timeoutMs + 5 });
  ok(r?.verdict === 'late', `${level.id}: a nudge after the timeout is too late`);
  const win = replay(level, { offset: level.openMs, gap: level.timeoutMs });
  ok(win.win && win.kicks === level.kicks && win.gaps.length === level.kicks, `${level.id}: nudges on both edges of the window are accepted and ${level.kicks} of them win`);
}

// ----------------------------------------------------------- humpty dumpty's wall ----
// The overflow lands where the frame says, the leak is the answer changing
// exactly at the buffer's end (and the canary's), the reference attacker
// clears every level, and the per-symbol leash sorts hand from badge.

console.log(`\n${HUMPTY_WALL.name}`);
for (const raw of HUMPTY_WALL.levels) {
  const level = withDefaults(raw);
  const f = frameOf(level);
  const rate = 1000 / level.gapMs;
  console.log(`  ${level.name.padEnd(22)} name[${level.size}]${level.canary ? ` canary ${level.canarySymbol}` : ''} lr -> ${level.address.join(' ')}` +
              `, ${level.gapMs} ms a symbol = ${rate.toFixed(1)}/s${level.hidden ? '; size hidden' : ''}`);

  ok(level.address.length === 2 && level.address.every(a => level.pool.includes(a)), `${level.id}: the address is two symbols from the pool`);
  ok(level.listing.some(l => l.includes('open_wall') && l.includes('@')), `${level.id}: the listing must print open_wall's address`);
  ok(level.maxLength >= f.total + 2, `${level.id}: a name must be allowed to run past the frame`);
  if (level.hidden) ok(level.listing.some(l => /name\[\?\]/.test(l)), `${level.id}: a hidden level shows name[?]`);
  else ok(level.listing.some(l => l.includes(`name[${level.size}]`)), `${level.id}: the listing shows the buffer's size`);
  if (level.canary) {
    ok(level.pool.includes(level.canarySymbol) && level.canarySymbol !== level.pool[0], `${level.id}: the canary is a pool symbol, never the first (a lazy name's filler)`);
    ok(canaryFor(level, 1) !== undefined && canaryFor(level).length > 0, `${level.id}: the canary is fixed per seed`);
  }
  ok(level.gapMs >= MIN_PRESS_MS, `${level.id}: ${level.gapMs} ms a symbol is under what the host can sample`);
  if (level.hand) ok(rate <= HAND_RATE, `${level.id}: marked hand but needs ${rate.toFixed(1)}/s > ${HAND_RATE}/s`);
  else ok(rate > HAND_RATE, `${level.id}: marked badge-only but ${rate.toFixed(1)}/s is within a hand's ${HAND_RATE}/s`);

  // the frame: polite up to the size, then the canary or the return
  const filler = level.pool[0];
  for (let n = 0; n <= f.size; n++) ok(judge(level, Array(n).fill(filler)).verdict === 'polite', `${level.id}: ${n} symbols should be polite`);
  const one = judge(level, Array(f.size + 1).fill(filler));
  ok(one.verdict === (level.canary ? 'canary' : 'fall') && one.overflow === 1, `${level.id}: one past the buffer should ${level.canary ? 'trip the canary' : 'fall'}, got ${one.verdict}`);
  const name = Array(f.size).fill(filler);
  const guard = level.canary ? [level.canarySymbol] : [];
  if (level.canary) {
    ok(judge(level, [...name, level.canarySymbol]).verdict === 'polite', `${level.id}: the right canary alone is polite again`);
    const wrong = level.pool.find(s => s !== level.canarySymbol);
    ok(judge(level, [...name, wrong, ...level.address]).verdict === 'canary', `${level.id}: a wrong canary masks a right address`);
  }
  ok(judge(level, [...name, ...guard, level.address[0]]).verdict === 'fall', `${level.id}: half an address is a fall`);
  const open = judge(level, [...name, ...guard, ...level.address]);
  ok(open.verdict === 'open' && open.win && open.lr.join() === level.address.join(), `${level.id}: the address opens the wall`);
  ok(judge(level, [...name, ...guard, ...level.address, filler, filler]).win, `${level.id}: symbols past the frame do not spoil a good return`);
  const other = [level.address[1], level.address[0]];
  ok(judge(level, [...name, ...guard, ...other]).verdict === 'fall', `${level.id}: the address backwards is a fall`);

  // the read: START prompts, the leash closes it, a stray before START waits for one
  const wall = new Wall(level);
  ok(wall.edge({ button: filler, down: true, t: 0 }) === null && !wall.listening, `${level.id}: a symbol before START is ignored`);
  ok(wall.edge({ button: 'START', down: true, t: 10 })?.kind === 'open' && wall.listening, `${level.id}: START opens the read`);
  ok(wall.closesAt === 10 + level.firstMs, `${level.id}: the first symbol has ${level.firstMs} ms`);
  ok(wall.tick(10 + level.firstMs - 1) === null, `${level.id}: no answer while the leash runs`);
  let t = 20;
  for (const sym of [...name, ...guard, ...level.address]) { wall.edge({ button: sym, down: true, t }); t += level.gapMs - 1; }
  ok(wall.listening && wall.closesAt === t - level.gapMs + 1 + level.gapMs, `${level.id}: every symbol inside the gap extends the leash`);
  const a = wall.tick(t + level.gapMs);
  ok(a?.kind === 'answer' && a.win, `${level.id}: the leash running out answers, and the address opens the wall`);
  const late = new Wall(level);
  late.edge({ button: 'START', down: true, t: 0 });
  late.edge({ button: filler, down: true, t: 10 });
  const closed = late.edge({ button: filler, down: true, t: 10 + level.gapMs + 1 });
  ok(closed?.kind === 'answer' && closed.length === 1, `${level.id}: a symbol after the leash is a stray; the read had closed with 1 symbol`);
  const empty = new Wall(level);
  empty.edge({ button: 'START', down: true, t: 0 });
  ok(empty.tick(level.firstMs + 1)?.verdict === 'polite', `${level.id}: nothing typed is a polite nothing`);

  // the attacker: size, canary, address
  let solved = 0, submissions = 0, presses = 0;
  for (let seed = 0; seed < 8; seed++) {
    const r = smash(raw, seed);
    solved += r.solved; submissions += r.submissions; presses += r.presses;
    ok(r.size === level.size, `${level.id}: the attacker should find size ${level.size}, found ${r.size}`);
    if (level.canary) ok(r.canary === canaryFor(raw, seed), `${level.id}: the attacker should find the canary for seed ${seed}`);
  }
  console.log(`      attacker: solved ${solved}/8, ${(submissions / 8).toFixed(0)} names (takes), ${(presses / 8).toFixed(0)} presses by hand`);
  ok(solved === 8, `${level.id}: the attacker must always open the wall`);
  if (level.hand) ok(presses / 8 <= HAND_PRESSES, `${level.id}: marked hand but costs ${(presses / 8).toFixed(0)} presses > ${HAND_PRESSES}`);
  ok(submissions / 8 <= 30, `${level.id}: ${(submissions / 8).toFixed(0)} takes is more than a player records in a sitting`);
}

// ------------------------------------------------------------------ the tutorial ----
// Every step names a range and level that exist, and the engine walks them.

console.log('\nthe tutorial');
{
  const byRange = { watch: RABBIT_WATCH, glass: LOOKING_GLASS, lock: CATERPILLAR_LOCK, dog: DORMOUSE_WATCHDOG, wall: HUMPTY_WALL };
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

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nrange: every level is what it says it is');
