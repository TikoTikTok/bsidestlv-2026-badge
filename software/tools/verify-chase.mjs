// Proves a timed stage is solvable, and reports its par in ticks.
//
//   node tools/verify-chase.mjs site/stages/queens-gauntlet.js

import { parse, solve, replay, isGoal, hazardCells } from '../site/src/chase.js';

const path = process.argv[2] ?? 'site/stages/queens-gauntlet.js';
const mod = await import(`../${path}`);
const stage = Object.values(mod)[0];
const map = parse(stage);

console.log(`${map.name} - ${map.w}x${map.h}, ${map.start.rocks.length} rocks, ` +
            `${map.hazards.length} hazards, world repeats every ${map.period} ticks`);
for (const hz of map.hazards)
  console.log(`  ${hz.id}: ${hz.cells.length}-tick loop${hz.sight ? `, sight ${hz.sight}` : ''}`);

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

const waits = moves.filter(m => m === 'wait').length;
console.log(`par ${moves.length} ticks (${waits} of them waiting) - ` +
            `${(moves.length * map.tickMs / 1000).toFixed(1)}s at ${map.tickMs}ms/tick`);
console.log(`searched ${explored} nodes, ${states} states, ${ms.toFixed(0)}ms`);

// Timing has to be the difficulty. If the hazards can be ignored, it is just a
// slower version of the untimed stage.
const still = parse({ ...stage, hazards: [] });
const calm = solve(still);
console.log(calm.moves
  ? `hazards: cost ${moves.length - calm.moves.length} extra ticks over an empty room (par ${calm.moves.length})`
  : 'hazards: the room is unsolvable even when empty - fix the map first');

console.log(moves.join(' '));
