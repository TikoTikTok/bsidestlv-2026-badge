// Alice in AI Land - timed stages, where the room moves on its own clock.
//
// The difference from src/puzzle.js is time. Every tick the hazards advance one
// step along fixed loops, so a plan is not just a route - it is a schedule. A
// corridor that is safe now is fatal three ticks later, and standing still is a
// real move with a real cost.
//
// Hazards are deterministic and periodic, which is what keeps this searchable:
// the world's whole future is (phase mod cycle length), so a state is
// (Alice, rocks, lever, phase) and breadth-first search over it returns the
// fewest ticks - the exact number a human would have to hit without a mistake.
//
// Map legend
//   #  wall     .  floor    A  Alice     O  rock
//   b  button   L  lever    G  gate      D  door

export const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
export const ACTIONS = ['N', 'S', 'W', 'E', 'wait'];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;

/** Walk a closed route, one cell per tick, and return the cell for every tick. */
function cycleOf(route, w) {
  const cells = [];
  for (let i = 0; i < route.length; i++) {
    const [ax, ay] = route[i];
    const [bx, by] = route[(i + 1) % route.length];
    const steps = Math.abs(bx - ax) + Math.abs(by - ay);
    const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    for (let s = 0; s < steps; s++) cells.push((ay + dy * s) * w + (ax + dx * s));
  }
  return cells;
}

export function parse(stage) {
  const rows = stage.rows;
  const w = rows[0].length, h = rows.length;
  const walls = new Set(), buttons = new Set(), gates = new Set(), levers = new Set();
  let alice = null, door = null;
  const rocks = [];

  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const i = y * w + x;
    if (ch === '#') walls.add(i);
    else if (ch === 'b') buttons.add(i);
    else if (ch === 'G') gates.add(i);
    else if (ch === 'L') levers.add(i);
    else if (ch === 'D') door = i;
    else if (ch === 'A') alice = i;
    else if (ch === 'O') rocks.push(i);
  }));
  if (alice === null || door === null) throw new Error('map needs an A and a D');
  if (rocks.length !== buttons.size) throw new Error('rocks and buttons must match');

  const hazards = (stage.hazards ?? []).map(hz => ({
    ...hz,
    cells: cycleOf(hz.route, w),
  }));
  const period = hazards.reduce((acc, hz) => lcm(acc, hz.cells.length), 1);

  return { w, h, rows, walls, buttons, gates, levers, door, hazards, period,
           sight: stage.sight ?? 0, tickMs: stage.tickMs ?? 320, name: stage.name,
           start: { alice, rocks: rocks.sort((a, b) => a - b), lever: false, phase: 0 } };
}

export const key = (s) => `${s.alice}|${s.rocks.join(',')}|${s.lever ? 1 : 0}|${s.phase}`;
export const buttonsHeld = (map, s) => s.rocks.every(r => map.buttons.has(r));
export const isGoal = (map, s) => buttonsHeld(map, s) && s.alice === map.door;

export const hazardAt = (map, hz, phase) => hz.cells[phase % hz.cells.length];

/** Where each hazard stands on a given tick. */
export function hazardCells(map, phase) {
  return map.hazards.map(hz => ({ hz, cell: hazardAt(map, hz, phase) }));
}

function passable(map, state, i) {
  if (i < 0 || i >= map.w * map.h) return false;
  if (map.walls.has(i)) return false;
  if (map.gates.has(i) && !state.lever) return false;
  return true;
}

/**
 * The Queen does not need to touch Alice. She looks along the way she is
 * walking, and a straight line of open floor between them is enough.
 */
export function seenBy(map, hz, phase, alice) {
  if (!hz.sight) return false;
  const here = hazardAt(map, hz, phase);
  const next = hazardAt(map, hz, phase + 1);
  const dx = Math.sign((next % map.w) - (here % map.w));
  const dy = Math.sign(((next / map.w) | 0) - ((here / map.w) | 0));
  if (!dx && !dy) return false;
  let x = (here % map.w) + dx, y = ((here / map.w) | 0) + dy;
  for (let n = 0; n < hz.sight; n++, x += dx, y += dy) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const i = y * map.w + x;
    if (map.walls.has(i)) return false;
    if (i === alice) return true;
  }
  return false;
}

/** Did this tick kill her? Sharing a cell, being walked into, or being seen. */
function caught(map, state, previousAlice, previousPhase) {
  for (const hz of map.hazards) {
    const now = hazardAt(map, hz, state.phase);
    const before = hazardAt(map, hz, previousPhase);
    if (now === state.alice) return true;                      // walked into her
    if (now === previousAlice && before === state.alice) return true;  // swapped past
    if (seenBy(map, hz, state.phase, state.alice)) return true;
  }
  return false;
}

/** One tick: Alice acts, then the room moves. Returns null if she dies. */
export function step(map, state, action) {
  const phase = (state.phase + 1) % map.period;
  let alice = state.alice, rocks = state.rocks, lever = state.lever;

  if (action !== 'wait') {
    const [dx, dy] = DIRS[action];
    const x = alice % map.w, y = (alice / map.w) | 0;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) return null;
    const target = ny * map.w + nx;

    if (target === map.door && !buttonsHeld(map, state)) return null;
    if (target !== map.door && !passable(map, state, target)) return null;

    const ri = rocks.indexOf(target);
    if (ri !== -1) {
      const beyond = (ny + dy) * map.w + (nx + dx);
      if (nx + dx < 0 || ny + dy < 0 || nx + dx >= map.w || ny + dy >= map.h) return null;
      if (!passable(map, state, beyond) || beyond === map.door) return null;
      if (rocks.includes(beyond)) return null;
      // a hazard standing there blocks the shove
      if (hazardCells(map, phase).some(({ cell }) => cell === beyond)) return null;
      rocks = rocks.map((r, k) => (k === ri ? beyond : r)).sort((a, b) => a - b);
    }
    if (map.levers.has(target)) lever = !lever;
    alice = target;
  }

  const next = { alice, rocks, lever, phase };
  if (caught(map, next, state.alice, state.phase)) return null;
  return next;
}

/**
 * Fewest ticks to finish. Uniform cost, so plain breadth-first is optimal, and
 * the answer doubles as the stage's par: a player has to match this number of
 * correct inputs, each inside one tick.
 */
export function solve(map, start = map.start, { limit = 1_500_000 } = {}) {
  if (isGoal(map, start)) return { moves: [], explored: 0 };
  const seen = new Set([key(start)]);
  let frontier = [{ state: start, action: null, parent: null }];
  let explored = 0;

  while (frontier.length && explored < limit) {
    const next = [];
    for (const node of frontier) {
      explored++;
      for (const action of ACTIONS) {
        const s = step(map, node.state, action);
        if (!s) continue;
        const k = key(s);
        if (seen.has(k)) continue;
        seen.add(k);
        const child = { state: s, action, parent: node };
        if (isGoal(map, s)) {
          const moves = [];
          for (let n = child; n && n.action; n = n.parent) moves.push(n.action);
          return { moves: moves.reverse(), explored, states: seen.size };
        }
        next.push(child);
      }
    }
    frontier = next;
  }
  return { moves: null, explored, states: seen.size };
}

/** Replay a plan, returning every state - used to prove a solution is legal. */
export function replay(map, moves, start = map.start) {
  const path = [start];
  let state = start;
  for (const [i, action] of moves.entries()) {
    const next = step(map, state, action);
    if (!next) throw new Error(`action ${action} is illegal or fatal at tick ${i}`);
    state = next;
    path.push(state);
  }
  return path;
}
