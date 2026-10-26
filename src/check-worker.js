// Alice in AI Land - the level maker's checker, off the page's thread.
//
// A big room can take the solver seconds; the maker asks here so the grid
// stays live. One message in (a level), one out (what src/level.js's check()
// says about it). The maker falls back to calling check() inline when a
// worker cannot be made.

import { check } from './level.js';

onmessage = (e) => {
  try { postMessage({ id: e.data.id, report: check(e.data.level) }); }
  catch (err) { postMessage({ id: e.data.id, report: { ok: false, problems: [err.message] } }); }
};
