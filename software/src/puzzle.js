// Alice in AI Land - puzzle rules and solver.
//
// Pure logic, no DOM: the page imports it to play, and tools/verify-stage.mjs
// imports the same file to prove a stage is solvable before it ships.
//
// Map legend
//   #  wall        .  floor       A  Alice start
//   O  rock        b  button (a rock must end up here)
//   L  lever       G  gate (closed while the lever is up)
//   D  door (the exit, opens once every button is held)

export const DIRS = {
  N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0],
};
const DIR_NAMES = Object.keys(DIRS);

export function parse(rows) {
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

  if (alice === null) throw new Error('map has no Alice start (A)');
  if (door === null) throw new Error('map has no door (D)');
  if (rocks.length !== buttons.size)
    throw new Error(`map has ${rocks.length} rocks but ${buttons.size} buttons`);

  const map = { w, h, walls, buttons, gates, levers, door, rows,
                start: { alice, rocks: rocks.sort((a, b) => a - b), lever: false } };
  map.live = liveSquares(map);
  return map;
}

const key = (s) => `${s.alice}|${s.rocks.join(',')}|${s.lever ? 1 : 0}`;

/**
 * Two positions Alice can walk between without touching anything are the same
 * position as far as the puzzle is concerned, so states are keyed by the
 * lowest cell she can reach rather than the cell she stands on. Without this
 * the search re-explores every step of every walk.
 *
 * The cost of the next walk then depends on where she actually stands, which
 * makes the result near-optimal rather than provably optimal - worth it for
 * two orders of magnitude of search.
 */
function regionKey(map, state, dist) {
  let low = state.alice;
  for (const cell of dist.keys()) if (cell < low) low = cell;
  return `${low}|${state.rocks.join(',')}|${state.lever ? 1 : 0}`;
}

/** A cell Alice or a rock may occupy. Gates are solid until the lever is thrown. */
function open(map, state, i) {
  if (i < 0 || i >= map.w * map.h) return false;
  if (map.walls.has(i)) return false;
  if (map.gates.has(i) && !state.lever) return false;
  return true;
}

export const buttonsHeld = (map, state) => state.rocks.every(r => map.buttons.has(r));
export const isGoal = (map, state) => buttonsHeld(map, state) && state.alice === map.door;

/** Apply one step. Returns the new state, or null if the move is blocked. */
export function step(map, state, dir) {
  const [dx, dy] = DIRS[dir];
  const x = state.alice % map.w, y = (state.alice / map.w) | 0;
  const nx = x + dx, ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) return null;
  const target = ny * map.w + nx;

  // the door only lets Alice in once every button is held
  if (target === map.door && !buttonsHeld(map, state)) return null;
  if (!open(map, state, target) && target !== map.door) return null;

  let rocks = state.rocks;
  const ri = rocks.indexOf(target);
  if (ri !== -1) {
    const bx = nx + dx, by = ny + dy;
    if (bx < 0 || by < 0 || bx >= map.w || by >= map.h) return null;
    const beyond = by * map.w + bx;
    if (!open(map, state, beyond) || beyond === map.door) return null;
    if (rocks.includes(beyond)) return null;                 // no pushing two rocks
    rocks = rocks.map((r, k) => (k === ri ? beyond : r)).sort((a, b) => a - b);
  }

  // stepping onto a lever throws it
  const lever = map.levers.has(target) ? !state.lever : state.lever;
  return { alice: target, rocks, lever };
}

/**
 * Squares a rock can never be pushed off of and onto a button. Found by
 * pulling a rock backwards from every button: if a square is not reachable
 * that way, a rock that lands there is lost, and so is the puzzle.
 *
 * Gates count as open here - the lever can always be thrown later, so assuming
 * they are shut would wrongly condemn squares behind them.
 *
 * This is the single thing that makes the search small enough for a browser
 * tab: on the tea party stage it cuts the explored states by ~20x.
 */
export function liveSquares(map) {
  const { w, h } = map;
  const passable = (i) => i >= 0 && i < w * h && !map.walls.has(i);
  const live = new Set(map.buttons);
  const queue = [...map.buttons];

  while (queue.length) {
    const cell = queue.pop();
    const x = cell % w, y = (cell / w) | 0;
    for (const [dx, dy] of Object.values(DIRS)) {
      const from = (y + dy) * w + (x + dx);          // where the rock came from
      const alice = (y + dy * 2) * w + (x + dx * 2); // where Alice stood to push it
      if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;
      if (x + dx * 2 < 0 || x + dx * 2 >= w || y + dy * 2 < 0 || y + dy * 2 >= h) continue;
      if (!passable(from) || !passable(alice)) continue;
      if (live.has(from)) continue;
      live.add(from);
      queue.push(from);
    }
  }
  return live;
}

/** A rock off the live set can never reach a button, so the state is lost. */
function deadlocked(map, state) {
  for (const r of state.rocks) if (!map.live.has(r)) return true;
  return false;
}

/** Binary min-heap on cost. A linear scan turns Dijkstra into O(n^2). */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v) {
    const a = this.a;
    a.push(v);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= a[i].cost) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].cost < a[m].cost) m = l;
        if (r < a.length && a[r].cost < a[m].cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Where Alice can walk right now, and how far each cell is.
 *
 * Levers are treated as walls for pass-through: stepping on one throws it, so
 * a path that crosses a lever is not a plain walk. Reaching a lever is modelled
 * as its own move below, which keeps this honest without losing any solutions -
 * arriving at the lever is simply a state, and walking on from it is the next.
 */
function reach(map, state) {
  const { w, h } = map;
  const dist = new Map([[state.alice, 0]]);
  const queue = [state.alice];
  const rocks = new Set(state.rocks);
  for (let qi = 0; qi < queue.length; qi++) {
    const cell = queue[qi];
    const x = cell % w, y = (cell / w) | 0;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (dist.has(n) || rocks.has(n) || n === map.door) continue;
      if (!open(map, state, n) || map.levers.has(n)) continue;
      dist.set(n, dist.get(cell) + 1);
      queue.push(n);
    }
  }
  return dist;
}

/** Shortest walk between two cells, as a list of directions. */
function walk(map, state, from, to) {
  if (from === to) return [];
  const { w } = map;
  const prev = new Map([[from, null]]);
  const queue = [from];
  const rocks = new Set(state.rocks);
  for (let qi = 0; qi < queue.length; qi++) {
    const cell = queue[qi];
    if (cell === to) break;
    const x = cell % w, y = (cell / w) | 0;
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
      const n = ny * w + nx;
      if (prev.has(n) || rocks.has(n)) continue;
      // must agree with reach() exactly, or the reconstructed path will contain
      // a move the rules reject: no walking through the door, and a lever may
      // only be stepped on when it is the destination
      const passable = open(map, state, n) && n !== map.door && (!map.levers.has(n) || n === to);
      if (!passable) continue;
      prev.set(n, [cell, dir]);
      queue.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const moves = [];
  for (let c = to; prev.get(c); c = prev.get(c)[0]) moves.unshift(prev.get(c)[1]);
  return moves;
}

/**
 * Search over pushes, not steps.
 *
 * Walking between pushes is not a decision - it is bookkeeping - so the search
 * only branches where the puzzle does: which rock to shove, which way, and when
 * to throw the lever. Dijkstra over real move counts keeps the answer directly
 * comparable to a human's, and the tea party stage drops from ~750k states to
 * a few thousand.
 */
export function solve(map, { limit = 400_000 } = {}) {
  const queue = new MinHeap();
  queue.push({ cost: 0, state: map.start, parent: null, approach: null, lastDir: null });

  // Settled by REGION key, but queued by exact state: working out which region
  // a state belongs to costs a flood fill, so it happens once per node popped
  // rather than once per edge considered. That is the difference between a
  // solver you can put behind a button and one you cannot.
  const settled = new Map();
  let explored = 0;

  while (queue.size && explored < limit) {
    const node = queue.pop();
    const dist = reach(map, node.state);
    const rk = regionKey(map, node.state, dist);
    if (settled.has(rk)) continue;
    settled.set(rk, { cost: node.cost, edge: node });
    explored++;

    // finished: every button held and Alice can walk to the door
    if (buttonsHeld(map, node.state)) {
      const x = map.door % map.w, y = (map.door / map.w) | 0;
      for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
        const approach = (y - dy) * map.w + (x - dx);
        if (!dist.has(approach)) continue;
        const moves = rebuild(map, node);
        moves.push(...walk(map, node.state, node.state.alice, approach), dir);
        return { moves, explored, states: settled.size };
      }
    }

    const relax = (next, approach, lastDir, cost) =>
      queue.push({ cost, state: next, parent: node, approach, lastDir });

    // throw a lever
    for (const lever of map.levers) {
      const x = lever % map.w, y = (lever / map.w) | 0;
      for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
        const approach = (y - dy) * map.w + (x - dx);
        if (!dist.has(approach)) continue;
        relax({ alice: lever, rocks: node.state.rocks, lever: !node.state.lever },
              approach, dir, node.cost + dist.get(approach) + 1);
        break;
      }
    }

    // push a rock
    for (const rock of node.state.rocks) {
      const x = rock % map.w, y = (rock / map.w) | 0;
      for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
        const behind = (y - dy) * map.w + (x - dx);
        const ahead = (y + dy) * map.w + (x + dx);
        if (!dist.has(behind)) continue;
        if (!open(map, node.state, ahead) || ahead === map.door) continue;
        if (node.state.rocks.includes(ahead) || !map.live.has(ahead)) continue;
        const rocks = node.state.rocks.map(r => (r === rock ? ahead : r)).sort((a, b) => a - b);
        relax({ alice: rock, rocks, lever: node.state.lever },
              behind, dir, node.cost + dist.get(behind) + 1);
      }
    }
  }
  return { moves: null, explored, states: settled.size };
}

/** Turn the chain of kept edges back into a move list. */
function rebuild(map, node) {
  const chain = [];
  for (let n = node; n && n.parent; n = n.parent) chain.unshift(n);
  const moves = [];
  for (const edge of chain)
    moves.push(...walk(map, edge.parent.state, edge.parent.state.alice, edge.approach), edge.lastDir);
  return moves;
}

/** Replay a move list, returning every state along the way. */
export function replay(map, moves) {
  const path = [map.start];
  let state = map.start;
  for (const dir of moves) {
    const next = step(map, state, dir);
    if (!next) throw new Error(`move ${dir} is illegal at step ${path.length - 1}`);
    state = next;
    path.push(state);
  }
  return path;
}
