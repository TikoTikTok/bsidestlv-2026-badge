// Alice in AI Land - progress and prizes: what the player has done on the
// stages page, kept on this device.
//
// Pure: no DOM, no fetch, so Node can prove it (software/tools/verify-progress.mjs)
// and the page (src/gallery.js) only draws it. One object in localStorage
// (STORE_KEY) holds everything:
//
//   { v: 1,
//     levels: { <key>: { id, wins, best, clean, shared, par } },   per level: wins, the fewest moves or ticks,
//                                                                  won once without undo, came in a link, its par
//     totals: { moves, pushes, waits, undos, caught, wins, lessons },
//     tutorial: false,                                             the Learn tutorial finished
//     prizes: { <id>: <ISO date> } }                               when each was won
//
// A level is known by `levelKey`: a hash of what makes it the puzzle it is -
// the map, the clock, the cast - so the same room shared in a link, kept on a
// shelf or merged into the community is one level, and a room whose map
// changed is a new one.
//
// The events are the player's (src/room.js, kind 'room'): open, move, push,
// lever, button, blocked, undo, reset, start, wait, tick, caught, restart,
// win, solve, lesson. A win after the bench's solver ran counts for nothing;
// a reset starts a fresh attempt.
//
//   const progress = new Progress(localStore());
//   progress.catalogue([{ id, key, group, kind, par }]);     the levels on the page, for "all of them" prizes
//   progress.on(({ unlocked }) => ...);                      prizes won by the last event
//   progress.feed(ev, { id, key, group, kind, par });        every event of the open level
//   progress.parKnown(key, par);                             the solver's answer came later
//   progress.record(key) / .summary() / .reset()

export const STORE_KEY = 'alice.progress';
const VERSION = 1;

/** 'chase' for a timed level, 'tea' for an untimed one (the same answer as src/level.js kindOf, without its imports). */
const kindOf = (level) => (level?.hazards?.length || level?.tickMs ? 'chase' : 'tea');

/**
 * A short id for a level as a puzzle: FNV-1a over the map, the clock and the
 * cast. The name, the blurb, the lesson and the dressing are not the puzzle,
 * so they do not count.
 */
export function levelKey(level) {
  const puzzle = JSON.stringify({ rows: level.rows, tickMs: level.tickMs ?? null,
                                  hazards: (level.hazards ?? []).map(h => [h.id, h.route, h.sight ?? 0]) });
  let h = 0x811c9dc5;
  for (let i = 0; i < puzzle.length; i++) { h ^= puzzle.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

// ----------------------------------------------------------------- facts ----

/** What a level is made of, read off its map: the explorer's card and the play panel's strip. */
export function factsOf(level) {
  const rows = level.rows ?? [];
  const all = rows.join('');
  const count = (ch) => all.split(ch).length - 1;
  const hazards = level.hazards ?? [];
  return {
    kind: kindOf(level), w: rows[0]?.length ?? 0, h: rows.length, tickMs: level.tickMs ?? (hazards.length ? 320 : null),
    rocks: count('O'), buttons: count('b'), gates: count('G'), levers: count('L'),
    cast: hazards.length, watchers: hazards.filter(h => h.sight).length,
  };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The facts as the strip says them: one line of parts. */
export function factsLine(f) {
  const parts = [];
  parts.push(f.kind === 'chase' ? `timed · ${f.tickMs} ms a tick` : 'untimed');
  parts.push(`${f.w}×${f.h}`);
  parts.push(plural(f.rocks, 'rock'));
  parts.push(plural(f.buttons, 'button'));
  if (f.gates) parts.push(f.gates === 1 ? 'a gate' : `${f.gates} gates`);
  if (f.cast) parts.push(f.cast === 1 ? 'one in the cast' : `a cast of ${f.cast}`);
  return parts;
}

// ---------------------------------------------------------------- prizes ----
// Each prize is a test over the state and the catalogue. No prize is hidden:
// the page lists them all, won or not, with how each is won. `unit` is
// what the Learn panel and the card count in: moves for an untimed level,
// ticks for a timed one.

const won = (ctx, id) => Object.values(ctx.levels).some(l => l.id === id && l.wins > 0);
const group = (ctx, g) => ctx.catalogue.filter(c => c.group === g);
const everyWon = (ctx, list) => list.length > 0 && list.every(c => (ctx.levels[c.key]?.wins ?? 0) > 0);

export const ACHIEVEMENTS = [
  { id: 'first-step', icon: '✚', title: 'Down the rabbit hole', say: 'Take your first step in any room.',
    test: (ctx) => ctx.totals.moves >= 1 },
  { id: 'tea-served', icon: '☕', title: 'Tea is served', say: 'Win A Mad Tea Party.',
    test: (ctx) => won(ctx, 'tea-party') },
  { id: 'not-today', icon: '♛', title: 'Not today, Your Majesty', say: "Win The Queen's Gauntlet.",
    test: (ctx) => won(ctx, 'queens-gauntlet') },
  { id: 'seen', icon: '◉', title: 'Seen', say: "Get caught by the Queen's eyes. It happens to everyone once.",
    test: (ctx) => ctx.totals.caught >= 1 },
  { id: 'par', icon: '★', title: 'The best known answer', say: 'Win a level in its par or fewer.',
    test: (ctx) => Object.values(ctx.levels).some(l => l.wins > 0 && l.par && l.best !== null && l.best <= l.par) },
  { id: 'clean', icon: '↶', title: 'No regrets', say: 'Win an untimed level without taking a move back.',
    test: (ctx) => Object.values(ctx.levels).some(l => l.clean) },
  { id: 'patient', icon: '⌛', title: 'Standing still', say: 'Wait twenty ticks, all told. Waiting is a move.',
    test: (ctx) => ctx.totals.waits >= 20 },
  { id: 'walker', icon: '∞', title: 'A long walk', say: 'Five hundred moves, all told.',
    test: (ctx) => ctx.totals.moves >= 500 },
  { id: 'lesson', icon: '✎', title: 'The first lesson', say: "Follow a room's lesson to its last line.",
    test: (ctx) => ctx.totals.lessons >= 1 },
  { id: 'caucus', icon: '⚑', title: 'A caucus race', say: 'Win every room the community made.',
    test: (ctx) => everyWon(ctx, group(ctx, 'community')) },
  { id: 'everything', icon: '◈', title: 'A prize for everyone', say: 'Win every level on this page.',
    test: (ctx) => everyWon(ctx, ctx.catalogue.filter(c => c.group !== 'shared')) },
  { id: 'looking-glass', icon: '◇', title: 'Through the looking glass', say: 'Win a room that came to you in a link.',
    test: (ctx) => Object.values(ctx.levels).some(l => l.shared && l.wins > 0) },
  { id: 'tutorial', icon: '♞', title: 'The Caucus Race, run', say: 'Finish the Learn tutorial, every step.',
    test: (ctx) => !!ctx.tutorial },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map(a => a.id);

/** A fresh state: nothing done yet. */
export const fresh = () => ({ v: VERSION, levels: {}, totals: { moves: 0, pushes: 0, waits: 0, undos: 0, caught: 0, wins: 0, lessons: 0 }, tutorial: false, prizes: {} });

/** The prizes the state has earned, catalogue in hand: the ids whose test passes. Pure. */
export function evaluate(state, catalogue = []) {
  const ctx = { ...state, catalogue };
  return ACHIEVEMENTS.filter(a => { try { return !!a.test(ctx); } catch { return false; } }).map(a => a.id);
}

// ----------------------------------------------------------------- store ----

/** localStorage under STORE_KEY, or nothing when storage is off. */
export const localStore = (key = STORE_KEY) => ({
  load() { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } },
  save(state) { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* storage may be off */ } },
  clear() { try { localStorage.removeItem(key); } catch { /* storage may be off */ } },
});
/** A store that forgets: tests, and a page with no storage. */
export const memoryStore = () => { let s = null; return { load: () => s, save: (v) => { s = v; }, clear: () => { s = null; } }; };

/** A loaded state made whole: whatever an older save lacks is filled in, whatever is not a state is dropped. */
export function mend(raw) {
  const s = fresh();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.levels && typeof raw.levels === 'object') {
    for (const [k, l] of Object.entries(raw.levels)) {
      if (!l || typeof l !== 'object') continue;
      s.levels[k] = { id: String(l.id ?? k), wins: Math.max(0, +l.wins || 0), best: Number.isFinite(l.best) ? l.best : null,
                      clean: !!l.clean, shared: !!l.shared, par: Number.isFinite(l.par) ? l.par : null };
    }
  }
  for (const k of Object.keys(s.totals)) s.totals[k] = Math.max(0, +(raw.totals?.[k]) || 0);
  s.tutorial = !!raw.tutorial;
  if (raw.prizes && typeof raw.prizes === 'object') for (const [id, when] of Object.entries(raw.prizes)) if (ACHIEVEMENT_IDS.includes(id) && typeof when === 'string') s.prizes[id] = when;
  return s;
}

// -------------------------------------------------------------- progress ----

export class Progress {
  constructor(store = memoryStore(), { now = () => new Date().toISOString() } = {}) {
    this.store = store;
    this.now = now;
    this.state = mend(store.load?.());
    this.list = [];                 // the catalogue: [{ id, key, group, kind, par }]
    this.run = { undo: false, solved: false };
    this.listeners = [];
  }

  /** The levels on the page, so "every room" and "every level" can be judged; par may come later (parKnown). */
  catalogue(list) {
    this.list = list.map(c => ({ ...c }));
    for (const c of this.list) if (c.par && this.state.levels[c.key]) this.state.levels[c.key].par = c.par;
    return this.settle();
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }

  /** What is recorded for a level, or null. */
  record(key) { return this.state.levels[key] ?? null; }

  /** A fresh attempt: a level opened or reset without an event saying so. */
  begin() { this.run = { undo: false, solved: false }; }

  /**
   * One event of the open level. `lvl` is the level it happened in: { id, key,
   * group, kind, par }. Returns the prizes it won, [] when none.
   */
  feed(ev, lvl) {
    if (!ev || !lvl?.key) return [];
    const t = this.state.totals;
    switch (ev.what) {
      case 'open': case 'reset': case 'restart': this.run = { undo: false, solved: false }; break;
      case 'solve': this.run.solved = true; break;
      case 'undo': this.run.undo = true; t.undos++; break;
      case 'move': t.moves++; break;
      case 'push': t.pushes++; break;
      case 'wait': t.waits++; break;
      case 'caught': t.caught++; break;
      case 'lesson': t.lessons++; break;
      case 'win': {
        if (this.run.solved) break;                      // the bench's solver won, not the player
        const n = ev.moves ?? ev.ticks ?? null;
        const rec = this.state.levels[lvl.key] ??= { id: lvl.id, wins: 0, best: null, clean: false, shared: false, par: null };
        rec.id = lvl.id;
        rec.wins++;
        if (n !== null && (rec.best === null || n < rec.best)) rec.best = n;
        if (!this.run.undo && (lvl.kind ?? 'tea') === 'tea') rec.clean = true;
        if (lvl.group === 'shared') rec.shared = true;
        if (lvl.par) rec.par = lvl.par;
        t.wins++;
        break;
      }
      default: return [];
    }
    return this.settle();
  }

  /** The solver's par for a level arrived (the page works it out in a worker): a best already under it is a prize now. */
  parKnown(key, par) {
    for (const c of this.list) if (c.key === key) c.par = par;
    if (this.state.levels[key]) this.state.levels[key].par = par;
    return this.settle();
  }

  /** The Learn tutorial was finished. */
  tutorialDone() { if (this.state.tutorial) return []; this.state.tutorial = true; return this.settle(); }

  /** Save, then judge: the prizes newly won go to the listeners and come back. */
  settle() {
    const earned = evaluate(this.state, this.list);
    const unlocked = earned.filter(id => !this.state.prizes[id]).map(id => ACHIEVEMENTS.find(a => a.id === id));
    for (const a of unlocked) this.state.prizes[a.id] = this.now();
    this.store.save?.(this.state);
    if (unlocked.length) for (const fn of this.listeners) fn({ unlocked, state: this.state });
    return unlocked;
  }

  /** Won levels of the catalogue (not the shared ones), prizes won, and the totals. */
  summary() {
    const listed = this.list.filter(c => c.group !== 'shared');
    return {
      won: listed.filter(c => (this.state.levels[c.key]?.wins ?? 0) > 0).length, of: listed.length,
      prizes: Object.keys(this.state.prizes).length, prizesOf: ACHIEVEMENTS.length,
      totals: { ...this.state.totals },
    };
  }

  /** Everything forgotten. */
  reset() { this.state = fresh(); this.run = { undo: false, solved: false }; this.store.clear?.(); this.store.save?.(this.state); for (const fn of this.listeners) fn({ unlocked: [], state: this.state, reset: true }); }
}
