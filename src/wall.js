// Alice in AI Land - Humpty Dumpty's Wall: rules for the stack-smashing range.
//
// Pure logic, no DOM. glitch.js drives it from the page with real button
// edges; software/tools/verify-range.mjs drives it from the CLI to prove the
// overflow lands where the levels say, the hand level fits a hand, and the
// badge levels fall to a replayed take.
//
// Humpty asks Alice her name and reads it into a buffer on his stack with
// the oldest bug in C: no bound. The frame behind the buffer is
//
//     name[size]  [canary]  lr[2]
//
// one symbol (a button) per slot. A name of `size` symbols or fewer is
// politely received. One symbol more starts writing past the buffer: onto
// the canary when the level has one (a wrong symbol there and Humpty
// notices - "stack smashing detected" - and the return never happens), then
// onto the saved return address `lr`, two symbols. When Humpty returns he
// goes wherever lr points: anywhere but the one address that opens the wall
// is a great fall. The address of `open_wall` is printed in his listing, as
// it would be in a firmware image; the *size* of the buffer may not be, and
// the canary never is. Both leak the same way: the answer changes exactly
// when the overflow reaches them.
//
// Reading the name is timed, as a UART read with a per-character timeout
// is: START is the prompt, every symbol must arrive within `gapMs` of the
// one before (the first within `firstMs` of the prompt), and the read ends
// when nothing comes. The later levels make that gap shorter than a hand
// can type, so the name is a take on the badge.

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** The canary symbol of a level that has one: fixed per level and seed, never the filler a lazy name is made of. */
export function canaryFor(level, seed = 0) {
  if (!level.canary) return null;
  const h = hashString(level.id + '/canary') ^ Math.imul(seed + 1, 0x9E3779B1);
  return level.pool[1 + (h >>> 0) % (level.pool.length - 1)];
}

/** A level with its defaults filled in: the first symbol's leash, the cap on a name, the canary for this seed. */
export const withDefaults = (level, seed = 0) => ({ firstMs: 1500, maxLength: 16, canarySymbol: canaryFor(level, seed), ...level });

/** The frame layout of a level: slot indices, and the total. */
export function frameOf(level) {
  const canaryAt = level.canary ? level.size : null;   // `canary` says there is one; `canarySymbol` is which
  const lrAt = level.size + (level.canary ? 1 : 0);
  return { size: level.size, canaryAt, lrAt, total: lrAt + 2 };
}

/**
 * What Humpty does with a name of `typed` symbols. The verdicts:
 *
 *   polite   the name fit (or the canary survived and lr was untouched)
 *   canary   the overflow reached the canary and changed it: Humpty notices
 *   fall     Humpty returned to a bad address and had a great fall
 *   open     lr was open_wall's address: the wall opens, Alice walks through
 *
 * `overflow` is how many symbols went past the buffer, the number the
 * player is really measuring.
 */
export function judge(level, typed) {
  const f = frameOf(level);
  const n = typed.length;
  const overflow = Math.max(0, n - f.size);
  const base = { typed: typed.slice(), length: n, overflow };
  if (n <= f.size) return { ...base, verdict: 'polite', win: false };
  if (f.canaryAt !== null && typed[f.canaryAt] !== level.canarySymbol) return { ...base, verdict: 'canary', win: false };
  if (n <= f.lrAt) return { ...base, verdict: 'polite', win: false };       // the canary held, lr untouched
  const lr = [typed[f.lrAt], typed[f.lrAt + 1]];
  if (lr[0] === level.address[0] && lr[1] === level.address[1]) return { ...base, verdict: 'open', win: true, lr };
  return { ...base, verdict: 'fall', win: false, lr };
}

/**
 * The read. START prompts; pool buttons append; `tick(t)` closes the read
 * once the gap since the last symbol (or since START) has passed, and
 * returns the judgement. `edge` returns { kind: 'open' } on START, else null.
 */
export class Wall {
  constructor(level, seed = 0) {
    this.level = withDefaults(level, seed);
    this.reset();
  }

  reset() {
    this.typed = null;        // null: no read open
    this.openedAt = null;
    this.lastAt = null;
    this.result = null;
  }

  get listening() { return this.typed !== null; }

  /** When the open read will close if nothing more arrives. */
  get closesAt() {
    if (!this.listening) return null;
    return this.typed.length ? this.lastAt + this.level.gapMs : this.openedAt + this.level.firstMs;
  }

  edge({ button, down, t }) {
    if (!down) return null;
    if (button === 'START') {
      this.reset();
      this.typed = [];
      this.openedAt = this.lastAt = t;
      return { kind: 'open', at: t };
    }
    if (!this.listening || !this.level.pool.includes(button)) return null;
    if (t > this.closesAt) return this.finish(this.closesAt);   // the read had already closed: this press is a stray
    this.typed.push(button);
    this.lastAt = t;
    if (this.typed.length >= this.level.maxLength) return this.finish(t);
    return null;
  }

  /** Call as time passes: a read with nothing more coming closes. */
  tick(t) {
    if (!this.listening) return null;
    if (t < this.closesAt) return null;
    return this.finish(t);
  }

  finish(t) {
    const r = { ...judge(this.level, this.typed), at: t, kind: 'answer' };
    this.result = r;
    this.typed = null;
    return r;
  }
}

/**
 * A reference attacker for the verifier: finds the buffer by lengthening the
 * name until Humpty stops being polite, the canary (if the level has one) by
 * trying every symbol in its slot until he is polite again, then writes the
 * address. Returns { solved, submissions, presses }; presses counts what a
 * hand types, START plus the symbols, per submission.
 */
export function attack(level, seed = 0) {
  level = withDefaults(level, seed);
  let submissions = 0, presses = 0;
  const filler = level.pool[0];
  const submit = (typed) => {
    submissions++; presses += 1 + typed.length;
    return judge(level, typed);
  };
  // 1. the size: the first length that is not polite is size + 1
  let n = 1, r = submit([filler]);
  while (r.verdict === 'polite' && n < level.maxLength) r = submit(Array(++n).fill(filler));
  if (r.verdict === 'polite') return { solved: false, submissions, presses };
  const size = n - 1;
  // 2. the canary, if the overflow hit one
  const name = Array(size).fill(filler);
  let canary = null;
  if (r.verdict === 'canary') {
    for (const sym of level.pool) {
      const t = submit([...name, sym]);
      if (t.verdict === 'polite') { canary = sym; break; }
    }
    if (canary === null) return { solved: false, submissions, presses };
  }
  // 3. the address is in the listing
  const full = [...name, ...(canary === null ? [] : [canary]), ...level.address];
  const last = submit(full);
  return { solved: last.win, submissions, presses, size, canary };
}
