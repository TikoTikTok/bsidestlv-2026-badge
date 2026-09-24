// Alice in AI Land - the glitch range page.
//
// Two ranges that practise the badge's quick-glitch layer. All rules live in
// src/range.js; this file is the rendering, the input plumbing (src/pad.js)
// and the words the log says.

import { Pad } from './pad.js';
import { comboSequence, Combo, buildLevel, idealOffsetMs, Run } from './range.js';
import { RABBIT_WATCH } from '../stages/rabbit-watch.js';
import { LOOKING_GLASS } from '../stages/looking-glass.js';

const $ = (sel) => document.querySelector(sel);
const TILE = 48;

// ------------------------------------------------------------------ assets ----

const loadImage = async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};

async function loadCharacter(id) {
  const dir = `assets/characters/${id}`;
  const meta = await (await fetch(`${dir}/${id}.json`)).json();
  const images = {};
  await Promise.all(Object.entries(meta.directions).flatMap(([d, files]) =>
    files.map(async (file, i) => { (images[d] ||= [])[i] = await loadImage(`${dir}/${file}`); })));
  return { id, meta, images };
}

/** Only the named images from a folder - the range needs a dozen, not the sheet. */
async function loadSome(folder, names) {
  const meta = await (await fetch(`assets/${folder}/${folder}.json`)).json();
  const byName = Object.fromEntries((meta[folder] ?? meta.items ?? meta.tiles).map(it => [it.name, it.file]));
  const images = {};
  await Promise.all(names.map(async (n) => { images[n] = await loadImage(`assets/${folder}/${byName[n]}`); }));
  return images;
}

const [alice, queen, rabbit, tiles, items] = await Promise.all([
  loadCharacter('alice2'), loadCharacter('queen'), loadCharacter('rabbit'),
  loadSome('tiles', ['wall_blue', 'wall_blue_banner_red', 'pillar_blue', 'floor_marble_plain',
                     'floor_marble_veined', 'floor_carpet_heart', 'door_heart_closed', 'door_heart_open']),
  loadSome('items', ['key_heart', 'potion_star']),
]);

const frameOf = (ch, dir, now, periodMs) => {
  const cyc = ch.meta.cycle ?? [0, 1, 0, 2];
  return ch.images[dir][cyc[Math.floor(now / periodMs) % cyc.length]];
};

// ------------------------------------------------------------------- input ----

const pad = new Pad().start();
window.__pad = pad;   // scripted tests inject edges through this

const ledsEl = $('#padLeds');
const LED_ORDER = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y', 'SL', 'SR', 'START', 'SELECT'];
const leds = Object.fromEntries(LED_ORDER.map(b => {
  const el = document.createElement('span');
  el.className = 'led';
  el.textContent = b;
  ledsEl.append(el);
  return [b, el];
}));

function refreshPad() {
  $('#padDevice').textContent = pad.device
    ? `${pad.device.id.replace(/\s*\(.*$/, '').slice(0, 40)}${pad.device.mapping === 'standard' ? '' : ' (raw)'}`
    : 'keyboard';
  $('#padDevice').classList.toggle('on', !!pad.device);
  for (const [b, el] of Object.entries(leds)) el.classList.toggle('on', pad.held.has(b));
}
setInterval(refreshPad, 100);

// Only one range listens at a time. Firing the badge taps START and then
// replays the take; if both ranges heard it, a combo replayed for range 1
// would also land as a stray pulse in range 2's log.
let armed = 'watch';
function arm(which) {
  armed = which;
  $('#watchPanel').classList.toggle('armed', which === 'watch');
  $('#glassPanel').classList.toggle('armed', which === 'glass');
}
$('#watchPanel').addEventListener('pointerdown', () => arm('watch'));
$('#glassPanel').addEventListener('pointerdown', () => arm('glass'));
arm('watch');

pad.on((edge) => {
  refreshPad();
  if (armed === 'watch') watchEdge(edge);
  else glassEdge(edge);
});

// ------------------------------------------------------- range 1: the watch ----

const GLYPH = { UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', A: 'A', B: 'B', X: 'X', Y: 'Y' };

let watchLevel = null, watchSeq = [], combo = null, watchSeed = 0;
let watchQuietUntil = 0;    // after a result, a new attempt needs 400 ms of silence first
let watchAttempt = 0;

const watchStatus = $('#watchStatus');
const setWatchStatus = (text, kind = '') => { watchStatus.textContent = text; watchStatus.className = `status ${kind}`; };

const watchTabs = RABBIT_WATCH.levels.map((level, i) => {
  const b = document.createElement('button');
  b.className = 'tab';
  b.textContent = `${i + 1} · ${level.name} · ${level.length} in ${level.windowMs} ms`;
  b.addEventListener('click', () => setWatchLevel(level));
  $('#watchTabs').append(b);
  return { level, b };
});

function setWatchLevel(level, seed = 0) {
  watchLevel = { ...level, pool: RABBIT_WATCH.pool };
  watchSeed = seed;
  watchSeq = comboSequence(watchLevel, seed);
  combo = new Combo(watchLevel, watchSeq);
  for (const t of watchTabs) t.b.classList.toggle('on', t.level === level);
  drawCombo();
  const rate = ((level.length - 1) / (level.windowMs / 1000)).toFixed(1);
  setWatchStatus(`${level.length} presses in ${level.windowMs} ms is ${rate}/s` +
                 (level.hand ? ' — a hand can do this' : ' — a hand cannot; record it, speed it up'));
}

function drawCombo() {
  const el = $('#comboSeq');
  el.textContent = '';
  watchSeq.forEach((b, i) => {
    const g = document.createElement('span');
    g.className = 'glyph' + (i < combo.at ? ' done' : i === combo.at && combo.open ? ' next' : '');
    if (combo.result && !combo.result.win && i === combo.at) g.classList.add('bad');
    g.textContent = GLYPH[b];
    g.title = b;
    el.append(g);
  });
}

function watchEdge({ button, down, t }) {
  if (!down) return;
  if (button === 'START') { combo.reset(); drawCombo(); setWatchStatus('clock reset'); return; }
  if (!combo.open) {
    // the tail of a replay that already lost must not start the next attempt:
    // every press while closed pushes the quiet period out again
    if (t < watchQuietUntil) { watchQuietUntil = t + 400; return; }
    combo.reset();
  }
  const r = combo.press(button, t);
  drawCombo();
  if (!r) {
    if (combo.at) setWatchStatus(`${combo.at} of ${watchSeq.length} · ${Math.round(t - combo.t0)} ms`, 'busy');
    return;
  }
  watchQuietUntil = t + 400;
  watchAttempt++;
  const gaps = r.gaps.map(g => Math.round(g)).join(' ');
  if (r.win) {
    setWatchStatus(`the watch chimes — ${Math.round(r.ms)} ms, ${r.rate.toFixed(1)} presses/s`, 'win');
    logTo('#watchLog', `#${watchAttempt} ✓ ${watchLevel.name}: ${Math.round(r.ms)} ms of ${watchLevel.windowMs} · ${r.rate.toFixed(1)}/s · gaps ${gaps} ms`, 'win');
  } else {
    setWatchStatus(r.reason, 'hot');
    const dropped = /wrong button/.test(r.reason) && r.presses > 0
      ? ' — if this was a replay, a press may have been too short for the browser to see; slow the speed one step'
      : '';
    logTo('#watchLog', `#${watchAttempt} ✗ ${watchLevel.name}: ${r.reason}` +
          (r.presses > 1 ? ` · ${r.rate.toFixed(1)}/s · gaps ${gaps} ms` : '') + dropped, 'hot');
  }
}

$('#watchShuffle').addEventListener('click', () => setWatchLevel(
  RABBIT_WATCH.levels.find(l => l.id === watchLevel.id), watchSeed + 1));

// the rabbit paces at the level's required rate: that is the tempo to record at
const rabbitCtx = $('#rabbit').getContext('2d');
function drawRabbit(now) {
  rabbitCtx.imageSmoothingEnabled = false;
  rabbitCtx.clearRect(0, 0, 96, 96);
  const rate = watchLevel ? (watchLevel.length - 1) / (watchLevel.windowMs / 1000) : 2;
  const period = Math.max(40, 1000 / Math.max(rate, 1.5));
  rabbitCtx.drawImage(frameOf(rabbit, combo?.open && combo.at ? 'E' : 'S', now, period), 0, 0, 96, 96);
}

// --------------------------------------------------- range 2: the glass ----

const map = LOOKING_GLASS.rows;
const MW = map[0].length, MH = map.length;
const glass = $('#glass');
const gctx = glass.getContext('2d');
glass.width = MW * TILE; glass.height = MH * TILE;
const cellOf = (ch) => { for (let y = 0; y < MH; y++) { const x = map[y].indexOf(ch); if (x >= 0) return [x, y]; } return null; };
const ALICE_HOME = cellOf('A'), GUARD = cellOf('G'), TREASURE = cellOf('T');

let level = null;           // buildLevel() result
let run = null;
let attempt = 0;
let scene = { kind: 'idle', since: 0 };   // what the map is animating
const revealedCrash = new Map();          // level id -> Set of crash lines hit

const glassStatus = $('#glassStatus');
const setGlassStatus = (text, kind = '') => { glassStatus.textContent = text; glassStatus.className = `status ${kind}`; };

const glassTabs = LOOKING_GLASS.levels.map((lv, i) => {
  const b = document.createElement('button');
  b.className = 'tab';
  b.textContent = `${i + 1} · ${lv.name} · ${lv.lineMs} ms/tick`;
  b.addEventListener('click', () => setGlassLevel(lv));
  $('#glassTabs').append(b);
  return { lv, b };
});

// A hidden listing shows the shape of the routine - how many ticks, which
// lines take longer - and nothing else. The text is a deterministic hash of
// the real line so it does not shuffle between renders.
function fadedText(line) {
  let h = 2166136261;
  for (const ch of line.text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  const width = Math.max(2, Math.min(5, Math.round(line.text.trim().length / 5)));
  return `${hex.slice(0, 4)}  ${hex.slice(4).match(/../g).slice(0, width).join(' ')}`;
}

function setGlassLevel(lv) {
  level = buildLevel(lv);
  run = null;
  scene = { kind: 'idle', since: performance.now() };
  for (const t of glassTabs) t.b.classList.toggle('on', t.lv === lv);
  $('#glassBlurb').textContent = lv.blurb;

  const ol = $('#listing');
  ol.textContent = '';
  const tickOf = new Map(level.honest.map(s => [s.line, s.tick]));
  level.program.lines.forEach((line) => {
    const li = document.createElement('li');
    li.dataset.line = line.index;
    const tick = tickOf.get(line.index);
    const t = document.createElement('span');
    t.className = 'tick';
    t.textContent = tick === undefined ? '' : `${tick}`;
    const code = document.createElement('code');
    code.textContent = level.hidden ? fadedText(line) : line.text;
    li.append(t, code);
    if (tick === undefined) li.classList.add('dead');           // never executed in the honest run
    if (line.kind === 'target' && !level.hidden) li.classList.add('target');
    if (line.kind === 'crash' && revealedCrash.get(lv.id)?.has(line.index)) li.classList.add('crash');
    if (level.hidden) li.classList.add('faded');
    ol.append(li);
  });
  const ticks = level.totalTicks;
  setGlassStatus(`${ticks} ticks × ${lv.lineMs} ms = ${level.totalMs} ms per run` +
                 (lv.hidden ? '' : ` · the check is at tick ${level.honest[level.targetStep].tick}`));
  resetReadout();
}

function resetReadout() {
  for (const id of ['roOffset', 'roWidth', 'roLanded', 'roDelta', 'roVerdict']) $(`#${id}`).textContent = '—';
  $('#roHint').innerHTML = '&nbsp;';
  $('#roVerdict').className = '';
}

const fmtMs = (ms) => `${ms < 0 ? '−' : '+'}${Math.abs(Math.round(ms))} ms`;
const fmtLines = (n) => n === 0 ? 'on it' : `${Math.abs(n)} line${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'early' : 'late'}`;

/** The words for a landing. Hidden levels only say early / late, never how much. */
function describe(r) {
  const lineText = (i) => `line ${i + 1}${level.hidden ? '' : ` (${level.program.lines[i].text.trim()})`}`;
  switch (r.verdict) {
    case 'skip':     return { text: 'the check was skipped — the door opens and Alice jumps to the treasure', kind: 'win' };
    case 'crash':    return { text: `the guard crashed on ${lineText(r.crashLine)} · ${level.hidden ? (r.deltaLines < 0 ? 'before the check' : 'after the check') : fmtLines(r.deltaLines)}`, kind: 'hot' };
    case 'brownout': return { text: `pulse too wide: ${r.covered.length} lines (${Math.round(r.widthMs)} ms), the guard survives ${level.pulseMaxLines} — brown-out reset`, kind: 'hot' };
    case 'miss':     return { text: r.startMs < 0 ? 'the pulse came before the trigger' : `the pulse landed ${Math.round(r.startMs - level.totalMs)} ms after the routine ended`, kind: '' };
    case 'denied':   return { text: 'no pulse — "No key, no treasure." Alice bounced', kind: '' };
    case 'nop':      return level.hidden
      ? { text: `no effect · ${r.deltaLines < 0 ? 'the guard had not decided yet' : 'the guard had already decided'}`, kind: '' }
      : { text: `no effect · rising edge on ${lineText(level.honest[r.covered[0]].line)} · ${fmtLines(r.deltaLines)} (${fmtMs(r.deltaMs)})`, kind: '' };
  }
  return { text: r.verdict, kind: '' };
}

function finishRun(r) {
  attempt++;
  const { text, kind } = describe(r);
  setGlassStatus(text, kind);

  $('#roOffset').textContent = r.startMs === null ? '—' : `${Math.round(r.startMs)} ms`;
  $('#roWidth').textContent = r.startMs === null ? '—' : `${Math.round(r.widthMs)} ms`;
  $('#roLanded').textContent = r.covered.length
    ? `${r.covered[0]}${r.covered.length > 1 ? `–${r.covered.at(-1)}` : ''} · L${r.lines[0] + 1}${r.lines.length > 1 ? `–${r.lines.at(-1) + 1}` : ''}`
    : '—';
  $('#roDelta').textContent = r.deltaLines === null ? '—'
    : level.hidden ? (r.deltaLines === 0 ? 'on it' : r.deltaLines < 0 ? 'early' : 'late')
    : `${r.deltaLines > 0 ? '+' : ''}${r.deltaLines} · ${fmtMs(r.deltaMs)}`;
  $('#roVerdict').textContent = r.verdict;
  $('#roVerdict').className = kind;
  $('#roHint').textContent = r.verdict === 'skip' ? 'treasure' : r.verdict === 'nop' && !level.hidden
    ? `try offset ${Math.round(idealOffsetMs(level))} ms` : r.verdict === 'crash' ? 'move the offset, or shorten the pulse' : '';

  const li = logTo('#glassLog', `#${attempt} ${level.name}: offset ${r.startMs === null ? '—' : Math.round(r.startMs) + ' ms'}` +
    ` · width ${Math.round(r.widthMs)} ms · ${text}`, kind);
  li.title = r.covered.length ? `steps ${r.covered.join(', ')}` : '';

  if (r.verdict === 'crash') {
    (revealedCrash.get(level.id) ?? revealedCrash.set(level.id, new Set()).get(level.id)).add(r.crashLine);
    $(`#listing li[data-line="${r.crashLine}"]`)?.classList.add('crash');
  }
  scene = { kind: r.verdict, since: performance.now() };
}

function glassEdge(edge) {
  if (edge.button === 'START' && edge.down) {
    run = new Run(level);
    scene = { kind: 'running', since: edge.t };
    resetReadout();
    setGlassStatus('running…', 'busy');
  }
  if (!run) return;
  const r = run.edge(edge);
  if (r) finishRun(r);
}

$('#glassRun').addEventListener('click', () => {
  arm('glass');
  pad.inject('START', true);
  setTimeout(() => pad.inject('START', false), 30);
});
$('#glassClear').addEventListener('click', () => { $('#glassLog').textContent = ''; attempt = 0; resetReadout(); });

// ------------------------------------------------------------------ drawing ----

const hash2 = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return Math.abs(h ^ (h >>> 16)); };
const WALLS = ['wall_blue', 'wall_blue', 'wall_blue', 'pillar_blue', 'wall_blue', 'wall_blue_banner_red'];
const FLOORS = ['floor_marble_plain', 'floor_marble_veined', 'floor_marble_plain'];

function drawGlass(now) {
  gctx.imageSmoothingEnabled = false;
  gctx.clearRect(0, 0, glass.width, glass.height);
  const won = scene.kind === 'skip';
  const age = now - scene.since;

  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const ch = map[y][x];
    const px = x * TILE, py = y * TILE;
    const inTreasury = x > GUARD[0];
    gctx.drawImage(tiles[inTreasury && ch !== '#' ? 'floor_carpet_heart' : FLOORS[hash2(x, y) % FLOORS.length]], px, py, TILE, TILE);
    if (ch === '#') gctx.drawImage(tiles[WALLS[hash2(x, y) % WALLS.length]], px, py, TILE, TILE);
    if (ch === 'G') gctx.drawImage(tiles[won ? 'door_heart_open' : 'door_heart_closed'], px, py, TILE, TILE);
    if (ch === 'T' && !(won && age > 700)) gctx.drawImage(items.key_heart, px, py, TILE, TILE);
    if (ch === 'T') gctx.drawImage(items.potion_star, px - 2, py - 26, TILE, TILE);
  }

  // the guard, in the doorway, facing Alice. A crash makes him flicker.
  let guardAlpha = 1;
  if (scene.kind === 'crash' || scene.kind === 'brownout') guardAlpha = age < 900 ? (Math.floor(age / 90) % 2 ? 0.15 : 1) : 1;
  if (won) guardAlpha = 0.35;
  gctx.globalAlpha = guardAlpha;
  gctx.drawImage(frameOf(queen, 'W', now, scene.kind === 'running' ? 120 : 400), GUARD[0] * TILE, GUARD[1] * TILE, TILE, TILE);
  gctx.globalAlpha = 1;

  // the executing line, as a little pulse over the doorway while the routine runs
  if (scene.kind === 'running' && run?.open) {
    const e = run.elapsed(now);
    const step = level.honest.findIndex(s => (s.tick + s.ticks) * level.lineMs > e);
    if (step >= 0) {
      gctx.fillStyle = 'rgba(111, 176, 240, .25)';
      gctx.fillRect(GUARD[0] * TILE, (GUARD[1] - 1) * TILE + 6, TILE * ((step + 1) / level.honest.length), 6);
    }
  }

  // Alice: home, bouncing off the guard, or jumping the wall to the treasure
  let ax = ALICE_HOME[0], ay = ALICE_HOME[1], dir = 'E', period = 400, hop = 0;
  if (scene.kind === 'running') { period = 160; ax += Math.min(age / 300, 1) * 2.4; }
  else if (scene.kind === 'nop' || scene.kind === 'denied' || scene.kind === 'miss') {
    period = 160;
    const p = Math.min(age / 700, 1);
    ax += p < 0.5 ? 2.4 + p * 2 : 2.4 + 1 - (p - 0.5) * 2 * 3.4;    // to the door, and bounced back
    if (p >= 0.5) dir = 'W';
    if (p >= 1) { ax = ALICE_HOME[0]; dir = 'S'; period = 400; }
  }
  else if (scene.kind === 'crash' || scene.kind === 'brownout') { ax += 2.4; dir = 'E'; if (age > 900) ax = ALICE_HOME[0]; }
  else if (won) {
    const p = Math.min(age / 900, 1);
    const from = ALICE_HOME[0] + 2.4, to = TREASURE[0];
    ax = from + (to - from) * p;
    hop = Math.sin(p * Math.PI) * 1.6;
    period = 120;
    if (p >= 1) { dir = 'S'; period = 400; }
  }
  gctx.drawImage(frameOf(alice, dir, now, period), ax * TILE, (ay - hop) * TILE, TILE, TILE);
}

let cursorLine = null;
function drawListing(now) {
  let want = null;
  if (scene.kind === 'running' && run?.open) {
    const e = run.elapsed(now);
    const step = level.honest.findIndex(s => (s.tick + s.ticks) * level.lineMs > e);
    want = step >= 0 ? level.honest[step].line : null;
  }
  if (want === cursorLine) return;
  $(`#listing li.pc`)?.classList.remove('pc');
  if (want !== null) $(`#listing li[data-line="${want}"]`)?.classList.add('pc');
  cursorLine = want;
}

function logTo(sel, text, kind) {
  const ol = $(sel);
  const li = document.createElement('li');
  li.textContent = text;
  if (kind) li.className = kind;
  ol.prepend(li);
  while (ol.children.length > 40) ol.lastChild.remove();
  return li;
}

// -------------------------------------------------------------------- loop ----

setWatchLevel(RABBIT_WATCH.levels[0]);
setGlassLevel(LOOKING_GLASS.levels[0]);

function tick(now) {
  if (run?.open) { const r = run.tick(now); if (r) finishRun(r); }
  drawRabbit(now);
  drawGlass(now);
  drawListing(now);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
