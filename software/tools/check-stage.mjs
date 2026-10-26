#!/usr/bin/env node
// What the level maker's Check says, from the command line - and what CI
// says about a community room before it ships.
//
//   npm run stage -- stages/community/my-room.js
//   node software/tools/check-stage.mjs stages/tea-party.js stages/queens-gauntlet.js
//
// Untimed rooms go to src/puzzle.js's solver, timed ones (hazards or a
// tickMs) to src/chase.js's - the same choice maker.html makes - through
// src/level.js, so the three agree to the move. Exit 1 if any room is
// malformed or unsolvable.

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { lint, check, kindOf } from '../../src/level.js';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: check-stage.mjs <stage.js> [...]'); process.exit(2); }

let failed = 0;
for (const file of files) {
  let stage;
  try {
    const mod = await import(pathToFileURL(resolve(file)).href);
    stage = Object.values(mod).find(v => v && typeof v === 'object' && Array.isArray(v.rows));
    if (!stage) throw new Error('exports no stage (an object with rows)');
  } catch (e) { console.error(`${file}: ${e.message}`); failed++; continue; }

  const kind = kindOf(stage);
  console.log(`${file}: ${JSON.stringify(stage.name)} - ${stage.rows[0]?.length}x${stage.rows.length}, ${kind === 'chase' ? `timed at ${stage.tickMs ?? 320} ms, ${stage.hazards?.length ?? 0} hazard(s)` : 'untimed'}`);
  const problems = lint(stage);
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (problems.length) { failed++; continue; }
  const r = check(stage);
  if (!r.ok) { for (const p of r.problems) console.error(`  ✗ ${p}`); failed++; continue; }
  console.log(`  ✓ solvable: par ${r.par} ${kind === 'chase' ? 'ticks' : 'moves'} (${r.explored} states, ${r.ms} ms)`);
  for (const n of r.notes) console.log(`  · ${n}`);
  console.log(`  ${r.moves.join(' ')}`);
}
process.exit(failed ? 1 : 0);
