// Alice in AI Land - the level maker page (maker.html).
//
// Two faces, one page, decided by where it is served from (the same answer
// as the gate's: src/gate.js gateMode, src/look-boot.js data-host):
//
//   the site    the landing: a room painting itself in the hero, what a stage
//               is, how to get the maker, and the invitation - a prompt for
//               an assistant with a copy button. Nothing here plays.
//   a checkout  the landing and, under it, the maker: a grid editor over the
//               game's own art (src/scene.js), a checker that runs the real
//               solvers (src/level.js, in a worker), Run & debug - the room
//               played with a simulated badge the keyboard, a click or a
//               real badge drives, every edge logged - and the export that
//               writes the stage module a pull request carries.
//
// The keyboard plays here, and only here: the Pad is built with every source
// on a dev host (src/pad.js sourcesFor), on the site it is not built at all.
// A room is kept in localStorage (alice.maker.level) between visits and can
// travel in a link (?level=, src/level.js encodeShare).

import { Pad, sourcesFor, KEYS, BUTTONS } from './pad.js';
import { gateMode } from './gate.js';
import { initLooks } from './looks.js';
import { tilt } from './tilt.js';
import { TILE, THEMES, HAZARD_CAST, loadScene, drawCell, drawRoom } from './scene.js';
import { parse as parseTea, step as teaStep, isGoal as teaGoal } from './puzzle.js';
import { parse as parseChase, step as chaseStep, isGoal as chaseGoal } from './chase.js';
import { CHARS, BRUSHES, kindOf, blank, setCell, resize, lint, check, toModule, fromModule, normalize,
         idOf, encodeShare, decodeShare } from './level.js';

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
export const aiPrompt = (repoUrl) => `Help me build a level for "Alice in AI Land", the BSidesTLV 2026 badge puzzle game.

1. Clone ${repoUrl} and read software/docs/LEVEL_MAKER.md - the stage format, the rules the checker applies, and how a room gets onto the site.
2. Run \`npm run maker\` in the clone (Node 20+, no dependencies). It serves the checkout on http://localhost:8080 and opens maker.html, the level maker: a grid editor drawn with the game's art, a Check button that runs the real solver, and Run & debug, where the keyboard stands in for the badge (WASD or arrows move, Z/X/C/V are A/B/X/Y, Enter is START).
3. Design a room with me. Ask what I want: how big, how many rocks, a gate and lever or not, timed with a cast walking loops or not, which dressing (garden, hall, court). Draft it as ASCII rows, paste it into the maker's map box, and iterate until Check says it is solvable and the gate is load-bearing.
4. Save it as stages/community/<id>.js with the maker's Export, add one line to stages/community/index.json, and run \`npm run stage -- stages/community/<id>.js\` to see what CI will say.
5. Commit on a branch and open a pull request against ${repoUrl} with the stage and the index line. Describe the room in a sentence; the checks prove it solves.`;

{
  const dialog = $('#aiDialog');
  const text = aiPrompt(repo);
  $('#aiPrompt').value = text;
  $('#aiClaude').href = `https://claude.ai/new?q=${encodeURIComponent(text)}`;
  $('#aiChatGPT').href = `https://chatgpt.com/?q=${encodeURIComponent(text)}`;
  const say = (s) => { $('#aiStatus').textContent = s; setTimeout(() => { $('#aiStatus').textContent = ''; }, 1500); };
  $('#aiBtn').addEventListener('click', () => { tilt.request?.(); dialog.showModal(); });
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

// ================================================================= the maker ====
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
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage may be off */ } };

// ---------------------------------------------------------------- the level ----

let level = null;
let past = [];                 // levels before each edit, for Ctrl+Z
let brush = '#';
let hazardPick = -1;           // index of the hazard whose route clicks lay, or -1
let playing = false;
let report = null;             // the checker's last word on this level

/** Every change goes through here: history, storage, the views. */
function setLevel(next, { remember = true, reset = false } = {}) {
  if (reset) past = [];
  else if (level && remember) { past.push(level); if (past.length > 200) past.shift(); }
  level = normalize(next);
  if (next.hazards?.length === 0) delete level.hazards;
  report = null;
  save(STORE, JSON.stringify(level));
  render();
}
function undoEdit() { if (past.length) { level = past.pop(); report = null; save(STORE, JSON.stringify(level)); render(); } }

// ----------------------------------------------------------------- the views ----

const board = $('#board'), bctx = board.getContext('2d');
const ascii = $('#ascii');
const hazardsEl = $('#hazards');

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
  b.addEventListener('click', () => { brush = ch; hazardPick = -1; render(); });
  $('#palette').append(b);
}

const dims = () => ({ w: Math.max(...level.rows.map(r => r.length)), h: level.rows.length });

function drawEdit() {
  const { w, h } = dims();
  board.width = w * TILE; board.height = h * TILE;
  const theme = THEMES[level.theme] ?? THEMES.garden;
  bctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = level.rows[y][x] ?? '.';
    const px = x * TILE, py = y * TILE;
    drawCell(bctx, scene, theme, ch in CHARS ? ch : '.', x, y, TILE);
    const over = { G: theme.gateClosed, L: 'lever_up', b: 'button_heart_up', D: 'door_heart_closed' }[ch];
    if (over) bctx.drawImage(scene.tiles.images[over], px, py, TILE, TILE);
    if (ch === 'O') bctx.drawImage(scene.items.images.rock_pair, px, py, TILE, TILE);
    if (ch === 'A') bctx.drawImage(scene.byId.alice2.images.S[0], px, py, TILE, TILE);
    if (!(ch in CHARS)) { bctx.fillStyle = 'rgba(244,121,141,.55)'; bctx.fillRect(px, py, TILE, TILE); }
  }
  // the grid, faint
  bctx.strokeStyle = 'rgba(255,255,255,.08)'; bctx.lineWidth = 1;
  for (let x = 1; x < w; x++) { bctx.beginPath(); bctx.moveTo(x * TILE + .5, 0); bctx.lineTo(x * TILE + .5, h * TILE); bctx.stroke(); }
  for (let y = 1; y < h; y++) { bctx.beginPath(); bctx.moveTo(0, y * TILE + .5); bctx.lineTo(w * TILE, y * TILE + .5); bctx.stroke(); }
  // the routes: a loop per hazard, its character at the first point, numbered corners
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6fb0f0';
  const hot = getComputedStyle(document.documentElement).getPropertyValue('--hot').trim() || '#f4798d';
  (level.hazards ?? []).forEach((hz, n) => {
    const on = n === hazardPick;
    const pts = hz.route;
    if (!pts.length) return;
    bctx.strokeStyle = on ? accent : hot; bctx.lineWidth = on ? 4 : 2.5; bctx.setLineDash(on ? [] : [6, 6]);
    bctx.beginPath();
    pts.forEach(([x, y], i) => bctx[i ? 'lineTo' : 'moveTo'](x * TILE + TILE / 2, y * TILE + TILE / 2));
    if (pts.length > 2) bctx.closePath();
    else if (pts.length === 2) bctx.lineTo(pts[0][0] * TILE + TILE / 2, pts[0][1] * TILE + TILE / 2);
    bctx.stroke(); bctx.setLineDash([]);
    pts.forEach(([x, y], i) => {
      bctx.fillStyle = on ? accent : hot;
      bctx.beginPath(); bctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 9, 0, Math.PI * 2); bctx.fill();
      bctx.fillStyle = '#05080f'; bctx.font = 'bold 11px monospace'; bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
      bctx.fillText(String(i + 1), x * TILE + TILE / 2, y * TILE + TILE / 2 + .5);
    });
    const who = scene.byId[hz.character ?? hz.id];
    if (who) { bctx.globalAlpha = .9; bctx.drawImage(who.images.S[0], pts[0][0] * TILE, pts[0][1] * TILE - 10, TILE, TILE); bctx.globalAlpha = 1; }
  });
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
  $('#editName').textContent = kind === 'chase' ? `timed · ${level.tickMs ?? 320} ms a tick` : 'untimed';
  const { w, h } = dims();
  $('#width').value = w; $('#height').value = h;
  $('#theme').value = level.theme ?? 'garden';
  $('#kind').value = kind;
  $('#tickField').hidden = kind !== 'chase';
  $('#tickMs').value = level.tickMs ?? 320;
  if (document.activeElement !== ascii) ascii.value = level.rows.join('\n');
  for (const b of document.querySelectorAll('.brush')) b.classList.toggle('on', hazardPick < 0 && b.dataset.ch === brush);
  renderHazards();
  drawEdit();
  const problems = lint(level);
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
}

function showReport() {
  const el = $('#report');
  if (!report) { el.textContent = ''; el.className = 'status'; return; }
  if (report.pending) { el.textContent = 'asking the solver…'; el.className = 'status busy'; return; }
  if (!report.ok) { el.textContent = report.problems.join(' · '); el.className = 'status hot'; return; }
  const unit = report.kind === 'chase' ? 'ticks' : 'moves';
  el.textContent = `solvable: par ${report.par} ${unit} (${report.explored} states, ${report.ms} ms)${report.notes.length ? ' · ' + report.notes.join(' · ') : ''}`;
  el.className = 'status win';
}

// ------------------------------------------------------------------ editing ----

function cellAt(e) {
  const r = board.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * board.width / TILE);
  const y = Math.floor((e.clientY - r.top) / r.height * board.height / TILE);
  const { w, h } = dims();
  return (x < 0 || y < 0 || x >= w || y >= h) ? null : { x, y };
}
let painting = null;   // the brush of the stroke in progress, so one drag is one undo step
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
  painting = e.button === 2 ? '.' : brush;
  board.setPointerCapture(e.pointerId);
  setLevel(setCell(level, c.x, c.y, painting));
});
board.addEventListener('pointermove', (e) => {
  if (!painting) return;
  const c = cellAt(e);
  if (!c || level.rows[c.y][c.x] === painting || painting === 'A' || painting === 'D') return;
  setLevel(setCell(level, c.x, c.y, painting), { remember: false });
});
const endStroke = () => { painting = null; };
board.addEventListener('pointerup', endStroke);
board.addEventListener('pointercancel', endStroke);

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
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (playing) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoEdit(); return; }
  const ch = Object.keys(BRUSH_KEYS).find(k => BRUSH_KEYS[k] === e.key);
  if (ch) { brush = ch; hazardPick = -1; render(); }
});
$('#newBtn').addEventListener('click', () => { hazardPick = -1; setLevel(blank(9, 7)); });

// ------------------------------------------------------------------ loading ----
// The shipped stages and the community's, as starting points. ?level= in the
// address wins, then the room left here last time, then a blank one.

{
  const sel = $('#load');
  const shipped = [['tea-party', 'A Mad Tea Party'], ['queens-gauntlet', "The Queen's Gauntlet"]];
  for (const [id, name] of shipped) sel.append(new Option(name, `stages/${id}.js`));
  fetch('stages/community/index.json', { cache: 'no-cache' }).then(r => r.json()).then((m) => {
    for (const s of m.stages ?? []) sel.append(new Option(`${s.name} (community)`, `stages/community/${s.id}.js`));
  }).catch(() => {});
  sel.addEventListener('change', async () => {
    if (!sel.value) return;
    try {
      const mod = await import(`../${sel.value}`);
      const stage = Object.values(mod).find(v => v && Array.isArray(v.rows));
      hazardPick = -1;
      setLevel(stage);
    } catch (e) { report = { ok: false, problems: [`could not load ${sel.value}: ${e.message}`] }; showReport(); }
    sel.value = '';
  });
}

{
  const token = new URLSearchParams(location.search).get('level');
  let first = null;
  if (token) { try { first = decodeShare(token); } catch { first = null; } }
  if (!first) { const kept = load(STORE); if (kept) { try { first = JSON.parse(kept); } catch { first = null; } } }
  $('#author').value = load(AUTHOR) ?? '';
  setLevel(first ?? blank(9, 7), { reset: true });
}

// ------------------------------------------------------------------ checking ----

let worker = null;
try { worker = new Worker(new URL('./check-worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; }
let checkId = 0;
function runCheck() {
  return new Promise((resolve) => {
    const id = ++checkId;
    const lvl = level;
    report = { pending: true }; showReport();
    const done = (r) => { if (id !== checkId) return; report = r; showReport(); resolve(r); };
    if (!worker) { setTimeout(() => done(check(lvl)), 20); return; }
    const onMsg = (e) => { if (e.data.id !== id) return; worker.removeEventListener('message', onMsg); done(e.data.report); };
    worker.addEventListener('message', onMsg);
    worker.postMessage({ id, level: lvl });
  });
}
$('#checkBtn').addEventListener('click', runCheck);

// --------------------------------------------------------------- run & debug ----
// The room as the stages page plays it: the untimed rules of src/puzzle.js or
// the timed ones of src/chase.js, driven by the pad - which here carries the
// keyboard, the simulated badge's keys and a real badge alike.

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
}
const cellName = (map, i) => `${i % map.w},${(i / map.w) | 0}`;

function teaMove(dir, { tell = true } = {}) {
  const { map } = game;
  const next = teaStep(map, game.state, dir);
  game.facing = dir;
  if (!next) { if (tell) log(`${dir}: blocked`, 'hot'); status(); return; }
  game.history.push(game.state);
  game.state = next; game.ticks++;
  if (tell) log(`${dir}: Alice at ${cellName(map, next.alice)}${next.lever !== game.history.at(-1).lever ? ', the lever thrown' : ''}`);
  if (teaGoal(map, next)) log(`solved in ${game.ticks} moves`, 'win');
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
  if (game.plan && game.planAt >= game.plan.length) game.plan = null;
  if (chaseGoal(game.map, next)) log(`out in ${game.ticks} ticks`, 'win');
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
});
addEventListener('keydown', (e) => {
  if (!playing || !game) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === 'r' || e.key === 'R') resetPlay();
  if (e.key === 'Backspace' && game.kind === 'tea') { e.preventDefault(); undoPlay(); }
  if (e.key === ' ' && game.kind === 'chase' && !game.plan) { e.preventDefault(); game.queued = 'wait'; if (game.waiting) { game.waiting = false; tick(); } }
});

$('#playBtn').addEventListener('click', startPlay);
$('#editBtn').addEventListener('click', () => { stopPlay(); $('#editPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#resetBtn').addEventListener('click', resetPlay);
$('#undoBtn').addEventListener('click', undoPlay);
$('#solveBtn').addEventListener('click', async () => {
  if (!playing) startPlay();
  const r = report?.ok ? report : await runCheck();
  if (!r.ok) { say(r.problems.join(' · '), 'hot'); return; }
  resetPlay();
  log(`the solver's ${r.par} ${r.kind === 'chase' ? 'ticks' : 'moves'}`, 'win');
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
});

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
  });
  $('#downloadModule').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([module()], { type: 'text/javascript' }));
    a.download = `${idOf(level)}.js`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#shareBtn').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?level=${encodeShare(level)}`;
    try { await navigator.clipboard.writeText(url); flash($('#exportStatus'), 'link copied'); }
    catch { prompt('the link', url); }
  });
  $('#importBtn').addEventListener('click', async () => {
    try {
      const lvl = await fromModule($('#importText').value);
      hazardPick = -1;
      setLevel(lvl);
      flash($('#importStatus'), `imported ${lvl.name}`);
    } catch (e) { $('#importStatus').textContent = e.message; }
  });
}

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

// scripted tests read and drive the maker through this; the pad is window.__pad
window.__maker = {
  dev: true, repo, prompt: aiPrompt(repo),
  get level() { return level; }, setLevel, lint: () => lint(level), check: runCheck, get report() { return report; },
  play: startPlay, stop: stopPlay, get game() { return game; }, get playing() { return playing; },
  module: () => toModule(level), share: () => encodeShare(level),
};

}
