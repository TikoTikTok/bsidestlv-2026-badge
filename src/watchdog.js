// Alice in AI Land - the Dormouse's Watchdog: rules for the window-watchdog range.
//
// Pure logic, no DOM. glitch.js drives it from the page with real button
// edges; software/tools/verify-range.mjs drives it from the CLI to prove the
// hand level fits a hand, the badge levels do not, and every level falls to
// a replayed take.
//
// A window watchdog (the STM32's WWDG, the AVR's WDT in window mode) is the
// guard dog of embedded firmware: it has to be kicked every so often or it
// resets the chip - and it must not be kicked too soon either, or it resets
// just the same, because a runaway loop that kicks it every microsecond is
// exactly the fault it is there to catch. So a kick has to land inside a
// window: not before `openMs` after the previous kick, not after `timeoutMs`.
//
// Here the Dormouse is the dog. START puts it to sleep (that is the badge's
// trigger tap) and starts the clock; every press of the kick button is a
// nudge that must land inside the window measured from the previous nudge
// (or from START, for the first). Too soon and it stirs, too late and it
// bites, and either way the attempt is over. `kicks` nudges in a row and
// Alice has tiptoed past.
//
// The badge plays this with a take of `kicks` taps recorded at a comfortable
// pace and sped up until the gaps fit the window - the same tempo lesson the
// Rabbit's watch teaches, with the extra that the *first* gap is the fire's
// offset, so the offset has to land inside the window too.

/** The window a level accepts, measured from the previous kick: [openMs, timeoutMs]. */
export const windowOf = (level) => ({ openMs: level.openMs, timeoutMs: level.timeoutMs, widthMs: level.timeoutMs - level.openMs });

/** The gap a perfect replay would use: the middle of the window. */
export const idealGapMs = (level) => (level.openMs + level.timeoutMs) / 2;

/**
 * The watchdog. Feed it edges and time; it returns null while the attempt is
 * open and a result object when it closes.
 *
 *   START down            arms it: the Dormouse falls asleep, the clock runs
 *   kick button down      a nudge, judged against the window
 *   tick(t)               a timeout past `timeoutMs` with no nudge is a bite
 *
 * The result is { win, reason, kicks, gaps, gap, ms, verdict } with verdict
 * one of 'asleep' (win), 'early', 'late'. `gaps` is each good nudge's
 * distance from the one before and `gap` the one that closed the attempt,
 * so the page can say where in the window every one fell.
 */
export class Watchdog {
  constructor(level) {
    this.level = level;
    this.reset();
  }

  reset() {
    this.t0 = null;       // START
    this.last = null;     // the previous kick (or START)
    this.gaps = [];
    this.result = null;
  }

  get armed() { return this.t0 !== null && this.result === null; }
  get kicks() { return this.gaps.length; }

  edge({ button, down, t }) {
    if (!down) return null;
    if (button === 'START') { this.reset(); this.t0 = t; this.last = t; return null; }
    if (!this.armed || button !== this.level.button) return null;
    const gap = t - this.last;
    if (gap < this.level.openMs) {
      return this.close(false, 'early', `too soon: nudge ${this.kicks + 1} came ${Math.round(gap)} ms after the last, the window opens at ${this.level.openMs} ms`, t, gap);
    }
    if (gap > this.level.timeoutMs) {
      return this.close(false, 'late', `too late: nudge ${this.kicks + 1} came ${Math.round(gap)} ms after the last, the Dormouse bit at ${this.level.timeoutMs} ms`, t, gap);
    }
    this.gaps.push(gap);
    this.last = t;
    if (this.kicks >= this.level.kicks) return this.close(true, 'asleep', 'the Dormouse sleeps on - Alice tiptoes past', t, gap);
    return null;
  }

  /** Call as time passes: past the timeout with no nudge, it bites. */
  tick(t) {
    if (!this.armed) return null;
    if (t - this.last > this.level.timeoutMs) {
      return this.close(false, 'late', `too late: no nudge within ${this.level.timeoutMs} ms of the last - the Dormouse bit`, t, t - this.last);
    }
    return null;
  }

  close(win, verdict, reason, t, gap = null) {
    this.result = {
      win, verdict, reason,
      kicks: this.kicks,
      gaps: this.gaps.slice(),
      gap,                                        // the gap that closed it: the last good one, or the bad one
      ms: this.t0 === null ? 0 : t - this.t0,
    };
    return this.result;
  }
}

/**
 * Where a gap sits in the window, as a fraction: 0 at the opening edge,
 * 1 at the timeout, outside that range when it missed. The page draws it.
 */
export function placeInWindow(level, gap) {
  const { openMs, widthMs } = windowOf(level);
  return (gap - openMs) / widthMs;
}

/**
 * A replay: `kicks` nudges, `gap` apart, the first `offset` after START,
 * each landing `jitter(i)` ms off. Returns the result. The verifier uses
 * it to show what a hand (jitter +/-40 ms) and the badge (+/-8 ms of host
 * sampling) make of each level.
 */
export function replay(level, { gap = idealGapMs(level), offset = gap, jitter = () => 0 } = {}) {
  const dog = new Watchdog(level);
  let base = 1000, t = base;
  dog.edge({ button: 'START', down: true, t });
  let r = null;
  for (let i = 0; i < level.kicks && !r; i++) {
    base += i === 0 ? offset : gap;          // the schedule; each press lands its own jitter off it
    t = base + jitter(i);
    r = dog.tick(t) ?? dog.edge({ button: level.button, down: true, t });
  }
  return r ?? dog.tick(t + level.timeoutMs + 1);
}
