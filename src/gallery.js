// Alice in AI Land - the stages page.
//
// Two rooms - the tea party (src/puzzle.js) and the gauntlet (src/chase.js) -
// drawn from the supplied art, driven by the badge, with a tutorial (src/
// tutor.js, src/coach.js) that watches what the player does. The bench's
// walk-cycle viewer and asset sheets live here too, on a dev host only.
// Everything drawn comes from assets/ through src/scene.js: five 8-way walk
// cycles under assets/characters/ and the item and tile sets. Nothing is
// drawn in code.

import { parse, step, solve, isGoal } from './puzzle.js';
import { parse as parseChase, step as chaseStep, solve as solveChase, isGoal as isChaseGoal } from './chase.js';
import { TILE, THEMES, loadScene, drawRoom } from './scene.js';
import { Pad, flipFor } from './pad.js';
import { openGate, gateMode, gateSources, showRefusal } from './gate.js';
import { loadStage } from './seal.js';
import { initLooks } from './looks.js';
import { Tutor, STAGES_TUTORIAL } from './tutor.js';
import { mountCoach, tutorStore } from './coach.js';

const $ = (sel) => document.querySelector(sel);

// ------------------------------------------------------------------ input ----

// The badge is the controller for both stages. On the site it is the only
// one (src/gate.js asks for it before anything plays); on a dev host the
// keyboard works too. The stages themselves come through src/seal.js, so a
// sealed copy under stages/sealed/ takes over from the plain module the
// moment one is published.
const mode = gateMode();
const pad = new Pad({ sources: gateSources(mode), flip: flipFor(location.search) }).start();
window.__pad = pad;

// While the badge is away the gate mutes the pad and the page holds still:
// the gauntlet's clock, a solver's playback and the walk cycle all check
// `paused`. The gate calls the hooks after the module is up (see the end).
let paused = false;
const hooks = {};
const gatePromise = openGate({ pad, mode, onPause: (why) => hooks.pause?.(why), onResume: () => hooks.resume?.() });

// Which stage the badge's d-pad drives: the one last tapped, or the one the
// phone looks' mode bar shows; the tea party first.
let armedStage = 'tea';
function armStage(which) {
  armedStage = which;
  $('#teaPanel').classList.toggle('armed', which === 'tea');
  $('#chasePanel').classList.toggle('armed', which === 'chase');
}
$('#teaPanel').addEventListener('pointerdown', () => armStage('tea'));
$('#chasePanel').addEventListener('pointerdown', () => armStage('chase'));

// the look picker and the mode bar (src/looks.js), up before the gate so a
// phone can pick its look while the badge is still being asked for
const looksReady = initLooks({ onMode(m) { if (m === 'tea' || m === 'chase') armStage(m); } });

// The tutorial, A Caucus Race: every edge and everything a stage does is fed
// to it; a step that comes up arms its stage and, on a phone, shows it. The
// coach itself is mounted once the stages exist (end of the file).
const tutor = new Tutor(STAGES_TUTORIAL, tutorStore('alice.tutor.stages'));
let coach = null;
const tutorFeed = (ev) => coach?.feed(ev);
pad.on(({ button, down, source }) => tutorFeed({ kind: 'edge', button, down, source }));

const state = { zoom: 2, backdrop: 'checker' };   // the asset sheet's controls, in the Art panel

const scene = await loadScene();
const { characters, items, tiles, byId } = scene;

const badge = await gatePromise;
const [TEA_PARTY, QUEENS_GAUNTLET] = await Promise.all([loadStage('tea-party', badge?.key), loadStage('queens-gauntlet', badge?.key)])
  .catch((e) => { showRefusal(`a stage would not open: ${e.message}`); throw e; });

const looks = await looksReady;

// --------------------------------------------------------------- controls ----

$('#zoom').addEventListener('input', (e) => {
  state.zoom = +e.target.value;
  $('#zoomOut').textContent = `${state.zoom}×`;
  drawItems(); drawTiles();
});
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
const playing = () => $('#walkPlay').checked;

// ------------------------------------------------------------------ stage ----
// The playable puzzle. Rules and solver live in src/puzzle.js, so the Solve
// button runs the same search that tools/verify-stage.mjs uses to prove the
// stage ships - it is a solver, not a recording.

const map = parse(TEA_PARTY.rows);
const stage = $('#stage');
const sctx = stage.getContext('2d');
stage.width = map.w * TILE;
stage.height = map.h * TILE;

const TEA_THEME = THEMES.garden;

let board = map.start;   // the puzzle state; `state` above is the page UI
let aliceFacing = 'S';
let stepsTaken = 0;
let history = [];          // every board before the last move, for undo
let hint = null;           // a line the status shows instead of the count, until the next change
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

/** A rock off its button with a wall on two adjacent sides can never be pushed again. */
function stuckRocks() {
  const solid = (x, y) => x < 0 || y < 0 || x >= map.w || y >= map.h || map.walls.has(y * map.w + x);
  return board.rocks.filter((r) => {
    if (map.buttons.has(r)) return false;
    const x = r % map.w, y = (r / map.w) | 0;
    return (solid(x, y - 1) || solid(x, y + 1)) && (solid(x - 1, y) || solid(x + 1, y));
  });
}

const undoKey = () => (pad.allows('key') ? 'B or Backspace' : 'B');
const resetKey = () => (pad.allows('key') ? 'START or R' : 'START');

function refreshStatus() {
  const count = `${buttonsPressed()}/${map.buttons.size} buttons · ${stepsTaken} moves`;
  if (isGoal(map, board)) setStatus(`tea is served — solved in ${stepsTaken} moves`, 'win');
  else if (solution) setStatus(`playing solution — move ${playbackAt} of ${solution.length}`, 'busy');
  else if (hint) setStatus(`${hint} · ${count}`, 'hint');
  else if (stuckRocks().length) setStatus(`a rock is stuck in a corner — ${undoKey()} takes a move back · ${count}`, 'hot');
  else setStatus(count);
  $('#undoBtn').disabled = !history.length || !!solution;
}

function applyMove(dir, { tell = true } = {}) {
  const next = step(map, board, dir);
  aliceFacing = dir;
  if (!next) {
    // a bump: say why, so a wall and a rock that will not budge read differently
    const [dx, dy] = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[dir];
    const x = board.alice % map.w + dx, y = ((board.alice / map.w) | 0) + dy;
    const target = y * map.w + x;
    hint = board.rocks.includes(target) ? 'that rock will not budge'
         : target === map.door ? 'the door wants all three buttons held'
         : map.gates.has(target) ? 'the gate is shut — find the lever' : 'blocked';
    refreshStatus();
    if (tell) tutorFeed({ kind: 'tea', what: 'blocked' });
    return false;
  }
  const before = board;
  history.push(before);
  hint = null;
  board = next;
  stepsTaken++;
  refreshStatus();
  if (tell) {
    const held = buttonsPressed(), heldBefore = before.rocks.filter(r => map.buttons.has(r)).length;
    const ev = (what) => tutorFeed({ kind: 'tea', what, buttons: held, moves: stepsTaken });
    ev('move');
    if (before.rocks.some((r, i) => r !== board.rocks[i])) ev('push');
    if (before.lever !== board.lever) ev('lever');
    if (held > heldBefore) ev('button');
    if (isGoal(map, board)) ev('win');
  }
  return true;
}

/** One move back; the playback's moves are not undone, a player's are. */
function undoMove() {
  if (solution || !history.length) return false;
  board = history.pop();
  stepsTaken = Math.max(0, stepsTaken - 1);
  hint = null;
  refreshStatus();
  tutorFeed({ kind: 'tea', what: 'undo', moves: stepsTaken });
  return true;
}

/** Playback runs on its own clock, not the render loop - one move per tick,
 *  whatever the frame rate is doing. */
function startPlayback(moves) {
  stopPlayback();
  solution = moves;
  playbackAt = 0;
  playTimer = setInterval(() => {
    if (paused) return;
    if (playbackAt >= solution.length) { stopPlayback(); return; }
    applyMove(solution[playbackAt++], { tell: false });
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

function resetStage({ tell = true } = {}) {
  stopPlayback();
  board = map.start;
  aliceFacing = 'S';
  stepsTaken = 0;
  playbackAt = 0;
  history = [];
  hint = null;
  refreshStatus();
  if (tell) tutorFeed({ kind: 'tea', what: 'reset' });
}

function drawStage(now) {
  sctx.clearRect(0, 0, stage.width, stage.height);
  drawRoom(sctx, scene, map, board, TEA_THEME, { now, facing: aliceFacing, walking: !!solution, beatMs: playSpeed });
}

// The badge drives the stage: d-pad steps, B takes a move back, START resets,
// while this stage is armed. On a dev host the pad also carries the keyboard
// (arrows or WASD, Enter), so there is one path for a move; R and Backspace
// are the page's own reset and undo keys.
const PAD_DIRS = { UP: 'N', DOWN: 'S', LEFT: 'W', RIGHT: 'E' };
pad.on(({ button, down }) => {
  if (!down || armedStage !== 'tea') return;
  if (button === 'START') { resetStage(); return; }
  if (button === 'B') { undoMove(); return; }
  const dir = PAD_DIRS[button];
  if (dir && !solution) applyMove(dir);
});
addEventListener('keydown', (e) => {
  if (!pad.allows('key') || armedStage !== 'tea') return;
  if (e.key === 'r' || e.key === 'R') resetStage();
  if (e.key === 'Backspace') { e.preventDefault(); undoMove(); }
});

$('#resetBtn').addEventListener('click', () => resetStage());
$('#undoBtn').addEventListener('click', undoMove);
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
      setStatus(`no solution from here (${explored} states, ${ms}ms) — ${undoKey()} takes a move back, ${resetKey()} resets`, 'hot');
      $('#solveBtn').disabled = false;
      return;
    }
    console.log(`[stage] solved in ${moves.length} moves, ${explored} states, ${ms}ms`);
    startPlayback(moves);
  }, 30);
});

resetStage({ tell: false });

// ?autosolve=tea kicks the solver on load - handy for a screenshot or smoke test; the bench only
if (mode === 'dev' && new URLSearchParams(location.search).get('autosolve') === 'tea') {
  setTimeout(() => $('#solveBtn').click(), 400);
}

// ------------------------------------------------------------------- loop ----

let beat = 0, last = performance.now();
function tick(now) {
  const cycle = active.meta.cycle ?? [0, 1, 0, 2];
  if (playing() && !paused && now - last >= period) { beat = (beat + 1) % cycle.length; last = now; }
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

let chaseState = chaseMap.start;
let chaseFacing = 'S';
let chaseTicks = 0;
let chaseDead = false;
let chasePlan = null;
let chasePlanAt = 0;
let chaseTimer = null;
let chaseTickMs = chaseMap.tickMs;
let queued = null;          // the input this tick, if the player gave one
let chaseWaiting = true;    // the clock holds after a restart until the first input, so every run starts on the same beat

const chaseStatus = $('#chaseStatus');
function setChaseStatus() {
  const held = chaseState.rocks.filter(r => chaseMap.buttons.has(r)).length;
  const count = `tick ${chaseTicks} · ${held}/${chaseMap.buttons.size} buttons`;
  if (chaseDead) {
    chaseStatus.textContent = `caught on tick ${chaseTicks} — ${pad.allows('key') ? 'START or R' : 'START'} restarts`;
    chaseStatus.className = 'status hot';
  } else if (isChaseGoal(chaseMap, chaseState)) {
    chaseStatus.textContent = `out in ${chaseTicks} ticks (par 64)`;
    chaseStatus.className = 'status win';
  } else if (chaseWaiting) {
    chaseStatus.textContent = `the room waits for your first press · ${count}`;
    chaseStatus.className = 'status hint';
  } else {
    chaseStatus.textContent = `${count}${chasePlan ? ' · solving' : ''}`;
    chaseStatus.className = `status${chasePlan ? ' busy' : ''}`;
  }
}

function chaseRestart({ tell = true } = {}) {
  chaseState = chaseMap.start;
  chaseFacing = 'S';
  chaseTicks = 0;
  chaseDead = false;
  chasePlan = null;
  chasePlanAt = 0;
  queued = null;
  chaseWaiting = true;
  $('#chaseSolve').disabled = false;
  setChaseStatus();
  if (tell) tutorFeed({ kind: 'chase', what: 'restart' });
}

/** The first input after a restart starts the clock, and is taken at once rather than up to a tick later. */
function chaseGo() {
  if (!chaseWaiting) return;
  chaseWaiting = false;
  tutorFeed({ kind: 'chase', what: 'start', ticks: chaseTicks });
  chaseTick();
  startClock();
}

/** One tick of the world: whatever Alice does, the cast moves. */
function chaseTick() {
  if (chaseDead || chaseWaiting || isChaseGoal(chaseMap, chaseState)) return;
  const planned = !!chasePlan;
  const action = chasePlan ? (chasePlan[chasePlanAt++] ?? 'wait') : (queued ?? 'wait');
  const chosen = planned ? null : queued;    // what the player asked for this tick, if anything
  queued = null;
  if (action !== 'wait') chaseFacing = action;
  const heldBefore = chaseState.rocks.filter(r => chaseMap.buttons.has(r)).length;
  const ev = (what) => tutorFeed({ kind: 'chase', what, ticks: chaseTicks });

  const next = chaseStep(chaseMap, chaseState, action);
  if (!next) {
    // an illegal move is just a bump; a fatal one ends the run
    const bumped = chaseStep(chaseMap, chaseState, 'wait');
    if (action !== 'wait' && bumped) { chaseState = bumped; chaseTicks++; setChaseStatus(); if (!planned) ev('tick'); return; }
    chaseDead = true;
    chasePlan = null;
    $('#chaseSolve').disabled = false;
    setChaseStatus();
    ev('caught');
    return;
  }
  chaseState = next;
  chaseTicks++;
  if (chasePlan && chasePlanAt >= chasePlan.length) {
    chasePlan = null;
    $('#chaseSolve').disabled = false;
  }
  setChaseStatus();
  if (!planned) {
    ev('tick');
    if (chosen === 'wait') ev('wait');
    const held = chaseState.rocks.filter(r => chaseMap.buttons.has(r)).length;
    if (held > heldBefore) ev('button');
    if (isChaseGoal(chaseMap, chaseState)) ev('win');
  }
}

function startClock() {
  if (chaseTimer) clearInterval(chaseTimer);
  chaseTimer = setInterval(() => { if ($('#chaseRun').checked && !paused) chaseTick(); }, chaseTickMs);
}
startClock();

function drawChase(now) {
  cctx.clearRect(0, 0, chase.width, chase.height);
  drawRoom(cctx, scene, chaseMap, chaseState, CHASE_THEME, { now, facing: chaseFacing, walking: true, beatMs: chaseTickMs, dead: chaseDead });
}

// The badge: d-pad moves, Y waits a tick (the design's tick-step), START
// restarts. The keyboard rides the same pad on a dev host (V is Y there);
// space and R are the page's own wait and restart keys.
const CHASE_PAD = { UP: 'N', DOWN: 'S', LEFT: 'W', RIGHT: 'E', Y: 'wait' };
pad.on(({ button, down }) => {
  if (!down || armedStage !== 'chase') return;
  if (button === 'START') { chaseRestart(); return; }
  const action = CHASE_PAD[button];
  if (action && !chasePlan) { queued = action; chaseGo(); }   // consumed by the next tick, not now
});
addEventListener('keydown', (e) => {
  if (!pad.allows('key') || armedStage !== 'chase') return;
  if (e.key === 'r' || e.key === 'R') { chaseRestart(); return; }
  if (e.key === ' ' && !chasePlan) { e.preventDefault(); queued = 'wait'; chaseGo(); }
});

$('#chaseReset').addEventListener('click', () => chaseRestart());
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
      chaseStatus.textContent = `no way out from here (${explored} states, ${ms}ms) — ${pad.allows('key') ? 'START or R' : 'START'} restarts`;
      chaseStatus.className = 'status hot';
      $('#chaseSolve').disabled = false;
      return;
    }
    console.log(`[gauntlet] ${moves.length} ticks, ${explored} states, ${ms}ms`);
    chasePlan = moves;
    chasePlanAt = 0;
    setChaseStatus();
    if (chaseWaiting) { chaseWaiting = false; startClock(); }
  }, 30);
});

chaseRestart({ tell: false });
if (mode === 'dev' && new URLSearchParams(location.search).get('autosolve') === 'chase')
  setTimeout(() => $('#chaseSolve').click(), 400);

// The gate's pause (site only): the badge went, so the world stands still -
// the gauntlet's cast does not move while nobody can move Alice, a solver's
// playback holds its place, the walk cycle freezes. The status lines say
// why, and are redrawn as they were when the badge is back.
hooks.pause = (why) => {
  paused = true;
  queued = null;
  const text = `paused - the badge is ${why}`;
  chaseStatus.textContent = text; chaseStatus.className = 'status hot';
  setStatus(text, 'hot');
};
hooks.resume = () => {
  paused = false;
  setChaseStatus();
  refreshStatus();
};

// The tutorial's coach: a step that comes up arms its stage and, on a phone,
// shows it. Mounted after both stages, since its first step arms one.
coach = mountCoach(tutor, {
  looks,
  chapters: { 1: 'Chapter one · a mad tea party', 2: "Chapter two · the queen's gauntlet" },
  finish: {
    title: 'A prize for everyone',
    say: 'Both rooms are yours. The range is next door.',
    note: (skipped) => 'You have been through both rooms' +
      (skipped ? ` (${skipped} step${skipped === 1 ? '' : 's'} skipped)` : '') +
      '. Start over any time, or cross to the glitch range, where the badge does the pressing.',
  },
  prepare(step, { show = false } = {}) {
    if (!step?.stage) return;
    armStage(step.stage);
    if (!show) return;
    if (looks.look.id !== 'classic') looks.setMode(step.stage);
    else $(`#${step.stage}Panel`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
});

// scripted tests read the stages through this (dev hosts; nothing here plays)
window.__stages = { get tutor() { return tutor; }, get board() { return board; }, get history() { return history; },
                    get chase() { return { state: chaseState, ticks: chaseTicks, dead: chaseDead, waiting: chaseWaiting }; },
                    get armed() { return armedStage; }, armStage };

// The render loop starts last: everything it draws has to exist first.
requestAnimationFrame(tick);
