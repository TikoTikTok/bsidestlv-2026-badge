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

// -------------------------------------------------------------- the tools ----
// What the studio's tools paint, as lists of cells, so a stroke is one edit
// and one undo step whatever drew it. Every function returns a new level.

const dimsOf = (level) => ({ w: level.rows[0]?.length ?? 0, h: level.rows.length });
const inside = (level, x, y) => { const { w, h } = dimsOf(level); return x >= 0 && y >= 0 && x < w && y < h; };

/** The cells on a straight line from a to b (Bresenham), both ends included. */
export function lineCells(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

/** The cells of the rectangle with corners a and b: its outline, or all of it. */
export function rectCells(x0, y0, x1, y1, { filled = false } = {}) {
  const out = [];
  const [l, r] = [Math.min(x0, x1), Math.max(x0, x1)], [t, b] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++)
    if (filled || x === l || x === r || y === t || y === b) out.push([x, y]);
  return out;
}

/** The 4-connected region of cells like (x, y). */
export function regionCells(level, x, y) {
  if (!inside(level, x, y)) return [];
  const was = level.rows[y][x];
  const seen = new Set([`${x},${y}`]);
  const out = [], queue = [[x, y]];
  while (queue.length) {
    const [cx, cy] = queue.pop();
    out.push([cx, cy]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
      if (!inside(level, nx, ny) || seen.has(k) || level.rows[ny][nx] !== was) continue;
      seen.add(k); queue.push([nx, ny]);
    }
  }
  return out;
}

/** Paint `ch` on every cell of the list (Alice and the door stay single: the last cell wins). */
export function paintCells(level, cells, ch) {
  let out = level;
  for (const [x, y] of cells) out = setCell(out, x, y, ch);
  return out;
}

/** The mirror images of a cell under the studio's symmetry: 'h' (left-right), 'v' (top-bottom), 'both'. */
export function mirrorCells(level, x, y, symmetry) {
  const { w, h } = dimsOf(level);
  const out = [[x, y]];
  if (symmetry === 'h' || symmetry === 'both') out.push([w - 1 - x, y]);
  if (symmetry === 'v' || symmetry === 'both') out.push([x, h - 1 - y]);
  if (symmetry === 'both') out.push([w - 1 - x, h - 1 - y]);
  return out.filter(([a, b], i) => out.findIndex(([c, d]) => c === a && d === b) === i);
}

// --------------------------------------------------------- the transforms ----
// The whole room turned or moved, routes included.

const mapRoutes = (level, fn) => (level.hazards ?? []).map(hz => ({ ...hz, route: hz.route.map(([x, y]) => fn(x, y)) }));

export function flipH(level) {
  const { w } = dimsOf(level);
  return { ...level, rows: level.rows.map(r => [...r].reverse().join('')), hazards: mapRoutes(level, (x, y) => [w - 1 - x, y]) };
}
export function flipV(level) {
  const { h } = dimsOf(level);
  return { ...level, rows: [...level.rows].reverse(), hazards: mapRoutes(level, (x, y) => [x, h - 1 - y]) };
}
/** A quarter turn clockwise: the room's width becomes its height. */
export function rotate(level) {
  const { w, h } = dimsOf(level);
  const rows = [];
  for (let x = 0; x < w; x++) { let row = ''; for (let y = h - 1; y >= 0; y--) row += level.rows[y][x] ?? '.'; rows.push(row); }
  return { ...level, rows, hazards: mapRoutes(level, (x, y) => [h - 1 - y, x]) };
}
/** The inside of the room moved by (dx, dy); what crosses the wall is lost, what is uncovered is floor. */
export function shift(level, dx, dy) {
  const { w, h } = dimsOf(level);
  const rows = level.rows.map((r, y) => [...r].map((ch, x) => {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return ch;
    const sx = x - dx, sy = y - dy;
    return (sx <= 0 || sy <= 0 || sx >= w - 1 || sy >= h - 1) ? '.' : level.rows[sy][sx];
  }).join(''));
  const hazards = (level.hazards ?? []).map(hz => ({ ...hz, route: hz.route.map(([x, y]) => [x + dx, y + dy]).filter(([x, y]) => x > 0 && y > 0 && x < w - 1 && y < h - 1) }));
  return { ...level, rows, hazards };
}

// ------------------------------------------------------------ the analysis ----
// What the studio draws over the board, from the solver's own bookkeeping.

/**
 * Cells a rock must never land on (src/puzzle.js liveSquares in reverse),
 * where Alice can walk from her start with the rocks in place and the gate
 * shut, and - with a report - how the solver's answer moves. null while the
 * room is malformed.
 */
export function analyse(level, report = null) {
  if (lint(level).length) return null;
  const map = parseTea(level.rows);
  const { w, h } = map;
  const stuck = new Set();
  for (let i = 0; i < w * h; i++) if (!map.walls.has(i) && !map.live.has(i) && i !== map.door) stuck.add(i);
  const reach = new Set([map.start.alice]);
  const queue = [map.start.alice];
  const blocked = new Set([...map.walls, ...map.gates, ...map.start.rocks]);
  while (queue.length) {
    const i = queue.pop();
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (blocked.has(j) || reach.has(j)) continue;
      reach.add(j); queue.push(j);
    }
  }
  let path = null, pushes = 0;
  if (report?.ok && report.moves) {
    const states = kindOf(level) === 'tea' ? replayTea(map, report.moves) : replayChase(parseChase(level), report.moves);
    path = states.map(s => s.alice);
    for (let i = 1; i < states.length; i++) if (states[i].rocks.join() !== states[i - 1].rocks.join()) pushes++;
  }
  return { w, h, stuck, reach, path, pushes };
}

/** One word for how hard the solver found a room, from its par and its search. */
export function difficulty(report, pushes = 0) {
  if (!report?.ok) return null;
  const score = report.par / (report.kind === 'chase' ? 1.4 : 1) + pushes * 2 + Math.log10(Math.max(1, report.explored)) * 6;
  if (score < 24) return { label: 'a stroll', level: 1 };
  if (score < 48) return { label: 'a puzzle', level: 2 };
  if (score < 80) return { label: 'a riddle', level: 3 };
  if (score < 130) return { label: 'a labyrinth', level: 4 };
  return { label: 'a nightmare', level: 5 };
}

// ------------------------------------------------------------- the starters ----
// Rooms to start from, each a lesson in one idea. Every one solves (the
// verifier proves it).

export const STARTERS = [
  { id: 'blank', name: 'A blank room', blurb: 'a walled 9x7 with Alice and the door', level: () => blank(9, 7) },
  { id: 'wide', name: 'A wide room', blurb: 'a 15x9 with room to think', level: () => blank(15, 9) },
  { id: 'corridor', name: 'The corridor', blurb: 'one rock, one line, one shove', level: () => ({ name: 'The Corridor', theme: 'garden', rows: [
    '#########', '#A......#', '#.O.....#', '#.......#', '#......b#', '#.......#', '#......D#', '#########'] }) },
  { id: 'gate', name: 'The gate', blurb: 'a wall between, a lever to throw', level: () => ({ name: 'The Gate', theme: 'garden', rows: [
    '###########', '#A..#....b#', '#.O.G.....#', '#...#.##..#', '#.L.#.b.O.#', '#...#....D#', '###########'] }) },
  { id: 'two-rooms', name: 'Two rooms', blurb: 'three rocks, a door that wants them all', level: () => ({ name: 'Two Rooms', theme: 'court', rows: [
    '#############', '#A...#..b...#', '#..O.#......#', '#....G......#', '#..O.#.###..#', '#....#.b...D#', '#..O.#......#', '#..L.#..b...#', '#############'] }) },
  { id: 'hall', name: 'The hall', blurb: 'a clock and the Queen on patrol', level: () => ({ name: 'The Hall', theme: 'hall', tickMs: 320, rows: [
    '#########', '#A.#...b#', '#.O#....#', '#..G....#', '#..#....#', '#.O#....#', '#L.#..bD#', '#########'],
    hazards: [{ id: 'queen', route: [[2, 3], [7, 3]], sight: 3 }, { id: 'cheshire', route: [[4, 1], [7, 1]] }] }) },
];

// ------------------------------------------------------------- the generator ----
// A room drawn by a seed: walls sprinkled, rocks and buttons placed where a
// rock can still be pushed, a gate across the middle if asked, a watcher on
// a straight patrol if timed. The seed alone decides it, so a room can be
// named by its seed and drawn again. generate() draws one; generateSolvable()
// keeps drawing until the solver clears one, which is what the page's
// "Surprise me" and the bridge's maker_generate do.

/** mulberry32: a small seeded generator, the same numbers everywhere. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const NAMES = [['The', 'A', 'Her', 'His'], ['Crooked', 'Quiet', 'Mad', 'Red', 'Looking', 'Lost', 'Little', 'Painted', 'Sleepy', 'Curious'],
               ['Garden', 'Hall', 'Court', 'Cellar', 'Croquet', 'Tea Table', 'Rose Bed', 'Study', 'Kitchen', 'Chessboard']];

export function generate({ seed = 1, width = 11, height = 8, rocks = 2, walls = 0.12, gate = false, timed = false, cast = 1, theme } = {}) {
  const r = rng(seed);
  const w = Math.max(MIN_SIZE + 1, Math.min(MAX_SIZE, width | 0)), h = Math.max(MIN_SIZE + 1, Math.min(MAX_SIZE, height | 0));
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? '#' : '.'));
  const cells = () => { const out = []; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) out.push([x, y]); return out; };
  const pickCell = (ok) => { const c = cells().filter(([x, y]) => ok(x, y)); return c.length ? c[(r() * c.length) | 0] : null; };
  const wallAt = (x, y) => grid[y]?.[x] === '#';
  // a gate: a wall down (or across) the middle with one gap in it
  let gateX = -1;
  if (gate && w >= 7) {
    gateX = 3 + ((r() * (w - 6)) | 0);
    for (let y = 1; y < h - 1; y++) grid[y][gateX] = '#';
    grid[1 + ((r() * (h - 2)) | 0)][gateX] = 'G';
  }
  // sprinkled walls, never two deep on the border's inside so corridors stay open
  for (const [x, y] of cells()) if (grid[y][x] === '.' && r() < walls && x !== gateX) grid[y][x] = '#';
  // the corner rule: a rock may only start where it is not already lost, and a button where a rock can arrive
  const corner = (x, y) => (wallAt(x - 1, y) || wallAt(x + 1, y)) && (wallAt(x, y - 1) || wallAt(x, y + 1));
  const free = (x, y) => grid[y][x] === '.';
  const left = (x) => gateX < 0 || x < gateX;
  const alice = pickCell((x, y) => free(x, y) && left(x)); if (!alice) return null;
  grid[alice[1]][alice[0]] = 'A';
  if (gateX >= 0) { const l = pickCell((x, y) => free(x, y) && left(x)); if (!l) return null; grid[l[1]][l[0]] = 'L'; }
  const door = pickCell((x, y) => free(x, y) && (gateX < 0 ? Math.abs(x - alice[0]) + Math.abs(y - alice[1]) >= Math.min(w, h) - 2 : x > gateX)); if (!door) return null;
  grid[door[1]][door[0]] = 'D';
  for (let k = 0; k < rocks; k++) {
    const o = pickCell((x, y) => free(x, y) && !corner(x, y) && left(x) && !corner(x, y)); if (!o) return null;
    grid[o[1]][o[0]] = 'O';
    const b = pickCell((x, y) => free(x, y) && !corner(x, y) && (gateX < 0 || x > gateX)); if (!b) return null;
    grid[b[1]][b[0]] = 'b';
  }
  const name = `${NAMES[0][(r() * NAMES[0].length) | 0]} ${NAMES[1][(r() * NAMES[1].length) | 0]} ${NAMES[2][(r() * NAMES[2].length) | 0]} #${seed}`;
  const level = { name, theme: theme ?? (timed ? 'hall' : gate ? 'court' : 'garden'), rows: grid.map(row => row.join('')) };
  if (timed) {
    level.tickMs = 320;
    level.hazards = [];
    const ids = ['queen', 'cheshire', 'rabbit', 'hatter'];
    for (let k = 0; k < Math.min(cast, 4); k++) {
      // a straight run of floor at least three long, along a row or a column
      let best = null;
      for (let tries = 0; tries < 40 && !best; tries++) {
        const horizontal = r() < 0.5;
        const [x, y] = cells()[(r() * cells().length) | 0];
        let a = horizontal ? x : y, b = a;
        const at = (p) => horizontal ? grid[y][p] : grid[p][x];
        const clear = (p) => at(p) === '.' || at(p) === 'b';
        while (clear(a - 1)) a--;
        while (clear(b + 1)) b++;
        if (b - a >= 2 && clear(a) && !level.hazards.some(hz => hz.route.some(([px, py]) => (horizontal ? py === y : px === x))))
          best = horizontal ? [[a, y], [b, y]] : [[x, a], [x, b]];
      }
      if (!best) break;
      level.hazards.push({ id: ids[k], route: best, ...(k === 0 ? { sight: 2 } : {}) });
    }
    if (!level.hazards.length) delete level.hazards;
  }
  return level;
}

/**
 * Draws rooms from `seed` upwards until one solves with a par of at least
 * `minPar`; returns { level, report, seed, tries } or null after `tries`.
 * The search is capped per room so a bad draw costs milliseconds.
 */
export function generateSolvable(opts = {}, { tries = 60, minPar = 12, limit = 30_000 } = {}) {
  let seed = (opts.seed ?? ((Math.random() * 1e9) | 0)) >>> 0;
  for (let n = 1; n <= tries; n++, seed = (seed + 1) >>> 0) {
    const level = generate({ ...opts, seed });
    if (!level || lint(level).length) continue;
    const report = check(level, { limit });
    if (report.ok && report.par >= minPar) return { level, report, seed, tries: n };
  }
  return null;
}
