// Alice in AI Land - asset sheet.
//
// Everything on this page comes from the supplied art: five 8-way walk cycles
// under assets/characters/ and the item set under assets/items/. Nothing is
// generated or drawn in code.

import { parse, step, solve, isGoal } from './puzzle.js';
import { parse as parseChase, step as chaseStep, solve as solveChase,
         isGoal as isChaseGoal, hazardCells, hazardAt, seenBy } from './chase.js';
import { TEA_PARTY } from '../stages/tea-party.js';
import { QUEENS_GAUNTLET } from '../stages/queens-gauntlet.js';

const $ = (sel) => document.querySelector(sel);

const state = { zoom: 2, animate: true, backdrop: 'checker' };

const WALK_CHARACTERS = [
  { id: 'alice2',   label: 'Alice' },
  { id: 'rabbit',   label: 'White Rabbit' },
  { id: 'hatter',   label: 'Mad Hatter' },
  { id: 'queen',    label: 'Red Queen' },
  { id: 'cheshire', label: 'Cheshire Cat' },
];

const loadImage = async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};

/** One character: manifest + every frame, keyed by direction. */
async function loadCharacter({ id, label }) {
  const dir = `assets/characters/${id}`;
  const meta = await (await fetch(`${dir}/${id}.json`)).json();
  const images = {};
  await Promise.all(Object.entries(meta.directions).flatMap(([d, files]) =>
    files.map(async (file, i) => { (images[d] ||= [])[i] = await loadImage(`${dir}/${file}`); })));
  return { id, label, meta, images };
}

/** A folder of single-image assets plus its manifest (items, tiles). */
async function loadSet(folder, manifestKey) {
  const meta = await (await fetch(`assets/${folder}/${folder}.json`)).json();
  const list = meta[manifestKey];
  const images = {};
  await Promise.all(list.map(async (it) => {
    images[it.name] = await loadImage(`assets/${folder}/${it.file}`);
  }));
  return { meta, list, images };
}

const [characters, items, tiles] = await Promise.all([
  Promise.all(WALK_CHARACTERS.map(loadCharacter)),
  loadSet('items', 'items'),
  loadSet('tiles', 'tiles'),
]);
const byId = Object.fromEntries(characters.map(c => [c.id, c]));

// --------------------------------------------------------------- controls ----

$('#zoom').addEventListener('input', (e) => {
  state.zoom = +e.target.value;
  $('#zoomOut').textContent = `${state.zoom}×`;
  drawItems(); drawTiles();
});
$('#animate').addEventListener('change', (e) => { state.animate = e.target.checked; });
$('#backdrop').addEventListener('change', (e) => {
  state.backdrop = e.target.value;
  document.querySelectorAll('.swatchbox').forEach(el => { el.className = `swatchbox ${state.backdrop}`; });
});

// ------------------------------------------------------------------ items ----

/** Renders one asset set into a grid with category filters. */
function assetGrid(set, gridSel, filterSel) {
  const gridEl = $(gridSel);
  let filter = 'all';

  const filters = $(filterSel);
  for (const name of ['all', ...new Set(set.list.map(i => i.category))]) {
    const b = document.createElement('button');
    b.className = 'tab' + (name === 'all' ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => {
      filter = name;
      [...filters.children].forEach(c => c.classList.toggle('on', c === b));
      draw();
    });
    filters.append(b);
  }

  function draw() {
  gridEl.textContent = '';
  const size = set.meta.size;
  for (const item of set.list) {
    if (filter !== 'all' && item.category !== filter) continue;
    const cell = document.createElement('figure');
    cell.className = 'item';
    const box = document.createElement('div');
    box.className = `swatchbox ${state.backdrop}`;
    const canvas = document.createElement('canvas');
    canvas.width = size * state.zoom;
    canvas.height = size * state.zoom;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(set.images[item.name], 0, 0, canvas.width, canvas.height);
    box.append(canvas);
    const cap = document.createElement('figcaption');
    cap.textContent = item.name;
    cap.title = 'click to copy';
    cap.addEventListener('click', () => {
      navigator.clipboard?.writeText(item.name);
      const old = cap.textContent;
      cap.textContent = 'copied ✓';
      cap.classList.add('copied');
      setTimeout(() => { cap.textContent = old; cap.classList.remove('copied'); }, 900);
    });
    cell.append(box, cap);
    gridEl.append(cell);
  }
  }

  draw();
  return draw;
}

const drawItems = assetGrid(items, '#items', '#itemFilters');
const drawTiles = assetGrid(tiles, '#tiles', '#tileFilters');

// ------------------------------------------------------- walk cycle panel ----

const LABEL = ['stand', 'step 1', 'stand', 'step 2'];
const LAYOUT = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'];
const compass = $('#compass');
const hero = $('#heroCanvas');
const heroCtx = hero.getContext('2d');

let active = characters[0];
let facing = 'S';
let cells = [];

const tabEls = characters.map((c) => {
  const b = document.createElement('button');
  b.className = 'tab';
  b.textContent = c.label;
  b.addEventListener('click', () => setCharacter(c));
  $('#walkTabs').append(b);
  return { c, b };
});

function buildCompass() {
  const { frameWidth: FW, frameHeight: FH } = active.meta;
  compass.textContent = '';
  cells = [];
  for (const dir of LAYOUT) {
    const el = document.createElement('div');
    if (!dir) { el.className = 'cell spacer'; compass.append(el); continue; }
    el.className = 'cell';
    const canvas = document.createElement('canvas');
    canvas.width = FW * 2; canvas.height = FH * 2;
    el.append(canvas, Object.assign(document.createElement('b'), { textContent: dir }));
    el.addEventListener('click', () => setDir(dir));
    compass.append(el);
    cells.push({ dir, el, ctx: canvas.getContext('2d') });
  }
  hero.width = FW * 4; hero.height = FH * 4;
}

function setDir(d) {
  facing = d;
  $('#heroDir').textContent = d;
  for (const c of cells) c.el.classList.toggle('on', c.dir === d);
}

function setCharacter(c) {
  active = c;
  for (const t of tabEls) t.b.classList.toggle('on', t.c === c);
  buildCompass();
  setDir(facing);
}

// ?walk=<id> opens straight on a character
const wanted = new URLSearchParams(location.search).get('walk');
setCharacter(characters.find(c => c.id === wanted) ?? characters[0]);

const held = new Set();
const KEYS = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E',
               w: 'N', s: 'S', a: 'W', d: 'E' };
addEventListener('keydown', (e) => {
  const k = KEYS[e.key];
  if (!k) return;
  e.preventDefault();
  held.add(k);
  const ns = held.has('N') ? 'N' : held.has('S') ? 'S' : '';
  const ew = held.has('E') ? 'E' : held.has('W') ? 'W' : '';
  if (ns + ew) setDir(ns + ew);
});
addEventListener('keyup', (e) => { const k = KEYS[e.key]; if (k) held.delete(k); });

let period = 160;
$('#walkSpeed').addEventListener('input', (e) => {
  period = +e.target.value;
  $('#walkSpeedOut').textContent = `${period}ms`;
});
const playing = () => $('#walkPlay').checked && state.animate;

// ------------------------------------------------------------------ stage ----

// ----------------------------------------------------------------- themes ----
// A stage picks its look from a theme: each map character maps to a list of
// tiles, and which one a cell gets is a hash of its coordinates. Deterministic,
// so the room looks hand-dressed but never shuffles between frames.

const hash2 = (x, y) => {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
};
const pick = (list, x, y) => list[hash2(x, y) % list.length];

const THEMES = {
  // the tea party is a walled garden
  garden: {
    '#': ['hedge_daisies', 'hedge_wide', 'hedge_daisies', 'hedge_roses',
          'hedge_wide', 'hedge_daisies', 'pillar_rose', 'hedge_daisies'],
    '.': ['floor_grass_clover', 'floor_grass_roses', 'floor_grass_flowers',
          'floor_grass_clover', 'floor_grass_flowers', 'floor_dirt_patch'],
    A: ['floor_grass_clover'],
    O: ['floor_dirt_patch'],
    b: ['floor_checker_framed'],
    L: ['floor_dirt_cross'],
    G: ['floor_dirt_cross'],
    D: ['floor_carpet_heart'],
    gateClosed: 'hedge_post_left',
  },
  // the gauntlet is the Queen's hall
  hall: {
    // mostly plain: a banner every few cells reads as decoration, a banner on
    // every cell reads as noise and stops the wall looking like a wall
    '#': ['wall_blue', 'wall_blue', 'wall_blue', 'wall_blue', 'wall_blue',
          'wall_blue', 'pillar_blue', 'wall_blue', 'wall_blue',
          'wall_blue_banner_white', 'wall_blue', 'wall_blue_banner_red'],
    '.': ['floor_marble_plain', 'floor_marble_veined', 'floor_marble_plain',
          'floor_marble_cracked'],
    A: ['floor_marble_plain'],
    O: ['floor_marble_veined'],
    b: ['floor_checker_blue'],
    L: ['floor_marble_heart'],
    G: ['floor_carpet_heart'],
    D: ['floor_carpet_heart'],
    gateClosed: 'hedge_rail',
  },
};

/**
 * Every cell gets a floor first, then whatever stands on it. Some wall pieces -
 * pillars, posts, rails - are narrower than a cell, and without a floor beneath
 * them the gap is just background showing through.
 */
function drawCell(ctx, theme, ch, x, y, size) {
  const px = x * size, py = y * size;
  const floorList = theme[ch] && ch !== '#' ? theme[ch] : theme['.'];
  ctx.drawImage(tiles.images[pick(floorList, x, y)], px, py, size, size);
  if (ch === '#') ctx.drawImage(tiles.images[pick(theme['#'], x, y)], px, py, size, size);
}

// ------------------------------------------------------------------ stage ----
// The playable puzzle. Rules and solver live in src/puzzle.js, so the Solve
// button runs the same search that tools/verify-stage.mjs uses to prove the
// stage ships - it is a solver, not a recording.

const TILE = 48;
const map = parse(TEA_PARTY.rows);
const stage = $('#stage');
const sctx = stage.getContext('2d');
stage.width = map.w * TILE;
stage.height = map.h * TILE;

const TEA_THEME = THEMES.garden;

let board = map.start;   // the puzzle state; `state` above is the page UI
let aliceFacing = 'S';
let stepsTaken = 0;
let solution = null;       // moves queued for playback
let playbackAt = 0;
let playTimer = null;
let playSpeed = 120;

const statusEl = $('#stageStatus');
const setStatus = (text, kind = '') => {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
};

function buttonsPressed() { return board.rocks.filter(r => map.buttons.has(r)).length; }

function refreshStatus() {
  if (isGoal(map, board)) setStatus(`solved in ${stepsTaken} moves`, 'win');
  else if (solution) setStatus(`playing solution — move ${playbackAt} of ${solution.length}`, 'busy');
  else setStatus(`${buttonsPressed()} of ${map.buttons.size} buttons held · ${stepsTaken} moves`);
}

function applyMove(dir) {
  const next = step(map, board, dir);
  aliceFacing = dir;
  if (!next) return false;
  board = next;
  stepsTaken++;
  refreshStatus();
  return true;
}

/** Playback runs on its own clock, not the render loop - one move per tick,
 *  whatever the frame rate is doing. */
function startPlayback(moves) {
  stopPlayback();
  solution = moves;
  playbackAt = 0;
  playTimer = setInterval(() => {
    if (playbackAt >= solution.length) { stopPlayback(); return; }
    applyMove(solution[playbackAt++]);
  }, playSpeed);
  refreshStatus();
}

function stopPlayback() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  solution = null;
  $('#solveBtn').disabled = false;
  refreshStatus();
}

function resetStage() {
  stopPlayback();
  board = map.start;
  aliceFacing = 'S';
  stepsTaken = 0;
  playbackAt = 0;
  refreshStatus();
}

function drawStage(now) {
  sctx.imageSmoothingEnabled = false;
  sctx.clearRect(0, 0, stage.width, stage.height);

  const allHeld = buttonsPressed() === map.buttons.size;

  map.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const i = y * map.w + x;
    const px = x * TILE, py = y * TILE;

    drawCell(sctx, TEA_THEME, ch, x, y, TILE);

    if (map.gates.has(i) && !board.lever)
      sctx.drawImage(tiles.images[TEA_THEME.gateClosed], px, py, TILE, TILE);
    if (map.levers.has(i))
      sctx.drawImage(tiles.images[board.lever ? 'lever_down' : 'lever_up'], px, py, TILE, TILE);
    if (map.buttons.has(i)) {
      const pressed = board.rocks.includes(i);
      sctx.drawImage(tiles.images[pressed ? 'button_heart_down' : 'button_heart_up'], px, py, TILE, TILE);
    }
    if (i === map.door)
      sctx.drawImage(tiles.images[allHeld ? 'door_heart_open' : 'door_heart_closed'], px, py, TILE, TILE);
  }));

  for (const rock of board.rocks)
    sctx.drawImage(items.images.rock_pair,
                   (rock % map.w) * TILE, ((rock / map.w) | 0) * TILE, TILE, TILE);

  // Alice: her walk frames step while a solution is playing, otherwise she stands
  const aliceChar = byId.alice2;
  const aliceCycle = aliceChar.meta.cycle ?? [0, 1, 0, 2];
  const aliceBeat = solution ? Math.floor(now / playSpeed) % aliceCycle.length : 0;
  const aliceFrame = aliceChar.images[aliceFacing][aliceCycle[aliceBeat]];
  sctx.drawImage(aliceFrame, (board.alice % map.w) * TILE, ((board.alice / map.w) | 0) * TILE, TILE, TILE);

}

const KEY_DIRS = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E',
                   w: 'N', s: 'S', a: 'W', d: 'E' };
addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') { resetStage(); return; }
  const dir = KEY_DIRS[e.key];
  if (!dir || solution) return;
  e.preventDefault();
  applyMove(dir);
});

$('#resetBtn').addEventListener('click', resetStage);
$('#playSpeed').addEventListener('input', (e) => {
  playSpeed = +e.target.value;
  $('#playSpeedOut').textContent = `${playSpeed}ms`;
  if (solution) startPlayback(solution.slice(playbackAt));   // re-time mid-run
});

$('#solveBtn').addEventListener('click', () => {
  $('#solveBtn').disabled = true;
  setStatus('searching…', 'busy');
  // let the status paint before the search blocks the thread
  setTimeout(() => {
    const from = { ...board };
    const t0 = performance.now();
    const { moves, explored } = solve({ ...map, start: from });
    const ms = Math.round(performance.now() - t0);
    if (!moves) {
      setStatus(`no solution from here (${explored} states, ${ms}ms) — press Reset`);
      $('#solveBtn').disabled = false;
      return;
    }
    console.log(`[stage] solved in ${moves.length} moves, ${explored} states, ${ms}ms`);
    startPlayback(moves);
  }, 30);
});

resetStage();

// ?autosolve=tea kicks the solver on load - handy for a screenshot or smoke test
if (new URLSearchParams(location.search).get('autosolve') === 'tea') {
  setTimeout(() => $('#solveBtn').click(), 400);
}

// ------------------------------------------------------------------- loop ----

let beat = 0, last = performance.now();
function tick(now) {
  const cycle = active.meta.cycle ?? [0, 1, 0, 2];
  if (playing() && now - last >= period) { beat = (beat + 1) % cycle.length; last = now; }
  if (!playing()) beat = 0;

  const frame = cycle[beat];
  const { frameWidth: FW, frameHeight: FH } = active.meta;
  $('#heroFrame').textContent = LABEL[beat % LABEL.length];

  for (const c of cells) {
    c.ctx.imageSmoothingEnabled = false;
    c.ctx.clearRect(0, 0, FW * 2, FH * 2);
    c.ctx.drawImage(active.images[c.dir][frame], 0, 0, FW * 2, FH * 2);
  }
  heroCtx.imageSmoothingEnabled = false;
  heroCtx.clearRect(0, 0, FW * 4, FH * 4);
  heroCtx.drawImage(active.images[facing][frame], 0, 0, FW * 4, FH * 4);

  drawStage(now);
  drawChase(now);
  requestAnimationFrame(tick);
}

// ---------------------------------------------------- stage: timed room ----
// The Queen's Gauntlet. The world advances on its own clock whether or not the
// player does anything, so this stage is a dexterity test as much as a puzzle:
// 64 correct inputs, each inside one tick, and being seen ends the run.

const chaseMap = parseChase(QUEENS_GAUNTLET);
const chase = $('#chase');
const cctx = chase.getContext('2d');
chase.width = chaseMap.w * TILE;
chase.height = chaseMap.h * TILE;

const CHASE_THEME = THEMES.hall;
const HAZARD_CHARACTER = { queen: 'queen', cheshire: 'cheshire', rabbit: 'rabbit' };

let chaseState = chaseMap.start;
let chaseFacing = 'S';
let chaseTicks = 0;
let chaseDead = false;
let chasePlan = null;
let chasePlanAt = 0;
let chaseTimer = null;
let chaseTickMs = chaseMap.tickMs;
let queued = null;          // the input this tick, if the player gave one

const chaseStatus = $('#chaseStatus');
function setChaseStatus() {
  if (chaseDead) {
    chaseStatus.textContent = `caught on tick ${chaseTicks} — press R`;
    chaseStatus.className = 'status hot';
  } else if (isChaseGoal(chaseMap, chaseState)) {
    chaseStatus.textContent = `out in ${chaseTicks} ticks (par 64)`;
    chaseStatus.className = 'status win';
  } else {
    const held = chaseState.rocks.filter(r => chaseMap.buttons.has(r)).length;
    chaseStatus.textContent =
      `tick ${chaseTicks} · ${held}/${chaseMap.buttons.size} buttons${chasePlan ? ' · solving' : ''}`;
    chaseStatus.className = `status${chasePlan ? ' busy' : ''}`;
  }
}

function chaseRestart() {
  chaseState = chaseMap.start;
  chaseFacing = 'S';
  chaseTicks = 0;
  chaseDead = false;
  chasePlan = null;
  chasePlanAt = 0;
  queued = null;
  $('#chaseSolve').disabled = false;
  setChaseStatus();
}

/** One tick of the world: whatever Alice does, the cast moves. */
function chaseTick() {
  if (chaseDead || isChaseGoal(chaseMap, chaseState)) return;
  const action = chasePlan ? (chasePlan[chasePlanAt++] ?? 'wait') : (queued ?? 'wait');
  queued = null;
  if (action !== 'wait') chaseFacing = action;

  const next = chaseStep(chaseMap, chaseState, action);
  if (!next) {
    // an illegal move is just a bump; a fatal one ends the run
    const bumped = chaseStep(chaseMap, chaseState, 'wait');
    if (action !== 'wait' && bumped) { chaseState = bumped; chaseTicks++; setChaseStatus(); return; }
    chaseDead = true;
    chasePlan = null;
    $('#chaseSolve').disabled = false;
    setChaseStatus();
    return;
  }
  chaseState = next;
  chaseTicks++;
  if (chasePlan && chasePlanAt >= chasePlan.length) {
    chasePlan = null;
    $('#chaseSolve').disabled = false;
  }
  setChaseStatus();
}

function startClock() {
  if (chaseTimer) clearInterval(chaseTimer);
  chaseTimer = setInterval(() => { if ($('#chaseRun').checked) chaseTick(); }, chaseTickMs);
}
startClock();

function drawChase(now) {
  cctx.imageSmoothingEnabled = false;
  cctx.clearRect(0, 0, chase.width, chase.height);

  const allHeld = chaseState.rocks.every(r => chaseMap.buttons.has(r));
  chaseMap.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const i = y * chaseMap.w + x;
    const px = x * TILE, py = y * TILE;
    drawCell(cctx, CHASE_THEME, ch, x, y, TILE);
    if (chaseMap.gates.has(i) && !chaseState.lever)
      cctx.drawImage(tiles.images[CHASE_THEME.gateClosed], px, py, TILE, TILE);
    if (chaseMap.levers.has(i))
      cctx.drawImage(tiles.images[chaseState.lever ? 'lever_down' : 'lever_up'], px, py, TILE, TILE);
    if (chaseMap.buttons.has(i))
      cctx.drawImage(tiles.images[chaseState.rocks.includes(i) ? 'button_heart_down' : 'button_heart_up'],
                     px, py, TILE, TILE);
    if (i === chaseMap.door)
      cctx.drawImage(tiles.images[allHeld ? 'door_heart_open' : 'door_heart_closed'], px, py, TILE, TILE);
  }));

  // what the Queen can see this tick - the rule is invisible otherwise
  for (const hz of chaseMap.hazards) {
    if (!hz.sight) continue;
    for (let i = 0; i < chaseMap.w * chaseMap.h; i++) {
      if (!seenBy(chaseMap, hz, chaseState.phase, i)) continue;
      cctx.fillStyle = 'rgba(226, 64, 84, .22)';
      cctx.fillRect((i % chaseMap.w) * TILE, ((i / chaseMap.w) | 0) * TILE, TILE, TILE);
    }
  }

  for (const rock of chaseState.rocks)
    cctx.drawImage(items.images.rock_pair,
                   (rock % chaseMap.w) * TILE, ((rock / chaseMap.w) | 0) * TILE, TILE, TILE);

  // the cast, facing the way they are walking
  for (const { hz, cell } of hazardCells(chaseMap, chaseState.phase)) {
    const character = byId[HAZARD_CHARACTER[hz.id]];
    if (!character) continue;
    const ahead = hazardAt(chaseMap, hz, chaseState.phase + 1);
    const dx = Math.sign((ahead % chaseMap.w) - (cell % chaseMap.w));
    const dy = Math.sign(((ahead / chaseMap.w) | 0) - ((cell / chaseMap.w) | 0));
    const dir = dy < 0 ? 'N' : dy > 0 ? 'S' : dx > 0 ? 'E' : 'W';
    const cyc = character.meta.cycle ?? [0, 1, 0, 2];
    const img = character.images[dir][cyc[Math.floor(now / chaseTickMs) % cyc.length]];
    cctx.drawImage(img, (cell % chaseMap.w) * TILE, ((cell / chaseMap.w) | 0) * TILE, TILE, TILE);
  }

  const al = byId.alice2;
  const alCyc = al.meta.cycle ?? [0, 1, 0, 2];
  const alImg = al.images[chaseFacing][alCyc[Math.floor(now / chaseTickMs) % alCyc.length]];
  cctx.globalAlpha = chaseDead ? 0.35 : 1;
  cctx.drawImage(alImg, (chaseState.alice % chaseMap.w) * TILE,
                 ((chaseState.alice / chaseMap.w) | 0) * TILE, TILE, TILE);
  cctx.globalAlpha = 1;
}

const CHASE_KEYS = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E',
                     w: 'N', s: 'S', a: 'W', d: 'E', ' ': 'wait' };
addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') { chaseRestart(); return; }
  const action = CHASE_KEYS[e.key];
  if (!action || chasePlan) return;
  queued = action;                       // consumed by the next tick, not now
});

$('#chaseReset').addEventListener('click', chaseRestart);
$('#chaseSpeed').addEventListener('input', (e) => {
  chaseTickMs = +e.target.value;
  $('#chaseSpeedOut').textContent = `${chaseTickMs}ms`;
  startClock();
});
$('#chaseSolve').addEventListener('click', () => {
  $('#chaseSolve').disabled = true;
  chaseStatus.textContent = 'searching…';
  chaseStatus.className = 'status busy';
  setTimeout(() => {
    const t0 = performance.now();
    const { moves, explored } = solveChase(chaseMap, chaseState);
    const ms = Math.round(performance.now() - t0);
    if (!moves) {
      chaseStatus.textContent = `no way out from here (${explored} states, ${ms}ms) — press R`;
      $('#chaseSolve').disabled = false;
      return;
    }
    console.log(`[gauntlet] ${moves.length} ticks, ${explored} states, ${ms}ms`);
    chasePlan = moves;
    chasePlanAt = 0;
    setChaseStatus();
  }, 30);
});

chaseRestart();
if (new URLSearchParams(location.search).get('autosolve') === 'chase')
  setTimeout(() => $('#chaseSolve').click(), 400);

// The render loop starts last: everything it draws has to exist first.
requestAnimationFrame(tick);
