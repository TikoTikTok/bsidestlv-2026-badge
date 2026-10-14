// Alice in AI Land - the Caterpillar's Lock: rules for the timing side-channel range.
//
// Pure logic, no DOM. glitch.js drives it from the page with real button
// edges; software/tools/verify-range.mjs drives it from the CLI to prove the
// leak is what the levels claim and that the hand level fits a hand.
//
// The door holds a secret password of `length` symbols from `pool`. It
// compares a guess one symbol per tick and stops at the first mismatch, so
// the time to its answer is
//
//     (1 + comparisons) ticks, plus the level's jitter
//
// where `comparisons` is how many symbols it looked at: the run of matching
// ones along its comparison order, plus the one that failed (or every one,
// when the guess is right). That number is the side channel. The order is
// first-to-last on most levels; a level may use a secret fixed order instead,
// which hides *which* symbol was wrong but not *how many* were right - a
// secret order is not constant time. See stages/caterpillar-lock.js.

// ------------------------------------------------------------------ secret ----

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** A small seeded PRNG, so a secret and its jitter are reproducible when a test wants them to be. */
export function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** The level's password: fixed per level and seed, repeats allowed, as a password would. */
export function secretFor(level, seed = 0) {
  const next = lcg(hashString(level.id) ^ Math.imul(seed + 1, 0x9E3779B1));
  return Array.from({ length: level.length }, () => level.pool[Math.floor(next() * level.pool.length)]);
}

/**
 * The order the door compares in: position indices, first to last. The
 * identity for 'prefix'; a fixed shuffle per level and seed for 'secret',
 * never the identity (so the level differs from the one before it).
 */
export function orderFor(level, seed = 0) {
  const n = level.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  if (level.order !== 'secret') return idx;
  const next = lcg(hashString(level.id + '/order') ^ Math.imul(seed + 1, 0x85EBCA6B));
  do {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  } while (idx.every((p, i) => p === i));
  return idx;
}

// ------------------------------------------------------------------- the leak ----

/** How many symbols the door compares before it stops, walking `perm` (position indices). */
export function comparisons(secret, guess, perm) {
  let done = 0;
  for (const i of perm ?? secret.map((_, k) => k)) { done++; if (guess[i] !== secret[i]) break; }
  return done;
}

/** Matches by position, whatever the order. */
export const matches = (secret, guess) => secret.reduce((m, s, i) => m + (guess[i] === s ? 1 : 0), 0);

/** The run of correct symbols along the door's order - what the clock reports, minus one. */
export function runAlong(secret, guess, perm) {
  let k = 0;
  for (const i of perm) { if (guess[i] !== secret[i]) break; k++; }
  return k;
}

/**
 * Jitter in ticks: roughly Gaussian with the level's sigma, from three
 * uniforms. Zero when the level has none.
 */
export function jitterTicks(level, rng = Math.random) {
  if (!level.jitterTicks) return 0;
  return level.jitterTicks * 2 * (rng() + rng() + rng() - 1.5);
}

// ------------------------------------------------------------------- the door ----

/**
 * One door, driven by button edges and time.
 *
 *   START down            opens a fresh guess (and forgets a half-typed one,
 *                         or an answer still owed)
 *   a pool button down    appends a symbol while a guess is open; the guess
 *                         is submitted the instant it is `length` long
 *   tick(t)               once the answer time has passed, returns the answer
 *
 * `edge` returns { kind: 'open' } or { kind: 'submitted', guess, at, answerAt }
 * when something happened, else null. `tick` returns
 * { kind: 'answer', guess, win, ms, ticks, comparisons, run, matches } once
 * per submission; `ms` is what the player sees, the rest is the truth the
 * page keeps to itself.
 */
export class Lock {
  constructor(level, { secret, perm, rng = Math.random }) {
    this.level = level;
    this.secret = secret;
    this.perm = perm ?? secret.map((_, i) => i);
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.guess = null;        // null: no guess open; else the symbols so far
    this.submittedAt = null;
    this.answerAt = null;
    this.pending = null;      // the answer being waited for
    this.opened = false;      // the door is open: the password was right
  }

  get entering() { return this.guess !== null && this.pending === null; }
  get waiting() { return this.pending !== null; }

  edge({ button, down, t }) {
    if (!down) return null;
    if (button === 'START') {
      this.guess = [];
      this.pending = null;
      this.opened = false;
      return { kind: 'open', at: t };
    }
    if (!this.entering || !this.level.pool.includes(button)) return null;
    this.guess.push(button);
    if (this.guess.length < this.level.length) return null;
    return this.submit(t);
  }

  submit(t) {
    const guess = this.guess.slice();
    const done = comparisons(this.secret, guess, this.perm);
    const ticks = 1 + done;
    const ms = Math.max(0.5, ticks + jitterTicks(this.level, this.rng)) * this.level.tickMs;
    this.submittedAt = t;
    this.answerAt = t + ms;
    this.pending = {
      kind: 'answer', guess, ms, ticks, comparisons: done,
      win: done === this.level.length && guess.every((g, i) => g === this.secret[i]),
      run: runAlong(this.secret, guess, this.perm), matches: matches(this.secret, guess),
    };
    return { kind: 'submitted', guess, at: t, answerAt: this.answerAt };
  }

  /** Call as time passes. */
  tick(t) {
    if (!this.pending || t < this.answerAt) return null;
    const a = this.pending;
    this.pending = null;
    this.guess = null;
    this.opened = a.win;
    return a;
  }
}

/** A door for a level: its secret, its order, its noise. `seed` picks another password. */
export const buildLock = (level, seed = 0, { rng = Math.random } = {}) =>
  new Lock(level, { secret: secretFor(level, seed), perm: orderFor(level, seed), rng });

// ----------------------------------------------------------------- statistics ----

/** What the page prints per distinct guess: count, median, mean, min, max of the answer times. */
export function summarize(samples) {
  const s = samples.slice().sort((a, b) => a - b);
  const n = s.length;
  if (!n) return { n: 0, median: null, mean: null, min: null, max: null };
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { n, median, mean: s.reduce((a, b) => a + b, 0) / n, min: s[0], max: s[n - 1] };
}

/** The key the log groups samples under. */
export const guessKey = (guess) => guess.join(' ');

// ---------------------------------------------------------------- an attacker ----

/**
 * A reference attacker for the verifier: plays a level the way the leak
 * invites and reports what it cost. It changes one symbol at a time and
 * keeps a change that makes the door think one tick longer; against the
 * first-to-last order that is the classic prefix attack, against a secret
 * order the same move also discovers which position the door checks next.
 * Each guess is measured `repeats` times and the median taken, as a player
 * facing jitter would. Returns { solved, guesses, submissions, presses };
 * presses is what a hand would type, START plus `length` symbols per
 * submission.
 */
export function attack(level, lock, { repeats = 1, maxGuesses = 2000 } = {}) {
  let guesses = 0, submissions = 0;
  const noisy = level.jitterTicks > 0;
  // one guess, `repeats` times, the median of the rounded tick counts
  const measure = (guess, times = repeats) => {
    const seen = [];
    for (let r = 0; r < times; r++) {
      let t = 0;
      lock.edge({ button: 'START', down: true, t });
      for (const g of guess) lock.edge({ button: g, down: true, t: ++t });
      const a = lock.tick(1e9);
      submissions++;
      seen.push(Math.round(a.ms / level.tickMs));
      if (a.win) return { win: true, ticks: a.ticks };
    }
    guesses++;
    return { win: false, ticks: summarize(seen).median };
  };
  // a rise is worth keeping only if it holds when measured again: with
  // jitter a single median lies now and then, and a kept lie never heals
  const confirmed = (guess, ticks) => {
    if (!noisy) return { ok: true, ticks };
    const again = measure(guess);
    if (again.win) return { ok: true, win: true, ticks: again.ticks };
    return { ok: again.ticks === ticks, ticks: Math.min(ticks, again.ticks) };
  };
  const done = () => ({ solved: lock.opened, guesses, submissions, presses: submissions * (level.length + 1) });

  const guess = Array(level.length).fill(level.pool[0]);
  const fixed = new Set();                       // positions whose symbol made the clock move: keep them
  let base = measure(guess);
  if (base.win) return done();
  let stalls = 0;
  while (guesses < maxGuesses) {
    let moved = false;
    for (let pos = 0; pos < level.length && !moved; pos++) {
      if (fixed.has(pos)) continue;
      const was = guess[pos];
      for (const sym of level.pool) {
        if (sym === was) continue;
        guess[pos] = sym;
        const m = measure(guess);
        if (m.win) return done();
        if (m.ticks > base.ticks) {
          const c = confirmed(guess, m.ticks);
          if (c.win) return done();
          if (c.ok) { base = { ticks: c.ticks }; fixed.add(pos); moved = true; break; }
        }
      }
      if (!moved) guess[pos] = was;
    }
    if (moved) { stalls = 0; continue; }
    // every unfixed position was tried without a rise: either the door was
    // already agreeing with one of them (its run continues past it), or a
    // noisy base misled the scan. Re-measure the base; if a change at some
    // position *lowers* the clock, that position is right where it stands.
    const again = measure(guess, noisy ? repeats * 2 : repeats);
    if (again.win) return done();
    base = again;
    let settled = false;
    for (let pos = 0; pos < level.length && !settled; pos++) {
      if (fixed.has(pos)) continue;
      const was = guess[pos];
      guess[pos] = level.pool.find(s => s !== was);
      const m = measure(guess);
      if (m.win) return done();
      guess[pos] = was;
      if (m.ticks < base.ticks) {
        const c = confirmed(guess, base.ticks);   // the base holds?
        if (c.win) return done();
        if (c.ok) { fixed.add(pos); settled = true; }
      }
    }
    if (!settled && ++stalls > 3) return done();   // nothing moves the clock: give up
  }
  return done();
}
