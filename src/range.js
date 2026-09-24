// Alice in AI Land - the glitch range: rules for both practice games.
//
// Pure logic, no DOM. glitch.js drives it from the page with real button
// edges; software/tools/verify-range.mjs drives it from the CLI to prove every
// level is winnable and that the impossible-by-hand levels really are.
//
// Two games, one input model. The page hands both a stream of button edges,
// { button, down, t } with t in milliseconds, and each keeps its own clock.
//
//   The Rabbit's Pocket Watch   a combo that must be entered inside a window.
//                               The window shrinks per level until only a
//                               replayed take is fast enough.
//
//   The Looking-Glass Glitch    the Queen's guard runs a routine, one line per
//                               tick. A pulse on X that lands on the right
//                               line skips the check and Alice reaches the
//                               treasure. Everything else is a measurement.

// ------------------------------------------------------------------ combos ----

/**
 * A fixed sequence per level, so a take recorded once keeps working - that is
 * what makes record-and-replay the answer. A small LCG seeded by the level id
 * keeps it deterministic without a dependency; `shuffle` reseeds.
 */
export function comboSequence(level, seed = 0) {
  let s = hashString(level.id) ^ (seed * 0x9E3779B1);
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s >>> 8; };
  const out = [];
  while (out.length < level.length) {
    const b = level.pool[next() % level.pool.length];
    if (out.length && out.at(-1) === b && level.pool.length > 1) continue;  // no doubles
    out.push(b);
  }
  return out;
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/**
 * The combo state machine. Feed it rising edges; it returns null while the
 * attempt is open and a result object when it closes.
 *
 * Only presses count, never releases, and only the buttons in the sequence's
 * pool - START is the badge's trigger tap and just resets the attempt, which
 * is exactly what a fire should do.
 */
export class Combo {
  constructor(level, sequence) {
    this.level = level;
    this.sequence = sequence;
    this.reset();
  }

  reset() {
    this.at = 0;          // next expected index
    this.t0 = null;       // first press
    this.presses = [];    // timestamps of accepted presses
    this.result = null;
  }

  get open() { return this.result === null; }

  /** @returns null while open, else { win, reason, ms, rate, presses } */
  press(button, t) {
    if (!this.open) return this.result;
    if (button === 'START') { this.reset(); return null; }
    if (!this.level.pool.includes(button)) return null;

    const expected = this.sequence[this.at];
    if (button !== expected) {
      return this.close(false, `wrong button at step ${this.at + 1}: expected ${expected}, got ${button}`, t);
    }
    if (this.t0 === null) this.t0 = t;
    this.presses.push(t);
    this.at++;

    const elapsed = t - this.t0;
    if (elapsed > this.level.windowMs)
      return this.close(false, `too slow: step ${this.at} landed ${Math.round(elapsed)} ms after the first, window is ${this.level.windowMs} ms`, t);
    if (this.at === this.sequence.length) return this.close(true, 'the watch chimes', t);
    return null;
  }

  close(win, reason, t) {
    const ms = this.t0 === null ? 0 : t - this.t0;
    const n = this.presses.length;
    this.result = {
      win, reason, ms,
      presses: n,
      rate: n > 1 && ms > 0 ? (n - 1) / (ms / 1000) : 0,   // presses per second, first to last
      gaps: this.presses.slice(1).map((p, i) => p - this.presses[i]),
    };
    return this.result;
  }
}

// ---------------------------------------------------------------- programs ----
//
// A level's listing is pseudo-assembly for the Queen's guard. The interpreter
// is deliberately tiny:
//
//   label:                  a line ending in ':' is a label, and takes a tick
//   ... goto label          jumps; in the honest run every goto is taken,
//                           because Alice never has the key
//   ! ... goto label        the target: the check a glitch has to skip. When
//                           the glitch lands here the goto is NOT taken and
//                           the routine falls through to the good ending
//   * ...                   a line that crashes the guard if a pulse hits it
//   delay(n)                holds the line for n ticks instead of one
//   ret                     ends the routine
//
// Everything else is a harmless line that executes for one tick.

export function parseProgram(listing) {
  const lines = listing.map((raw, index) => {
    let text = raw, kind = 'plain';
    if (text.startsWith('!')) { kind = 'target'; text = text.slice(1); }
    else if (text.startsWith('*')) { kind = 'crash'; text = text.slice(1); }
    text = text.replace(/^ /, '');
    const label = /^(\w+):\s*$/.exec(text)?.[1] ?? null;
    const gotoTo = /\bgoto\s+(\w+)\s*$/.exec(text)?.[1] ?? null;
    const ticks = +(/delay\((\d+)\)/.exec(text)?.[1] ?? 1);
    const ret = /^\s*ret\b/.test(text);
    return { index, text, kind, label, gotoTo, ticks, ret };
  });
  const labels = new Map(lines.filter(l => l.label).map(l => [l.label, l.index]));
  const targets = lines.filter(l => l.kind === 'target');
  if (targets.length !== 1) throw new Error(`listing needs exactly one target line, has ${targets.length}`);
  for (const l of lines) if (l.gotoTo && !labels.has(l.gotoTo)) throw new Error(`goto ${l.gotoTo}: no such label`);
  return { lines, labels, target: targets[0].index };
}

/**
 * Execute the routine and return its steps in order: { line, tick, ticks }.
 * `skipTarget` is what a successful glitch does - the target's branch is not
 * taken - and gives the trace the page animates the win with.
 */
export function trace(program, { skipTarget = false } = {}) {
  const steps = [];
  let pc = 0, tick = 0, guard = 0;
  while (pc < program.lines.length && guard++ < 10000) {
    const line = program.lines[pc];
    steps.push({ line: line.index, tick, ticks: line.ticks });
    tick += line.ticks;
    if (line.ret) break;
    if (line.gotoTo && !(skipTarget && line.kind === 'target')) pc = program.labels.get(line.gotoTo);
    else pc++;
  }
  return steps;
}

/** A parsed level: program, honest trace, timeline in ms. */
export function buildLevel(level) {
  const program = parseProgram(level.listing);
  const honest = trace(program);
  const glitched = trace(program, { skipTarget: true });
  const targetStep = honest.findIndex(s => s.line === program.target);
  if (targetStep < 0) throw new Error(`${level.id}: the target line is never executed`);
  const totalTicks = honest.at(-1).tick + honest.at(-1).ticks;
  return {
    ...level, program, honest, glitched, targetStep,
    totalTicks, totalMs: totalTicks * level.lineMs,
    targetStartMs: honest[targetStep].tick * level.lineMs,
    targetEndMs: (honest[targetStep].tick + honest[targetStep].ticks) * level.lineMs,
  };
}

/**
 * Where a pulse landed. `pulse` is { startMs, endMs } measured from the
 * trigger; the result is the measurement the page prints and the verdict.
 *
 *   miss      the pulse fell entirely outside the routine
 *   brownout  the pulse covered more lines than the guard survives
 *   crash     the pulse covered a crash line
 *   skip      the pulse STARTED on the target: the check is skipped, Alice wins
 *   nop       the pulse covered only harmless lines
 *
 * A glitch does its damage at its rising edge - the line executing at that
 * instant is the one that misbehaves - so skipping the check needs the pulse
 * to start inside the target's window, which is exactly one line wide. The
 * rest of the pulse still counts: everything it covers is corrupted, and a
 * crash line anywhere under it crashes the guard.
 *
 * Every verdict carries which steps were covered and how far the rising edge
 * is from the target: in lines, and in milliseconds from the centre of the
 * target's window - the number a player adds to the badge's offset.
 */
export function land(built, pulse) {
  const { lineMs, honest, targetStep } = built;
  const startMs = Math.max(0, pulse.startMs);
  const endMs = Math.max(startMs + 1, pulse.endMs);     // a zero-width pulse still touches one line
  const first = honest.findIndex(s => (s.tick + s.ticks) * lineMs > startMs);
  const covered = [];
  if (first >= 0) {
    for (let i = first; i < honest.length && honest[i].tick * lineMs < endMs; i++) covered.push(i);
  }
  const base = {
    startMs: pulse.startMs, widthMs: pulse.endMs - pulse.startMs, covered,
    lines: covered.map(i => honest[i].line),
    deltaLines: covered.length ? covered[0] - targetStep : null,
    deltaMs: pulse.startMs - idealOffsetMs(built),
  };
  if (!covered.length) return { ...base, verdict: 'miss' };
  if (covered.length > built.pulseMaxLines) return { ...base, verdict: 'brownout' };
  const crash = covered.find(i => built.program.lines[honest[i].line].kind === 'crash');
  if (crash !== undefined) return { ...base, verdict: 'crash', crashLine: honest[crash].line };
  if (covered[0] === targetStep) return { ...base, verdict: 'skip' };
  return { ...base, verdict: 'nop' };
}

/** The offset a perfect glitcher would dial in: the middle of the target's window. */
export const idealOffsetMs = (built) => (built.targetStartMs + built.targetEndMs) / 2;

/**
 * One run of the guard's routine, driven by button edges. START starts it
 * (that is the badge's trigger tap), X is the glitch, anything else is
 * ignored. Closes with a landing when the pulse ends or the routine does.
 */
export class Run {
  constructor(built) {
    this.level = built;
    this.t0 = null;
    this.pulse = null;
    this.result = null;
  }

  get open() { return this.t0 !== null && this.result === null; }

  /** Elapsed ms since the trigger, or null before it. */
  elapsed(t) { return this.t0 === null ? null : t - this.t0; }

  edge({ button, down, t }) {
    if (button === 'START' && down) {
      this.t0 = t; this.pulse = null; this.result = null;
      return null;
    }
    if (!this.open || button !== 'X') return null;
    if (down) {
      if (!this.pulse) this.pulse = { startMs: t - this.t0, endMs: null };
      return null;
    }
    if (this.pulse && this.pulse.endMs === null) {
      this.pulse.endMs = t - this.t0;
      this.result = land(this.level, this.pulse);
      return this.result;
    }
    return null;
  }

  /** Call as time passes: a routine that ends with no pulse is a plain denial. */
  tick(t) {
    if (!this.open) return null;
    const e = this.elapsed(t);
    if (this.pulse && this.pulse.endMs === null) {
      // still holding X when the routine ends: that is a very wide pulse
      if (e >= this.level.totalMs) {
        this.pulse.endMs = e;
        this.result = land(this.level, this.pulse);
        return this.result;
      }
      return null;
    }
    if (e >= this.level.totalMs + 50) {
      this.result = { verdict: 'denied', covered: [], lines: [], startMs: null, widthMs: 0,
                      deltaLines: null, deltaMs: null };
      return this.result;
    }
    return null;
  }
}
