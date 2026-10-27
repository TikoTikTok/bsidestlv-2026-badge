// Alice in AI Land - the level maker page (maker.html).
//
// Two faces, one page, decided by where it is served from (the same answer
// as the gate's: src/gate.js gateMode, src/look-boot.js data-host):
//
//   the site    the landing: a room painting itself in the hero, what a stage
//               is, how to get the maker, and the invitation - a prompt for
//               an assistant with a copy button. Nothing here plays.
//   a checkout  the landing and, under it, the studio: a grid editor over the
//               game's own art (src/scene.js) with a pencil, a line, a
//               rectangle, a fill and a pick, mirrored strokes, the room
//               flipped, turned or moved, undo and redo, overlays from the
//               solver's bookkeeping (where a rock is lost, Alice's reach,
//               the solution's path, the cast's sight), starters, a seeded
//               generator, a shelf of rooms; a checker that runs the real
//               solvers (src/level.js, in a worker) and says how hard; Run &
//               debug - the room played with a simulated badge the keyboard,
//               a click or a real badge drives, every edge logged; the export
//               that writes the stage module a pull request carries; the
//               assistant panel, where whoever is on the bridge (src/bridge.js)
//               talks and is seen working; and the tutorial "Painting the
//               Roses" (src/tutor.js MAKER_TUTORIAL, src/coach.js).
//
// The keyboard plays here, and only here: the Pad is built with every source
// on a dev host (src/pad.js sourcesFor), on the site it is not built at all.
// A room is kept in localStorage (alice.maker.level) between visits, the
// shelf under alice.maker.shelf, and a room can travel in a link (?level=,
// src/level.js encodeShare).

import { Pad, sourcesFor, KEYS, BUTTONS } from './pad.js';
import { gateMode } from './gate.js';
import { initLooks } from './looks.js';
import { tilt } from './tilt.js';
import { TILE, THEMES, HAZARD_CAST, loadScene, drawCell, drawRoom } from './scene.js';
import { parse as parseTea, step as teaStep, isGoal as teaGoal } from './puzzle.js';
import { parse as parseChase, step as chaseStep, isGoal as chaseGoal, seenBy } from './chase.js';
import { CHARS, BRUSHES, kindOf, blank, setCell, resize, lint, check, toModule, fromModule, normalize,
         idOf, encodeShare, decodeShare, lineCells, rectCells, regionCells, paintCells, mirrorCells,
         flipH, flipV, rotate, shift, analyse, difficulty, STARTERS, generateSolvable } from './level.js';
import { MAKER_TUTORIAL, Tutor } from './tutor.js';
import { mountCoach, tutorStore } from './coach.js';
import { connectBridge } from './bridge.js';

const $ = (sel) => document.querySelector(sel);
const mode = gateMode();
const dev = mode === 'dev';

initLooks();

// ------------------------------------------------------------ the repository ----
// The site is served from <owner>.github.io/<repo>/, so the repository the
// visitor should clone is in the address. A checkout, or any other host,
// points at the project's own.

const UPSTREAM = 'https://github.com/bsidestlv/bsidestlv-2026-badge';
export function repoUrlFor(loc = location) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc.hostname);
  const seg = loc.pathname.split('/').filter(Boolean)[0];
  if (m && seg && !/\.html$/.test(seg)) return `https://github.com/${m[1]}/${seg}`;
  return UPSTREAM;
}
const repo = repoUrlFor();
$('#repoClone').textContent = repo;
$('#docsLink').href = `${repo}/blob/main/software/docs/LEVEL_MAKER.md`;

/** The prompt a visitor hands to an assistant. It goes to the repository, which is readable; this site is not meant to be. */
export const aiPrompt = (repoUrl) => `Help me build a level for "Alice in AI Land", the BSidesTLV 2026 badge puzzle game - with me, in its level studio, not on your own.

1. Clone ${repoUrl} and read software/docs/LEVEL_MAKER.md: the stage format, the rules the checker applies, how a room gets onto the site, and the bridge you drive the studio through.
2. Run \`npm run maker\` in the clone (Node 20+, no dependencies). It serves the checkout on http://localhost:8080, opens maker.html - the studio - in my browser, and mounts the bridge at http://localhost:8080/__maker/ (loopback only). Open the page yourself if it is not open.
3. Connect to the studio. If you have MCP, the clone's .mcp.json registers the server \`alice-maker\` (node software/tools/maker-mcp.mjs): maker_status, maker_get, maker_set_level, maker_paint, maker_check, maker_play, maker_moves, maker_snapshot, maker_say, maker_read_chat, maker_generate, maker_module and more. Without MCP, the same over HTTP: POST http://localhost:8080/__maker/rpc with {"op": "get" | "set" | "paint" | "check" | "play" | "moves" | "say" | "snapshot" | "generate" | "module" | "load" | "tool", "args": {...}}; GET /__maker/inbox?since=0&wait=20000 is what I type in the page's chat. Say hello first (POST /__maker/hello {"name": "..."}) so the page shows you are here.
4. Design the room with me. Ask in the page's chat what I want: how big, how many rocks, a gate and lever or not, timed with a cast walking loops or not, which dressing (garden, hall, court). Then work on the board where I can watch: set or paint the room, Check it (the real solver: par, whether the gate is load-bearing, how hard), play the solution so I see it, take a snapshot to see what I see, and iterate on what I say. Tell me what you are doing in the chat as you go.
5. When we are happy, export the module (maker_module, or op "module"), save it as stages/community/<id>.js, add one line to stages/community/index.json, and run \`npm run stage -- stages/community/<id>.js\` to see what CI will say.
6. Commit on a branch and open a pull request against ${repoUrl} with the stage and the index line. Describe the room in a sentence; the checks prove it solves.`;

{
  const dialog = $('#aiDialog');
  const text = aiPrompt(repo);
  $('#aiPrompt').value = text;
  $('#aiClaude').href = `https://claude.ai/new?q=${encodeURIComponent(text)}`;
  $('#aiChatGPT').href = `https://chatgpt.com/?q=${encodeURIComponent(text)}`;
  const say = (s) => { $('#aiStatus').textContent = s; setTimeout(() => { $('#aiStatus').textContent = ''; }, 1500); };
  const open = () => { tilt.request?.(); dialog.showModal(); };
  $('#aiBtn').addEventListener('click', open);
  $('#aiBtn2')?.addEventListener('click', open);
  $('#aiClose').addEventListener('click', () => dialog.close());
  $('#aiCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); say('copied'); }
    catch { $('#aiPrompt').select(); say('select and copy'); }
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}

// ------------------------------------------------------------------ the hero ----
// A small room paints itself a row at a time, Alice walks the solution the
// solver found just now, the room fades and comes back in the next dressing.
// The same renderer the stages use; nothing is a recording.

const HERO = {
  name: 'The Hero Room',
  rows: [
    '###########',
    '#A..#....b#',
    '#.O.G.....#',
    '#...#.##..#',
    '#.L.#.b.O.#',
    '#...#....D#',
    '###########',
  ],
};
const scene = await loadScene();

{
  const canvas = $('#heroCanvas');
  const ctx = canvas.getContext('2d');
  const map = parseTea(HERO.rows);
  canvas.width = map.w * TILE; canvas.height = map.h * TILE;
  const moves = check(HERO).moves ?? [];
  const dressings = ['garden', 'hall', 'court'];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dressing = 0, phase = 'paint', t0 = performance.now(), state = map.start, at = 0, facing = 'S', alpha = 1;

  function frame(now) {
    const theme = THEMES[dressings[dressing]];
    const dt = now - t0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = alpha;
    if (phase === 'paint') {
      const rows = still ? map.h : Math.min(map.h, 1 + Math.floor(dt / 110));
      drawRoom(ctx, scene, map, state, theme, { now, facing, onlyRows: rows });
      if (rows >= map.h && dt > map.h * 110 + 500) { phase = still ? 'hold' : 'walk'; t0 = now; }
    } else if (phase === 'walk') {
      while (at < moves.length && dt > (at + 1) * 170) { const n = teaStep(map, state, moves[at]); facing = moves[at]; if (n) state = n; at++; }
      drawRoom(ctx, scene, map, state, theme, { now, facing, walking: at < moves.length, beatMs: 170 });
      if (at >= moves.length) { phase = 'hold'; t0 = now; }
    } else if (phase === 'hold') {
      drawRoom(ctx, scene, map, state, theme, { now, facing });
      if (!still && dt > 1800) { phase = 'fade'; t0 = now; }
    } else {
      alpha = Math.max(0, 1 - dt / 500);
      drawRoom(ctx, scene, map, state, theme, { now, facing });
      if (alpha === 0) { alpha = 1; dressing = (dressing + 1) % dressings.length; phase = 'paint'; t0 = now; state = map.start; at = 0; facing = 'S'; }
    }
    ctx.globalAlpha = 1;
    if (!(still && phase === 'hold')) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ================================================================= the studio ====
// Everything from here is the checkout's. On the site the elements are hidden
// (class dev-only) and this module stops.

if (!dev) {
  window.__maker = { dev: false, repo, prompt: aiPrompt(repo) };
} else {

const pad = new Pad({ sources: sourcesFor(true) }).start();
window.__pad = pad;

// the header says which controller is in use, as the range does
const padDevice = $('#padDevice');
setInterval(() => {
  const d = pad.device;
  padDevice.textContent = d ? (d.badge ? 'the badge' : d.id.slice(0, 32)) : 'keyboard';
  padDevice.classList.toggle('on', !!d?.badge);
}, 500);

const STORE = 'alice.maker.level';
const AUTHOR = 'alice.maker.author';
const SHELF = 'alice.maker.shelf';
const PREFS = 'alice.maker.prefs';
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage may be off */ } };
const loadJson = (k, or) => { const s = load(k); if (!s) return or; try { return JSON.parse(s); } catch { return or; } };

// the tutorial: every event the studio produces goes through here
const tutor = new Tutor(MAKER_TUTORIAL, tutorStore('alice.tutor.maker'));
let coach = null;
const tell = (what, extra = {}) => coach?.feed({ ...extra, kind: 'maker', what });

// ---------------------------------------------------------------- the level ----

let level = null;
let past = [];                 // levels before each edit, for Ctrl+Z
let future = [];               // levels undone, for Ctrl+Y
let brush = '#';
let tool = 'pencil';           // pencil | line | rect | fill | pick
let symmetry = 'none';         // none | h | v | both
let hazardPick = -1;           // index of the hazard whose route clicks lay, or -1
let playing = false;
let report = null;             // the checker's last word on this level
let analysis = null;           // analyse(level, report): the overlays' data
let cell = 48;                 // how big a cell is drawn, px
let bridge = null;             // the assistant's bridge (src/bridge.js), connected once the studio exists
const prefs = Object.assign({ overlays: { grid: true, coords: false, stuck: true, reach: false, path: true, sight: false }, zoom: 48, autoCheck: false }, loadJson(PREFS, {}));
const overlays = prefs.overlays;
cell = prefs.zoom;
const savePrefs = () => save(PREFS, JSON.stringify(prefs));

/** Every change goes through here: history, storage, the views, the bridge, the tutorial. */
function setLevel(next, { remember = true, reset = false, why = 'edit' } = {}) {
  if (reset) { past = []; future = []; }
  else if (level && remember) { past.push(level); future = []; if (past.length > 200) past.shift(); }
  level = normalize(next);
  if (next.hazards?.length === 0) delete level.hazards;
  report = null;
  save(STORE, JSON.stringify(level));
  render();
  const problems = lint(level);
  tell('lint', { ok: !problems.length, problems, why });
  if (prefs.autoCheck && !problems.length) autoCheckSoon();
}
function undoEdit() { if (past.length) { future.push(level); level = past.pop(); report = null; save(STORE, JSON.stringify(level)); render(); } }
function redoEdit() { if (future.length) { past.push(level); level = future.pop(); report = null; save(STORE, JSON.stringify(level)); render(); } }

// ----------------------------------------------------------------- the views ----

const board = $('#board'), bctx = board.getContext('2d');
const ascii = $('#ascii');
const hazardsEl = $('#hazards');
const cursorEl = $('#boardCursor');

// the brushes: a swatch of the tile each one paints, drawn from the sheet
const BRUSH_KEYS = { '#': '1', '.': '2', A: '3', O: '4', b: '5', L: '6', G: '7', D: '8' };
for (const ch of BRUSHES) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'brush'; b.dataset.ch = ch;
  const c = document.createElement('canvas'); c.width = c.height = TILE;
  const cx = c.getContext('2d');
  drawCell(cx, scene, THEMES.garden, ch, 1, 1, TILE);
  cx.drawImage(scene.tiles.images[({ b: 'button_heart_up', L: 'lever_up', D: 'door_heart_closed', G: 'hedge_post_left' })[ch]] ?? c, 0, 0, TILE, TILE);
  if (ch === 'O') cx.drawImage(scene.items.images.rock_pair, 0, 0, TILE, TILE);
  if (ch === 'A') cx.drawImage(scene.byId.alice2.images.S[0], 0, 0, TILE, TILE);
  b.append(c, document.createTextNode(CHARS[ch]), Object.assign(document.createElement('kbd'), { textContent: BRUSH_KEYS[ch] }));
  b.addEventListener('click', () => setBrush(ch));
  $('#palette').append(b);
}
function setBrush(ch) { brush = ch; hazardPick = -1; if (tool === 'pick') setTool('pencil'); render(); tell('brush', { ch }); }
function setTool(t) { tool = t; hazardPick = -1; for (const b of document.querySelectorAll('#tools .tool')) b.classList.toggle('on', b.dataset.tool === t); board.dataset.tool = t; tell('tool', { tool: t, used: false }); }
function setSymmetry(s) { symmetry = s; for (const b of document.querySelectorAll('#symmetry .tool')) b.classList.toggle('on', b.dataset.sym === s); tell('symmetry', { symmetry: s }); drawEdit(); }

const dims = () => ({ w: Math.max(...level.rows.map(r => r.length)), h: level.rows.length });
const cssVar = (name, or) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || or;

let ghost = null;   // the cells a line or rectangle stroke would paint, while the pointer is down

function drawEdit() {
  const { w, h } = dims();
  board.width = w * cell; board.height = h * cell;
  const theme = THEMES[level.theme] ?? THEMES.garden;
  bctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = level.rows[y][x] ?? '.';
    const px = x * cell, py = y * cell;
    drawCell(bctx, scene, theme, ch in CHARS ? ch : '.', x, y, cell);
    const over = { G: theme.gateClosed, L: 'lever_up', b: 'button_heart_up', D: 'door_heart_closed' }[ch];
    if (over) bctx.drawImage(scene.tiles.images[over], px, py, cell, cell);
    if (ch === 'O') bctx.drawImage(scene.items.images.rock_pair, px, py, cell, cell);
    if (ch === 'A') bctx.drawImage(scene.byId.alice2.images.S[0], px, py, cell, cell);
    if (!(ch in CHARS)) { bctx.fillStyle = 'rgba(244,121,141,.55)'; bctx.fillRect(px, py, cell, cell); }
  }
  const accent = cssVar('--accent', '#6fb0f0'), hot = cssVar('--hot', '#f4798d'), good = cssVar('--accent-2', '#3fd6a3');
  // the solver's bookkeeping, over the room
  if (analysis) {
    if (overlays.stuck) {
      bctx.fillStyle = 'rgba(244,121,141,.28)';
      for (const i of analysis.stuck) { const x = i % w, y = (i / w) | 0; if (level.rows[y][x] === '.' || level.rows[y][x] === 'O' || level.rows[y][x] === 'L') hatch(x, y, hot); }
    }
    if (overlays.reach) {
      bctx.fillStyle = 'rgba(111,176,240,.22)';
      for (const i of analysis.reach) bctx.fillRect((i % w) * cell, ((i / w) | 0) * cell, cell, cell);
    }
    if (overlays.path && analysis.path?.length > 1) {
      bctx.strokeStyle = good; bctx.lineWidth = Math.max(2, cell / 12); bctx.lineJoin = 'round'; bctx.lineCap = 'round'; bctx.globalAlpha = .85;
      bctx.beginPath();
      analysis.path.forEach((i, n) => bctx[n ? 'lineTo' : 'moveTo']((i % w) * cell + cell / 2, ((i / w) | 0) * cell + cell / 2));
      bctx.stroke(); bctx.globalAlpha = 1;
    }
  }
  if (overlays.sight && kindOf(level) === 'chase' && !lint(level).length) {
    try {
      const map = parseChase(level);
      bctx.fillStyle = 'rgba(226,64,84,.22)';
      for (const hz of map.hazards) { if (!hz.sight) continue; for (let i = 0; i < w * h; i++) if (seenBy(map, hz, 0, i)) bctx.fillRect((i % w) * cell, ((i / w) | 0) * cell, cell, cell); }
    } catch { /* a route the lint missed */ }
  }
  // the grid, faint; the coordinates, fainter
  if (overlays.grid) {
    bctx.strokeStyle = 'rgba(255,255,255,.08)'; bctx.lineWidth = 1;
    for (let x = 1; x < w; x++) { bctx.beginPath(); bctx.moveTo(x * cell + .5, 0); bctx.lineTo(x * cell + .5, h * cell); bctx.stroke(); }
    for (let y = 1; y < h; y++) { bctx.beginPath(); bctx.moveTo(0, y * cell + .5); bctx.lineTo(w * cell, y * cell + .5); bctx.stroke(); }
  }
  if (overlays.coords && cell >= 32) {
    bctx.fillStyle = 'rgba(255,255,255,.45)'; bctx.font = `${Math.max(8, cell / 5)}px monospace`; bctx.textAlign = 'left'; bctx.textBaseline = 'top';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bctx.fillText(`${x},${y}`, x * cell + 2, y * cell + 2);
  }
  // the mirror lines
  if (symmetry !== 'none') {
    bctx.strokeStyle = accent; bctx.setLineDash([4, 6]); bctx.lineWidth = 1;
    if (symmetry !== 'v') { bctx.beginPath(); bctx.moveTo(w * cell / 2, 0); bctx.lineTo(w * cell / 2, h * cell); bctx.stroke(); }
    if (symmetry !== 'h') { bctx.beginPath(); bctx.moveTo(0, h * cell / 2); bctx.lineTo(w * cell, h * cell / 2); bctx.stroke(); }
    bctx.setLineDash([]);
  }
  // a stroke in progress
  if (ghost) {
    bctx.fillStyle = 'rgba(255,255,255,.35)';
    for (const [x, y] of ghost) bctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
  }
  // the routes: a loop per hazard, its character at the first point, numbered corners
  (level.hazards ?? []).forEach((hz, n) => {
    const on = n === hazardPick;
    const pts = hz.route;
    if (!pts.length) return;
    bctx.strokeStyle = on ? accent : hot; bctx.lineWidth = on ? 4 : 2.5; bctx.setLineDash(on ? [] : [6, 6]);
    bctx.beginPath();
    pts.forEach(([x, y], i) => bctx[i ? 'lineTo' : 'moveTo'](x * cell + cell / 2, y * cell + cell / 2));
    if (pts.length > 2) bctx.closePath();
    else if (pts.length === 2) bctx.lineTo(pts[0][0] * cell + cell / 2, pts[0][1] * cell + cell / 2);
    bctx.stroke(); bctx.setLineDash([]);
    pts.forEach(([x, y], i) => {
      bctx.fillStyle = on ? accent : hot;
      bctx.beginPath(); bctx.arc(x * cell + cell / 2, y * cell + cell / 2, Math.max(7, cell / 5), 0, Math.PI * 2); bctx.fill();
      bctx.fillStyle = '#05080f'; bctx.font = `bold ${Math.max(9, cell / 4.5)}px monospace`; bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
      bctx.fillText(String(i + 1), x * cell + cell / 2, y * cell + cell / 2 + .5);
    });
    const who = scene.byId[hz.character ?? hz.id];
    if (who) { bctx.globalAlpha = .9; bctx.drawImage(who.images.S[0], pts[0][0] * cell, pts[0][1] * cell - cell / 5, cell, cell); bctx.globalAlpha = 1; }
  });

  function hatch(x, y, colour) {
    bctx.save(); bctx.beginPath(); bctx.rect(x * cell, y * cell, cell, cell); bctx.clip();
    bctx.strokeStyle = colour; bctx.globalAlpha = .45; bctx.lineWidth = 2;
    for (let k = -cell; k < cell * 2; k += 8) { bctx.beginPath(); bctx.moveTo(x * cell + k, y * cell); bctx.lineTo(x * cell + k + cell, y * cell + cell); bctx.stroke(); }
    bctx.restore();
  }
}

function renderHazards() {
  hazardsEl.textContent = '';
  (level.hazards ?? []).forEach((hz, n) => {
    const row = document.createElement('div');
    row.className = 'hazard' + (n === hazardPick ? ' on' : '');
    const who = document.createElement('select');
    for (const c of HAZARD_CAST) who.append(new Option(c.label, c.id, false, (hz.character ?? hz.id) === c.id));
    who.addEventListener('change', () => edit(n, (h) => { const c = HAZARD_CAST.find(c => c.id === who.value); h.id = uniqueId(c.id, n); h.character = c.id; if (!('sight' in h) || !h.sight) h.sight = c.sight; }));
    const sight = document.createElement('label');
    sight.append('sight ', Object.assign(document.createElement('input'), { type: 'number', min: 0, max: 8, value: hz.sight ?? 0 }));
    sight.lastChild.addEventListener('change', (e) => edit(n, (h) => { h.sight = +e.target.value; }));
    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 'btn' + (n === hazardPick ? '' : ' ghost');
    pick.textContent = n === hazardPick ? 'laying the route…' : 'lay the route';
    pick.addEventListener('click', () => { hazardPick = hazardPick === n ? -1 : n; render(); });
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'btn ghost'; back.textContent = 'drop a point';
    back.addEventListener('click', () => edit(n, (h) => { h.route = h.route.slice(0, -1); }));
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn ghost'; del.textContent = '✕';
    del.addEventListener('click', () => { const hazards = level.hazards.filter((_, i) => i !== n); hazardPick = -1; setLevel({ ...level, hazards }); });
    const route = document.createElement('span');
    route.className = 'route';
    route.textContent = hz.route.length ? `route ${hz.route.map(([x, y]) => `${x},${y}`).join(' → ')} → back` : 'no route yet: click the cells it walks between, in order';
    row.append(who, sight, pick, back, del, route);
    hazardsEl.append(row);
  });
  function edit(n, fn) { const hazards = level.hazards.map(h => ({ ...h, route: [...h.route] })); fn(hazards[n]); setLevel({ ...level, hazards }); }
}
function uniqueId(base, except) {
  const taken = new Set((level.hazards ?? []).filter((_, i) => i !== except).map(h => h.id));
  let id = base; for (let k = 2; taken.has(id); k++) id = `${base}${k}`;
  return id;
}

function render() {
  const kind = kindOf(level);
  $('#name').value = level.name;
  const { w, h } = dims();
  $('#editName').textContent = `${w}×${h} · ${kind === 'chase' ? `timed, ${level.tickMs ?? 320} ms a tick` : 'untimed'}`;
  $('#width').value = w; $('#height').value = h;
  $('#theme').value = level.theme ?? 'garden';
  $('#kind').value = kind;
  $('#tickField').hidden = kind !== 'chase';
  $('#tickMs').value = level.tickMs ?? 320;
  if (document.activeElement !== ascii) ascii.value = level.rows.join('\n');
  for (const b of document.querySelectorAll('.brush')) b.classList.toggle('on', hazardPick < 0 && b.dataset.ch === brush);
  $('#undoEdit').disabled = !past.length; $('#redoEdit').disabled = !future.length;
  renderHazards();
  const problems = lint(level);
  try { analysis = problems.length ? null : analyse(level, report); } catch { analysis = null; }
  drawEdit();
  const ul = $('#lint');
  ul.textContent = '';
  for (const p of problems) ul.append(Object.assign(document.createElement('li'), { textContent: p }));
  if (!problems.length) ul.append(Object.assign(document.createElement('li'), { className: 'ok', textContent: '✓ the room is well formed - Check asks the solver' }));
  $('#checkBtn').disabled = !!problems.length;
  $('#playBtn').disabled = !!problems.length;
  const id = idOf(level);
  $('#fileName').textContent = `${id}.js`; $('#fileName2').textContent = id;
  $('#moduleOut').textContent = toModule(level, { author: $('#author').value.trim() || undefined });
  showReport();
  bridge?.state(snapshotState());
}

function showReport() {
  const el = $('#report'), verdict = $('#verdict');
  verdict.hidden = true;
  if (!report) { el.textContent = ''; el.className = 'status'; return; }
  if (report.pending) { el.textContent = 'asking the solver…'; el.className = 'status busy'; return; }
  if (!report.ok) { el.textContent = report.problems.join(' · '); el.className = 'status hot'; return; }
  const unit = report.kind === 'chase' ? 'ticks' : 'moves';
  el.textContent = `solvable: par ${report.par} ${unit} (${report.explored} states, ${report.ms} ms)`;
  el.className = 'status win';
  // the verdict: how hard, in the solver's own numbers
  const pushes = analysis?.pushes ?? 0;
  const d = difficulty(report, pushes);
  verdict.hidden = false;
  verdict.textContent = '';
  const meter = document.createElement('div'); meter.className = 'meter';
  for (let i = 1; i <= 5; i++) { const s = document.createElement('i'); if (i <= d.level) s.className = 'on'; meter.append(s); }
  const label = document.createElement('b'); label.textContent = d.label;
  const facts = document.createElement('span');
  facts.textContent = [`par ${report.par} ${unit}`, `${pushes} shove${pushes === 1 ? '' : 's'}`, `${report.explored} states`, ...report.notes].join(' · ');
  verdict.append(meter, label, facts);
}
const unitOf = (r) => (r?.kind === 'chase' ? 'ticks' : 'moves');

// ------------------------------------------------------------------ editing ----

function cellAt(e) {
  const r = board.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * board.width / cell);
  const y = Math.floor((e.clientY - r.top) / r.height * board.height / cell);
  const { w, h } = dims();
  return (x < 0 || y < 0 || x >= w || y >= h) ? null : { x, y };
}
const withMirror = (cells) => cells.flatMap(([x, y]) => mirrorCells(level, x, y, symmetry));

let stroke = null;   // { tool, ch, from, before } while the pointer is down: one stroke, one undo step
board.addEventListener('contextmenu', (e) => e.preventDefault());
board.addEventListener('pointerdown', (e) => {
  if (playing) return;
  tilt.request?.();
  const c = cellAt(e);
  if (!c) return;
  if (hazardPick >= 0 && e.button === 0) {
    const hazards = level.hazards.map(h => ({ ...h, route: [...h.route] }));
    const route = hazards[hazardPick].route;
    const last = route.at(-1);
    if (last && last[0] === c.x && last[1] === c.y) route.pop(); else route.push([c.x, c.y]);
    setLevel({ ...level, hazards });
    return;
  }
  if (tool === 'pick' || (e.altKey && e.button === 0)) { const ch = level.rows[c.y][c.x]; if (ch in CHARS) setBrush(ch); return; }
  const ch = e.button === 2 ? '.' : brush;
  if (tool === 'fill') {
    const cells = withMirror(regionCells(level, c.x, c.y));
    setLevel(paintCells(level, cells, ch));
    tell('paint', { ch, cells: cells.length, tool }); tell('tool', { tool, used: true });
    return;
  }
  stroke = { tool, ch, from: c, before: level, filled: e.shiftKey };
  board.setPointerCapture(e.pointerId);
  if (tool === 'pencil') { setLevel(paintCells(level, withMirror([[c.x, c.y]]), ch)); tell('paint', { ch, cells: 1, tool }); }
  else { ghost = withMirror([[c.x, c.y]]); drawEdit(); }
});
board.addEventListener('pointermove', (e) => {
  const c = cellAt(e);
  cursorEl.textContent = c ? `${c.x},${c.y} ${CHARS[level.rows[c.y]?.[c.x]] ?? ''}` : '';
  if (!stroke || !c) return;
  if (stroke.tool === 'pencil') {
    if (level.rows[c.y][c.x] === stroke.ch || stroke.ch === 'A' || stroke.ch === 'D') return;
    setLevel(paintCells(level, withMirror([[c.x, c.y]]), stroke.ch), { remember: false });
  } else {
    stroke.filled = e.shiftKey;
    ghost = withMirror(stroke.tool === 'line' ? lineCells(stroke.from.x, stroke.from.y, c.x, c.y) : rectCells(stroke.from.x, stroke.from.y, c.x, c.y, { filled: stroke.filled }));
    drawEdit();
  }
});
board.addEventListener('pointerleave', () => { cursorEl.textContent = ''; });
function endStroke(e) {
  if (!stroke) return;
  const s = stroke; stroke = null;
  // the end of the stroke is where the pointer came up, whether or not it was seen moving there
  const c = e.type === 'pointerup' ? cellAt(e) : null;
  if (c && s.tool !== 'pencil') ghost = withMirror(s.tool === 'line' ? lineCells(s.from.x, s.from.y, c.x, c.y) : rectCells(s.from.x, s.from.y, c.x, c.y, { filled: e.shiftKey || s.filled }));
  if (s.tool !== 'pencil' && ghost) {
    const cells = ghost; ghost = null;
    // the stroke is one history step on top of the level before it
    level = s.before; setLevel(paintCells(level, cells, s.ch));
    tell('paint', { ch: s.ch, cells: cells.length, tool: s.tool }); tell('tool', { tool: s.tool, used: true });
  } else if (ghost) { ghost = null; drawEdit(); }
  void e;
}
board.addEventListener('pointerup', endStroke);
board.addEventListener('pointercancel', endStroke);

for (const b of document.querySelectorAll('#tools .tool')) b.addEventListener('click', () => setTool(b.dataset.tool));
for (const b of document.querySelectorAll('#symmetry .tool')) b.addEventListener('click', () => setSymmetry(b.dataset.sym));
const transform = (fn, name) => { hazardPick = -1; setLevel(fn(level), { why: name }); tell('transform', { transform: name }); };
$('#flipH').addEventListener('click', () => transform(flipH, 'flipH'));
$('#flipV').addEventListener('click', () => transform(flipV, 'flipV'));
$('#rotateBtn').addEventListener('click', () => transform(rotate, 'rotate'));
for (const b of document.querySelectorAll('[data-shift]')) b.addEventListener('click', () => { const [dx, dy] = b.dataset.shift.split(',').map(Number); transform(l => shift(l, dx, dy), 'shift'); });
$('#undoEdit').addEventListener('click', undoEdit);
$('#redoEdit').addEventListener('click', redoEdit);
for (const box of document.querySelectorAll('#overlays input')) {
  box.checked = !!overlays[box.dataset.overlay];
  box.addEventListener('change', () => setOverlay(box.dataset.overlay, box.checked));
}
function setOverlay(name, on) {
  overlays[name] = !!on; savePrefs();
  const box = document.querySelector(`#overlays input[data-overlay="${name}"]`); if (box) box.checked = !!on;
  drawEdit(); tell('overlay', { overlay: name, on: !!on });
}
$('#zoom').value = cell;
$('#zoom').addEventListener('input', (e) => { cell = +e.target.value; prefs.zoom = cell; savePrefs(); drawEdit(); });

$('#name').addEventListener('input', (e) => setLevel({ ...level, name: e.target.value }, { remember: false }));
$('#width').addEventListener('change', (e) => setLevel(resize(level, +e.target.value, dims().h)));
$('#height').addEventListener('change', (e) => setLevel(resize(level, dims().w, +e.target.value)));
$('#theme').addEventListener('change', (e) => setLevel({ ...level, theme: e.target.value }));
$('#kind').addEventListener('change', (e) => {
  if (e.target.value === 'chase') setLevel({ ...level, tickMs: level.tickMs ?? 320 });
  else { const { tickMs, hazards, ...rest } = level; hazardPick = -1; setLevel(rest); }
});
$('#tickMs').addEventListener('change', (e) => setLevel({ ...level, tickMs: +e.target.value }));
$('#addHazard').addEventListener('click', () => {
  const used = new Set((level.hazards ?? []).map(h => h.character ?? h.id));
  const c = HAZARD_CAST.find(c => !used.has(c.id)) ?? HAZARD_CAST[0];
  const hz = { id: uniqueId(c.id, -1), character: c.id, route: [], sight: c.sight };
  hazardPick = (level.hazards ?? []).length;
  setLevel({ ...level, tickMs: level.tickMs ?? 320, hazards: [...(level.hazards ?? []), hz] });
});
ascii.addEventListener('input', () => {
  const rows = ascii.value.replace(/\r/g, '').split('\n').filter((r, i, a) => r.length || i < a.length - 1);
  if (rows.length) setLevel({ ...level, rows }, { remember: false });
});
ascii.addEventListener('change', () => render());

const keysDialog = $('#keysDialog');
$('#keysBtn').addEventListener('click', () => keysDialog.showModal());
$('#keysClose').addEventListener('click', () => keysDialog.close());
keysDialog.addEventListener('click', (e) => { if (e.target === keysDialog) keysDialog.close(); });

/** Keys typed into a text box, a menu or the map belong to it; a checkbox, a slider or a button does not keep them. */
const typing = (el) => !!el && (/^(SELECT|TEXTAREA)$/.test(el.tagName) || (el.tagName === 'INPUT' && !/^(checkbox|range|button)$/.test(el.type)));
const TOOL_KEYS = { p: 'pencil', i: 'line', r: 'rect', f: 'fill', k: 'pick' };
const SYMS = ['none', 'h', 'v', 'both'];
addEventListener('keydown', (e) => {
  if (typing(e.target)) return;
  if (keysDialog.open) return;
  if (e.key === '?') { keysDialog.showModal(); return; }
  if (playing) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redoEdit(); else undoEdit(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redoEdit(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'enter') { e.preventDefault(); if (!lint(level).length) runCheck(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); shelfSave(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const ch = Object.keys(BRUSH_KEYS).find(c => BRUSH_KEYS[c] === e.key);
  if (ch) { setBrush(ch); return; }
  if (TOOL_KEYS[k]) { setTool(TOOL_KEYS[k]); return; }
  if (k === 'm') { setSymmetry(SYMS[(SYMS.indexOf(symmetry) + 1) % SYMS.length]); return; }
  if (k === 'g') { setOverlay('grid', !overlays.grid); }
});
$('#newBtn').addEventListener('click', () => { hazardPick = -1; setLevel(blank(9, 7), { why: 'new' }); });

// ------------------------------------------------------------------ loading ----
// The shipped stages and the community's, as starting points. ?level= in the
// address wins, then the room left here last time, then a blank one.

const SHIPPED = [['tea-party', 'A Mad Tea Party'], ['queens-gauntlet', "The Queen's Gauntlet"]];
const community = [];
async function loadById(id) {
  const starter = STARTERS.find(s => s.id === id);
  if (starter) { hazardPick = -1; setLevel(starter.level(), { why: 'starter' }); return level; }
  const path = SHIPPED.some(([s]) => s === id) ? `stages/${id}.js` : community.some(s => s.id === id) ? `stages/community/${id}.js` : null;
  if (!path) throw new Error(`no stage, starter or community room called '${id}'`);
  const mod = await import(`../${path}`);
  const stage = Object.values(mod).find(v => v && Array.isArray(v.rows));
  hazardPick = -1;
  setLevel(stage, { why: 'load' });
  return level;
}
{
  const sel = $('#load');
  for (const [id, name] of SHIPPED) sel.append(new Option(name, id));
  fetch('stages/community/index.json', { cache: 'no-cache' }).then(r => r.json()).then((m) => {
    for (const s of m.stages ?? []) { community.push(s); sel.append(new Option(`${s.name} (community)`, s.id)); }
  }).catch(() => {});
  sel.addEventListener('change', async () => {
    if (!sel.value) return;
    try { await loadById(sel.value); }
    catch (e) { report = { ok: false, problems: [`could not load ${sel.value}: ${e.message}`] }; showReport(); }
    sel.value = '';
  });
  const starters = $('#starters');
  for (const s of STARTERS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'starter';
    b.append(Object.assign(document.createElement('b'), { textContent: s.name }), Object.assign(document.createElement('small'), { textContent: s.blurb }));
    b.addEventListener('click', () => loadById(s.id));
    starters.append(b);
  }
}

{
  const token = new URLSearchParams(location.search).get('level');
  let first = null;
  if (token) { try { first = decodeShare(token); } catch { first = null; } }
  if (!first) first = loadJson(STORE, null);
  $('#author').value = load(AUTHOR) ?? '';
  setLevel(first ?? blank(9, 7), { reset: true, why: 'open' });
}

// ------------------------------------------------------------------ checking ----

let worker = null;
try { worker = new Worker(new URL('./check-worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; }
let checkId = 0;
const ask = (msg, key) => new Promise((resolve) => {
  const id = ++checkId;
  if (!worker) { setTimeout(() => resolve(msg.level ? check(msg.level) : generateSolvable(msg.generate, msg.rules)), 20); return; }
  const onMsg = (e) => { if (e.data.id !== id) return; worker.removeEventListener('message', onMsg); resolve(e.data[key]); };
  worker.addEventListener('message', onMsg);
  worker.postMessage({ id, ...msg });
});
function runCheck() {
  const lvl = level;
  report = { pending: true }; showReport();
  return ask({ level: lvl }, 'report').then((r) => {
    if (level !== lvl) return r;        // the room changed under the solver; its answer is for the old one
    report = r; render();
    tell('check', { ok: !!r.ok, par: r.par ?? null, rules: r.kind ?? null });
    return r;
  });
}
$('#checkBtn').addEventListener('click', runCheck);
let autoTimer = 0;
const autoCheckSoon = () => { clearTimeout(autoTimer); autoTimer = setTimeout(() => { if (!playing && !lint(level).length) runCheck(); }, 600); };
$('#autoCheck').checked = !!prefs.autoCheck;
$('#autoCheck').addEventListener('change', (e) => { prefs.autoCheck = e.target.checked; savePrefs(); if (prefs.autoCheck) autoCheckSoon(); });

// ------------------------------------------------------------- surprise me ----

const genOpts = () => ({
  width: +$('#genW').value, height: +$('#genH').value, rocks: +$('#genRocks').value, walls: +$('#genWalls').value / 100,
  gate: $('#genGate').checked, timed: $('#genTimed').checked, cast: 2, seed: $('#genSeed').value === '' ? undefined : +$('#genSeed').value,
});
async function surprise(opts = genOpts(), rules = { minPar: +$('#genPar').value || 12 }) {
  const status = $('#genStatus');
  status.textContent = 'drawing…'; status.className = 'status busy';
  const found = await ask({ generate: opts, rules }, 'found');
  if (!found) { status.textContent = 'nothing solvable in 60 draws - fewer rocks, fewer walls, or a bigger room'; status.className = 'status hot'; return null; }
  hazardPick = -1;
  setLevel(found.level, { why: 'generate' });
  report = found.report; render();
  $('#genSeed').value = found.seed;
  status.textContent = `seed ${found.seed}, ${found.tries} draw${found.tries === 1 ? '' : 's'}, par ${found.report.par}`; status.className = 'status win';
  tell('generate', { seed: found.seed, par: found.report.par });
  return found;
}
$('#genBtn').addEventListener('click', () => surprise());

// ----------------------------------------------------------------- the shelf ----
// Rooms kept in this browser: a name, the room, when, the last verdict.

let shelf = loadJson(SHELF, []);
function renderShelf() {
  const ul = $('#shelf');
  ul.textContent = '';
  $('#shelfCount').textContent = shelf.length ? `${shelf.length}` : '';
  for (const [i, item] of shelf.entries()) {
    const li = document.createElement('li');
    const open = document.createElement('button'); open.type = 'button'; open.className = 'shelf-open';
    open.append(Object.assign(document.createElement('b'), { textContent: item.level.name }),
                Object.assign(document.createElement('small'), { textContent: `${item.level.rows[0].length}×${item.level.rows.length} · ${kindOf(item.level) === 'chase' ? 'timed' : 'untimed'}${item.par ? ` · par ${item.par}` : ''} · ${new Date(item.at).toLocaleDateString()}` }));
    open.addEventListener('click', () => { hazardPick = -1; setLevel(item.level, { why: 'shelf' }); if (item.par) { report = item.report; render(); } tell('shelf', { did: 'open' }); });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'btn ghost'; del.textContent = '✕'; del.title = 'take it off the shelf';
    del.addEventListener('click', () => { shelf.splice(i, 1); save(SHELF, JSON.stringify(shelf)); renderShelf(); tell('shelf', { did: 'drop' }); });
    li.append(open, del);
    ul.append(li);
  }
}
function shelfSave() {
  const at = shelf.findIndex(s => s.level.name === level.name);
  const item = { level, at: Date.now(), par: report?.ok ? report.par : null, report: report?.ok ? report : null };
  if (at >= 0) shelf[at] = item; else shelf.unshift(item);
  while (shelf.length > 60) shelf.pop();
  save(SHELF, JSON.stringify(shelf)); renderShelf();
  const s = $('#shelfStatus'); s.textContent = at >= 0 ? `${level.name} updated` : `${level.name} kept`; s.className = 'status win';
  setTimeout(() => { s.textContent = ''; }, 1600);
  tell('shelf', { did: 'save' });
}
$('#shelfSave').addEventListener('click', shelfSave);
renderShelf();

$('#pngBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = board.toDataURL('image/png'); a.download = `${idOf(level)}.png`; a.click();
  tell('export', { how: 'png' });
});

// --------------------------------------------------------------- run & debug ----
// The room as the stages page plays it: the untimed rules of src/puzzle.js or
// the timed ones of src/chase.js, driven by the pad - which here carries the
// keyboard, the simulated badge's keys, a real badge and the bridge alike.

const run = $('#run'), rctx = run.getContext('2d');
const runStatus = $('#runStatus');
const runLog = $('#runLog');
let game = null;     // { kind, map, state, history, facing, ticks, dead, waiting, plan, planAt, timer, t0, tickMs }

const say = (text, kind = '') => { runStatus.textContent = text; runStatus.className = `status ${kind}`; };
function log(text, kind = '') {
  const li = document.createElement('li');
  li.textContent = `${game ? `+${Math.round(performance.now() - game.t0)} ms` : ''}  ${text}`;
  if (kind) li.className = kind;
  runLog.prepend(li);
  while (runLog.children.length > 200) runLog.lastChild.remove();
}

function startPlay() {
  if (lint(level).length) return;
  const kind = kindOf(level);
  const map = kind === 'tea' ? parseTea(level.rows) : parseChase(level);
  game = { kind, map, state: map.start, history: [], facing: 'S', ticks: 0, dead: false, waiting: true, plan: null, planAt: 0,
           timer: null, t0: performance.now(), tickMs: level.tickMs ?? 320 };
  run.width = map.w * TILE; run.height = map.h * TILE;
  playing = true;
  $('#playPanel').classList.add('armed');
  $('#keysUndo').hidden = kind !== 'tea';
  $('#keysWait').hidden = kind !== 'chase';
  $('#undoBtn').hidden = kind !== 'tea';
  runLog.textContent = '';
  log(`${level.name}: ${kind === 'tea' ? 'untimed' : `timed, ${game.tickMs} ms a tick`}`);
  status();
  if (kind === 'chase') game.timer = setInterval(tick, game.tickMs);
  $('#playPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  tell('play', { rules: kind });
}
function stopPlay() {
  if (game?.timer) clearInterval(game.timer);
  playing = false;
  $('#playPanel').classList.remove('armed');
}
function status() {
  if (!game) return;
  const { map, state, kind } = game;
  const held = state.rocks.filter(r => map.buttons.has(r)).length;
  const count = `${held}/${map.buttons.size} buttons`;
  if (game.dead) say(`caught on tick ${game.ticks} - START resets`, 'hot');
  else if (kind === 'tea' && teaGoal(map, state)) say(`solved in ${game.ticks} moves`, 'win');
  else if (kind === 'chase' && chaseGoal(map, state)) say(`out in ${game.ticks} ticks${report?.par ? ` (par ${report.par})` : ''}`, 'win');
  else if (kind === 'chase' && game.waiting) say(`the room waits for your first press · ${count}`, 'hint');
  else if (game.plan) say(`playing the solution - ${game.planAt} of ${game.plan.length} · ${count}`, 'busy');
  else say(`${kind === 'chase' ? `tick ${game.ticks}` : `${game.ticks} moves`} · ${count}`);
  $('#undoBtn').disabled = !game.history.length || !!game.plan;
  bridge?.state(snapshotState());
}
const cellName = (map, i) => `${i % map.w},${(i / map.w) | 0}`;

function teaMove(dir, { tell: loud = true } = {}) {
  const { map } = game;
  const next = teaStep(map, game.state, dir);
  game.facing = dir;
  if (!next) { if (loud) log(`${dir}: blocked`, 'hot'); status(); return; }
  game.history.push(game.state);
  game.state = next; game.ticks++;
  if (loud) log(`${dir}: Alice at ${cellName(map, next.alice)}${next.lever !== game.history.at(-1).lever ? ', the lever thrown' : ''}`);
  if (!game.plan) tell('move', { dir });
  if (teaGoal(map, next)) { log(`solved in ${game.ticks} moves`, 'win'); tell('win', { moves: game.ticks }); }
  status();
}
function tick() {
  if (!game || game.kind !== 'chase' || game.dead || game.waiting || chaseGoal(game.map, game.state)) return;
  const planned = !!game.plan;
  const action = game.plan ? (game.plan[game.planAt++] ?? 'wait') : (game.queued ?? 'wait');
  game.queued = null;
  if (action !== 'wait') game.facing = action;
  const next = chaseStep(game.map, game.state, action);
  if (!next) {
    const bumped = chaseStep(game.map, game.state, 'wait');
    if (action !== 'wait' && bumped) { game.state = bumped; game.ticks++; log(`tick ${game.ticks}: ${action} blocked, Alice stood`, 'hot'); status(); return; }
    game.dead = true; game.plan = null;
    log(`tick ${game.ticks + 1}: ${action} - caught`, 'hot');
    status();
    return;
  }
  game.state = next; game.ticks++;
  if (!planned || game.planAt % 8 === 1) log(`tick ${game.ticks}: ${action}${action === 'wait' ? '' : ` → ${cellName(game.map, next.alice)}`}`);
  if (!planned && action !== 'wait') tell('move', { dir: action });
  if (game.plan && game.planAt >= game.plan.length) game.plan = null;
  if (chaseGoal(game.map, next)) { log(`out in ${game.ticks} ticks`, 'win'); tell('win', { ticks: game.ticks }); }
  status();
}
function resetPlay() {
  if (!game) return;
  if (game.timer) clearInterval(game.timer);
  const { kind } = game;
  startPlay();
  log(kind === 'tea' ? 'reset' : 'restart');
}
function undoPlay() {
  if (!game || game.kind !== 'tea' || game.plan || !game.history.length) return;
  game.state = game.history.pop(); game.ticks = Math.max(0, game.ticks - 1);
  log('undo'); status();
}

const PAD_DIRS = { UP: 'N', DOWN: 'S', LEFT: 'W', RIGHT: 'E' };
pad.on(({ button, down, source, t }) => {
  simLight(button, down);
  if (!game || !playing) return;
  log(`${button} ${down ? 'down' : 'up'} (${source})`, 'dim');
  if (!down) return;
  if (button === 'START') { resetPlay(); return; }
  if (game.kind === 'tea') {
    if (button === 'B') { undoPlay(); return; }
    const dir = PAD_DIRS[button];
    if (dir && !game.plan) teaMove(dir);
  } else {
    const action = PAD_DIRS[button] ?? (button === 'Y' ? 'wait' : null);
    if (!action || game.plan) return;
    game.queued = action;
    if (game.waiting) { game.waiting = false; log('the clock starts'); tick(); }
  }
  void t;
});
addEventListener('keydown', (e) => {
  if (!playing || !game) return;
  if (typing(e.target)) return;
  if (e.key === 'r' || e.key === 'R') resetPlay();
  if (e.key === 'Escape') { stopPlay(); $('#editPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (e.key === 'Backspace' && game.kind === 'tea') { e.preventDefault(); undoPlay(); }
  if (e.key === ' ' && game.kind === 'chase' && !game.plan) { e.preventDefault(); game.queued = 'wait'; if (game.waiting) { game.waiting = false; tick(); } }
});

$('#playBtn').addEventListener('click', startPlay);
$('#editBtn').addEventListener('click', () => { stopPlay(); $('#editPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#resetBtn').addEventListener('click', resetPlay);
$('#undoBtn').addEventListener('click', undoPlay);
async function playSolution() {
  if (!playing) startPlay();
  const r = report?.ok ? report : await runCheck();
  if (!r.ok) { say(r.problems.join(' · '), 'hot'); return r; }
  resetPlay();
  log(`the solver's ${r.par} ${unitOf(r)}`, 'win');
  tell('solution', { par: r.par });
  if (game.kind === 'tea') {
    game.plan = r.moves; game.planAt = 0;
    const t = setInterval(() => {
      if (!game || !game.plan || !playing) { clearInterval(t); return; }
      teaMove(game.plan[game.planAt++], { tell: false });
      if (game.planAt >= game.plan.length) { game.plan = null; clearInterval(t); }
      status();
    }, 160);
  } else {
    game.plan = r.moves; game.planAt = 0; game.waiting = false;
  }
  status();
  return r;
}
$('#solveBtn').addEventListener('click', playSolution);

// ----------------------------------------------------------- the simulated badge ----
// A picture of the badge whose keys light with the pad's held set, whatever
// pressed them, and press the pad when clicked (source 'ui', as the range's
// on-screen pad does). The layout is the board's: shoulders on top, the
// d-pad left, the diamond right, SELECT and START between.

const sim = $('#sim');
{
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; return n; };
  sim.append(el('rect', { class: 'body', x: 6, y: 18, width: 308, height: 144, rx: 26 }));
  sim.append(el('text', { class: 'brandline', x: 160, y: 150 }, 'BSIDESTLV 2026 · ALICE CONTROLLER'));
  sim.append(el('circle', { class: 'led', id: 'simLed', cx: 160, cy: 34, r: 3 }));
  const key = (name, shape, label, lx, ly) => {
    const g = el('g', { 'data-btn': name });
    g.append(shape, el('text', { x: lx, y: ly }, label));
    sim.append(g);
    const down = (e) => { e.preventDefault(); tilt.request?.(); g.setPointerCapture?.(e.pointerId); pad.inject(name, true); };
    const up = () => pad.inject(name, false);
    g.addEventListener('pointerdown', down);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
    g.addEventListener('lostpointercapture', up);
  };
  const rect = (x, y, w, h, r = 6) => el('rect', { class: 'key', x, y, width: w, height: h, rx: r });
  key('SL', rect(22, 4, 64, 18, 9), 'SL', 54, 13);
  key('SR', rect(234, 4, 64, 18, 9), 'SR', 266, 13);
  const dp = { x: 72, y: 88, s: 26, g: 2 };
  key('UP', rect(dp.x - dp.s / 2, dp.y - dp.s * 1.5 - dp.g, dp.s, dp.s), '▲', dp.x, dp.y - dp.s - dp.g);
  key('DOWN', rect(dp.x - dp.s / 2, dp.y + dp.s / 2 + dp.g, dp.s, dp.s), '▼', dp.x, dp.y + dp.s + dp.g);
  key('LEFT', rect(dp.x - dp.s * 1.5 - dp.g, dp.y - dp.s / 2, dp.s, dp.s), '◀', dp.x - dp.s - dp.g, dp.y);
  key('RIGHT', rect(dp.x + dp.s / 2 + dp.g, dp.y - dp.s / 2, dp.s, dp.s), '▶', dp.x + dp.s + dp.g, dp.y);
  sim.append(el('rect', { class: 'key', x: dp.x - dp.s / 2, y: dp.y - dp.s / 2, width: dp.s, height: dp.s, rx: 4, style: 'pointer-events:none' }));
  const di = { x: 248, y: 88, r: 15, d: 31 };
  key('Y', el('circle', { class: 'key', cx: di.x, cy: di.y - di.d, r: di.r }), 'Y', di.x, di.y - di.d);
  key('A', el('circle', { class: 'key', cx: di.x, cy: di.y + di.d, r: di.r }), 'A', di.x, di.y + di.d);
  key('X', el('circle', { class: 'key', cx: di.x - di.d, cy: di.y, r: di.r }), 'X', di.x - di.d, di.y);
  key('B', el('circle', { class: 'key', cx: di.x + di.d, cy: di.y, r: di.r }), 'B', di.x + di.d, di.y);
  key('SELECT', rect(126, 104, 30, 12, 6), 'SEL', 141, 110);
  key('START', rect(164, 104, 30, 12, 6), 'STA', 179, 110);
  sim.addEventListener('contextmenu', (e) => e.preventDefault());
}
function simLight(button, down) {
  sim.querySelector(`g[data-btn="${button}"]`)?.classList.toggle('on', down);
  $('#simLed').classList.toggle('on', pad.held.size > 0);
}
// a real badge's or a key's edge the pad swallowed as a duplicate still shows what is held
setInterval(() => { for (const b of BUTTONS) sim.querySelector(`g[data-btn="${b}"]`)?.classList.toggle('on', pad.held.has(b)); }, 100);
void KEYS;

// ---------------------------------------------------------------- the export ----

{
  const flash = (el, s) => { el.textContent = s; setTimeout(() => { el.textContent = ''; }, 1600); };
  const module = () => toModule(level, { author: $('#author').value.trim() || undefined });
  $('#author').addEventListener('input', () => { save(AUTHOR, $('#author').value); $('#moduleOut').textContent = module(); });
  $('#copyModule').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(module()); flash($('#exportStatus'), `copied - save it as stages/community/${idOf(level)}.js`); }
    catch { flash($('#exportStatus'), 'the clipboard refused; select the text on the right'); }
    tell('export', { how: 'copy' });
  });
  $('#downloadModule').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([module()], { type: 'text/javascript' }));
    a.download = `${idOf(level)}.js`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    tell('export', { how: 'download' });
  });
  $('#shareBtn').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?level=${encodeShare(level)}`;
    try { await navigator.clipboard.writeText(url); flash($('#exportStatus'), 'link copied'); }
    catch { prompt('the link', url); }
    tell('export', { how: 'link' });
  });
  $('#importBtn').addEventListener('click', async () => {
    try {
      const lvl = await fromModule($('#importText').value);
      hazardPick = -1;
      setLevel(lvl, { why: 'import' });
      flash($('#importStatus'), `imported ${lvl.name}`);
    } catch (e) { $('#importStatus').textContent = e.message; }
  });
}

// ------------------------------------------------------------- the assistant ----
// The chat the bridge carries, and the ops an assistant drives the studio
// through. Every op is logged here as it happens, so the person sees what
// the assistant did and not just what changed.

const chatLog = $('#chatLog');
function chat(text, who = 'you') {
  const li = document.createElement('li');
  li.className = who;
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.append(Object.assign(document.createElement('b'), { textContent: who === 'you' ? 'you' : who === 'act' ? '·' : who }), ` ${text}`);
  li.title = t;
  chatLog.prepend(li);
  while (chatLog.children.length > 300) chatLog.lastChild.remove();
}
const chatText = $('#chatText');
async function sendChat() {
  const text = chatText.value.trim();
  if (!text) return;
  chatText.value = '';
  chat(text, 'you');
  tell('chat', { text });
  if (!bridge?.available) chat('no assistant can hear you yet: this page is served without the bridge, start it with `npm run maker`', 'act');
  else if (!bridge.agents.length) chat('nobody has said hello on the bridge yet; the line is kept for whoever does', 'act');
  await bridge?.post(text);
}
$('#chatSend').addEventListener('click', sendChat);
chatText.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });

const gameSummary = () => {
  if (!game) return null;
  const { map, state, kind } = game;
  const xy = (i) => ({ x: i % map.w, y: (i / map.w) | 0 });
  return { kind, playing, ticks: game.ticks, alice: xy(state.alice), rocks: state.rocks.map(xy), lever: state.lever,
           buttonsHeld: state.rocks.filter(r => map.buttons.has(r)).length, buttons: map.buttons.size, dead: game.dead, waiting: game.waiting,
           won: kind === 'tea' ? teaGoal(map, state) : chaseGoal(map, state), phase: state.phase ?? 0, planned: !!game.plan };
};
const snapshotState = () => ({ level, kind: kindOf(level), lint: lint(level), report: report?.pending ? null : report, game: gameSummary(), tool, brush, symmetry });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ops = {
  get: () => ({ ...snapshotState(), overlays, cell, shelf: shelf.map(s => ({ name: s.level.name, par: s.par })), tutorial: tutor.step?.id ?? 'done' }),
  set: ({ level: next }) => {
    if (!next || !Array.isArray(next.rows)) throw new Error('set wants { level: { name, rows, ... } }');
    hazardPick = -1; setLevel(normalize(next), { why: 'assistant' });
    chat(`set the room to "${level.name}" (${dims().w}×${dims().h})`, 'act');
    return { lint: lint(level), kind: kindOf(level) };
  },
  paint: ({ cells }) => {
    if (!Array.isArray(cells)) throw new Error('paint wants { cells: [[x, y, ch], ...] }');
    let next = level;
    for (const [x, y, ch] of cells) { if (!(ch in CHARS)) throw new Error(`no brush '${ch}'`); next = setCell(next, +x, +y, ch); }
    setLevel(next, { why: 'assistant' });
    chat(`painted ${cells.length} cell${cells.length === 1 ? '' : 's'}`, 'act');
    return { lint: lint(level) };
  },
  check: async () => {
    const problems = lint(level);
    if (problems.length) return { ok: false, problems };
    const r = await runCheck();
    chat(r.ok ? `checked: par ${r.par} ${unitOf(r)}, ${difficulty(r, analysis?.pushes ?? 0)?.label}` : `checked: ${r.problems.join('; ')}`, 'act');
    return r.ok ? { ...r, pushes: analysis?.pushes ?? 0, difficulty: difficulty(r, analysis?.pushes ?? 0) } : r;
  },
  play: () => { if (lint(level).length) throw new Error('the room is malformed: ' + lint(level).join('; ')); startPlay(); chat('started Run & debug', 'act'); return gameSummary(); },
  stop: () => { stopPlay(); chat('left Run & debug', 'act'); return { playing }; },
  reset: () => { if (!game) throw new Error('nothing is running'); resetPlay(); return gameSummary(); },
  press: async ({ button, holdMs = 60 }) => {
    if (!BUTTONS.includes(button)) throw new Error(`no button '${button}'; they are ${BUTTONS.join(' ')}`);
    pad.inject(button, true); await sleep(Math.max(10, Math.min(2000, holdMs))); pad.inject(button, false);
    return gameSummary();
  },
  moves: async ({ moves, stepMs }) => {
    if (!game || !playing) startPlay();
    const toButton = { N: 'UP', S: 'DOWN', W: 'LEFT', E: 'RIGHT', wait: 'Y' };
    const lines = [];
    const before = runLog.children.length;
    const gap = stepMs ?? (game.kind === 'chase' ? game.tickMs : 120);
    for (const m of moves ?? []) {
      const b = toButton[m]; if (!b) throw new Error(`no move '${m}'; moves are N S W E wait`);
      pad.inject(b, true); await sleep(30); pad.inject(b, false);
      await sleep(Math.max(0, gap - 30));
      if (game.dead || (game.kind === 'tea' ? teaGoal(game.map, game.state) : chaseGoal(game.map, game.state))) break;
    }
    for (let i = runLog.children.length - before - 1; i >= 0; i--) lines.push(runLog.children[i].textContent);
    chat(`played ${moves.length} move${moves.length === 1 ? '' : 's'}`, 'act');
    return { ...gameSummary(), log: lines.filter(l => !/\(ui\)|\(keyboard\)|\(gamepad\)/.test(l)).slice(-40) };
  },
  say: ({ text, from }) => { chat(String(text ?? ''), from || bridge?.agents.at(-1) || 'the assistant'); return { ok: true }; },
  snapshot: ({ what = 'board' } = {}) => {
    const c = what === 'run' ? run : board;
    if (what === 'run' && !game) throw new Error('nothing is running: play first, or take the board');
    return { png: c.toDataURL('image/png'), note: what === 'run' ? `${level.name}, ${runStatus.textContent}` : `${level.name}, ${dims().w}×${dims().h}; shaded cells lose a rock, the green line is the last solution` };
  },
  module: ({ author } = {}) => ({ id: idOf(level), file: `stages/community/${idOf(level)}.js`, source: toModule(level, { author: author || $('#author').value.trim() || undefined }),
                                indexLine: { id: idOf(level), name: level.name, author: author || $('#author').value.trim() || '', kind: kindOf(level) } }),
  load: async ({ id }) => { await loadById(id); chat(`loaded ${level.name}`, 'act'); return { level, lint: lint(level) }; },
  generate: async (a = {}) => {
    const opts = { width: a.width ?? 11, height: a.height ?? 8, rocks: a.rocks ?? 2, walls: a.walls ?? 0.12, gate: !!a.gate, timed: !!a.timed, cast: a.cast ?? 2, seed: a.seed };
    const found = await surprise(opts, { minPar: a.minPar ?? 12 });
    chat(found ? `drew "${found.level.name}" from seed ${found.seed}, par ${found.report.par}` : 'drew nothing solvable', 'act');
    return found ? { level: found.level, seed: found.seed, report: found.report } : null;
  },
  tool: (a = {}) => {
    if (a.tool) { if (!Object.values(TOOL_KEYS).includes(a.tool)) throw new Error(`no tool '${a.tool}'`); setTool(a.tool); }
    if (a.brush) { if (!(a.brush in CHARS)) throw new Error(`no brush '${a.brush}'`); setBrush(a.brush); }
    if (a.symmetry) { if (!SYMS.includes(a.symmetry)) throw new Error(`no symmetry '${a.symmetry}'`); setSymmetry(a.symmetry); }
    if (a.overlay) { if (!(a.overlay in overlays)) throw new Error(`no overlay '${a.overlay}'`); setOverlay(a.overlay, a.on ?? !overlays[a.overlay]); }
    return { tool, brush, symmetry, overlays };
  },
};

const bridgeChip = $('#bridgeChip'), bridgeState = $('#bridgeState');
bridge = connectBridge(ops, {
  onHello: (name) => { chat(`${name} is here`, 'act'); tell('hello', { name }); },
  onState: (b) => {
    const who = b.agents.length ? b.agents.join(', ') : null;
    bridgeChip.textContent = !b.available ? '◌ no bridge' : !b.connected ? '◌ bridge…' : who ? `● ${who}` : '○ bridge open';
    bridgeChip.className = `bridge-chip dev-only${b.connected ? ' on' : ''}${who ? ' who' : ''}`;
    bridgeChip.title = !b.available ? 'served without the bridge: start the page with npm run maker to let an assistant in' : who ? `on the bridge: ${who}` : 'the bridge is open; no assistant has said hello';
    bridgeState.textContent = !b.available ? 'no bridge here' : !b.connected ? 'bridge lost' : who ? `${who} connected` : 'waiting for an assistant';
    bridgeState.className = `tag${who ? ' on' : ''}`;
    $('#bridgeUrl').textContent = `${location.origin}/__maker/`;
  },
  onCommand: (cmd) => { if (cmd.op !== 'get' && cmd.op !== 'snapshot' && cmd.op !== 'say' && cmd.op !== 'hello') console.debug('bridge:', cmd.op, cmd.args); },
});

// ---------------------------------------------------------------- the coach ----
// The tutorial, mounted once the studio exists: a step that comes up scrolls
// to its panel when asked to show it.

const PANELS = { edit: '#editPanel', play: '#playPanel', export: '#exportPanel', assistant: '#assistantPanel' };
coach = mountCoach(tutor, {
  chapters: { 1: 'Chapter one · the brushes', 2: 'Chapter two · the proof', 3: 'Chapter three · ship it' },
  finish: {
    title: 'The roses are painted',
    say: 'You know the studio. Make a room nobody has seen.',
    note: (skipped) => 'You have been through the whole studio' + (skipped ? ` (${skipped} step${skipped === 1 ? '' : 's'} skipped)` : '') +
      '. Start over any time; the shelf keeps your rooms, the export sends one in.',
  },
  prepare(step, { show = false } = {}) {
    if (!show || !step?.panel) return;
    $(PANELS[step.panel])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
});
tell('lint', { ok: !lint(level).length, why: 'open' });

// ------------------------------------------------------------------- the loop ----

function loop(now) {
  if (game) {
    rctx.clearRect(0, 0, run.width, run.height);
    drawRoom(rctx, scene, game.map, game.state, THEMES[level.theme] ?? THEMES.garden,
             { now, facing: game.facing, walking: game.kind === 'chase' ? !game.waiting && !game.dead : !!game.plan, beatMs: game.kind === 'chase' ? game.tickMs : 160, dead: game.dead });
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// scripted tests read and drive the studio through this; the pad is window.__pad
window.__maker = {
  dev: true, repo, prompt: aiPrompt(repo),
  get level() { return level; }, setLevel, lint: () => lint(level), check: runCheck, get report() { return report; }, get analysis() { return analysis; },
  play: startPlay, stop: stopPlay, get game() { return game; }, get playing() { return playing; }, solution: playSolution,
  module: () => toModule(level), share: () => encodeShare(level),
  get tool() { return tool; }, setTool, get brush() { return brush; }, setBrush, get symmetry() { return symmetry; }, setSymmetry, overlays, setOverlay,
  undo: undoEdit, redo: redoEdit, get past() { return past.length; }, get future() { return future.length; },
  surprise, get shelf() { return shelf; }, shelfSave, loadById, ops, get bridge() { return bridge; }, get tutor() { return tutor; }, chat: sendChat,
};

}
