// Alice in AI Land - a level as the maker holds it, and what can be said about it.
//
// Pure logic, no DOM: the level maker page (src/maker.js) edits through this,
// software/tools/check-stage.mjs and verify-maker.mjs judge a stage through
// the same functions, so what the page says about a room is what CI will say.
//
// A level is the same object a stage module exports:
//
//   { name, rows, theme?, tickMs?, hazards?: [{ id, character?, route, sight? }] }
//
// rows is the ASCII map (src/puzzle.js's legend: # . A O b L G D). A level
// with hazards or a tickMs is timed and judged by src/chase.js; without
// either it is untimed and judged by src/puzzle.js.

import { parse as parseTea, solve as solveTea, replay as replayTea, isGoal as teaGoal } from './puzzle.js';
import { parse as parseChase, solve as solveChase, replay as replayChase, isGoal as chaseGoal } from './chase.js';

export const CHARS = {
  '#': 'wall', '.': 'floor', A: 'Alice', O: 'rock', b: 'button', L: 'lever', G: 'gate', D: 'door',
};
export const BRUSHES = Object.keys(CHARS);
export const MIN_SIZE = 4, MAX_SIZE = 24;

/** 'chase' for a timed level, 'tea' for an untimed one. */
export const kindOf = (level) => (level.hazards?.length || level.tickMs ? 'chase' : 'tea');

/** A walled, empty room with Alice in a corner and the door in the other. */
export function blank(w = 9, h = 7) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? '#' : '.';
    rows.push(row);
  }
  rows[1] = '#A' + rows[1].slice(2);
  rows[h - 2] = rows[h - 2].slice(0, w - 2) + 'D#';
  return { name: 'An Untitled Room', rows, theme: 'garden' };
}

/** A copy of `level` with one cell changed. Alice and the door are single, so painting one moves it. */
export function setCell(level, x, y, ch) {
  const rows = level.rows.map(r => [...r]);
  if (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length) return level;
  if (ch === 'A' || ch === 'D') for (const r of rows) for (let i = 0; i < r.length; i++) if (r[i] === ch) r[i] = '.';
  rows[y][x] = ch;
  return { ...level, rows: rows.map(r => r.join('')) };
}

/** A copy of `level` resized to w x h: cells kept where they were, new ground is floor inside a wall. */
export function resize(level, w, h) {
  w = Math.max(MIN_SIZE, Math.min(MAX_SIZE, w | 0));
  h = Math.max(MIN_SIZE, Math.min(MAX_SIZE, h | 0));
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const old = level.rows[y]?.[x];
      row += edge ? '#' : (old && old !== undefined ? old : '.');
    }
    rows.push(row);
  }
  const hazards = (level.hazards ?? []).map(hz => ({ ...hz, route: hz.route.filter(([x, y]) => x < w && y < h) }));
  return { ...level, rows, hazards };
}

/** The slug a level's module is named by: stages/community/<id>.js. */
export const idOf = (level) => (level.name ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
export const exportName = (level) => idOf(level).toUpperCase().replace(/-/g, '_');

/**
 * What is wrong with a level before any solver is asked: the shape, the
 * legend, the counts, the routes. Returns [] when nothing is.
 */
export function lint(level) {
  const out = [];
  const rows = level?.rows;
  if (!Array.isArray(rows) || !rows.length || rows.some(r => typeof r !== 'string')) return ['rows must be a list of strings'];
  const w = rows[0].length, h = rows.length;
  if (rows.some(r => r.length !== w)) out.push('every row must be the same length');
  if (w < MIN_SIZE || h < MIN_SIZE) out.push(`the room is too small (${w}x${h}; at least ${MIN_SIZE}x${MIN_SIZE})`);
  if (w > MAX_SIZE || h > MAX_SIZE) out.push(`the room is too big (${w}x${h}; at most ${MAX_SIZE}x${MAX_SIZE})`);
  const count = {};
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (!(ch in CHARS)) out.push(`unknown character '${ch}' at ${x},${y}`);
    count[ch] = (count[ch] ?? 0) + 1;
  }));
  if ((count.A ?? 0) !== 1) out.push(`the room needs exactly one Alice (A), it has ${count.A ?? 0}`);
  if ((count.D ?? 0) !== 1) out.push(`the room needs exactly one door (D), it has ${count.D ?? 0}`);
  if ((count.O ?? 0) !== (count.b ?? 0)) out.push(`${count.O ?? 0} rock(s) but ${count.b ?? 0} button(s); they must match`);
  if (!count.O) out.push('a room with no rock is a walk, not a puzzle');
  if ((count.G ?? 0) && !(count.L ?? 0)) out.push('a gate (G) with no lever (L) never opens');
  for (let x = 0; x < w; x++) if (rows[0][x] !== '#' || rows[h - 1][x] !== '#') { out.push('the top and bottom rows must be wall'); break; }
  for (let y = 0; y < h; y++) if (rows[y][0] !== '#' || rows[y][w - 1] !== '#') { out.push('the left and right columns must be wall'); break; }
  if (!level.name || !String(level.name).trim()) out.push('the level needs a name');
  if (level.tickMs !== undefined && !(level.tickMs >= 100 && level.tickMs <= 2000)) out.push('tickMs must be between 100 and 2000');

  const ids = new Set();
  for (const [n, hz] of (level.hazards ?? []).entries()) {
    const at = `hazard ${n + 1}${hz.id ? ` (${hz.id})` : ''}`;
    if (!hz.id) out.push(`${at}: needs an id`);
    if (ids.has(hz.id)) out.push(`${at}: duplicate id`);
    ids.add(hz.id);
    if (!Array.isArray(hz.route) || hz.route.length < 2) { out.push(`${at}: a route needs at least two points`); continue; }
    for (let i = 0; i < hz.route.length; i++) {
      const [ax, ay] = hz.route[i], [bx, by] = hz.route[(i + 1) % hz.route.length];
      if (ax !== bx && ay !== by) out.push(`${at}: points ${i + 1} and ${(i + 1) % hz.route.length + 1} are not in a line`);
      if (ax === bx && ay === by && hz.route.length > 1) out.push(`${at}: points ${i + 1} and ${(i + 1) % hz.route.length + 1} are the same cell`);
      const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
      for (let x = ax, y = ay; ; x += dx, y += dy) {
        const ch = rows[y]?.[x];
        if (ch === undefined) { out.push(`${at}: leaves the room at ${x},${y}`); break; }
        if (ch === '#') { out.push(`${at}: walks through a wall at ${x},${y}`); break; }
        if (x === bx && y === by) break;
      }
    }
    if (hz.sight !== undefined && !(hz.sight >= 0 && hz.sight <= 8)) out.push(`${at}: sight must be 0..8`);
  }
  return out;
}

/**
 * The verifier's verdict on a level: whether it is solvable, by how many
 * moves or ticks, and whether its parts do any work. The same questions
 * tools/verify-stage.mjs and verify-chase.mjs ask of the shipped stages.
 */
export function check(level, { limit } = {}) {
  const problems = lint(level);
  if (problems.length) return { ok: false, problems };
  const kind = kindOf(level);
  const t0 = performance.now();
  const notes = [];
  let moves = null, explored = 0;
  if (kind === 'tea') {
    const map = parseTea(level.rows);
    ({ moves, explored } = solveTea(map, limit ? { limit } : {}));
    if (moves) {
      const path = replayTea(map, moves);
      if (!teaGoal(map, path.at(-1))) return { ok: false, kind, problems: ['the solver returned a path that does not reach the goal'] };
      if (map.gates.size) {
        const welded = parseTea(level.rows.map(r => r.replace(/G/g, '#').replace(/L/g, '.')));
        const alt = solveTea(welded, limit ? { limit } : {});
        notes.push(alt.moves ? `the gate is decoration: still solvable in ${alt.moves.length} moves with it welded shut` : 'the gate is load-bearing');
      }
    }
  } else {
    const map = parseChase(level);
    ({ moves, explored } = solveChase(map, map.start, limit ? { limit } : {}));
    if (moves) {
      const path = replayChase(map, moves);
      if (!chaseGoal(map, path.at(-1))) return { ok: false, kind, problems: ['the solver returned a path that does not reach the goal'] };
      const calm = solveChase(parseChase({ ...level, hazards: [] }));
      if (calm.moves) notes.push(`the cast costs ${moves.length - calm.moves.length} tick(s) over an empty room (par ${calm.moves.length})`);
      notes.push(`${moves.filter(m => m === 'wait').length} of the par's ${moves.length} ticks are waiting`);
      notes.push(`the world repeats every ${map.period} ticks`);
    }
  }
  const ms = Math.round(performance.now() - t0);
  if (!moves) return { ok: false, kind, problems: [`unsolvable: ${explored} states searched in ${ms} ms`], explored, ms };
  return { ok: true, kind, moves, par: moves.length, explored, ms, notes };
}

// ------------------------------------------------------------- the module ----

const LEGEND = `//   #  wall     .  floor    A  Alice    O  rock
//   b  button   L  lever    G  gate     D  door`;

/** The source of a stage module, as stages/*.js are written. */
export function toModule(level, { author } = {}) {
  const kind = kindOf(level);
  const name = exportName(level);
  const head = [`// Stage: ${JSON.stringify(level.name)}`];
  if (author) head.push(`// By ${author}, made with the level maker (maker.html)`);
  head.push('//', LEGEND);
  if (kind === 'chase') head.push('//', '// A timed room: every tick the cast advances one cell along its loop.');
  const body = [`export const ${name} = {`, `  name: ${JSON.stringify(level.name)},`];
  if (level.theme) body.push(`  theme: ${JSON.stringify(level.theme)},`);
  if (kind === 'chase') body.push(`  tickMs: ${level.tickMs ?? 320},`);
  body.push('  rows: [', ...level.rows.map(r => `    '${r}',`), '  ],');
  if (level.hazards?.length) {
    body.push('  hazards: [');
    for (const hz of level.hazards) {
      const parts = [`id: ${JSON.stringify(hz.id)}`];
      if (hz.character && hz.character !== hz.id) parts.push(`character: ${JSON.stringify(hz.character)}`);
      parts.push(`route: [${hz.route.map(([x, y]) => `[${x}, ${y}]`).join(', ')}]`);
      if (hz.sight) parts.push(`sight: ${hz.sight}`);
      body.push(`    { ${parts.join(', ')} },`);
    }
    body.push('  ],');
  }
  body.push('};');
  return head.join('\n') + '\n\n' + body.join('\n') + '\n';
}

/** A level from a stage module's source: imported as a data: URL, so it is real JavaScript, not a regex. */
export async function fromModule(text) {
  const mod = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(text));
  const level = Object.values(mod).find(v => v && typeof v === 'object' && Array.isArray(v.rows));
  if (!level) throw new Error('the module exports no stage (an object with rows)');
  return normalize(level);
}

/** A plain copy with only the fields a stage carries. */
export function normalize(level) {
  const out = { name: String(level.name ?? 'untitled'), rows: [...level.rows] };
  if (level.theme) out.theme = level.theme;
  if (level.tickMs !== undefined) out.tickMs = +level.tickMs;
  if (level.hazards?.length) out.hazards = level.hazards.map(hz => {
    const h = { id: String(hz.id), route: hz.route.map(([x, y]) => [+x, +y]) };
    if (hz.character) h.character = hz.character;
    if (hz.sight) h.sight = +hz.sight;
    return h;
  });
  return out;
}

// -------------------------------------------------------------- the share ----
// ?level=<token> carries a level in a link: JSON, base64url. No server, so a
// link is the whole level - fine for a room, which is a few hundred bytes.

const b64 = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'));
const unb64 = (s) => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'));
const utf8 = (s) => unescape(encodeURIComponent(s));
const unutf8 = (s) => decodeURIComponent(escape(s));

export const encodeShare = (level) => b64(utf8(JSON.stringify(normalize(level)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const decodeShare = (token) => normalize(JSON.parse(unutf8(unb64(token.replace(/-/g, '+').replace(/_/g, '/')))));
