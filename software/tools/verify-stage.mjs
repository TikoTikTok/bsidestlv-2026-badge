// Proves a stage is solvable and reports the shortest solution.
//
// This is the acceptance test from docs/GAME_DESIGN.md: a stage that the
// reference solver cannot clear does not ship.
//
//   node tools/verify-stage.mjs site/stages/tea-party.js

import { parse, solve, replay, isGoal } from '../site/src/puzzle.js';

const path = process.argv[2] ?? 'site/stages/tea-party.js';
const mod = await import(`../${path}`);
const stage = Object.values(mod)[0];
const map = parse(stage.rows);

console.log(`${stage.name} - ${map.w}x${map.h}, ${map.start.rocks.length} rocks, ` +
            `${map.buttons.size} buttons, ${map.gates.size} gate(s), ${map.levers.size} lever(s)`);

const t0 = performance.now();
const { moves, explored, states } = solve(map);
const ms = performance.now() - t0;

if (!moves) {
  console.error(`UNSOLVABLE - explored ${explored} states in ${ms.toFixed(0)}ms`);
  process.exit(1);
}

const path_ = replay(map, moves);
if (!isGoal(map, path_.at(-1))) {
  console.error('solver returned a path that does not reach the goal');
  process.exit(1);
}

console.log(`solved in ${moves.length} moves (${ms.toFixed(0)}ms, ${explored} nodes, ${states} states)`);

// Is the gate load-bearing, or decoration? Weld it shut and see whether the
// stage still falls over. "The solver happened to use it" is not the same
// thing - a route that merely exists is not a puzzle.
if (map.gates.size) {
  const welded = parse(stage.rows.map(r => r.replace(/G/g, '#').replace(/L/g, '.')));
  const alt = solve(welded);
  console.log(alt.moves
    ? `gate: DECORATION - still solvable in ${alt.moves.length} moves with the gate welded shut`
    : 'gate: load-bearing - unsolvable when welded shut');
}

// Same question for each rock: is any of them a spare?
console.log(moves.join(' '));
