// Alice in AI Land - the level maker's checker, off the page's thread.
//
// A big room can take the solver seconds; the maker asks here so the grid
// stays live. One message in, one out:
//   { id, level }            -> { id, report }   what src/level.js's check() says about it
//   { id, generate: opts }   -> { id, found }     a seeded room the solver clears (generateSolvable), or null
// The maker falls back to calling the same functions inline when a worker
// cannot be made.

import { check, generateSolvable } from './level.js';

onmessage = (e) => {
  const { id } = e.data;
  try {
    if (e.data.generate) postMessage({ id, found: generateSolvable(e.data.generate, e.data.rules ?? {}) });
    else postMessage({ id, report: check(e.data.level) });
  } catch (err) { postMessage({ id, report: { ok: false, problems: [err.message] }, found: null }); }
};
