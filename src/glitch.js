// Alice in AI Land - the glitch range page.
//
// Five ranges that practise the badge's quick-glitch layer. The rules live
// in src/range.js (the watch, the glass), src/lock.js, src/watchdog.js and
// src/wall.js; this file is the rendering, the input plumbing (src/pad.js)
// and the words the log says.

import { Pad, flipFor } from './pad.js';
import { comboSequence, Combo, buildLevel, idealOffsetMs, Run } from './range.js';
import { buildLock, summarize, guessKey } from './lock.js';
import { Watchdog, windowOf, idealGapMs, placeInWindow } from './watchdog.js';
import { Wall, frameOf as wallFrameOf, withDefaults as wallDefaults } from './wall.js';
import { openGate, gateMode, gateSources, showRefusal } from './gate.js';
import { loadStage } from './seal.js';
import { initLooks } from './looks.js';
import { tilt } from './tilt.js';

const $ = (sel) => document.querySelector(sel);
const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
const fmtSeconds = (ms) => `${+(ms / 1000).toFixed(1)} s`;
const TILE = 48;

// ------------------------------------------------------------------- input ----

// The pad first: on the site the gate needs its poll to hear the beacon, and
// the page does not listen to anything else (see src/gate.js, src/pad.js).
const mode = gateMode();
const pad = new Pad({ sources: gateSources(mode), flip: flipFor(location.search) }).start();
window.__pad = pad;   // scripted tests inject edges through this (dev hosts only; the policy drops it elsewhere)

// ----------------------------------------------------------------- header ----

const ledsEl = $('#padLeds');
const LED_ORDER = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y', 'SL', 'SR', 'START', 'SELECT'];
const leds = Object.fromEntries(LED_ORDER.map(b => {
  const el = document.createElement('span');
  el.className = 'led';
  el.textContent = b;
  ledsEl.append(el);
  return [b, el];
}));

const noPadLabel = pad.allows('key') ? 'keyboard' : 'no badge';
function refreshPad() {
  $('#padDevice').textContent = pad.device
    ? `${pad.device.id.replace(/\s*\(.*$/, '').slice(0, 40)}${pad.device.mapping === 'standard' ? '' : ' (raw)'}`
    : noPadLabel;
  $('#padDevice').classList.toggle('on', !!pad.device);
  for (const [b, el] of Object.entries(leds)) el.classList.toggle('on', pad.held.has(b));
  if (padIsMirror) for (const b of tpButtons) b.classList.toggle('down', pad.held.has(b.dataset.btn));
}
setInterval(refreshPad, 100);

// ----------------------------------------------------------- on-screen pad ----

// On a dev host the on-screen pad feeds the same edge stream as source 'ui',
// stamped with the pointer event's own time, for driving the page from a
// phone without the badge. On the site the policy is badge-only (src/pad.js
// drops 'ui'), so nothing on the screen is a controller: the pad stays as a
// mirror of the badge's buttons - a look that moulds it into the body (the
// handheld) keeps its shape, and the player sees what the browser sees.
const touchPad = $('#touchPad');
const padIsMirror = !pad.allows('ui');
const tpButtons = [...touchPad.querySelectorAll('button[data-btn]')];
if (padIsMirror) {
  touchPad.classList.add('mirror');
  touchPad.querySelector('.tp-label').textContent = 'the badge, as the browser sees it';
  touchPad.querySelector('.tp-hint small').textContent = 'lit while a button is down - the badge is the only controller here';
  $('#glassRun').remove();
  document.body.classList.add('badge-only');
  touchPad.open = false;
} else {
  touchPad.open = matchMedia('(pointer: coarse)').matches;
}
const padOpen = () => document.body.classList.toggle('touchpad-open', touchPad.open);
touchPad.addEventListener('toggle', padOpen);
padOpen();
if (!padIsMirror) for (const b of tpButtons) {
  const name = b.dataset.btn;
  const stamp = (e) => (e.timeStamp > 0 && e.timeStamp <= performance.now()) ? e.timeStamp : performance.now();
  const release = (e) => {
    if (!b.classList.contains('down')) return;
    b.classList.remove('down');
    pad.inject(name, false, stamp(e));
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.button !== 0) return;
    try { b.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
    b.classList.add('down');
    pad.inject(name, true, stamp(e));
  });
  b.addEventListener('pointerup', (e) => { release(e); if (tilt.needsPermission) tilt.request(); });   // a tap on the pad is a gesture iOS accepts for the sensors
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ------------------------------------------------------------------ arming ----

// Only one range listens at a time. Firing the badge taps START and then
// replays the take; if every range heard it, a combo replayed for range 1
// would also land as a stray pulse in range 2's log and a guess in range
// 3's. A tap on a range arms it, and so does the phone looks' mode bar.
const RANGES = ['watch', 'glass', 'lock', 'dog', 'wall'];
let armed = 'watch';
function arm(which) {
  armed = which;
  for (const r of RANGES) $(`#${r}Panel`).classList.toggle('armed', which === r);
}
for (const r of RANGES) $(`#${r}Panel`).addEventListener('pointerdown', () => arm(r));
arm('watch');

// ------------------------------------------------------------------- looks ----

// src/looks.js builds the picker and runs the mode bar. What CSS cannot do
// on this page: keep the handheld's pad out, and arm the range on screen.
await initLooks({
  onLook(look) { if (look.padAlwaysOut) touchPad.open = true; padOpen(); },
  onMode(m) { if (RANGES.includes(m)) arm(m); },
});

// -------------------------------------------------------------------- gate ----

// On the site nothing below runs until a badge has shown its vault; the
// ranges come through src/seal.js so a sealed copy takes over the moment one
// is published. On a dev host the gate resolves at once. Afterwards the gate
// keeps watching: when the badge goes it mutes the pad and calls the hooks
// (filled in at the end of this file) around the pause.
const hooks = {};
const badge = await openGate({ pad, mode, onPause: (why) => hooks.pause?.(why), onResume: () => hooks.resume?.() });
const [RABBIT_WATCH, LOOKING_GLASS, CATERPILLAR_LOCK, DORMOUSE_WATCHDOG, HUMPTY_WALL] = await Promise.all([
  loadStage('rabbit-watch', badge?.key), loadStage('looking-glass', badge?.key), loadStage('caterpillar-lock', badge?.key),
  loadStage('dormouse-watchdog', badge?.key), loadStage('humpty-wall', badge?.key)])
  .catch((e) => { showRefusal(`a range would not open: ${e.message}`); throw e; });


// ------------------------------------------------------------------ assets ----

// Wait for `load`, not `decode()`: in a hidden tab Chrome settles decode()
// promises only when it next paints a frame, so a page opened in the
// background never came up until it was looked at. drawImage decodes a
// 48 px sprite on first use in well under a millisecond anyway.
const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`could not load ${src}`));
  img.src = src;
});

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

const [alice, queen, rabbit, hatter, tiles, items] = await Promise.all([
  loadCharacter('alice2'), loadCharacter('queen'), loadCharacter('rabbit'), loadCharacter('hatter'),
  loadSome('tiles', ['wall_blue', 'wall_blue_banner_red', 'pillar_blue', 'floor_marble_plain',
                     'floor_marble_veined', 'floor_carpet_heart', 'door_heart_closed', 'door_heart_open',
                     'hedge_daisies', 'hedge_wide', 'hedge_roses', 'floor_grass_clover', 'floor_grass_flowers',
                     'floor_dirt_patch', 'door_wood_closed', 'door_wood_open',
                     'wall_stone_blue', 'wall_stone_banners', 'floor_cobble', 'floor_cobble_moss', 'floor_grass_patch', 'floor_grass_roses']),
  loadSome('items', ['key_heart', 'potion_star', 'mushroom_red', 'mushroom_blue_trio', 'teapot_heart_blue', 'teacup_heart_blue']),
]);

const frameOf = (ch, dir, now, periodMs) => {
  const cyc = ch.meta.cycle ?? [0, 1, 0, 2];
  return ch.images[dir][cyc[Math.floor(now / periodMs) % cyc.length]];
};

// ------------------------------------------------------------------ wiring ----

// the bench log: raw edges, timed from the last START, for checking the badge
let benchT0 = null, benchCount = 0;
pad.on(({ button, down, t, source }) => {
  if (button === 'START' && down) benchT0 = t;
  const rel = benchT0 === null ? null : t - benchT0;
  benchCount++;
  const li = logTo('#benchLog', `${button.padEnd(6)} ${down ? '\u25bc' : '\u25b2'}  ${rel === null ? '   \u2014   ' : rel.toFixed(1).padStart(8)} ms  ${source}`,
                   button === 'START' && down ? 'win' : '');
  li.style.whiteSpace = 'pre';
  $('#benchStatus').textContent = `${benchCount} edges \u00b7 ${pad.device ? pad.device.id.slice(0, 32) : noPadLabel}`;
});
$('#benchClear').addEventListener('click', () => { $('#benchLog').textContent = ''; benchCount = 0; benchT0 = null; $('#benchStatus').textContent = 'no edges yet'; });

pad.on((edge) => {
  refreshPad();
  if (armed === 'watch') watchEdge(edge);
  else if (armed === 'glass') glassEdge(edge);
  else if (armed === 'lock') lockEdge(edge);
  else if (armed === 'dog') dogEdge(edge);
  else wallEdge(edge);
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
  b.append(span('long', `${i + 1} · ${level.name} · ${level.length} in ${level.windowMs} ms`),
           span('short', `${level.length} in ${fmtSeconds(level.windowMs)}`));
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
  $('#wtHead').textContent = `window · ${level.windowMs} ms · ${level.length} presses`;
  $('#wtMid').textContent = `${rate} presses/s to fit`;
  $('#wtEnd').textContent = `${level.windowMs} ms`;
  $('#wtGaps').textContent = '';
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
  if (button === 'START') { combo.reset(); drawCombo(); setWatchStatus('clock reset'); $('#wtGaps').textContent = ''; return; }
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
    $('#wtGaps').textContent = combo.at ? `${combo.at} of ${watchSeq.length}` : '';
    return;
  }
  watchQuietUntil = t + 400;
  watchAttempt++;
  const gaps = r.gaps.map(g => Math.round(g)).join(' ');
  $('#wtGaps').textContent = r.gaps.length ? `gaps ${gaps} ms` : '';
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

// the window as a bar: it fills while the attempt runs, and every accepted
// press leaves a mark where it landed (the phone looks show it; see glitch.css)
let watchMarksKey = '';
function drawWatchTrace(now) {
  if (!combo) return;
  const W = watchLevel.windowMs;
  const fill = combo.t0 === null ? 0 : Math.min(combo.open ? now - combo.t0 : combo.result.ms, W);
  const fillEl = $('#wtFill');
  fillEl.style.width = `${fill / W * 100}%`;
  fillEl.className = 'trace-fill' + (combo.result ? (combo.result.win ? ' win' : ' hot') : '');
  const key = combo.presses.join();
  if (key !== watchMarksKey) {
    watchMarksKey = key;
    const marks = $('#wtMarks');
    marks.textContent = '';
    for (const p of combo.presses) {
      const m = span('trace-mark', '');
      m.style.left = `${Math.min((p - combo.t0) / W, 1) * 100}%`;
      marks.append(m);
    }
  }
}

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
  b.append(span('long', `${i + 1} · ${lv.name} · ${lv.lineMs} ms/tick`),
           span('short', `${i + 1} ${lv.short ?? lv.name} · ${lv.lineMs}ms`));
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
  buildTrace();
  resetReadout();
}

function resetReadout() {
  for (const id of ['roOffset', 'roWidth', 'roLanded', 'roDelta', 'roVerdict']) $(`#${id}`).textContent = '—';
  $('#roHint').innerHTML = '&nbsp;';
  $('#roVerdict').className = '';
  resetTrace();
}

// The trace: the routine as one cell per tick, and where the pulse landed on
// it. A hidden level marks nothing but the player's own pulse and the crash
// lines already found - the check's position is what the level withholds.
const stepTicks = (i) => { const s = level.honest[i]; return Array.from({ length: s.ticks }, (_, k) => s.tick + k); };

function buildTrace() {
  const ticks = $('#traceTicks');
  ticks.textContent = '';
  for (let t = 0; t < level.totalTicks; t++) ticks.append(span('', ''));
  if (!level.hidden) for (const t of stepTicks(level.targetStep)) ticks.children[t].classList.add('target');
  for (const line of revealedCrash.get(level.id) ?? []) markCrashTick(line);
  $('#traceHead').textContent = `routine · ${level.totalTicks} ticks × ${level.lineMs} ms`;
  $('#traceMid').textContent = level.hidden ? 'the check is in here somewhere'
    : `check · tick ${level.honest[level.targetStep].tick} · ${level.targetStartMs}–${level.targetEndMs} ms`;
  $('#traceEnd').textContent = `${level.totalMs} ms`;
}

function markCrashTick(line) {
  const step = level.honest.findIndex(s => s.line === line);
  if (step >= 0) for (const t of stepTicks(step)) $('#traceTicks').children[t]?.classList.add('crash');
}

function resetTrace() {
  $('#tracePulse').hidden = true;
  $('#traceLanded').textContent = '';
  for (const el of $('#traceTicks').querySelectorAll('.hit, .pc')) el.classList.remove('hit', 'win', 'hot', 'nop', 'pc');
}

/** Draw a landing: the pulse as a band over the routine, the ticks it covered lit in the verdict's colour. */
function paintTrace(r, kind) {
  const tone = kind || (r.verdict === 'nop' ? 'nop' : '');
  const pulse = $('#tracePulse');
  if (r.startMs === null) pulse.hidden = true;
  else {
    const left = Math.max(0, Math.min(r.startMs / level.totalMs, 1));
    const right = Math.max(left, Math.min((r.startMs + r.widthMs) / level.totalMs, 1));
    pulse.hidden = false;
    pulse.style.left = `${left * 100}%`;
    pulse.style.width = `${(right - left) * 100}%`;
    pulse.className = `trace-pulse ${tone}`;
  }
  const ticks = $('#traceTicks');
  for (const i of r.covered) for (const t of stepTicks(i)) {
    const el = ticks.children[t];
    if (el) { el.classList.add('hit'); if (tone) el.classList.add(tone); }
  }
  $('#traceLanded').textContent = r.covered.length ? `landed tick ${level.honest[r.covered[0]].tick} · L${r.lines[0] + 1}`
    : r.verdict === 'denied' ? 'no pulse' : 'outside the routine';
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

  $('#roOffset').textContent = r.startMs === null ? '—' : `${Math.round(r.startMs)}`;
  $('#roWidth').textContent = r.startMs === null ? '—' : `${Math.round(r.widthMs)}`;
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
    markCrashTick(r.crashLine);
  }
  paintTrace(r, kind);
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

$('#glassRun')?.addEventListener('click', () => {
  arm('glass');
  pad.inject('START', true);
  setTimeout(() => pad.inject('START', false), 30);
});
$('#glassClear').addEventListener('click', () => { $('#glassLog').textContent = ''; attempt = 0; resetReadout(); });

// ---------------------------------------------------- range 3: the lock ----
// The Caterpillar's door and its clock. Rules in src/lock.js; this is the
// garden, the guess, the clock as a bar, and a log that keeps every sample
// of a guess together so the median is read off, not worked out.

let lockLevel = null, lock = null, lockSeed = 0, lockAttempt = 0;
let lockScene = { kind: 'idle', since: 0 };        // idle | entering | waiting | no | open
const lockSamples = new Map();                     // guessKey -> [ms]
let lastAnswer = null;
let lockStray = null;                              // a symbol that arrived in the same sample as START, before it
let lockTimer = null;                              // the door's answer, due whether or not a frame is drawn

const lockStatus = $('#lockStatus');
const setLockStatus = (text, kind = '') => { lockStatus.textContent = text; lockStatus.className = `status ${kind}`; };
const lockMaxMs = () => (lockLevel.length + 2) * lockLevel.tickMs;

const lockTabs = CATERPILLAR_LOCK.levels.map((lv, i) => {
  const b = document.createElement('button');
  b.className = 'tab';
  b.append(span('long', `${i + 1} \u00b7 ${lv.name} \u00b7 ${lv.length} of ${lv.pool.length} \u00b7 ${lv.tickMs} ms/tick`),
           span('short', `${i + 1} ${lv.short} \u00b7 ${lv.tickMs}ms`));
  b.addEventListener('click', () => setLockLevel(lv));
  $('#lockTabs').append(b);
  return { lv, b };
});

function setLockLevel(lv, seed = 0) {
  clearTimeout(lockTimer);
  lockLevel = lv;
  lockSeed = seed;
  lock = buildLock(lv, seed);
  lockSamples.clear();
  lastAnswer = null;
  lockStray = null;
  lockScene = { kind: 'idle', since: performance.now() };
  for (const t of lockTabs) t.b.classList.toggle('on', t.lv === lv);
  $('#lockBlurb').textContent = lv.blurb;
  $('#ltHead').textContent = `clock \u00b7 ${lv.tickMs} ms a tick \u00b7 ${lv.order === 'secret' ? 'checked in his order' : 'checked first to last'}`;
  $('#ltMid').textContent = `${lv.length + 1} ticks = right`;
  $('#ltEnd').textContent = `${lockMaxMs()} ms`;
  $('#ltAnswer').textContent = '';
  $('#ltMarks').textContent = '';
  drawLockGuess();
  resetLockReadout();
  setLockStatus(`${lv.pool.length}^${lv.length} = ${Math.pow(lv.pool.length, lv.length).toLocaleString('en')} passwords \u00b7 ` +
                (lv.jitterTicks ? `jitter \u00b1${lv.jitterTicks} tick` : 'no jitter') + ' \u00b7 START, then the password');
}

function resetLockReadout() {
  for (const id of ['lrMs', 'lrTicks', 'lrN', 'lrMedian', 'lrVerdict']) $(`#${id}`).textContent = '\u2014';
  $('#lrHint').innerHTML = '&nbsp;';
  $('#lrVerdict').className = '';
}

function drawLockGuess() {
  const el = $('#lockGuess');
  el.textContent = '';
  const typed = lock.guess ?? lastAnswer?.guess ?? [];
  for (let i = 0; i < lockLevel.length; i++) {
    const g = document.createElement('span');
    const sym = typed[i];
    let cls = 'glyph';
    if (sym && (lock.entering || lock.waiting)) cls += ' done';
    else if (sym && lastAnswer?.win) cls += ' done';
    else if (!sym && lock.entering && i === typed.length) cls += ' next';
    g.className = cls;
    g.textContent = sym ? GLYPH[sym] : '\u00b7';
    if (sym) g.title = sym;
    el.append(g);
  }
}

function lockEdge(edge) {
  // a badge fire can land the take's first symbol in the same browser sample
  // as the trigger's START, and the sample lists some buttons before START:
  // hold such a press for a moment and type it once START has opened the guess
  if (edge.down && edge.button !== 'START' && !lock.entering && lockLevel.pool.includes(edge.button)) { lockStray = edge; return; }
  let r = lock.edge(edge);
  if (r?.kind === 'open') {
    clearTimeout(lockTimer);
    lockScene = { kind: 'entering', since: edge.t };
    resetLockReadout();
    $('#ltAnswer').textContent = '';
    setLockStatus(`${lockLevel.length} symbols\u2026`, 'busy');
    if (lockStray && edge.t - lockStray.t <= 20) r = lock.edge(lockStray) ?? r;
  }
  lockStray = null;
  if (r?.kind === 'submitted') {
    lockScene = { kind: 'waiting', since: edge.t };
    setLockStatus('the Caterpillar is thinking\u2026', 'busy');
    // a background tab draws no frames, so the answer is not left to the
    // render loop: a timer delivers it (the loop still checks, harmlessly)
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { const a = lock.tick(performance.now()); if (a) lockAnswer(a); }, Math.max(0, r.answerAt - performance.now()) + 1);
  }
  drawLockGuess();
}

function lockAnswer(a) {
  lockAttempt++;
  lastAnswer = a;
  const key = guessKey(a.guess);
  const samples = lockSamples.get(key) ?? lockSamples.set(key, []).get(key);
  samples.push(a.ms);
  const st = summarize(samples);
  const ticks = a.ms / lockLevel.tickMs;
  const digits = lockLevel.jitterTicks ? 1 : 0;
  const glyphs = a.guess.map(g => GLYPH[g]).join(' ');
  $('#lrMs').textContent = `${Math.round(a.ms)}`;
  $('#lrTicks').textContent = ticks.toFixed(digits);
  $('#lrN').textContent = `${st.n}`;
  $('#lrMedian').textContent = `${Math.round(st.median)}`;
  const kind = a.win ? 'win' : 'hot';
  $('#lrVerdict').textContent = a.win ? 'enter' : 'no';
  $('#lrVerdict').className = kind;
  $('#lrHint').textContent = a.win ? 'the door opens' : `median ${(st.median / lockLevel.tickMs).toFixed(1)} ticks`;
  if (a.win) setLockStatus(`"Enter." \u2014 ${glyphs} \u00b7 guess ${lockAttempt} \u00b7 ${Math.round(a.ms)} ms`, 'win');
  else setLockStatus(`"No." after ${Math.round(a.ms)} ms \u2014 ${ticks.toFixed(digits)} ticks` +
                     (st.n > 1 ? ` \u00b7 median of ${st.n}: ${(st.median / lockLevel.tickMs).toFixed(1)}` : ''), 'hot');
  logTo('#lockLog', `#${lockAttempt} ${glyphs} \u00b7 ${Math.round(a.ms)} ms \u00b7 ${ticks.toFixed(digits)} ticks` +
        (st.n > 1 ? ` \u00b7 n=${st.n} median ${Math.round(st.median)} ms (${Math.round(st.min)}\u2013${Math.round(st.max)})` : '') +
        (a.win ? ' \u00b7 the door opens' : ''), a.win ? 'win' : '');
  // the clock: a mark per sample of this guess, the newest bright
  const marks = $('#ltMarks');
  marks.textContent = '';
  for (const ms of samples) {
    const m = span('trace-mark', '');
    m.style.left = `${Math.min(ms / lockMaxMs(), 1) * 100}%`;
    m.style.opacity = ms === a.ms ? 1 : .4;
    marks.append(m);
  }
  $('#ltAnswer').textContent = `${Math.round(a.ms)} ms \u00b7 ${ticks.toFixed(digits)} ticks`;
  lockScene = { kind: a.win ? 'open' : 'no', since: performance.now() };
  drawLockGuess();
}

$('#lockShuffle').addEventListener('click', () => { setLockLevel(lockLevel, lockSeed + 1); $('#lockLog').textContent = ''; lockAttempt = 0; });
$('#lockClear').addEventListener('click', () => { $('#lockLog').textContent = ''; lockAttempt = 0; lockSamples.clear(); resetLockReadout(); $('#ltMarks').textContent = ''; });

// the clock as a bar: it fills while the door thinks, and stays at the answer
function drawLockTrace(now) {
  if (!lock) return;
  const max = lockMaxMs();
  let ms = 0;
  if (lock.waiting) ms = Math.min(now - lock.submittedAt, max);
  else if (lastAnswer && lockScene.kind !== 'entering') ms = Math.min(lastAnswer.ms, max);
  const fill = $('#ltFill');
  fill.style.width = `${ms / max * 100}%`;
  fill.className = 'trace-fill' + (lock.waiting || !lastAnswer || lockScene.kind === 'entering' ? '' : lastAnswer.win ? ' win' : ' hot');
}

// the garden: hedges, two mushrooms, the Caterpillar's door. He thinks in
// smoke rings, one per tick; Alice walks up, is turned away, or goes through.
const lockMap = CATERPILLAR_LOCK.rows;
const LW = lockMap[0].length, LH = lockMap.length;
const lockCanvas = $('#lockScene');
const lkctx = lockCanvas.getContext('2d');
lockCanvas.width = LW * TILE; lockCanvas.height = LH * TILE;
const lockCellOf = (ch) => { for (let y = 0; y < LH; y++) { const x = lockMap[y].indexOf(ch); if (x >= 0) return [x, y]; } return null; };
const L_ALICE = lockCellOf('A'), L_DOOR = lockCellOf('D');
const HEDGES = ['hedge_daisies', 'hedge_wide', 'hedge_roses', 'hedge_wide', 'hedge_daisies', 'hedge_wide'];
const GRASS = ['floor_grass_clover', 'floor_grass_flowers', 'floor_grass_clover', 'floor_dirt_patch', 'floor_grass_clover'];

function drawLock(now) {
  lkctx.imageSmoothingEnabled = false;
  lkctx.clearRect(0, 0, lockCanvas.width, lockCanvas.height);
  const age = now - lockScene.since;
  const open = lockScene.kind === 'open';

  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const ch = lockMap[y][x];
    const px = x * TILE, py = y * TILE;
    lkctx.drawImage(tiles[GRASS[hash2(x, y) % GRASS.length]], px, py, TILE, TILE);
    if (ch === '#') lkctx.drawImage(tiles[HEDGES[hash2(x, y) % HEDGES.length]], px, py, TILE, TILE);
    if (ch === 'm') lkctx.drawImage(items[y < LH / 2 ? 'mushroom_red' : 'mushroom_blue_trio'], px, py, TILE, TILE);
    if (ch === 'D') lkctx.drawImage(tiles[open ? 'door_wood_open' : 'door_wood_closed'], px, py, TILE, TILE);
  }

  // the Caterpillar thinks: a smoke ring per tick, rising from the door
  if (lock.waiting) {
    const ticks = Math.min((now - lock.submittedAt) / lockLevel.tickMs, 9);
    const cx = (L_DOOR[0] + 0.5) * TILE, base = L_DOOR[1] * TILE - 2;
    for (let i = 0; i < Math.floor(ticks); i++) {
      const rise = (i + 1) * 9 + ((now / 40) % 9);
      lkctx.strokeStyle = ink('--text');
      lkctx.globalAlpha = Math.max(0.12, 0.6 - i * 0.06);
      lkctx.lineWidth = 2;
      lkctx.beginPath();
      lkctx.ellipse(cx + Math.sin(now / 300 + i) * 4, base - rise, 5 + i * 1.2, 2.5 + i * 0.6, 0, 0, Math.PI * 2);
      lkctx.stroke();
    }
    lkctx.globalAlpha = 1;
  }

  // Alice: home until the first guess, then at the door - turned away with a
  // bounce on a no, through it on an enter
  let ax = L_ALICE[0], dir = 'S', period = 400;
  const atDoor = L_DOOR[0] - 1;
  const k = lockScene.kind;
  if (k === 'entering') { const p = Math.min(age / 500, 1); ax = L_ALICE[0] + (atDoor - L_ALICE[0]) * p; dir = 'E'; period = p < 1 ? 140 : 400; }
  else if (k === 'waiting') { ax = atDoor; dir = 'E'; }
  else if (k === 'no') { const p = Math.min(age / 500, 1); ax = atDoor - Math.sin(p * Math.PI) * 0.7; dir = p < 0.5 ? 'W' : 'E'; period = 160; }
  else if (k === 'open') { const p = Math.min(age / 700, 1); ax = atDoor + p; dir = 'E'; period = 140; lkctx.globalAlpha = 1 - Math.max(0, p - 0.6) / 0.4; }
  lkctx.drawImage(frameOf(alice, dir, now, period), ax * TILE, L_ALICE[1] * TILE, TILE, TILE);
  lkctx.globalAlpha = 1;
}

// ---------------------------------------------------- range 4: the dog ----
// The Dormouse's window watchdog. Rules in src/watchdog.js; this is the
// teapot it sleeps in, the nudges as a row of counters, the window as a lit
// band on a clock that refills after every nudge, and the words.

let dogLevel = null, dog = null, dogAttempt = 0;
let dogScene = { kind: 'idle', since: 0 };        // idle | asleep | nudge | early | late | past
let dogTimer = null;                               // the bite, due whether or not a frame is drawn

const dogStatus = $('#dogStatus');
const setDogStatus = (text, kind = '') => { dogStatus.textContent = text; dogStatus.className = `status ${kind}`; };

/** The speed to record a level's tempo at: a power of two that makes the recorded gap a comfortable 0.4-0.8 s. */
function dogSpeed(lv) {
  const ideal = idealGapMs(lv);
  const speed = Math.pow(2, Math.max(0, Math.ceil(Math.log2(400 / ideal))));
  return { speed, recordMs: Math.round(ideal * speed) };
}

const dogTabs = DORMOUSE_WATCHDOG.levels.map((lv, i) => {
  const b = document.createElement('button');
  b.className = 'tab';
  b.append(span('long', `${i + 1} · ${lv.name} · ${lv.kicks} nudges · ${lv.openMs}–${lv.timeoutMs} ms`),
           span('short', `${i + 1} ${lv.short} · ${lv.openMs}–${lv.timeoutMs}`));
  b.addEventListener('click', () => setDogLevel(lv));
  $('#dogTabs').append(b);
  return { lv, b };
});

function setDogLevel(lv) {
  clearTimeout(dogTimer);
  dogLevel = lv;
  dog = new Watchdog(lv);
  dogScene = { kind: 'idle', since: performance.now() };
  for (const t of dogTabs) t.b.classList.toggle('on', t.lv === lv);
  $('#dogBlurb').textContent = lv.blurb;
  const w = windowOf(lv);
  $('#dtHead').textContent = `window · ${lv.openMs}–${lv.timeoutMs} ms after the last nudge`;
  $('#dtMid').textContent = `${w.widthMs} ms wide`;
  $('#dtEnd').textContent = `${lv.timeoutMs} ms`;
  $('#dtGap').textContent = '';
  const band = $('#dtWindow');
  band.style.left = `${lv.openMs / lv.timeoutMs * 100}%`;
  band.style.width = `${w.widthMs / lv.timeoutMs * 100}%`;
  $('#dtMarks').textContent = '';
  drawKicks();
  resetDogReadout();
  const { speed, recordMs } = dogSpeed(lv);
  setDogStatus(`${lv.kicks} nudges on ${lv.button}, each ${lv.openMs}–${lv.timeoutMs} ms after the last` +
               (lv.hand ? ' — a hand can do this' : ` — a hand cannot; record a tap every ${recordMs} ms and play it at ${speed}×`));
}

function resetDogReadout() {
  for (const id of ['drKicks', 'drGap', 'drRate', 'drVerdict']) $(`#${id}`).textContent = '—';
  $('#drWindow').textContent = `${dogLevel.openMs}–${dogLevel.timeoutMs}`;
  $('#drHint').innerHTML = '&nbsp;';
  $('#drVerdict').className = '';
}

/** Where a gap fell, in words. */
function sideOf(gap) {
  const p = placeInWindow(dogLevel, gap);
  return p < 0 ? 'too soon' : p > 1 ? 'too late' : p < 0.33 ? 'early side' : p > 0.67 ? 'late side' : 'dead centre';
}

function drawKicks() {
  const el = $('#dogKicks');
  el.textContent = '';
  const r = dog.result;
  for (let i = 0; i < dogLevel.kicks; i++) {
    const g = document.createElement('span');
    let cls = 'glyph small';
    if (i < dog.kicks) cls += ' done';
    else if (dog.armed && i === dog.kicks) cls += ' next';
    else if (r && !r.win && i === r.kicks) cls += r.verdict === 'early' ? ' early' : ' bad';
    g.className = cls;
    g.textContent = i + 1;
    el.append(g);
  }
}

function markKick(gap, bad) {
  const m = span('trace-mark' + (bad ? ' hot' : ''), '');
  m.style.left = `${Math.min(gap / dogLevel.timeoutMs, 1) * 100}%`;
  $('#dtMarks').append(m);
}

function armDogTimer() {
  clearTimeout(dogTimer);
  dogTimer = setTimeout(() => { const r = dog.tick(performance.now()); if (r) finishDog(r); }, dogLevel.timeoutMs + 2);
}

function dogEdge(edge) {
  if (!edge.down) return;
  if (edge.button === 'START') {
    dog.edge(edge);
    dogScene = { kind: 'asleep', since: edge.t };
    $('#dtMarks').textContent = '';
    $('#dtGap').textContent = '';
    resetDogReadout();
    setDogStatus('the Dormouse is asleep — nudge it while the window is lit', 'busy');
    armDogTimer();
    drawKicks();
    return;
  }
  if (!dog.armed || edge.button !== dogLevel.button) return;
  const r = dog.edge(edge);
  const gap = r ? r.gap : dog.gaps.at(-1);
  markKick(gap, !!r && !r.win);
  $('#drKicks').textContent = `${dog.kicks} / ${dogLevel.kicks}`;
  $('#drGap').textContent = `${Math.round(gap)}`;
  $('#dtGap').textContent = `last gap ${Math.round(gap)} ms · ${sideOf(gap)}`;
  if (!r) {
    dogScene = { kind: 'nudge', since: edge.t };
    setDogStatus(`${dog.kicks} of ${dogLevel.kicks} · ${Math.round(gap)} ms · ${sideOf(gap)}`, 'busy');
    armDogTimer();
    drawKicks();
    return;
  }
  finishDog(r);
}

function finishDog(r) {
  clearTimeout(dogTimer);
  dogAttempt++;
  const rate = r.gaps.length ? 1000 / (r.gaps.reduce((a, b) => a + b, 0) / r.gaps.length) : 0;
  $('#drRate').textContent = rate ? rate.toFixed(1) : '—';
  $('#drKicks').textContent = `${r.kicks} / ${dogLevel.kicks}`;
  if (r.gap !== null) $('#drGap').textContent = `${Math.round(r.gap)}`;
  const kind = r.win ? 'win' : 'hot';
  $('#drVerdict').textContent = r.win ? 'asleep' : r.verdict === 'early' ? 'stirred' : 'bit';
  $('#drVerdict').className = kind;
  $('#drHint').textContent = r.win ? 'Alice tiptoes past' : r.verdict === 'early' ? 'too soon — wait for the window' : 'too late — nudge sooner';
  setDogStatus(r.reason, kind);
  const gaps = r.gaps.map(g => Math.round(g)).join(' ');
  logTo('#dogLog', `#${dogAttempt} ${r.win ? '✓' : '✗'} ${dogLevel.name}: ${r.kicks} of ${dogLevel.kicks} nudges · ${r.reason}` +
        (r.gaps.length ? ` · gaps ${gaps} ms` : ''), kind);
  dogScene = { kind: r.win ? 'past' : r.verdict, since: performance.now() };
  drawKicks();
}

$('#dogClear').addEventListener('click', () => { $('#dogLog').textContent = ''; dogAttempt = 0; resetDogReadout(); $('#dtMarks').textContent = ''; });

// the clock as a bar: it fills from the last nudge towards the bite, and the
// lit band is where the next nudge has to land
function drawDogTrace(now) {
  if (!dog) return;
  const max = dogLevel.timeoutMs;
  let ms = 0;
  if (dog.armed) ms = Math.min(now - dog.last, max);
  else if (dog.result && dog.result.gap !== null) ms = Math.min(dog.result.gap, max);
  const fill = $('#dtFill');
  fill.style.width = `${ms / max * 100}%`;
  fill.className = 'trace-fill' + (dog.armed || !dog.result ? '' : dog.result.win ? ' win' : ' hot');
}

// the teapot the Dormouse sleeps in: snores while it sleeps, rattles when it
// wakes, and Alice tiptoes across the top once the party is past it
const dormouseCtx = $('#dormouse').getContext('2d');
function drawDormouse(now) {
  const c = dormouseCtx;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, 96, 96);
  const age = now - dogScene.since;
  const k = dogScene.kind;
  let dx = 0, dy = 0;
  if ((k === 'early' || k === 'late') && age < 700) { dx = Math.sin(age / 25) * 3; dy = Math.cos(age / 40) * 2; }
  if (k === 'nudge' && age < 200) dy = -Math.sin(age / 200 * Math.PI) * 3;
  c.drawImage(items.teapot_heart_blue, 14 + dx, 30 + dy, 68, 68);
  // snores: a 'z' per second, rising from the spout
  if (k === 'asleep' || k === 'nudge' || k === 'past') {
    c.fillStyle = ink('--text');
    c.font = 'bold 11px monospace';
    for (let i = 0; i < 3; i++) {
      const ph = ((now / 1000) + i / 3) % 1;
      c.globalAlpha = (1 - ph) * 0.8;
      c.fillText('z', 62 + i * 6 + Math.sin(ph * 6) * 2, 34 - ph * 22 - i * 4);
    }
    c.globalAlpha = 1;
  }
  if (k === 'early' || k === 'late') {
    c.fillStyle = ink('--hot');
    c.font = 'bold 12px monospace';
    c.fillText(k === 'early' ? '?!' : 'GRR', 56, 26);
  }
  if (k === 'past') {
    const p = Math.min(age / 1500, 1);
    c.drawImage(frameOf(alice, 'E', now, 140), -24 + p * 110, -4, 48, 48);
  }
}

// --------------------------------------------------- range 5: the wall ----
// Humpty Dumpty's stack. Rules in src/wall.js; this is the wall and the egg
// on it, the name as it is typed, his frame as slots, the leash as a bar,
// the listing with open_wall's address in it, and the words.

let wallLevel = null, wall = null, wallSeed = 0, wallAttempt = 0, lastWall = null;
let wallScene = { kind: 'idle', since: 0 };       // idle | listening | polite | canary | fall | open
let wallTimer = null, wallStray = null;

const wallStatus = $('#wallStatus');
const setWallStatus = (text, kind = '') => { wallStatus.textContent = text; wallStatus.className = `status ${kind}`; };

const wallTabs = HUMPTY_WALL.levels.map((lv, i) => {
  const b = document.createElement('button');
  b.className = 'tab';
  b.append(span('long', `${i + 1} · ${lv.name} · ${lv.gapMs} ms a symbol`),
           span('short', `${i + 1} ${lv.short} · ${lv.gapMs}ms`));
  b.addEventListener('click', () => setWallLevel(lv));
  $('#wallTabs').append(b);
  return { lv, b };
});

function setWallLevel(lv, seed = 0) {
  clearTimeout(wallTimer);
  wallLevel = wallDefaults(lv, seed);
  wallSeed = seed;
  wall = new Wall(lv, seed);
  lastWall = null;
  wallStray = null;
  wallScene = { kind: 'idle', since: performance.now() };
  for (const t of wallTabs) t.b.classList.toggle('on', t.lv === lv);
  $('#wallBlurb').textContent = lv.blurb;
  const ol = $('#wallListing');
  ol.textContent = '';
  lv.listing.forEach((text, i) => {
    const li = document.createElement('li');
    const t = span('tick', text.trim() ? `${i + 1}` : '');
    const code = document.createElement('code');
    code.textContent = text;
    li.append(t, code);
    if (/@/.test(text)) li.classList.add('addr');
    if (/canary/.test(text)) li.classList.add('canary-line');
    ol.append(li);
  });
  $('#wlHead').textContent = `leash · ${lv.gapMs} ms a symbol`;
  $('#wlMid').textContent = 'the read ends when nothing comes';
  $('#wlEnd').textContent = `${lv.gapMs} ms`;
  $('#wlAnswer').textContent = '';
  drawName();
  drawFrame(null);
  resetWallReadout();
  const rate = (1000 / lv.gapMs).toFixed(1);
  setWallStatus(`${lv.hidden ? 'a buffer of some size' : `a buffer of ${lv.size}`}, ${lv.canary ? 'a canary, ' : ''}then lr · ` +
                `${lv.gapMs} ms a symbol (${rate}/s)` + (lv.hand ? ' — a thumb can type this' : ' — a thumb cannot; the name is a take'));
}

function resetWallReadout() {
  for (const id of ['wrLen', 'wrOver', 'wrLr', 'wrSaid', 'wrVerdict']) $(`#${id}`).textContent = '—';
  $('#wrHint').innerHTML = '&nbsp;';
  $('#wrVerdict').className = '';
}

function drawName() {
  const el = $('#wallName');
  el.textContent = '';
  const typed = wall.typed ?? lastWall?.typed ?? [];
  const n = Math.max(typed.length + (wall.listening ? 1 : 0), 1);
  for (let i = 0; i < n; i++) {
    const g = document.createElement('span');
    const sym = typed[i];
    let cls = 'glyph small';
    if (sym) cls += ' done';
    else if (wall.listening) cls += ' next';
    g.className = cls;
    g.textContent = sym ? GLYPH[sym] : '·';
    if (sym) g.title = sym;
    el.append(g);
  }
}

/** Humpty's frame as slots. A hidden level shows it only once the wall is open; before that the size is the puzzle. */
function drawFrame(a) {
  const el = $('#wallFrame');
  el.textContent = '';
  if (wallLevel.hidden && !a?.win) return;
  const f = wallFrameOf(wallLevel);
  const typed = a?.typed ?? [];
  for (let i = 0; i < f.total; i++) {
    const slot = document.createElement('span');
    let cls = 'slot';
    let tag = null;
    if (i < f.size) { cls += ' buf'; if (i === 0) tag = `name[${f.size}]`; }
    else if (i === f.canaryAt) { cls += ' canary'; tag = 'canary'; }
    else { cls += ' lr'; if (i === f.lrAt) tag = 'lr'; }
    const sym = typed[i];
    if (sym) {
      cls += ' filled';
      if (i >= f.size) cls += a.verdict === 'open' || (i === f.canaryAt && a.verdict !== 'canary') ? ' good' : ' hit';
    }
    slot.className = cls;
    if (tag) slot.dataset.tag = tag;
    slot.textContent = sym ? GLYPH[sym] : i === f.canaryAt ? '?' : i >= f.lrAt ? '↩' : '·';
    el.append(slot);
  }
}

function armWallTimer() {
  clearTimeout(wallTimer);
  wallTimer = setTimeout(() => { const a = wall.tick(performance.now()); if (a) wallAnswer(a); }, Math.max(0, wall.closesAt - performance.now()) + 1);
}

function wallEdge(edge) {
  // as with the lock: a fire's first symbol can list before START in the same
  // browser sample, so hold such a press for a moment and type it after START
  if (edge.down && edge.button !== 'START' && !wall.listening && wallLevel.pool.includes(edge.button)) { wallStray = edge; return; }
  let r = wall.edge(edge);
  if (r?.kind === 'open') {
    clearTimeout(wallTimer);
    wallScene = { kind: 'listening', since: edge.t };
    resetWallReadout();
    $('#wlAnswer').textContent = '';
    setWallStatus('"And what is your name?"', 'busy');
    if (wallStray && edge.t - wallStray.t <= 20) r = wall.edge(wallStray) ?? r;
  }
  wallStray = null;
  if (r?.kind === 'answer') { wallAnswer(r); return; }
  if (wall.listening) {
    if (wall.typed.length) setWallStatus(`${wall.typed.length} symbol${wall.typed.length === 1 ? '' : 's'}…`, 'busy');
    armWallTimer();
  }
  drawName();
}

const WALL_SAID = {
  polite: (g) => `"Pleased to meet you, ${g}."`,
  canary: () => '"*** stack smashing detected ***" — Humpty halts',
  fall: () => 'Humpty had a great fall',
  open: () => '"Pleased to meet you." — and the wall opens',
};

function wallAnswer(a) {
  clearTimeout(wallTimer);
  wallAttempt++;
  lastWall = a;
  const glyphs = a.typed.map(g => GLYPH[g]).join(' ') || '(nothing)';
  const said = WALL_SAID[a.verdict](glyphs);
  const kind = a.win ? 'win' : a.verdict === 'polite' ? '' : 'hot';
  $('#wrLen').textContent = `${a.length}`;
  $('#wrOver').textContent = wallLevel.hidden && !a.win ? (a.verdict === 'polite' ? 'none' : 'some') : `${a.overflow}`;
  $('#wrLr').textContent = a.lr ? a.lr.map(g => GLYPH[g]).join(' ') : 'untouched';
  $('#wrSaid').textContent = { polite: 'pleased', canary: 'smashed', fall: 'a fall', open: 'opens' }[a.verdict];
  $('#wrVerdict').textContent = a.verdict;
  $('#wrVerdict').className = kind;
  $('#wrHint').textContent = {
    polite: a.length ? 'the name fit — try a longer one' : 'nothing typed before the leash ran out',
    canary: 'the canary changed — what symbol was in its slot?',
    fall: `fault report: lr = ${(a.lr ?? []).map(g => GLYPH[g]).join(' ')}`,
    open: 'the garden',
  }[a.verdict];
  $('#wlAnswer').textContent = said;
  setWallStatus(said, kind);
  logTo('#wallLog', `#${wallAttempt} ${glyphs} · ${a.length} symbol${a.length === 1 ? '' : 's'} · ${said}`, kind);
  wallScene = { kind: a.verdict, since: performance.now() };
  drawName();
  drawFrame(a);
}

$('#wallClear').addEventListener('click', () => { $('#wallLog').textContent = ''; wallAttempt = 0; resetWallReadout(); });

// the leash as a bar: it runs out from the last symbol; the answer comes when it does
function drawWallTrace(now) {
  if (!wall) return;
  const fill = $('#wlFill');
  if (wall.listening) {
    const leash = wall.typed.length ? wallLevel.gapMs : wallLevel.firstMs;
    const from = wall.closesAt - leash;
    fill.style.width = `${Math.min((now - from) / leash, 1) * 100}%`;
    fill.className = 'trace-fill';
  } else {
    fill.style.width = lastWall ? '100%' : '0';
    fill.className = 'trace-fill' + (!lastWall ? '' : lastWall.win ? ' win' : lastWall.verdict === 'polite' ? '' : ' hot');
  }
}

// the wall, the egg on it, Alice at its foot. He talks while he listens,
// nods when pleased, wobbles when his canary complains, falls and cracks on
// a bad return, and the wall opens under him when lr says open_wall.
const wallMap = HUMPTY_WALL.rows;
const WW = wallMap[0].length, WH = wallMap.length;
const wallCanvas = $('#wallScene');
const wctx = wallCanvas.getContext('2d');
wallCanvas.width = WW * TILE; wallCanvas.height = WH * TILE;
const wallCellOf = (ch) => { for (let y = 0; y < WH; y++) { const x = wallMap[y].indexOf(ch); if (x >= 0) return [x, y]; } return null; };
const W_ALICE = wallCellOf('A'), W_HUMPTY = wallCellOf('H');
const WALL_STONES = ['wall_stone_blue', 'wall_stone_blue', 'wall_stone_banners', 'wall_stone_blue'];
const WALL_FLOORS = ['floor_cobble', 'floor_cobble_moss', 'floor_cobble', 'floor_grass_patch'];
const GARDEN = ['floor_grass_roses', 'floor_grass_patch', 'floor_grass_roses', 'floor_grass_clover'];

function drawEgg(c, x, y, { mouth = 0, tilt = 0, crack = 0, alpha = 1 } = {}) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.rotate(tilt);
  c.fillStyle = '#f3ead8';
  c.strokeStyle = '#8a7a60';
  c.lineWidth = 1.5;
  c.beginPath(); c.ellipse(0, 0, 13, 17, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  // a belt and a bow tie, as every Humpty has
  c.fillStyle = ink('--accent'); c.fillRect(-13, 5, 26, 4);
  c.fillStyle = ink('--hot'); c.beginPath(); c.moveTo(-5, -2); c.lineTo(5, -6); c.lineTo(5, 2); c.lineTo(-5, -6); c.closePath(); c.fill();
  c.fillStyle = '#2a2a2a';
  c.beginPath(); c.arc(-5, -8, 1.6, 0, Math.PI * 2); c.arc(5, -8, 1.6, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.2;
  c.beginPath(); c.ellipse(0, -1, 4, 1 + mouth * 3, 0, 0, Math.PI * 2); c.stroke();
  if (crack > 0) {
    c.strokeStyle = '#6b5a40'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-10, 2); c.lineTo(-4, -3 * crack); c.lineTo(1, 4 * crack); c.lineTo(7, -5 * crack); c.lineTo(11, 3); c.stroke();
  }
  c.restore();
}

function drawWall(now) {
  wctx.imageSmoothingEnabled = false;
  wctx.clearRect(0, 0, wallCanvas.width, wallCanvas.height);
  const age = now - wallScene.since;
  const k = wallScene.kind;
  const open = k === 'open';

  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const ch = wallMap[y][x];
    const px = x * TILE, py = y * TILE;
    const garden = x > W_HUMPTY[0];
    wctx.drawImage(tiles[(garden ? GARDEN : WALL_FLOORS)[hash2(x, y) % 4]], px, py, TILE, TILE);
    if (ch === '#') wctx.drawImage(tiles[WALL_STONES[hash2(x, y) % WALL_STONES.length]], px, py, TILE, TILE);
    if (ch === 'H') wctx.drawImage(tiles[open ? 'door_wood_open' : WALL_STONES[0]], px, py, TILE, TILE);
  }

  // Humpty, on the wall above the gap - or off it
  const hx = (W_HUMPTY[0] + 0.5) * TILE, hy = W_HUMPTY[1] * TILE - 2;
  let egg = { mouth: 0, tilt: 0, crack: 0, alpha: 1 };
  if (k === 'listening') egg.mouth = (Math.sin(now / 90) + 1) / 2;
  else if (k === 'polite' && age < 600) egg.tilt = Math.sin(age / 600 * Math.PI * 2) * 0.12;
  else if (k === 'canary' && age < 900) egg.tilt = Math.sin(age / 40) * 0.25 * (1 - age / 900);
  else if (k === 'fall') {
    const p = Math.min(age / 700, 1);
    egg = { mouth: 1, tilt: p * 1.4, crack: p >= 1 ? 1 : 0, alpha: 1 };
    wctx.save();
    drawEgg(wctx, hx + p * 30, hy + p * p * 70, egg);
    wctx.restore();
    if (p >= 1) { wctx.fillStyle = ink('--hot'); wctx.font = 'bold 10px monospace'; wctx.fillText('all the king’s horses…', hx - 20, hy + 90); }
  }
  else if (open) egg.alpha = Math.max(0.25, 1 - age / 1500);
  if (k !== 'fall') drawEgg(wctx, hx, hy, egg);

  // Alice: home, up to the wall while he listens, back on a no, through on an open
  let ax = W_ALICE[0], dir = 'E', period = 400;
  const foot = W_HUMPTY[0] - 1;
  if (k === 'listening') { const p = Math.min(age / 500, 1); ax = W_ALICE[0] + (foot - W_ALICE[0]) * p; period = p < 1 ? 140 : 400; }
  else if (k === 'polite' || k === 'canary') { const p = Math.min(age / 900, 1); ax = foot - (foot - W_ALICE[0]) * p; dir = p < 1 ? 'W' : 'S'; period = p < 1 ? 160 : 400; }
  else if (k === 'fall') { ax = foot; dir = 'E'; }
  else if (open) { const p = Math.min(age / 1200, 1); ax = foot + p * 3; period = 140; if (p >= 1) { dir = 'S'; period = 400; } }
  wctx.drawImage(frameOf(alice, dir, now, period), ax * TILE, W_ALICE[1] * TILE, TILE, TILE);
}

// ------------------------------------------------------------------ drawing ----

const hash2 = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return Math.abs(h ^ (h >>> 16)); };
const WALLS = ['wall_blue', 'wall_blue', 'wall_blue', 'pillar_blue', 'wall_blue', 'wall_blue_banner_red'];
const FLOORS = ['floor_marble_plain', 'floor_marble_veined', 'floor_marble_plain'];
/** A colour of the theme in force, read live, so the canvases paint in the page's own accent and text. */
const ink = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#6fb0f0';

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
      gctx.fillStyle = ink('--accent');
      gctx.globalAlpha = 0.25;
      gctx.fillRect(GUARD[0] * TILE, (GUARD[1] - 1) * TILE + 6, TILE * ((step + 1) / level.honest.length), 6);
      gctx.globalAlpha = 1;
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

let cursorLine = null, cursorTick = null;
function drawListing(now) {
  let want = null, tickNow = null;
  if (scene.kind === 'running' && run?.open) {
    const e = run.elapsed(now);
    const step = level.honest.findIndex(s => (s.tick + s.ticks) * level.lineMs > e);
    want = step >= 0 ? level.honest[step].line : null;
    tickNow = e < level.totalMs ? Math.floor(e / level.lineMs) : null;
  }
  if (tickNow !== cursorTick) {
    const ticks = $('#traceTicks');
    if (cursorTick !== null) ticks.children[cursorTick]?.classList.remove('pc');
    if (tickNow !== null) ticks.children[tickNow]?.classList.add('pc');
    cursorTick = tickNow;
  }
  if (want === cursorLine) return;
  $(`#listing li.pc`)?.classList.remove('pc');
  if (want !== null) {
    const li = $(`#listing li[data-line="${want}"]`);
    if (li) {
      li.classList.add('pc');
      // a short listing (the phone looks) keeps the executing line in view
      const ol = $('#listing');
      if (ol.scrollHeight > ol.clientHeight) ol.scrollTop = (li.offsetTop - ol.offsetTop) - ol.clientHeight / 2 + li.offsetHeight / 2;
    }
  }
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
setLockLevel(CATERPILLAR_LOCK.levels[0]);
setDogLevel(DORMOUSE_WATCHDOG.levels[0]);
setWallLevel(HUMPTY_WALL.levels[0]);
// scripted tests read the ranges' state through this (dev hosts; nothing here plays)
window.__range = { get armed() { return armed; }, get combo() { return combo; }, get run() { return run; }, get lock() { return lock; },
                   get dog() { return dog; }, get wall() { return wall; }, arm, setDogLevel, setWallLevel };

// The gate's pause (site only). The ranges are timed per attempt, so there
// is nothing to freeze: a run that was open ends on its own clock (the pad
// has already released whatever was held), a guess already fired gets its
// answer. A half-done combo is reset so it is not "too slow" when the badge
// is back. The bench log keeps the record.
hooks.pause = (why) => {
  if (combo?.open && combo.at > 0) { combo.reset(); drawCombo(); $('#wtGaps').textContent = ''; }
  if (dog?.armed) { clearTimeout(dogTimer); dog.reset(); drawKicks(); setDogStatus(`paused - the badge is ${why}`, 'hot'); }
  if (wall?.listening) { clearTimeout(wallTimer); wall.reset(); drawName(); setWallStatus(`paused - the badge is ${why}`, 'hot'); }
  setWatchStatus(`paused - the badge is ${why}`, 'hot');
  logTo('#benchLog', `badge ${why} - paused`, 'hot');
  $('#benchStatus').textContent = `${benchCount} edges · paused`;
};
hooks.resume = () => {
  setWatchStatus('the badge is back - carry on', 'win');
  logTo('#benchLog', 'badge back', 'win');
  refreshPad();
};

function tick(now) {
  if (run?.open) { const r = run.tick(now); if (r) finishRun(r); }
  if (lock?.waiting) { const a = lock.tick(now); if (a) lockAnswer(a); }
  if (dog?.armed) { const r = dog.tick(now); if (r) finishDog(r); }
  if (wall?.listening) { const a = wall.tick(now); if (a) wallAnswer(a); }
  drawRabbit(now);
  drawWatchTrace(now);
  drawGlass(now);
  drawListing(now);
  drawLock(now);
  drawLockTrace(now);
  drawDormouse(now);
  drawDogTrace(now);
  drawWall(now);
  drawWallTrace(now);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
