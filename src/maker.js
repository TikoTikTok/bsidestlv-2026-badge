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
//               that writes the stage module a pull request carries, with the
//               room's blurb and lesson (what the stages page shows under it); the
//               assistant panel, where whoever is on the bridge (src/bridge.js)
//               talks and is seen working; and the tutorials - the guided
//               builds of src/tutor.js MAKER_TUTORIALS, one chosen in the
//               Learn panel, drawn by src/coach.js.
//
// The keyboard plays here, and only here: the Pad is built with every source
// on a dev host (src/pad.js sourcesFor), on the site it is not built at all.
// A room is kept in localStorage (alice.maker.level) between visits, the
// shelf under alice.maker.shelf, and a room can travel in a link (?level=,
// src/level.js shareUrl: the Share dialog, below; the same link opens the
// room on the stages page and in the landing's hero).

import { Pad, sourcesFor, KEYS, BUTTONS } from './pad.js';
import { gateMode } from './gate.js';
import { initLooks } from './looks.js';
import { tilt } from './tilt.js';
import { TILE, THEMES, HAZARD_CAST, loadScene, drawCell, drawRoom } from './scene.js';
import { parse as parseTea, step as teaStep, isGoal as teaGoal } from './puzzle.js';
import { parse as parseChase, step as chaseStep, isGoal as chaseGoal, seenBy } from './chase.js';
import { CHARS, BRUSHES, kindOf, isGlitch, blank, setCell, resize, lint, check, toModule, fromModule, normalize,
         idOf, encodeShare, decodeShare, shareUrl, shareInfo, sharePage, SHARE_PARTS, lineCells, rectCells, regionCells, paintCells, mirrorCells,
         flipH, flipV, rotate, shift, analyse, difficulty, STARTERS, generateSolvable, lessonToText, lessonFromText } from './level.js';
import { MAKER_TUTORIALS, LESSON_EVENTS, Tutor } from './tutor.js';
import { mountCoach, tutorStore } from './coach.js';
import { connectBridge } from './bridge.js';
import { GUIDE_MODES, modeById } from './guide.js';
import { aiPrompt, prPrompt, prParts, prShort, repoParts, pagesUrl } from './invite.js';
import { RANGE_KINDS, RANGE_NAMES, RANGE_FILES, RANGE_MAPS, RANGE_GLYPHS, POOL_BUTTONS, BUDGET, rangeBlank, wallListing, takeFor } from './rangecheck.js';
import { loadStage, stageOf } from './seal.js';
import { comboSequence, buildLevel, idealOffsetMs } from './range.js';
import { secretFor, orderFor } from './lock.js';
import { windowOf } from './watchdog.js';
import { frameOf, canaryFor } from './wall.js';

const $ = (sel) => document.querySelector(sel);
const mode = gateMode();
const dev = mode === 'dev';

// Before anything paints, as this device left them (the studio below keeps them): the guide's place in the
// classic look - beside the board (data-learn="side", maker.html's default: a column on a wide window, a drawer
// on a narrow one) or in the page, last - and the phone looks' mode bar's panel. src/look-boot.js hides the other
// panels from data-mode on DOMContentLoaded and initLooks lights the button, so the page opens where it was left.
const html = document.documentElement;
const LEARN = 'alice.maker.learn';   // 'side' | 'page'
const MODE = 'alice.maker.mode';     // one of MODES
const MODES = ['home', 'learn', 'edit', 'play', 'export', 'assistant'];   // maker.html's nav.modes = the panels' keys (goTo)
if (dev) {
  try {
    if (localStorage.getItem(LEARN) === 'page') html.dataset.learn = 'page';
    const m = localStorage.getItem(MODE);
    if (MODES.includes(m)) html.dataset.mode = m;
  } catch { /* storage may be off */ }
}
const looksReady = initLooks({ onMode(m) { if (dev) try { localStorage.setItem(MODE, m); } catch { /* storage may be off */ } } });

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

// ------------------------------------------------------------ the invitation ----
// Two prompts, from src/invite.js: the invitation (come and build a room with
// me) under the hero and in the assistant panel, and the brief for one room
// (open the pull request for THIS room) from the export panel. One dialog
// shows either, data-kind saying which. The links carry the text in ?q=, or,
// when a brief is too long for a link, a short note that says the brief is on
// the clipboard - then Copy is what the person presses first, and the status
// says so.

const invite = (() => {
  const dialog = $('#aiDialog');
  const title = $('#aiTitle'), note = $('#aiNote'), box = $('#aiPrompt'), status = $('#aiStatus');
  const prose = {
    invite: [title.textContent, note.textContent],
    pr: ['Ship this room: hand your assistant the pull request',
         'Copy this brief into Claude, ChatGPT or an assistant on the bridge. It carries the room\'s module, its index line, the branch, the commands to run and the pull request\'s body; an assistant that can run commands on your machine does the rest, and you review the pull request.'],
  };
  const LINK_MAX = 6000;           // a ?q= longer than this is cut or refused by the front doors
  let text = '', hint = '';
  const say = (s) => { status.textContent = s; setTimeout(() => { status.textContent = hint; }, 1500); };
  function show(kind, prompt, { short } = {}) {
    text = prompt;
    dialog.dataset.kind = kind;
    [title.textContent, note.textContent] = prose[kind];
    box.value = text;
    const long = !!short && encodeURIComponent(text).length > LINK_MAX;
    const carried = encodeURIComponent(long ? short : text);
    $('#aiClaude').href = `https://claude.ai/new?q=${carried}`;
    $('#aiChatGPT').href = `https://chatgpt.com/?q=${carried}`;
    hint = long ? 'too long for a link: press Copy first; the links carry a note saying you will paste the brief' : '';
    status.textContent = hint;
    tilt.request?.();
    dialog.showModal();
  }
  const open = () => show('invite', aiPrompt(repo));
  $('#aiBtn').addEventListener('click', open);
  $('#aiBtn2')?.addEventListener('click', open);
  $('#aiClose').addEventListener('click', () => dialog.close());
  $('#aiCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); say('copied'); }
    catch { box.select(); say('select and copy'); }
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  return { show };
})();

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
const looks = await looksReady;      // the picker, and in the phone looks the mode bar (looks.setMode / looks.mode)

// A room that came in a link (?level=, src/level.js decodeShare; the studio's
// Share dialog writes one). On the site it is the room in the hero, and the
// line under it says where it plays - the stages page, where the badge plays
// it; on a checkout the studio below loads it instead, as any room.
const sharedToken = new URLSearchParams(location.search).get('level');
let sharedRoom = null, sharedError = null;
if (sharedToken !== null) {
  try { sharedRoom = decodeShare(sharedToken); sharedError = lint(sharedRoom)[0] ?? null; }
  catch (e) { sharedError = e.message; }
}
const sharedGlitch = !!sharedRoom && !sharedError && isGlitch(sharedRoom);   // a glitch range level: the range page plays it, the hero cannot draw it
const sharedOk = !!sharedRoom && !sharedError && !sharedGlitch;
{
  const note = $('#sharedNote');
  const playLink = (href, text) => Object.assign(document.createElement('a'), { href, className: 'btn', textContent: text });   // the one thing to press
  if (sharedOk) {
    note.append('Someone shared a room with you: ', Object.assign(document.createElement('b'), { textContent: sharedRoom.name }), '. ',
                playLink(`index.html?level=${encodeURIComponent(sharedToken)}`, 'Play it on the stages page'),
                ' The badge plays it there like any room. This page only shows it; to edit it, open this same link in the studio of a checkout.');
    note.hidden = false;
  } else if (sharedGlitch) {
    note.append('Someone shared a glitch level with you: ', Object.assign(document.createElement('b'), { textContent: sharedRoom.name }), '. ',
                playLink(`glitch.html?level=${encodeURIComponent(sharedToken)}`, 'Play it on the range page'),
                ' It is the last tab of its range there. To edit it, open this same link in the studio of a checkout.');
    note.hidden = false;
  } else if (sharedToken !== null) {
    note.textContent = `The link carries a room this page could not ${sharedRoom ? 'show' : 'read'}: ${sharedError}.`;
    note.hidden = false;
  }
}

{
  const canvas = $('#heroCanvas');
  const ctx = canvas.getContext('2d');
  const hero = (!dev && sharedOk) ? sharedRoom : HERO;     // the landing shows what was shared; the studio has its own board for it
  const timed = kindOf(hero) === 'chase';
  const map = timed ? parseChase(hero) : parseTea(hero.rows);
  const step = timed ? chaseStep : teaStep;
  canvas.width = map.w * TILE; canvas.height = map.h * TILE;
  // Alice walks the solution when the solver finds one within reason; a shared room it cannot clear in time is painted still
  const moves = check(hero, { limit: 50_000 }).moves ?? [];
  const dressings = hero === HERO ? ['garden', 'hall', 'court'] : [THEMES[hero.theme] ? hero.theme : 'garden'];
  const beat = timed ? Math.max(120, Math.min(400, hero.tickMs ?? 320)) : 170;
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
      while (at < moves.length && dt > (at + 1) * beat) { const n = step(map, state, moves[at]); if (moves[at] !== 'wait') facing = moves[at]; if (n) state = n; at++; }
      drawRoom(ctx, scene, map, state, theme, { now, facing, walking: at < moves.length, beatMs: beat });
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

// ------------------------------------------------------------ the guide's place ----
// The Learn panel is the last panel of a long page. In the classic look it sits beside
// the board instead (src/maker.css, html[data-learn=side]): a column at the right of a
// wide window, sticky under the header; a drawer over the right edge of a narrow one (the
// in-app browser's pane, a small window), opened and closed by the coach line's "learn"
// and the panel's ×. "unpin" (#learnPin) puts it back in the page. In the phone looks the
// maker has a mode bar and Learn is a mode, so the way to any panel is goTo(key).

const WIDE = matchMedia('(min-width: 1000px)');   // the same breakpoint as src/maker.css: a column, else a drawer
const PANELS = { home: '#hero', edit: '#editPanel', play: '#playPanel', export: '#exportPanel', assistant: '#assistantPanel', learn: '#learnPanel' };
/** Put a panel on screen: the phone looks switch the mode bar to it (its mode is its key), the classic page scrolls to it. */
function goTo(key) {
  if (looks.look.id !== 'classic') { looks.setMode(key); return; }
  $(PANELS[key])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/** The drawer (the classic look, a narrow window): open, closed, or toggled; the coach line's "learn" says which it is. */
function openLearn(open = !('learnOpen' in html.dataset)) {
  if (open && html.dataset.learn === 'side') html.dataset.learnOpen = ''; else delete html.dataset.learnOpen;
  $('#coachOpen').setAttribute('aria-expanded', String('learnOpen' in html.dataset));
  return 'learnOpen' in html.dataset;
}
/** Beside the board ('side', a column or a drawer) or in the page ('page'); remembered unless told not to. */
function setLearn(where, { remember = true } = {}) {
  html.dataset.learn = where === 'page' ? 'page' : 'side';
  if (html.dataset.learn === 'page') openLearn(false);
  if (remember) save(LEARN, html.dataset.learn);
  $('#learnPin').textContent = html.dataset.learn === 'side' ? 'unpin' : 'pin beside the board';
  $('#learnPin').setAttribute('aria-pressed', String(html.dataset.learn === 'side'));
  return html.dataset.learn;
}
setLearn(html.dataset.learn, { remember: false });
$('#learnPin').addEventListener('click', () => setLearn(html.dataset.learn === 'side' ? 'page' : 'side'));
$('#learnClose').addEventListener('click', () => openLearn(false));
WIDE.addEventListener('change', () => openLearn(false));   // grown into the column or shrunk out of it: the drawer starts closed

// the tutorials: one Tutor per guided build, each with its own progress
// (alice.tutor.maker for the first, alice.tutor.maker.<id> for the rest), the
// chosen one remembered under alice.maker.tutorial, ?tutorial=<id> picking one
// for the visit; every event the studio produces goes through tell() to the
// coach, which feeds the build in use
const TUTORIAL = 'alice.maker.tutorial';
const tutorKey = (id) => (id === MAKER_TUTORIALS[0].id ? 'alice.tutor.maker' : `alice.tutor.maker.${id}`);
const tutorialById = (id) => MAKER_TUTORIALS.find(t => t.id === id) ?? null;
const tutors = new Map(MAKER_TUTORIALS.map(t => [t.id, new Tutor(t.steps, tutorStore(tutorKey(t.id)))]));
let picked = [new URLSearchParams(location.search).get('tutorial'), load(TUTORIAL)].find(id => tutorialById(id)) ?? MAKER_TUTORIALS[0].id;
let tutor = tutors.get(picked);
let coach = null;
/** Every event the studio produces goes to the coach; on the Rabbit's guided way, a step done goes up the bridge too, so the assistant sees it. */
const tell = (what, extra = {}) => {
  const s = coach?.feed({ ...extra, kind: 'maker', what });
  if (s) {
    if (guideMode === 'tutorial' && bridge?.available)
      bridge.post(`✓ ${s.title} (${tutor.at} of ${tutor.steps.length}${tutor.done ? ', the build is done' : ''})`, { kind: 'tutorial', data: { id: picked, step: s.id, at: tutor.at, of: tutor.steps.length, done: tutor.done } });
    // A step that waits on the lint may come up when the room already passes it: the stroke that finished the
    // step before fired the lint first. Tell it once more, so "Well formed" ticks without another edit.
    const next = tutor.step;
    if (next && what !== 'lint' && level && [].concat(next.done.what ?? []).includes('lint')) queueMicrotask(() => tell('lint', { ok: !lint(level).length, problems: lint(level), why: 'again' }));
  }
  return s;
};
const tutorialSummary = () => ({ id: picked, title: tutorialById(picked).title, step: tutor.step?.id ?? 'done', at: tutor.at, of: tutor.steps.length });

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
let guideMode = null;          // the way picked on the welcome banner (src/guide.js GUIDE_MODES), or null
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
const blurbEl = $('#blurb'), lessonEl = $('#lesson');
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
  if (!level.rows) return;    // a glitch level: the board is hidden, the range's map is drawn by renderRange
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

/** A hazard changed - added, a route point laid, its cast or sight edited: which one, and its route so far (the tutorial watches it grow). */
const tellHazard = (did, n) => { const h = level.hazards?.[n]; if (h) tell('hazard', { did, n, route: h.route.map(([x, y]) => [x, y]), sight: h.sight ?? 0, character: h.character ?? h.id }); };
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
  function edit(n, fn) { const hazards = level.hazards.map(h => ({ ...h, route: [...h.route] })); fn(hazards[n]); setLevel({ ...level, hazards }); tellHazard('edit', n); }
}
function uniqueId(base, except) {
  const taken = new Set((level.hazards ?? []).filter((_, i) => i !== except).map(h => h.id));
  let id = base; for (let k = 2; taken.has(id); k++) id = `${base}${k}`;
  return id;
}

function render() {
  $('#editPanel').dataset.category = isGlitch(level) ? 'glitch' : 'room';
  if (isGlitch(level)) { renderRange(); return; }
  $('#category').value = 'room';
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
  if (document.activeElement !== blurbEl) blurbEl.value = level.blurb ?? '';
  if (document.activeElement !== lessonEl) lessonEl.value = lessonToText(level);
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
  $('#prBtn').disabled = !!problems.length;
  $('#prBtn').title = problems.length ? `not yet: ${problems[0]}` : 'hand your assistant the module, the index line, the branch and the steps: everything the pull request for this room needs';
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
  if (isGlitch(level)) { showRangeReport(); return; }
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
    tellHazard('route', hazardPick);
    return;
  }
  if (tool === 'pick' || (e.altKey && e.button === 0)) { const ch = level.rows[c.y][c.x]; if (ch in CHARS) setBrush(ch); return; }
  const ch = e.button === 2 ? '.' : brush;
  // a stroke is told before the room changes under it, so what lint then says is the news after the paint
  if (tool === 'fill') {
    const cells = withMirror(regionCells(level, c.x, c.y));
    tell('paint', { ch, cells: cells.length, tool }); tell('tool', { tool, used: true });
    setLevel(paintCells(level, cells, ch));
    return;
  }
  stroke = { tool, ch, from: c, before: level, filled: e.shiftKey };
  board.setPointerCapture(e.pointerId);
  if (tool === 'pencil') { tell('paint', { ch, cells: 1, tool }); setLevel(paintCells(level, withMirror([[c.x, c.y]]), ch)); }
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
    // the stroke is one history step on top of the level before it, told before the room changes
    tell('paint', { ch: s.ch, cells: cells.length, tool: s.tool }); tell('tool', { tool: s.tool, used: true });
    level = s.before; setLevel(paintCells(level, cells, s.ch));
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

$('#name').addEventListener('input', (e) => { setLevel({ ...level, name: e.target.value }, { remember: false }); tell('name', { name: level.name }); });
$('#width').addEventListener('change', (e) => setLevel(resize(level, +e.target.value, dims().h)));
$('#height').addEventListener('change', (e) => setLevel(resize(level, dims().w, +e.target.value)));
$('#theme').addEventListener('change', (e) => setLevel({ ...level, theme: e.target.value }));
$('#kind').addEventListener('change', (e) => {
  if (e.target.value === 'chase') setLevel({ ...level, tickMs: level.tickMs ?? 320 });
  else { const { tickMs, hazards, ...rest } = level; hazardPick = -1; setLevel(rest); }
  tell('tick', { ms: level.tickMs ?? null, timed: kindOf(level) === 'chase' });
});
$('#tickMs').addEventListener('change', (e) => { setLevel({ ...level, tickMs: +e.target.value }); tell('tick', { ms: level.tickMs ?? null, timed: kindOf(level) === 'chase' }); });
$('#addHazard').addEventListener('click', () => {
  const used = new Set((level.hazards ?? []).map(h => h.character ?? h.id));
  const c = HAZARD_CAST.find(c => !used.has(c.id)) ?? HAZARD_CAST[0];
  const hz = { id: uniqueId(c.id, -1), character: c.id, route: [], sight: c.sight };
  hazardPick = (level.hazards ?? []).length;
  setLevel({ ...level, tickMs: level.tickMs ?? 320, hazards: [...(level.hazards ?? []), hz] });
  tellHazard('add', hazardPick);
});
ascii.addEventListener('input', () => {
  const rows = ascii.value.replace(/\r/g, '').split('\n').filter((r, i, a) => r.length || i < a.length - 1);
  if (rows.length) setLevel({ ...level, rows }, { remember: false });
});
ascii.addEventListener('change', () => render());
blurbEl.addEventListener('input', () => { setLevel({ ...level, blurb: blurbEl.value }, { remember: false }); tell('blurb', { chars: blurbEl.value.trim().length }); });
lessonEl.addEventListener('input', () => {
  const lesson = lessonFromText(lessonEl.value);
  setLevel({ ...level, lesson }, { remember: false });
  tell('lesson', { steps: lesson.filter(s => LESSON_EVENTS.includes(s.on)).length, malformed: lesson.length - lesson.filter(s => LESSON_EVENTS.includes(s.on)).length });
});
lessonEl.addEventListener('change', () => render());

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
$('#newBtn').addEventListener('click', () => { hazardPick = -1; setLevel(freshLevel(), { why: 'new' }); });

// ------------------------------------------------------------------ loading ----
// The shipped stages and the community's, as starting points. ?level= in the
// address wins, then the room left here last time, then a blank one.

const SHIPPED = [['tea-party', 'A Mad Tea Party'], ['queens-gauntlet', "The Queen's Gauntlet"]];
const community = [];
async function loadById(id) {
  const starter = STARTERS.find(s => s.id === id);
  if (starter) { hazardPick = -1; setLevel(starter.level(), { why: 'starter' }); tell('load', { id, from: 'starter' }); return level; }
  const path = SHIPPED.some(([s]) => s === id) ? `stages/${id}.js` : community.some(s => s.id === id) ? `stages/community/${id}.js` : null;
  if (!path) {
    const ranged = await rangeLevelById(id);
    if (!ranged) throw new Error(`no stage, starter, community level or shipped range level (<range>:<id>) called '${id}'`);
    hazardPick = -1; setLevel(ranged, { why: 'load' }); return level;
  }
  const mod = await import(`../${path}`);
  const stage = stageOf(mod);
  hazardPick = -1;
  setLevel(stage, { why: 'load' });
  tell('load', { id, from: path.startsWith('stages/community/') ? 'community' : 'stage' });
  return level;
}
{
  const sel = $('#load');
  for (const [id, name] of SHIPPED) sel.append(new Option(name, id));
  fetch('stages/community/index.json', { cache: 'no-cache' }).then(r => r.json()).then((m) => {
    for (const s of m.stages ?? []) {
      community.push(s);
      sel.append(new Option(`${s.name} (community)`, s.id));
      // a community room is a starter too: the demos carry a lesson to learn the format from
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'starter community';
      b.append(Object.assign(document.createElement('b'), { textContent: s.name }), Object.assign(document.createElement('small'), { textContent: `the community's · ${s.kind === 'chase' ? 'timed' : RANGE_KINDS.includes(s.kind) ? `a ${s.kind} level` : 'untimed'} · by ${s.author}` }));
      b.addEventListener('click', () => loadById(s.id).catch((e) => { report = { ok: false, problems: [`could not load ${s.id}: ${e.message}`] }; showReport(); }));
      $('#starters').append(b);
    }
    if (openDialog.open) fillOpen();   // the picker came up before the index did: its community column fills now
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

// ------------------------------------------------------------ a glitch level ----
// The second category: a level for one of the glitch range's five games
// (glitch.html), held as data ({ name, range, ...the range's fields },
// src/rangecheck.js) and judged by the same check() CI runs on the shipped
// ranges. There is no player here - the players are src/glitch.js's - so
// "Try it on the range" opens the level there as a tab. While this category
// is on (data-category on the panel) the board, the palette and the tools
// are hidden by class, never removed; the forms below take their place.

const GLYPH = { UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', A: 'A', B: 'B', X: 'X', Y: 'Y' };
const glyphs = (list) => (list ?? []).map(b => GLYPH[b] ?? b).join(' ');
const rangeMap = $('#rangeMap'), rmctx = rangeMap.getContext('2d');
const forms = [...document.querySelectorAll('#rangeForms .range-form')];
const stash = { room: null, glitch: {} };    // the level of whichever category is off screen, so a switch loses nothing
const shippedRanges = {};                    // kind -> the shipped module's export, once loaded
const shippedLoad = Promise.all(RANGE_KINDS.map(kind => loadStage(RANGE_FILES[kind], null).then(r => { shippedRanges[kind] = r; }).catch(() => {})));
const shippedIds = (kind) => new Set((shippedRanges[kind]?.levels ?? []).map(l => l.id));
const handOf = (lv) => lv.hand ?? (lv.range === 'glass' ? lv.lineMs >= 2 * BUDGET.HAND_JITTER_MS : true);

/** What New makes: a room, or a blank level of the range on screen. */
function freshLevel() { return isGlitch(level) ? rangeBlank(level.range) : blank(9, 7); }
/** A line for the shelf: a room's size and clock, a glitch level's range and hand. */
function describeShelf(lv) {
  return isGlitch(lv) ? `${RANGE_NAMES[lv.range] ?? lv.range} · ${handOf(lv) ? 'a hand level' : 'badge-only'}`
                      : `${lv.rows[0].length}×${lv.rows.length} · ${kindOf(lv) === 'chase' ? 'timed' : 'untimed'}`;
}

/** A shipped range level as a copy to edit: '<range>:<id>', or the id alone when one range has it. null when none. */
async function rangeLevelById(id) {
  await shippedLoad;
  const m = /^(watch|glass|lock|dog|wall):(.+)$/.exec(id);
  const hits = [];
  for (const kind of m ? [m[1]] : RANGE_KINDS) {
    const lv = shippedRanges[kind]?.levels.find(l => l.id === (m ? m[2] : id));
    if (lv) hits.push({ kind, lv });
  }
  if (hits.length > 1) throw new Error(`'${id}' is a level of ${hits.map(h => h.kind).join(' and ')}: say which, as <range>:${id}`);
  if (!hits.length) return null;
  const { kind, lv } = hits[0];
  return { ...lv, range: kind, ...(kind === 'watch' ? { pool: lv.pool ?? shippedRanges.watch.pool } : {}) };
}

// the category and the range: a switch keeps what it leaves
function setCategory(cat) {
  if (cat === (isGlitch(level) ? 'glitch' : 'room')) return;
  if (isGlitch(level)) stash.glitch[level.range] = level; else stash.room = level;
  hazardPick = -1;
  const kind = $('#rangeKind').value;
  setLevel(cat === 'glitch' ? (stash.glitch[kind] ?? rangeBlank(kind)) : (stash.room ?? blank(9, 7)), { why: 'category' });
}
function setRangeKind(kind) {
  if (!RANGE_KINDS.includes(kind)) throw new Error(`no range '${kind}'; they are ${RANGE_KINDS.join(' ')}`);
  if (isGlitch(level)) { if (level.range === kind) return; stash.glitch[level.range] = level; }
  hazardPick = -1;
  setLevel(stash.glitch[kind] ?? rangeBlank(kind), { why: 'range' });
}
$('#category').addEventListener('change', (e) => setCategory(e.target.value));
$('#rangeKind').addEventListener('change', (e) => setRangeKind(e.target.value));
$('#rangeShort').addEventListener('input', (e) => setLevel({ ...level, short: e.target.value }, { remember: false }));

// the forms: one per range, the one on screen filled from the level and read back on every edit
function fillForm(form) {
  for (const el of form.querySelectorAll('[data-field]')) {
    const field = el.dataset.field, v = level[field];
    if (el.tagName === 'FIELDSET') { for (const c of el.querySelectorAll('input')) c.checked = Array.isArray(v) && v.includes(c.value); continue; }
    if (document.activeElement === el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (field === 'address') el.value = Array.isArray(v) ? (v[+el.dataset.slot] ?? '') : '';
    else if (el.tagName === 'TEXTAREA') el.value = Array.isArray(v) ? v.join('\n') : (v ?? '');
    else el.value = v ?? '';
  }
}
/** What one control says its field is now, as a patch on the level. */
function readField(form, el) {
  const fs = el.closest('fieldset[data-field]');
  if (fs) { const on = new Set([...fs.querySelectorAll('input:checked')].map(c => c.value)); return { [fs.dataset.field]: POOL_BUTTONS.filter(b => on.has(b)) }; }
  const field = el.dataset.field;
  if (el.type === 'checkbox') return { [field]: el.checked };
  if (field === 'address') return { address: [...form.querySelectorAll('[data-field=address]')].map(s => s.value) };
  if (el.tagName === 'TEXTAREA') return { [field]: el.value.replace(/\r/g, '').split('\n') };
  if (el.type === 'number') return { [field]: el.value === '' ? undefined : +el.value };
  return { [field]: el.value };
}
function editField(form, el, { remember }) {
  if (!isGlitch(level) || level.range !== form.dataset.range) return;
  const patch = readField(form, el);
  // Humpty's listing follows the frame while it is still the one written from the fields
  if (level.range === 'wall' && !('listing' in patch) && (level.listing ?? []).join('\n') === wallListing(level).join('\n')) patch.listing = wallListing({ ...level, ...patch });
  setLevel({ ...level, ...patch }, { remember });
}
for (const form of forms) {
  form.addEventListener('input', (e) => { const el = e.target; if (el.type === 'checkbox' || el.tagName === 'SELECT') return; editField(form, el, { remember: false }); });
  form.addEventListener('change', (e) => { const el = e.target; if (el.type === 'checkbox' || el.tagName === 'SELECT') editField(form, el, { remember: true }); else render(); });
}
$('#wallListingBtn').addEventListener('click', () => { if (isGlitch(level) && level.range === 'wall') setLevel({ ...level, listing: wallListing(level) }); });

// the preview: the range's map (or the level's own), and what the rules make of the numbers
function drawRangeMap(kind) {
  const rows = level.rows ?? RANGE_MAPS[kind];
  const wrap = $('#rangeMapWrap'), note = $('#rangeMapNote');
  if (!rows) { wrap.hidden = true; note.textContent = `${RANGE_NAMES[kind] ?? kind} has no map: the badge is the board, the page draws the clock.`; return; }
  wrap.hidden = false;
  note.textContent = level.rows ? 'a map of its own (the range page draws the range\'s)'
    : `the range's map, the same for every level of it: ${Object.entries(RANGE_GLYPHS[kind] ?? {}).map(([g, w]) => `${g} ${w}`).join(', ')}`;
  const w = Math.max(...rows.map(r => r.length)), h = rows.length, size = TILE;
  rangeMap.width = w * size; rangeMap.height = h * size;
  rmctx.imageSmoothingEnabled = false;
  const accent = cssVar('--accent', '#6fb0f0'), ink = cssVar('--ink', '#05080f');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x] ?? '.';
    drawCell(rmctx, scene, THEMES.garden, ch === '#' ? '#' : '.', x, y, size);
    if (ch === 'A') rmctx.drawImage(scene.byId.alice2.images.S[0], x * size, y * size, size, size);
    else if (ch !== '#' && ch !== '.') {
      rmctx.fillStyle = accent; rmctx.beginPath(); rmctx.arc(x * size + size / 2, y * size + size / 2, size / 3, 0, Math.PI * 2); rmctx.fill();
      rmctx.fillStyle = ink; rmctx.font = `bold ${Math.round(size / 2.4)}px monospace`; rmctx.textAlign = 'center'; rmctx.textBaseline = 'middle';
      rmctx.fillText(ch, x * size + size / 2, y * size + size / 2 + 1);
    }
  }
}
function rangeFacts(kind) {
  const lv = normalize(level);
  const out = [];
  try {
    if (kind === 'watch') {
      const rate = (lv.length - 1) / (lv.windowMs / 1000);
      out.push(['tempo', `${rate.toFixed(1)} presses/s, ${(lv.windowMs / (lv.length - 1)).toFixed(0)} ms a press`], ['the tune', glyphs(comboSequence(lv))],
               ['a hand', rate <= BUDGET.HAND_RATE ? `can do this (${BUDGET.HAND_RATE}/s is the budget)` : `cannot (${BUDGET.HAND_RATE}/s is the budget): a take, replayed faster`]);
    } else if (kind === 'glass') {
      const b = buildLevel(lv);
      out.push(['the run', `${b.honest.length} steps × ${lv.lineMs} ms = ${b.totalMs} ms`], ['the check', `step ${b.targetStep} (line ${b.program.target + 1}), ${b.targetStartMs}–${b.targetEndMs} ms`],
               ['ideal offset', `${idealOffsetMs(b)} ms`], ['a hand', lv.lineMs >= 2 * BUDGET.HAND_JITTER_MS ? `lands a tick this long (±${BUDGET.HAND_JITTER_MS} ms)` : `cannot (±${BUDGET.HAND_JITTER_MS} ms on a tick under ${2 * BUDGET.HAND_JITTER_MS}): the badge`]);
    } else if (kind === 'lock') {
      out.push(['passwords', `${lv.pool.length}^${lv.length} = ${Math.pow(lv.pool.length, lv.length).toLocaleString('en')}`], ['the right answer', `${(lv.length + 1) * lv.tickMs} ms (${lv.length + 1} ticks)`],
               ['password, seed 0', glyphs(secretFor(lv))], ['order', lv.order === 'secret' ? `${orderFor(lv).join('')} (his own)` : 'first to last'],
               ['a hand', `${BUDGET.HAND_PRESSES} presses is the budget; Check runs the attacker`]);
    } else if (kind === 'dog') {
      const w = windowOf(lv), t = takeFor(lv), rate = 1000 / t.gapMs;
      out.push(['the window', `${w.widthMs} ms wide, ideal gap ${t.gapMs} ms`], ['tempo', `${rate.toFixed(1)} nudges/s`], ['the take', `record a tap every ${t.recordMs} ms, play it at ${t.speed}×`],
               ['a hand', w.widthMs >= 2 * BUDGET.HAND_JITTER_MS && rate <= BUDGET.HAND_RATE ? 'can do this' : `cannot: ±${BUDGET.HAND_JITTER_MS} ms a press, ${BUDGET.HAND_RATE}/s`]);
    } else if (kind === 'wall') {
      const f = frameOf(lv);
      out.push(['the frame', `name[${f.size}]${lv.canary ? ' [canary]' : ''} lr[2] = ${f.total} slots`], ['canary, seed 0', lv.canary ? glyphs([canaryFor(lv)]) : 'none'],
               ['tempo', `${(1000 / lv.gapMs).toFixed(1)} symbols/s`], ['open_wall', glyphs(lv.address)],
               ['a hand', 1000 / lv.gapMs <= BUDGET.HAND_RATE ? 'can type this' : `cannot: ${BUDGET.HAND_RATE} symbols a second is the budget`]);
    }
  } catch (e) { out.push(['—', e.message]); }
  return out;
}
let startersKey = null;
function renderRangeStarters(kind) {
  const key = `${kind}:${shippedRanges[kind] ? 1 : 0}:${community.length}`;
  if (startersKey === key) return;
  const box = $('#rangeStarters');
  box.textContent = '';
  if (!shippedRanges[kind]) { shippedLoad.then(() => { if (isGlitch(level) && level.range === kind) renderRangeStarters(kind); }); return; }
  startersKey = key;
  const add = (name, small, id) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'starter';
    b.append(Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('small'), { textContent: small }));
    b.addEventListener('click', () => loadById(id).catch((e) => { report = { ok: false, problems: [`could not load ${id}: ${e.message}`] }; showReport(); }));
    box.append(b);
  };
  for (const lv of shippedRanges[kind].levels) add(lv.name, `${RANGE_NAMES[kind]} · ${handOf({ ...lv, range: kind }) ? 'a hand level' : 'badge-only'} · a copy to edit`, `${kind}:${lv.id}`);
  for (const s of community.filter(s => s.kind === kind)) add(s.name, `the community's · by ${s.author}`, s.id);
}
function renderRange() {
  const kind = level.range;
  $('#category').value = 'glitch';
  if (RANGE_KINDS.includes(kind)) $('#rangeKind').value = kind;
  $('#name').value = level.name;
  if (document.activeElement !== blurbEl) blurbEl.value = level.blurb ?? '';
  const shortEl = $('#rangeShort');
  if (document.activeElement !== shortEl) shortEl.value = level.short ?? '';
  for (const f of forms) { f.hidden = f.dataset.range !== kind; if (!f.hidden) fillForm(f); }
  $('#undoEdit').disabled = !past.length; $('#redoEdit').disabled = !future.length;
  const problems = lint(level);
  const warnings = shippedIds(kind).has(level.id) ? [`'${level.id}' is a shipped level's id in this range: give it a name of its own before sending it in`] : [];
  $('#editName').textContent = `${RANGE_NAMES[kind] ?? `range '${kind}'`} · ${handOf(level) ? 'a hand level' : 'badge-only'}`;
  drawRangeMap(kind);
  const dl = $('#rangeFacts');
  dl.textContent = '';
  for (const [k, v] of problems.length ? [] : rangeFacts(kind)) dl.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
  const ul = $('#rangeLint');
  ul.textContent = '';
  for (const p of [...problems, ...warnings]) ul.append(Object.assign(document.createElement('li'), { textContent: p }));
  if (!problems.length) ul.append(Object.assign(document.createElement('li'), { className: 'ok', textContent: '✓ the level is well formed - Check runs what CI runs' }));
  $('#checkBtn').disabled = !!problems.length;
  $('#playBtn').disabled = true;
  $('#tryRange').disabled = !!problems.length;
  const id = idOf(level);
  $('#fileName').textContent = `${id}.js`; $('#fileName2').textContent = id;
  $('#moduleOut').textContent = toModule(level, { author: $('#author').value.trim() || undefined });
  renderRangeStarters(kind);
  showReport();
  bridge?.state(snapshotState());
}
/** The verdict on a glitch level: hand or badge-only, the attacker's cost, every note the checker made - problems first. */
function showRangeReport() {
  const el = $('#report'), verdict = $('#verdict');
  verdict.hidden = true;
  if (!report.ok) { el.textContent = report.problems.join(' · '); el.className = 'status hot'; }
  else { el.textContent = `checked: ${report.hand ? 'a hand level' : 'badge-only'}${report.par ? `, the attacker needs ${report.par} takes` : ''} (${report.ms} ms)`; el.className = 'status win'; }
  if (!report.notes?.length) return;
  verdict.hidden = false;
  verdict.textContent = '';
  const d = difficulty(report);
  if (d) {
    const meter = document.createElement('div'); meter.className = 'meter';
    for (let i = 1; i <= 5; i++) { const s = document.createElement('i'); if (i <= d.level) s.className = 'on'; meter.append(s); }
    verdict.append(meter, Object.assign(document.createElement('b'), { textContent: d.label }));
  }
  verdict.append(Object.assign(document.createElement('span'), { textContent: report.notes.join(' · ') }));
}
/** The address glitch.html opens the level on: a tab of its range, named "· yours". */
const tryUrl = () => `glitch.html?level=${encodeShare(level)}`;
$('#tryRange').addEventListener('click', () => { if (!isGlitch(level) || lint(level).length) return; window.open(tryUrl(), '_blank', 'noopener'); });
// the shipped levels in the Load menu, a group per range, once the modules are in
shippedLoad.then(() => {
  const sel = $('#load');
  for (const kind of RANGE_KINDS) {
    if (!shippedRanges[kind]) continue;
    const group = document.createElement('optgroup');
    group.label = RANGE_NAMES[kind];
    for (const lv of shippedRanges[kind].levels) group.append(new Option(lv.name, `${kind}:${lv.id}`));
    sel.append(group);
  }
});
const rangeStudio = { setCategory, setRangeKind, rangeLevelById, tryUrl, shipped: shippedRanges, shippedLoad, categoryOf: () => (isGlitch(level) ? 'glitch' : 'room') };

const firstVisit = sharedRoom === null && loadJson(STORE, null) === null;   // nothing kept on this device yet, no link: the picker opens by itself (below)
{
  // a link's room first (malformed or not: the lint says what is wrong with it), then the room left here last time, then a blank one
  const first = sharedRoom ?? loadJson(STORE, null);
  $('#author').value = load(AUTHOR) ?? '';
  setLevel(first ?? blank(9, 7), { reset: true, why: 'open' });
  if (sharedToken !== null && !sharedRoom) $('#importStatus').textContent = `the link's room could not be read: ${sharedError}`;
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
    const gate = r.notes?.some(n => /load-bearing/.test(n)) ? 'load-bearing' : r.notes?.some(n => /decoration/.test(n)) ? 'decoration' : null;
    tell('check', { ok: !!r.ok, par: r.par ?? null, rules: r.kind ?? null, gate });
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
                Object.assign(document.createElement('small'), { textContent: `${describeShelf(item.level)}${item.par ? ` · par ${item.par}` : ''} · ${new Date(item.at).toLocaleDateString()}` }));
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
  if (isGlitch(level)) { say('a glitch level plays on the range page: Try it on the range', 'hot'); return; }
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
  goTo('play');
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
    tell('caught', { ticks: game.ticks + 1 });
    return;
  }
  game.state = next; game.ticks++;
  if (!planned || game.planAt % 8 === 1) log(`tick ${game.ticks}: ${action}${action === 'wait' ? '' : ` → ${cellName(game.map, next.alice)}`}`);
  if (!planned) tell('move', { dir: action });
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
  tell('restart', { rules: kind });
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
  if (e.key === 'Escape') { stopPlay(); goTo('edit'); }
  if (e.key === 'Backspace' && game.kind === 'tea') { e.preventDefault(); undoPlay(); }
  if (e.key === ' ' && game.kind === 'chase' && !game.plan) { e.preventDefault(); game.queued = 'wait'; if (game.waiting) { game.waiting = false; tick(); } }
});

$('#playBtn').addEventListener('click', startPlay);
$('#editBtn').addEventListener('click', () => { stopPlay(); goTo('edit'); });
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
  $('#importBtn').addEventListener('click', async () => {
    try {
      const lvl = await fromModule($('#importText').value);
      hazardPick = -1;
      setLevel(lvl, { why: 'import' });
      flash($('#importStatus'), `imported ${lvl.name}`);
    } catch (e) { $('#importStatus').textContent = e.message; }
  });
  // the fourth way: the whole pull request, handed to an assistant - the one in
  // the dialog's links or the clipboard, and whoever is on the bridge, who reads
  // the same brief from the inbox (maker_read_chat) or asks for it (op pr)
  $('#prBtn').addEventListener('click', async () => {
    if (lint(level).length) return;
    const author = $('#author').value.trim() || undefined;
    const last = report?.ok ? report : null;
    const brief = prPrompt(repo, level, { author, report: last, difficulty: last ? difficulty(last, analysis?.pushes ?? 0) : null });
    invite.show('pr', brief, { short: prShort(repo) });
    tell('export', { how: 'pr' });
    const who = bridge?.agents ?? [];
    if (who.length) { chat(`asked ${who.join(', ')} to open the pull request`, 'act'); await bridge.post(brief); }
  });
}

// ----------------------------------------------------------------- the share ----
// The level as one link (src/level.js shareUrl): nothing is uploaded, the
// whole level travels in the address. Two choices decide the link, and the
// first is the one that matters. WHERE it opens: "play it" (the default) is
// the page that plays the level - index.html for a room, a card in Rooms the
// badge plays, glitch.html for a glitch level, a tab of its range; "edit it"
// is maker.html, the studio of a checkout, which on the published site is the
// landing with the room in its hero (src/level.js sharePage). AT which
// address: this page's (a checkout: localhost, so only whoever runs it can
// open the link) or the published site's, which anyone opens - the fork's
// page when this page is served from one, else the official site's, or
// whatever the dialog's box says (remembered). Then what goes in (the lesson,
// the blurb, the dressing) and how the link reads (compact base64url, or the
// JSON itself). The dialog (#shareDialog) shows the level's JSON and follows
// an edit of it until the parts change, and says how long the link is and
// when that is a problem. shareLink is the one answer: the dialog,
// window.__maker.share and the bridge's op all go through it.

const shareDialog = $('#shareDialog');
const shareUrlEl = $('#shareUrl'), shareJsonEl = $('#shareJson'), shareStatus = $('#shareStatus'), shareOpen = $('#shareOpen'), shareSiteEl = $('#shareSite');
let shareEdited = false, shareLast = null;      // the JSON box was edited by hand: the link follows it until the parts change
const SITE_URL = pagesUrl(repoParts(repo)?.owner ?? 'bsidestlv', repo);     // where the site this page belongs to is published
prefs.share = { at: 'here', site: '', ...(prefs.share ?? {}) };              // the address picked last time, and a site of one's own
/** The published site's address as a base for a page: a scheme when none was typed, a file name dropped, a slash at the end. */
function siteUrl(given) {
  const s = String(given ?? prefs.share.site ?? '').trim() || SITE_URL;
  const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  u.pathname = u.pathname.replace(/[^/]*\.html?$/i, '');
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  u.search = ''; u.hash = '';
  return u.href;
}
const shareBase = (page, at, site) => new URL(page, at === 'site' ? siteUrl(site) : location.href).href;
/**
 * The link for `room` (the level on the board unless given) under { where, at, site, format, play, parts }:
 * { url, token, chars, format, where, at, page, warnings }. `where` is play (the default) / studio / stages / range
 * (src/level.js sharePage; it comes back resolved), `at` here (this page's address) or site (the published site's,
 * `site` naming another), `play` adds play=1 for the studio only, `parts` says which optional fields travel.
 */
function shareLink({ format = 'b64', where = 'play', at = 'here', site, play = false, parts = {} } = {}, room = level) {
  if (at !== 'here' && at !== 'site') throw new Error(`no such address '${at}' (here: this page's, or site: the published site's)`);
  const door = sharePage(room, where);
  let base;
  try { base = shareBase(door.page, at, site); } catch { throw new Error(`the site's address is not a URL: ${site ?? prefs.share.site}`); }
  const url = shareUrl(base, room, { format, play: !!play && door.where === 'studio', parts: parts ?? {} });
  const info = shareInfo(url);
  return { url, token: new URL(url).searchParams.get('level'), chars: info.chars, format: info.format, where: door.where, at, page: door.page, warnings: info.warnings };
}
{
  const opts = () => ({
    format: shareDialog.querySelector('input[name="shareFormat"]:checked')?.value ?? 'b64',
    where: shareDialog.querySelector('input[name="shareWhere"]:checked')?.value ?? 'play',
    at: shareDialog.querySelector('input[name="shareAt"]:checked')?.value ?? 'here',
    play: $('#sharePlay').checked,
    parts: Object.fromEntries([...shareDialog.querySelectorAll('[data-part]')].map(i => [i.dataset.part, i.checked])),
  });
  const DOOR = {   // the status line's first words: where the link opens
    stages: 'opens on the stages page, where the badge plays it', range: 'opens on the range page, as the last tab of its range',
    studio: 'opens in the studio of a checkout (the published site shows it on the landing)', debug: 'opens in Run & debug, in the studio of a checkout',
  };
  function refresh() {
    const o = opts();
    const glitch = isGlitch(level);
    // the dialog's words follow the category and the choices
    $('#shareTitle').textContent = glitch ? 'Share this level' : 'Share this room';
    $('#shareWhat').textContent = glitch ? 'level in its address - every field of it' : 'room in its address - the map, its clock and cast, and whatever you tick below';
    $('#sharePlayPage').textContent = glitch ? 'the range page' : 'the stages page';
    $('#sharePlayPage').closest('label').title = glitch ? 'glitch.html: the last tab of its range, "· yours", armed' : 'index.html: a card in Rooms, "Shared · its name", armed; the badge plays it';
    $('#sharePlay').disabled = o.where !== 'studio';
    $('#shareHere').textContent = location.host || 'this page';
    shareSiteEl.disabled = o.at !== 'site';
    for (const i of shareDialog.querySelectorAll('[data-part]')) i.disabled = glitch;   // a glitch level has no lesson, blurb or dressing
    try {
      let room;
      if (shareEdited) room = decodeShare(shareJsonEl.value);
      else {
        room = normalize(level);
        if (!glitch) for (const p of SHARE_PARTS) if (!o.parts[p]) delete room[p];
        shareJsonEl.value = JSON.stringify(room, null, 2);
      }
      shareLast = shareLink({ ...o, parts: {} }, room);        // the parts are already out of `room`; an edit decides for itself
      shareUrlEl.value = shareLast.url;
      shareOpen.href = shareLast.url;
      const host = new URL(shareLast.url).host;
      const bits = [DOOR[shareLast.where === 'studio' && o.play ? 'debug' : shareLast.where],
                    o.at === 'site' ? `at ${host}, the published site: anyone opens it` : `at ${host}, this checkout: only whoever runs it opens it - pick the published site for anyone else`,
                    `${shareLast.chars} characters`, o.format === 'json' ? 'readable JSON' : 'compact'];
      if (room.hazards?.length) bits.push(`${room.hazards.length} in the cast`);
      if (room.blurb) bits.push('the blurb');
      if (room.lesson?.length) bits.push(`a lesson of ${room.lesson.length}`);
      const problems = lint(room);
      const warn = [...(problems.length ? [`the ${glitch ? 'level' : 'room'} is malformed: ${problems[0]}`] : []), ...shareLast.warnings];
      shareStatus.textContent = [...bits, ...warn].join(' · ');
      shareStatus.className = `status${warn.length ? ' hot' : ''}`;
    } catch (e) {
      shareLast = null; shareUrlEl.value = ''; shareOpen.removeAttribute('href');
      shareStatus.textContent = `the link: ${e.message}`; shareStatus.className = 'status hot';
    }
  }
  const told = () => tell('export', { how: 'link', format: shareLast?.format ?? 'b64', chars: shareLast?.chars ?? 0, where: shareLast?.where ?? 'play', at: shareLast?.at ?? 'here' });
  $('#shareBtn').addEventListener('click', () => {
    shareEdited = false;
    shareDialog.querySelector(`input[name="shareAt"][value="${prefs.share.at === 'site' ? 'site' : 'here'}"]`).checked = true;   // the address is remembered; where it opens starts at play
    shareSiteEl.value = prefs.share.site || SITE_URL;
    refresh(); shareDialog.showModal(); shareUrlEl.focus(); told();
  });
  for (const i of shareDialog.querySelectorAll('[data-part], input[name="shareFormat"], input[name="shareWhere"], input[name="shareAt"], #sharePlay'))
    i.addEventListener('change', () => { if (i.dataset.part) shareEdited = false; if (i.name === 'shareAt') { prefs.share.at = i.value; savePrefs(); } refresh(); });
  shareSiteEl.addEventListener('input', () => { const v = shareSiteEl.value.trim(); prefs.share.site = v === SITE_URL ? '' : v; savePrefs(); refresh(); });
  shareJsonEl.addEventListener('input', () => { shareEdited = true; refresh(); });
  $('#shareCopy').addEventListener('click', async () => {
    if (!shareLast) return;
    const btn = $('#shareCopy');
    try { await navigator.clipboard.writeText(shareLast.url); btn.textContent = 'Copied ✓'; }
    catch { shareUrlEl.focus(); shareUrlEl.select(); btn.textContent = 'Select all, then copy'; }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    told();
  });
  shareOpen.addEventListener('click', () => { if (shareLast) told(); });
  shareUrlEl.addEventListener('focus', () => shareUrlEl.select());
  $('#shareClose').addEventListener('click', () => shareDialog.close());
  shareDialog.addEventListener('click', (e) => { if (e.target === shareDialog) shareDialog.close(); });
  shareDialog.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });    // the studio's keys (brushes, tools) stay out of the dialog
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
  if (/^(guide|welcome|rabbit)\W*$/i.test(text)) { showGuide(bridge?.agents.at(-1) ?? null, { again: true }); return; }
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
const snapshotState = () => ({ level, kind: kindOf(level), category: isGlitch(level) ? 'glitch' : 'room', lint: lint(level), report: report?.pending ? null : report, game: gameSummary(), tool, brush, symmetry, tutorial: tutorialSummary(), guide: guideMode });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ops = {
  get: () => ({ ...snapshotState(), overlays, cell, shelf: shelf.map(s => ({ name: s.level.name, par: s.par })), tutorial: tutorialSummary() }),
  set: ({ level: next }) => {
    if (!next || (!Array.isArray(next.rows) && !isGlitch(next))) throw new Error('set wants { level: { name, rows, ... } } for a room, or { level: { name, range, ... } } for a glitch level');
    hazardPick = -1; setLevel(normalize(next), { why: 'assistant' });
    chat(isGlitch(level) ? `set the level to "${level.name}" (${RANGE_NAMES[level.range] ?? level.range})` : `set the room to "${level.name}" (${dims().w}×${dims().h})`, 'act');
    return { lint: lint(level), kind: kindOf(level) };
  },
  patch: (fields = {}) => {
    const allowed = ['name', 'theme', 'blurb', 'lesson', 'tickMs', 'hazards', 'rows', 'short'];
    const keys = Object.keys(fields ?? {}).filter(k => allowed.includes(k));
    if (!keys.length) throw new Error(`patch wants some of ${allowed.join(', ')}: the fields to set on the room (null removes one)`);
    const next = { ...level };
    for (const k of keys) {
      if (fields[k] === null || fields[k] === undefined) delete next[k];
      else next[k] = k === 'lesson' && typeof fields[k] === 'string' ? lessonFromText(fields[k]) : fields[k];
    }
    if (next.theme !== undefined && !THEMES[next.theme]) throw new Error(`no dressing '${next.theme}' (garden, hall, court)`);
    if (!Array.isArray(next.rows) && !isGlitch(next)) throw new Error('rows must stay a list of strings');
    hazardPick = -1; setLevel(next, { why: 'assistant' });
    if (keys.includes('name')) tell('name', { name: level.name });
    if (keys.includes('blurb')) tell('blurb', { chars: (level.blurb ?? '').trim().length });
    if (keys.includes('lesson')) tell('lesson', { steps: (level.lesson ?? []).filter(s => LESSON_EVENTS.includes(s.on)).length, malformed: (level.lesson ?? []).filter(s => !LESSON_EVENTS.includes(s.on)).length });
    if (keys.includes('tickMs') || keys.includes('hazards')) tell('tick', { ms: level.tickMs ?? null, timed: kindOf(level) === 'chase' });
    chat(`set ${keys.join(', ')} on "${level.name}"`, 'act');
    return { level, lint: lint(level), kind: kindOf(level) };
  },
  paint: ({ cells }) => {
    if (isGlitch(level)) throw new Error('paint is for rooms: this is a glitch level, set its fields with set');
    if (!Array.isArray(cells)) throw new Error('paint wants { cells: [[x, y, ch], ...] }');
    let next = level;
    for (const [x, y, ch] of cells) { if (!(ch in CHARS)) throw new Error(`no brush '${ch}'`); next = setCell(next, +x, +y, ch); }
    setLevel(next, { why: 'assistant' });
    const byBrush = new Map();
    for (const [, , ch] of cells) byBrush.set(ch, (byBrush.get(ch) ?? 0) + 1);
    for (const [ch, n] of byBrush) tell('paint', { ch, cells: n, tool: 'assistant' });     // the guided builds hear it as a stroke
    chat(`painted ${cells.length} cell${cells.length === 1 ? '' : 's'}`, 'act');
    return { lint: lint(level) };
  },
  check: async () => {
    const problems = lint(level);
    if (problems.length) return { ok: false, problems };
    const r = await runCheck();
    chat(r.ok ? (isGlitch(level) ? `checked: ${difficulty(r)?.label}${r.par ? `, the attacker needs ${r.par} takes` : ''}` : `checked: par ${r.par} ${unitOf(r)}, ${difficulty(r, analysis?.pushes ?? 0)?.label}`) : `checked: ${r.problems.join('; ')}`, 'act');
    return r.ok ? { ...r, pushes: analysis?.pushes ?? 0, difficulty: difficulty(r, analysis?.pushes ?? 0) } : r;
  },
  play: () => { if (isGlitch(level)) throw new Error('a glitch level plays on glitch.html (the studio\'s "Try it on the range", or ?level= with its share token), not in Run & debug'); if (lint(level).length) throw new Error('the room is malformed: ' + lint(level).join('; ')); startPlay(); chat('started Run & debug', 'act'); return gameSummary(); },
  stop: () => { stopPlay(); chat('left Run & debug', 'act'); return { playing }; },
  reset: () => { if (!game) throw new Error('nothing is running'); resetPlay(); return gameSummary(); },
  press: async ({ button, holdMs = 60 }) => {
    if (!BUTTONS.includes(button)) throw new Error(`no button '${button}'; they are ${BUTTONS.join(' ')}`);
    pad.inject(button, true); await sleep(Math.max(10, Math.min(2000, holdMs))); pad.inject(button, false);
    return gameSummary();
  },
  moves: async ({ moves, stepMs }) => {
    if (isGlitch(level)) throw new Error('moves are for rooms: a glitch level plays on glitch.html, not in Run & debug');
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
    const c = what === 'run' ? run : isGlitch(level) ? rangeMap : board;
    if (what === 'run' && !game) throw new Error('nothing is running: play first, or take the board');
    if (what !== 'run' && isGlitch(level) && !level.rows && !RANGE_MAPS[level.range]) throw new Error(`${RANGE_NAMES[level.range] ?? level.range} has no map to picture; get has the level`);
    return { png: c.toDataURL('image/png'), note: what === 'run' ? `${level.name}, ${runStatus.textContent}` : isGlitch(level) ? `${level.name}, the ${level.range} range's map` : `${level.name}, ${dims().w}×${dims().h}; shaded cells lose a rock, the green line is the last solution` };
  },
  module: ({ author } = {}) => ({ id: idOf(level), file: `stages/community/${idOf(level)}.js`, source: toModule(level, { author: author || $('#author').value.trim() || undefined }),
                                indexLine: { id: idOf(level), name: level.name, author: author || $('#author').value.trim() || '', kind: kindOf(level) } }),
  pr: ({ author } = {}) => {
    const a = author || $('#author').value.trim() || undefined;
    const last = report?.ok ? report : null;
    chat('took the pull request brief', 'act');
    tell('export', { how: 'pr' });
    return { ...prParts(level, { author: a }), brief: prPrompt(repo, level, { author: a, report: last, difficulty: last ? difficulty(last, analysis?.pushes ?? 0) : null }) };
  },
  load: async ({ id }) => { await loadById(id); chat(`loaded ${level.name}`, 'act'); return { level, lint: lint(level) }; },
  generate: async (a = {}) => {
    if (isGlitch(level)) throw new Error('generate draws rooms: this is a glitch level - set a room first (a level with rows), then generate');
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
  share: (a = {}) => {
    const r = shareLink(a);
    tell('export', { how: 'link', format: r.format, chars: r.chars, where: r.where, at: r.at });
    chat(`made a link: ${r.chars} characters, ${r.format === 'json' ? 'readable' : 'compact'}, opens ${r.where === 'studio' ? 'in the studio' : `on the ${r.where} page`}, at ${r.at === 'site' ? 'the published site' : 'this checkout\'s address'}`, 'act');
    return r;
  },
  tutorial: ({ id, skip, restart } = {}) => {
    if (id !== undefined) { pickTutorial(id); chat(`opened the guided build "${tutorialById(picked).title}"`, 'act'); }
    if (restart) { coach.restart(); chat(`started "${tutorialById(picked).title}" over`, 'act'); }
    const skips = skip === true ? 1 : Math.max(0, Math.min(tutor.steps.length, +skip || 0));
    for (let i = 0; i < skips; i++) coach.skip();
    if (skips) chat(`skipped ${skips} step${skips === 1 ? '' : 's'} of the guided build`, 'act');
    return tutorialSummary();
  },
  guide: ({ show, mode, close, by } = {}) => {
    if (close) guideDialog.close();
    if (show) showGuide(bridge?.agents.at(-1) ?? null, { again: true });
    if (mode) pickGuide(mode, { from: by ?? 'assistant' });
    return { mode: guideMode, open: guideDialog.open, ways: GUIDE_MODES.map(m => m.id), tutorial: tutorialSummary() };
  },
  // The guide's current step, as a card in the chat - the whole of it: the line, the why, the board in a line, what the
  // assistant does on it, the question with its options as buttons, and "Do it for me" when the step has a help plan. The
  // person may follow and answer here instead of in the assistant's chat; the bridge applies a press at once (whichever side
  // answers first wins). An answer that keeps the step (a why, a "not yet", a stay, the help) leaves the buttons live.
  ask: ({ mode, title, at, of, step, say, why, board, next, q, options = [], other, help, does = [], before, work, over } = {}) => {
    const m = modeById(mode);
    for (const old of chatLog.querySelectorAll('li.ask:not(.answered)')) { old.classList.add('stale'); for (const x of old.querySelectorAll('button')) x.disabled = true; }
    const li = document.createElement('li');
    li.className = 'ask';
    const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text });
    const who = m ? m.title : 'guide';
    li.append(el('b', '', m ? `${m.icon} ${m.title}` : title ?? 'guide'), ' ');
    if (over) { li.append(say ?? 'That was the way. The room stays on the board.'); chatLog.prepend(li); return { shown: true, over: true }; }
    li.append(el('span', 'ask-step', `step ${at + 1} of ${of} · ${step}`), el('span', 'ask-say', say ?? ''));
    if (why) li.append(el('span', 'ask-why', why));
    if (board) li.append(el('span', 'ask-board', String(board).replace(/^Board: /, '')));
    if (does.length && !q) li.append(el('span', 'ask-does', `${bridge?.agents.at(-1) ?? 'the assistant'} is on it: ${does.join(', ')}${work?.length ? ', then the repository work below' : ''}`));
    if (work?.length) {
      const d = document.createElement('details'); d.className = 'ask-work';
      d.append(el('summary', '', 'what the assistant does now'));
      const ul = document.createElement('ul'); for (const w of work) ul.append(el('li', '', w)); d.append(ul);
      li.append(d);
    }
    // the buttons are held while the bridge works, and stay held once the step is answered or superseded
    const lock = (on) => { li.classList.toggle('busy', on); for (const x of li.querySelectorAll('button')) x.disabled = on || li.classList.contains('answered') || li.classList.contains('stale'); };
    if (q && options.length) {
      const row = document.createElement('div');
      row.className = 'ask-row';
      row.append(el('span', 'ask-q', q));
      for (const o of options) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn ghost ask-pick'; btn.textContent = o.label; if (o.hint) btn.title = o.hint;
        btn.addEventListener('click', async () => {
          lock(true);
          chat(o.label, 'you');
          const r = await bridge?.answer(o.label, at);
          const stays = !!r && !r.over && r.at === at && ['why', 'stay', 'not yet', 'help'].includes(r.did);
          if (!stays) li.classList.add('answered');
          if (r?.say) chat(r.say, who);
          else if (r?.did === 'moved') chat('that step was already done', 'act');
          lock(false);
        });
        row.append(btn);
      }
      // the hint for their own words, when it is written for them (the ones that start "or ..."); the rest are the assistant's
      const hint = other && /^or\b/i.test(other) ? other.replace(/^or\s+/i, '').replace(/\s*[-;:]\s*(answer|pick|turn|offer|if they|their|then)\b.*$/i, '') : null;
      li.append(row);
      row.append(el('small', '', hint ? `or type below: ${hint}` : 'or type your own answer below'));
    }
    // Do it for me, unless an option offers the help or a redo already; on a step the assistant has already done (before), the help is a repeat and its words are the label
    if (help && !options.some(o => o.then === 'help' || o.then === 'again')) {
      const row = document.createElement('div');
      row.className = 'ask-row ask-more';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn ghost ask-help'; btn.textContent = before ? help : 'Do it for me'; btn.title = help;
      btn.addEventListener('click', async () => {
        lock(true);
        chat('Do it for me', 'you');
        const r = await bridge?.help(at);
        if (r?.did === 'moved') li.classList.add('answered');
        chat(r?.say ?? help, who);
        const failed = r?.ran?.find(x => x.error);
        if (failed) chat(failed.error, 'act');
        lock(false);
      });
      row.append(btn); if (!before) row.append(el('small', '', help));
      li.append(row);
    }
    chatLog.prepend(li);
    return { shown: true, at, step, next: next ?? null, before: !!before };
  },
};

// --------------------------------------------------------------- the welcome ----
// An assistant said hello on the bridge: the banner (#guideDialog) offers the
// three ways of src/guide.js GUIDE_MODES to build a first room with it. The
// pick goes up the bridge (the assistant reads the White Rabbit's guide from
// there) and, for the Rabbit, puts the page's own build under the coach, so
// the checklist and the assistant narrate the same steps. The assistant can
// show it or pick too (op guide); the person can close it and come back
// (?guide=1, or "guide" typed in the chat).

const guideDialog = $('#guideDialog');
const openDialog = $('#openDialog');   // the level picker, wired at the end of the studio
let guideShown = false;              // once a page load, unless asked again
{
  const box = $('#guidePicks');
  for (const m of GUIDE_MODES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'guide-pick'; b.dataset.mode = m.id;
    b.append(Object.assign(document.createElement('span'), { className: 'icon', textContent: m.icon }),
             Object.assign(document.createElement('b'), { textContent: m.title }),
             Object.assign(document.createElement('i'), { textContent: m.kicker }),
             Object.assign(document.createElement('small'), { textContent: m.blurb }),
             Object.assign(document.createElement('em'), { textContent: m.time }));
    b.addEventListener('click', () => { guideDialog.close(); pickGuide(m.id, { from: 'page' }); });
    box.append(b);
  }
}
/** The banner, with who is here. Once a page load, and not once a way is picked, unless asked `again`. */
function showGuide(name, { again = false } = {}) {
  if (!again && (guideShown || guideMode)) return false;
  guideShown = true;
  $('#guideTitle').textContent = name ? `${name} is here` : 'Your assistant is here';
  $('#guideNote').textContent = `${name ?? 'Your assistant'} is on the bridge, ready to build your first room with you. Pick a way: you can change your mind, ask for help, or hand any step over at any time.`;
  if (!guideDialog.open) guideDialog.showModal();
  return true;
}
/** The pick: kept, told to the assistant (unless it came from it), the Rabbit's build put under the coach. */
function pickGuide(mode, { from = 'page' } = {}) {
  const m = modeById(mode);
  if (!m) throw new Error(`no such way '${mode}'; they are ${GUIDE_MODES.map(x => x.id).join(', ')}`);
  guideMode = m.id;
  if (guideDialog.open) guideDialog.close();
  if (m.tutorial) { pickTutorial(m.tutorial); if (tutor.done) coach.restart(); }
  const who = bridge?.agents.at(-1) ?? 'your assistant';
  chat(from === 'page' ? `you chose ${m.icon} ${m.title}: ${who} takes it from here - watch this chat and the board` : `${who} chose ${m.icon} ${m.title} for you`, 'act');
  if (from === 'page') bridge?.guide(m.id);
  goTo('assistant');
  setTimeout(() => chatText.focus({ preventScroll: true }), 400);
  bridge?.state(snapshotState());
  return { mode: guideMode, tutorial: tutorialSummary() };
}
/** The way the bridge already holds, taken up quietly by a page that (re)attached mid-walk: the Rabbit's build under the coach, the banner kept shut, the bridge not told again. */
function adoptGuide(mode) {
  const m = modeById(mode);
  guideMode = m.id;
  if (guideDialog.open) guideDialog.close();
  if (m.tutorial && picked !== m.tutorial) pickTutorial(m.tutorial);
  chat(`carrying on with ${m.icon} ${m.title} - the current step is below`, 'act');
  bridge?.state(snapshotState());
}
$('#guideLater').addEventListener('click', () => { guideDialog.close(); chat('the welcome is closed; type "guide" here, or ask your assistant, to bring it back', 'act'); });
guideDialog.addEventListener('click', (e) => { if (e.target === guideDialog) guideDialog.close(); });
guideDialog.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });    // the studio's keys stay out of the dialog

const bridgeChip = $('#bridgeChip'), bridgeState = $('#bridgeState');
bridge = connectBridge(ops, {
  onHello: (name) => { chat(`${name} is here`, 'act'); tell('hello', { name }); showGuide(name); },
  onState: (b) => {
    const who = b.agents.length ? b.agents.join(', ') : null;
    bridgeChip.textContent = !b.available ? '◌ no bridge' : !b.connected ? '◌ bridge…' : who ? `● ${who}` : '○ bridge open';
    bridgeChip.className = `bridge-chip dev-only${b.connected ? ' on' : ''}${who ? ' who' : ''}`;
    bridgeChip.title = !b.available ? 'served without the bridge: start the page with npm run maker to let an assistant in' : who ? `on the bridge: ${who}` : 'the bridge is open; no assistant has said hello';
    bridgeState.textContent = !b.available ? 'no bridge here' : !b.connected ? 'bridge lost' : who ? `${who} connected` : 'waiting for an assistant';
    bridgeState.className = `tag${who ? ' on' : ''}`;
    $('#bridgeUrl').textContent = `${location.origin}/__maker/`;
    if (b.guideMode && b.guideMode !== guideMode && modeById(b.guideMode)) adoptGuide(b.guideMode);   // a way is already picked on the bridge (a reload mid-walk): take it up, no banner
    if (b.connected && b.agents.length) showGuide(b.agents.at(-1));     // an assistant was here before the page: the banner still comes up
  },
  onCommand: (cmd) => { if (cmd.op !== 'get' && cmd.op !== 'snapshot' && cmd.op !== 'say' && cmd.op !== 'hello') console.debug('bridge:', cmd.op, cmd.args); },
});
bridge.state(snapshotState());       // the first mirror goes up as soon as the stream opens, so the guide knows the room before anything changes

// ---------------------------------------------------------------- the coach ----
// The tutorials, mounted once the studio exists: a card per guided build in
// the Learn panel picks one, the coach line and the checklist follow the one
// in use, and a step that comes up goes to its panel when asked to show it (goTo:
// the mode bar on a phone, a scroll on the classic page).

const coachOpts = (t) => ({ title: t.title, chapters: t.chapters, finish: t.finish });
/** The cards: every build with where the player is in it; redrawn whenever the coach redraws. */
function renderPicks() {
  const box = $('#learnPick');
  box.textContent = '';
  for (const t of MAKER_TUTORIALS) {
    const tu = tutors.get(t.id);
    const n = tu.steps.length, at = Math.min(tu.at, n);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `learn-pick${t.id === picked ? ' on' : ''}${tu.done ? ' done' : ''}`;
    b.setAttribute('data-id', t.id);
    b.setAttribute('aria-pressed', String(t.id === picked));
    b.append(Object.assign(document.createElement('b'), { textContent: t.title }),
             Object.assign(document.createElement('small'), { textContent: t.blurb }),
             Object.assign(document.createElement('i'), { textContent: tu.done ? `done · ${n} steps` : at ? `${at} / ${n}` : `${n} steps` }));
    b.addEventListener('click', () => pickTutorial(t.id));
    box.append(b);
  }
}
/** Put a guided build under the coach. Remembered unless told not to; an unknown id is refused with the list. */
function pickTutorial(id, { remember = true } = {}) {
  const t = tutorialById(id);
  if (!t) throw new Error(`no tutorial '${id}'; they are ${MAKER_TUTORIALS.map(t => t.id).join(', ')}`);
  picked = t.id; tutor = tutors.get(t.id);
  if (remember) save(TUTORIAL, t.id);
  coach.use(tutor, coachOpts(t));
  return tutorialSummary();
}
coach = mountCoach(tutor, {
  ...coachOpts(tutorialById(picked)),
  prepare(step, { show = false } = {}) {
    if (show && step?.panel) goTo(step.panel);
  },
  looks,
  open() {   // the coach line's "learn" in the classic look: the drawer on a narrow window; the column is on screen already; else the panel is in the page
    if (html.dataset.learn === 'page') { $('#learnPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (WIDE.matches) { $('#learnCoach').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    openLearn();
  },
  onRender: () => { renderPicks(); bridge?.state(snapshotState()); },   // a step done, skipped or swapped: the mirror carries the new position at once, so the bridge's Rabbit never lags
});
tell('lint', { ok: !lint(level).length, why: 'open' });
if (new URLSearchParams(location.search).get('guide') === '1') showGuide(null, { again: true });

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
  module: () => toModule(level), share: (opts) => shareLink(opts).url, shareLink,
  get tool() { return tool; }, setTool, get brush() { return brush; }, setBrush, get symmetry() { return symmetry; }, setSymmetry, overlays, setOverlay,
  undo: undoEdit, redo: redoEdit, get past() { return past.length; }, get future() { return future.length; },
  surprise, get shelf() { return shelf; }, shelfSave, loadById, ops, get bridge() { return bridge; }, get tutor() { return tutor; }, chat: sendChat,
  tutorials: MAKER_TUTORIALS, pickTutorial, get tutorial() { return tutorialSummary(); },
  goTo, setLearn, openLearn, get learn() { return { where: html.dataset.learn, open: 'learnOpen' in html.dataset, wide: WIDE.matches }; }, get mode() { return looks.mode; },
  guide: { show: (name, o) => showGuide(name, o), pick: pickGuide, get mode() { return guideMode; }, get open() { return guideDialog.open; }, ways: GUIDE_MODES },
  ...rangeStudio, get category() { return rangeStudio.categoryOf(); },
  openLevel: showOpen, get openDialog() { return openDialog.open; },
};

// ------------------------------------------------------------ open a level ----
// What to work on when it is not a new room: the picker (#openDialog) lists a
// new room and a new level of each range, the shipped stages as copies, the
// community's levels, the shelf, and takes a share link pasted in - the same
// ?level= the stages page's Share and the Share dialog here write - so a
// level that lives anywhere can be carried on here. Open… in the stage bar,
// the welcome banner's "open an existing level", ?open=1 and the first visit
// of a device (nothing kept yet, no link) show it.
function openPick(host, label, note, act) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'open-pick';
  b.append(Object.assign(document.createElement('b'), { textContent: label }), Object.assign(document.createElement('small'), { textContent: note }));
  b.addEventListener('click', async () => {
    try { await act(); openDialog.close(); }
    catch (e) { $('#openStatus').textContent = `could not open: ${e.message}`; $('#openStatus').className = 'status hot'; }
  });
  host.append(b);
}
function fillOpen() {
  const fresh = $('#openNew'); fresh.replaceChildren();
  openPick(fresh, 'A new room', 'a walled 9×7 with Alice and the door', () => { hazardPick = -1; setLevel(blank(9, 7), { why: 'new' }); });
  for (const kind of RANGE_KINDS) openPick(fresh, `A new ${kind} level`, `for ${RANGE_NAMES[kind]} on the glitch range`, () => { hazardPick = -1; setLevel(rangeBlank(kind), { why: 'new' }); });
  const stages = $('#openStages'); stages.replaceChildren();
  for (const [id, name] of SHIPPED) openPick(stages, name, 'a copy of the shipped stage', () => loadById(id));
  const comm = $('#openCommunity'); comm.replaceChildren();
  for (const s of community) openPick(comm, s.name, `${s.kind === 'chase' ? 'timed' : RANGE_KINDS.includes(s.kind) ? `a ${s.kind} level` : 'untimed'} · by ${s.author}`, () => loadById(s.id));
  if (!community.length) comm.append(Object.assign(document.createElement('p'), { className: 'note', textContent: 'none yet - yours could be the first' }));
  const kept = $('#openShelf'); kept.replaceChildren();
  for (const item of shelf) openPick(kept, item.level.name, describeShelf(item.level), () => { hazardPick = -1; setLevel(item.level, { why: 'shelf' }); if (item.par) { report = item.report; render(); } tell('shelf', { did: 'open' }); });
  if (!shelf.length) kept.append(Object.assign(document.createElement('p'), { className: 'note', textContent: 'nothing kept yet - "Keep this room" puts one here' }));
  $('#openStatus').textContent = ''; $('#openStatus').className = 'status';
}
function showOpen() {
  fillOpen();
  if (guideDialog.open) guideDialog.close();
  if (!openDialog.open) openDialog.showModal();
}
$('#openBtn').addEventListener('click', showOpen);
$('#guideOpen').addEventListener('click', showOpen);
$('#openLinkBtn').addEventListener('click', () => {
  try {
    const lv = decodeShare($('#openLink').value);
    hazardPick = -1; setLevel(lv, { why: 'load' }); tell('load', { id: idOf(lv), from: 'link' });
    $('#openLink').value = ''; openDialog.close();
    chat(`opened ${lv.name} from a link`, 'act');
  } catch (e) { $('#openStatus').textContent = `the link: ${e.message}`; $('#openStatus').className = 'status hot'; }
});
$('#openLink').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#openLinkBtn').click(); } });
$('#openClose').addEventListener('click', () => openDialog.close());
openDialog.addEventListener('click', (e) => { if (e.target === openDialog) openDialog.close(); });
openDialog.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });    // the studio's keys stay out of the dialog
{
  const q = new URLSearchParams(location.search);
  if (q.get('open') === '1' || (firstVisit && q.get('guide') !== '1')) showOpen();
}

// ?level=…&play=1: the link asked for Run & debug, so the room it brought is played at once
if (sharedOk && new URLSearchParams(location.search).get('play') === '1') startPlay();

}
