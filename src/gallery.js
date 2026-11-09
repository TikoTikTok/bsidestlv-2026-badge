// Alice in AI Land - the stages page.
//
// One player and a list of levels. The player is src/room.js: whichever
// level is open - A Mad Tea Party and The Queen's Gauntlet (stages/, through
// src/seal.js so a sealed copy takes over the moment one is published), the
// community's rooms (stages/community/, the ones the index lists as rooms),
// or a room that came in a link (?level=, the maker's Share dialog) - played
// by the rules it is: untimed (src/puzzle.js: B undoes) or timed (src/
// chase.js: a clock from the first press, Y waits a tick). The badge drives
// it; on a dev host the keyboard too. The list is the explorer: a card per
// level with a picture of the room, what it is made of and what you have
// won in it; pick one and it opens. src/progress.js remembers the play on
// this device and hands out the prizes; a worker (src/check-worker.js) works
// out every level's par in the background, once, so a card can say it and a
// win under it can count. The tutorial (src/tutor.js, src/coach.js) watches
// it all. Everything drawn comes from assets/ through src/scene.js.

import { parse as parseTea } from './puzzle.js';
import { parse as parseChase } from './chase.js';
import { TILE, THEMES, loadScene, drawRoom } from './scene.js';
import { Pad, flipFor } from './pad.js';
import { openGate, gateMode, gateSources, showRefusal } from './gate.js';
import { loadStage } from './seal.js';
import { initLooks } from './looks.js';
import { Tutor, STAGES_TUTORIAL } from './tutor.js';
import { mountCoach, tutorStore } from './coach.js';
import { mountRoom } from './room.js';
import { decodeShare, lint, kindOf, isGlitch, shareUrl, shareInfo, analyse, difficulty } from './level.js';
import { Progress, ACHIEVEMENTS, levelKey, factsOf, factsLine, localStore } from './progress.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

// ------------------------------------------------------------------ input ----

// The badge is the controller. On the site it is the only one (src/gate.js
// asks for it before anything plays); on a dev host the keyboard works too.
const mode = gateMode();
const pad = new Pad({ sources: gateSources(mode), flip: flipFor(location.search) }).start();
window.__pad = pad;

// While the badge is away the gate mutes the pad and the page holds still: the
// open level's clock and a solver's playback check `paused` through the player.
const hooks = {};
const gatePromise = openGate({ pad, mode, onPause: (why) => hooks.pause?.(why), onResume: () => hooks.resume?.() });

// the look picker and the mode bar (src/looks.js), up before the gate so a
// phone can pick its look while the badge is still being asked for
const looksReady = initLooks();

// The tutorial, A Caucus Race: every edge and everything the open level does
// is fed to it. The coach is mounted once the levels exist (end of the file).
const tutor = new Tutor(STAGES_TUTORIAL, tutorStore('alice.tutor.stages'));
let coach = null;
const tutorFeed = (ev) => coach?.feed(ev);
pad.on(({ button, down, source }) => tutorFeed({ kind: 'edge', button, down, source }));

const scene = await loadScene();

const badge = await gatePromise;
const [TEA_PARTY, QUEENS_GAUNTLET] = await Promise.all([loadStage('tea-party', badge?.key), loadStage('queens-gauntlet', badge?.key)])
  .catch((e) => { showRefusal(`a stage would not open: ${e.message}`); throw e; });

const looks = await looksReady;
const phone = () => looks.look.id !== 'classic';
/** Put a panel on screen: the phone looks' mode, the classic page's scroll. */
const show = (panel) => { if (phone()) looks.setMode(panel); else $(`#${panel}Panel`).scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// -------------------------------------------------------------- the levels ----
// The catalogue: every level the page plays, as { id, name, author, group,
// kind, level, key, map, par, label, sealed }. group is 'stages' (the two
// shipped), 'community' (the index's rooms) or 'shared' (the one from a
// link, at most one). The community's modules are loaded up front, so
// opening is instant and every card has its picture.

const levels = [];
let current = null;
let parWorker = null;      // src/check-worker.js, below; null when a worker cannot be made
const byId = (id) => levels.find(l => l.id === id) ?? null;
const KIND_OF_ID = { 'tea-party': 'tea', 'queens-gauntlet': 'chase' };   // the shipped stages' events keep their old kinds for the tutorial
const WORD = { tea: 'untimed', chase: 'timed' };

function entryOf(id, level, { author, group, sealed = false }) {
  const kind = kindOf(level);
  return { id, name: level.name, author, group, kind, level, key: levelKey(level), sealed,
           map: kind === 'tea' ? parseTea(level.rows) : parseChase(level), par: null, label: null };
}
levels.push(entryOf('tea-party', TEA_PARTY, { author: 'the stages', group: 'stages' }),
            entryOf('queens-gauntlet', QUEENS_GAUNTLET, { author: 'the stages', group: 'stages' }));

// which ids are published sealed (stages/sealed.json, stages/community/sealed.json): an event stage stays on the badge, so no Share
const sealedIds = async (base) => { try { return new Set((await (await fetch(`${base}sealed.json`, { cache: 'no-cache' })).json()).sealed ?? []); } catch { return new Set(); } };
const [sealedStages, sealedRooms] = await Promise.all([sealedIds('stages/'), sealedIds('stages/community/')]);
for (const l of levels) l.sealed = sealedStages.has(l.id);

// the community's rooms: every entry of the index that is a room (kind tea / chase); the glitch levels are glitch.html's
let listed = [];
try {
  const m = await (await fetch('stages/community/index.json', { cache: 'no-cache' })).json();
  listed = m.stages ?? [];
} catch { /* no index: the group says so */ }
const failed = [];
await Promise.all(listed.filter(s => !s.kind || s.kind === 'tea' || s.kind === 'chase').map(async (s) => {
  try {
    const level = await loadStage(s.id, badge?.key, { base: 'stages/community/' });
    levels.push(entryOf(s.id, level, { author: s.author ?? 'the community', group: 'community', sealed: sealedRooms.has(s.id) }));
  } catch (e) { failed.push({ ...s, error: e.message }); }
}));
// in the index's order
levels.sort((a, b) => (a.group === b.group ? listed.findIndex(s => s.id === a.id) - listed.findIndex(s => s.id === b.id) : a.group === 'stages' ? -1 : 1));

// -------------------------------------------------------------- progress ----

const progress = new Progress(localStore());
const catalogue = () => progress.catalogue(levels.map(l => ({ id: l.id, key: l.key, group: l.group, kind: l.kind, par: l.par })));
catalogue();

// ------------------------------------------------------------- the player ----

const room = mountRoom({
  canvas: $('#room'), scene, pad, armed: () => true,
  status: $('#roomStatus'), lesson: $('#roomLesson'),
  keys: { undo: $('#roomKeyUndo'), wait: $('#roomKeyWait'), reset: $('#roomKeyReset') },
  keyboard: () => pad.allows('key'),
  feed(ev) {
    // the progress first (a win is recorded before the prize line), then the tutorial, which knows the two stages by their old kinds
    if (current) {
      progress.feed(ev, { id: current.id, key: current.key, group: current.group, kind: current.kind, par: current.par });
      if (ev.what === 'win') { renderFacts(); markCards(); }
    }
    tutorFeed(KIND_OF_ID[ev.id] ? { ...ev, kind: KIND_OF_ID[ev.id] } : ev);
    if (tutor.done) progress.tutorialDone();
  },
});

/** Opens a level by id: the player, the strip, the cards. `show` puts the Play panel on screen; `remember` writes ?room= in the address. */
function open(id, { tell = true, show: bring = false, remember = false } = {}) {
  const entry = byId(id);
  if (!entry) throw new Error(`no level '${id}'`);
  current = entry;
  progress.begin();
  room.load(entry.level, { id: entry.id, tell, par: entry.par });
  $('#levelName').textContent = entry.name;
  $('#levelBy').textContent = entry.group === 'shared' ? 'shared in a link' : entry.group === 'stages' ? 'one of the stages' : `by ${entry.author}`;
  $('#roomBlurb').textContent = entry.level.blurb ?? '';
  $('#roomBlurb').hidden = !entry.level.blurb;
  $('#roomUndo').hidden = entry.kind !== 'tea';
  $('#roomReset').textContent = entry.kind === 'tea' ? 'Reset' : 'Restart';
  $('#shareBtn').hidden = entry.sealed;   // an event stage stays on the badge
  renderFacts();
  markCards();
  // the address follows a pick, so a reload comes back here; a room from a link keeps its link
  if (remember && entry.group !== 'shared') {
    const q = new URLSearchParams(location.search);
    q.delete('level'); q.set('room', entry.id);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }
  if (bring) show('play');
  return entry;
}

// the facts strip: the rules, the size, what is in the room, the par and your best
function renderFacts() {
  const host = $('#levelFacts');
  host.replaceChildren();
  if (!current) return;
  const put = (label, value, cls = '') => { const s = el('span', cls); s.append(el('small', '', label), el('b', '', value)); host.append(s); };
  const f = factsOf(current.level);
  const line = factsLine(f);
  put('rules', line[0]);
  put('room', line[1]);
  put('in it', line.slice(2).join(' · '));
  const unit = current.kind === 'tea' ? 'moves' : 'ticks';
  if (current.par) put('par', `${current.par} ${unit}${current.label ? ` · ${current.label}` : ''}`);
  else put('par', parWorker ? 'working it out…' : 'unknown', 'dim');
  const rec = progress.record(current.key);
  if (rec?.wins) {
    const star = current.par && rec.best !== null && rec.best <= current.par;
    put('your best', `${rec.best} ${unit}${star ? ' ★ par' : ''} · won ${rec.wins}×${rec.clean ? ' · no undo' : ''}`, 'win');
  } else put('your best', 'not yet won', 'dim');
}

// ------------------------------------------------------------ the explorer ----
// A card per level, grouped; the picture is the room itself drawn small.

const GROUPS = [
  ['stages', 'The stages', 'The two rooms the challenge opens with.'],
  ['community', "The community's rooms", 'Made with the level maker and sent in; every one proved solvable before it shipped.'],
  ['shared', 'Shared with you', 'A room that came in a link. It is not on the page for anyone else.'],
];
const groupsHost = $('#levelGroups');
const cards = new Map();   // id -> the card

function thumb(entry) {
  const { map } = entry;
  const size = Math.max(3, Math.floor(Math.min(132 / map.w, 84 / map.h)));
  const c = el('canvas', 'thumb');
  c.width = map.w * size; c.height = map.h * size;
  c.setAttribute('aria-hidden', 'true');
  drawRoom(c.getContext('2d'), scene, map, map.start, THEMES[entry.level.theme] ?? (entry.kind === 'chase' ? THEMES.hall : THEMES.garden), { size });
  return c;
}
function card(entry) {
  const b = el('button', `level-card${entry.group === 'shared' ? ' shared' : ''}`);
  b.type = 'button'; b.dataset.id = entry.id;
  const f = factsOf(entry.level);
  b.append(thumb(entry), el('b', '', entry.name),
           el('small', '', `${WORD[entry.kind]} · ${f.w}×${f.h} · ${entry.author}`),
           el('span', 'level-par'), el('span', 'level-mark'));
  b.addEventListener('click', () => open(entry.id, { show: true, remember: true }));
  cards.set(entry.id, b);
  return b;
}
function renderGroups() {
  groupsHost.replaceChildren();
  cards.clear();
  for (const [group, title, note] of GROUPS) {
    const mine = levels.filter(l => l.group === group);
    if (!mine.length && group !== 'community') continue;
    const sec = el('section', 'level-group'); sec.dataset.group = group;
    sec.append(el('h3', 'sub', title), el('p', 'note', note));
    const grid = el('div', 'levels');
    for (const l of mine) grid.append(card(l));
    for (const f of failed) if (group === 'community') { const c = el('div', 'level-card off'); c.append(el('b', '', f.name ?? f.id), el('small', '', `could not open: ${f.error}`)); grid.append(c); }
    if (!mine.length) grid.append(el('p', 'note', 'No rooms yet. The level maker is where the first one is made.'));
    sec.append(grid);
    groupsHost.append(sec);
  }
  markCards();
}
/** What the cards say of the play: the open one, the won ones, the par. */
function markCards() {
  for (const [id, b] of cards) {
    const entry = byId(id);
    const rec = progress.record(entry.key);
    const unit = entry.kind === 'tea' ? 'moves' : 'ticks';
    b.classList.toggle('on', current?.id === id);
    b.classList.toggle('won', !!rec?.wins);
    b.classList.toggle('star', !!(rec?.wins && entry.par && rec.best !== null && rec.best <= entry.par));
    b.querySelector('.level-par').textContent = entry.par ? `par ${entry.par}` : '';
    b.querySelector('.level-mark').textContent = rec?.wins ? `✓ ${rec.best} ${unit}` : '';
    b.setAttribute('aria-pressed', String(current?.id === id));
  }
  const s = progress.summary();
  $('#progressLine').textContent = `${s.won} of ${s.of} won · ${s.prizes} of ${s.prizesOf} prizes`;
}
renderGroups();

// the prizes: every one, won or not, with how it is won
function renderPrizes() {
  const host = $('#prizes');
  host.replaceChildren();
  for (const a of ACHIEVEMENTS) {
    const when = progress.state.prizes[a.id];
    const d = el('div', `prize${when ? ' on' : ''}`); d.dataset.id = a.id;
    d.append(el('span', 'icon', a.icon), el('b', '', a.title), el('small', '', a.say));
    if (when) { const date = new Date(when); d.append(el('em', '', Number.isNaN(date.getTime()) ? 'won' : `won ${date.toLocaleDateString()}`)); }
    host.append(d);
  }
}
renderPrizes();

// a prize won: a line for a moment - one after another when several land at once - and everything that shows the play redrawn
const toasts = [];
let toastTimer = null;
function toast(text) {
  toasts.push(text);
  if (toastTimer) return;
  const next = () => {
    const t = $('#toast');
    if (!toasts.length) { t.hidden = true; toastTimer = null; return; }
    t.textContent = toasts.shift();
    t.hidden = false;
    toastTimer = setTimeout(next, 3200);
  };
  next();
}
progress.on(({ unlocked, reset }) => {
  if (unlocked.length) toast(`${unlocked.length === 1 ? 'A prize' : 'Prizes'}: ${unlocked.map(a => `${a.icon} ${a.title}`).join(' · ')}`);
  if (reset) toast('Progress forgotten');
  renderPrizes(); markCards(); renderFacts();
});
$('#progressReset').addEventListener('click', () => {
  if (!confirm('Forget every win and prize on this device?')) return;
  progress.reset();
  $('#progressStatus').textContent = 'forgotten'; $('#progressStatus').className = 'status';
});

// ------------------------------------------------------------------ the par ----
// The solver's answer for every level, in a worker so the page stays live,
// once per device (localStorage alice.levels.par, by the level's key). The
// tea party is the long one (~31k states). A card says the par once known,
// the strip adds the difficulty word, and a best already under it is a prize.

const PAR_KEY = 'alice.levels.par';
const parCache = (() => { try { return JSON.parse(localStorage.getItem(PAR_KEY) ?? '{}') || {}; } catch { return {}; } })();
try { parWorker = new Worker(new URL('./check-worker.js', import.meta.url), { type: 'module' }); } catch { parWorker = null; }
const parWaiting = new Map();
let parSeq = 0;
function parKnown(entry, { par, label }) {
  entry.par = par; entry.label = label;
  if (current === entry) room.setPar(par);
  catalogue();
  progress.parKnown(entry.key, par);
  markCards(); if (current === entry) renderFacts();
}
function askPar(entry) {
  const hit = parCache[entry.key];
  if (hit?.par) { parKnown(entry, hit); return; }
  if (!parWorker) return;
  const id = ++parSeq;
  parWaiting.set(id, (report) => {
    if (!report?.ok || !report.par) return;
    const a = analyse(entry.level, report);
    const d = difficulty(report, a?.pushes ?? 0);
    parCache[entry.key] = { par: report.par, label: d?.label ?? null };
    try { localStorage.setItem(PAR_KEY, JSON.stringify(parCache)); } catch { /* storage may be off */ }
    parKnown(entry, parCache[entry.key]);
  });
  parWorker.postMessage({ id, level: entry.level });
}
if (parWorker) {
  parWorker.onmessage = (e) => { const done = parWaiting.get(e.data.id); parWaiting.delete(e.data.id); done?.(e.data.report); };
  parWorker.onerror = () => { parWorker = null; renderFacts(); };
}
// the small rooms first, so the tea party's search does not hold the others up
for (const l of [...levels].sort((a, b) => a.map.w * a.map.h * (a.map.start.rocks.length + 1) - b.map.w * b.map.h * (b.map.start.rocks.length + 1))) askPar(l);

// ---------------------------------------------------------------- shared ----
/**
 * A room that came in a link - ?level=<token>, src/level.js decodeShare; the
 * maker's Share dialog and this page's write one - as a card of its own,
 * "Shared with you", opened and played like any level, its blurb and lesson
 * with it; the par is worked out like the others'. A link that is not a room
 * is said so in the status and nothing else changes - a glitch level's token
 * is the range page's, and the status carries the link there. Returns the
 * room, or null.
 */
const say = (text, kind = '', link = null) => {
  const s = $('#roomStatus'); s.textContent = text; s.className = `status ${kind}`.trim();
  if (link) s.append(Object.assign(el('a'), { href: link.href, textContent: link.text }));
};
function openShared(token) {
  let level;
  try {
    level = decodeShare(token);
    if (!isGlitch(level)) { const problems = lint(level); if (problems.length) throw new Error(problems.join('; ')); }
  } catch (e) { say(`the shared room could not be opened: ${e.message}`, 'hot'); return null; }
  if (isGlitch(level)) { say(`the link carries a glitch level, "${level.name}", not a room: `, 'hot', { href: `glitch.html?level=${encodeURIComponent(token)}`, text: 'play it on the range page' }); return null; }
  const old = levels.findIndex(l => l.group === 'shared');
  if (old >= 0) levels.splice(old, 1);
  const entry = entryOf('shared', level, { author: 'a link', group: 'shared' });
  levels.push(entry);
  catalogue();
  renderGroups();
  askPar(entry);
  open('shared', { tell: false, show: true });
  return level;
}

// ------------------------------------------------------------------ share ----
// The open level as one link, two doors: played here, or carried on in the
// level maker. The same tokens the maker writes (src/level.js shareUrl).

{
  const dialog = $('#shareDialog');
  const base = (page) => new URL(page, location.href).href;
  function fill() {
    if (!current) return;
    const play = shareUrl(base('index.html'), current.level), edit = shareUrl(base('maker.html'), current.level);
    $('#sharePlayUrl').value = play; $('#sharePlayOpen').href = play;
    $('#shareEditUrl').value = edit; $('#shareEditOpen').href = edit;
    const info = shareInfo(edit);
    const bits = [`${current.name}`, `${info.chars} characters`];
    if (current.level.lesson?.length) bits.push(`a lesson of ${current.level.lesson.length}`);
    $('#shareStatus').textContent = [...bits, ...info.warnings].join(' · ');
    $('#shareStatus').className = `status${info.warnings.length ? ' hot' : ''}`;
  }
  const copy = (btn, input) => async () => {
    try { await navigator.clipboard.writeText(input.value); btn.textContent = 'Copied ✓'; }
    catch { input.focus(); input.select(); btn.textContent = 'Select all, then copy'; }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  };
  $('#shareBtn').addEventListener('click', () => { fill(); dialog.showModal(); });
  $('#sharePlayCopy').addEventListener('click', copy($('#sharePlayCopy'), $('#sharePlayUrl')));
  $('#shareEditCopy').addEventListener('click', copy($('#shareEditCopy'), $('#shareEditUrl')));
  for (const id of ['sharePlayUrl', 'shareEditUrl']) $(`#${id}`).addEventListener('focus', (e) => e.target.select());
  $('#shareClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}

// ---------------------------------------------------------------- buttons ----

$('#roomReset').addEventListener('click', () => room.reset());
$('#roomUndo').addEventListener('click', () => room.undo());
$('#roomSolve').addEventListener('click', () => room.solve());

// The gate's pause (site only): the badge went, so the world stands still -
// a timed room's cast does not move while nobody can move Alice, a solver's
// playback holds its place. The status says why, and is redrawn when the
// badge is back.
hooks.pause = (why) => room.pause(why);
hooks.resume = () => room.resume();

// --------------------------------------------------------------- the coach ----
// The tutorial: a step the player asked for - the first on load, a skip, a
// click on the checklist, start over - opens the stage it is about (chapter
// one the tea party, chapter two the gauntlet; chapter three asks the player
// to pick one of the community's rooms, so it shows the list instead) and,
// on a phone, the panel. A step that completed itself leaves the player in
// whatever room they are in: the next line says where to go. Mounted once
// the levels exist, since its first step opens one.
open('tea-party', { tell: false });
const STAGE_OF = { tea: 'tea-party', chase: 'queens-gauntlet' };
coach = mountCoach(tutor, {
  looks,
  chapters: { 1: 'Chapter one · a mad tea party', 2: "Chapter two · the queen's gauntlet", 3: "Chapter three · the community's rooms" },
  finish: {
    title: 'A prize for everyone',
    say: 'The rooms are yours. The range is next door, the level maker too.',
    note: (skipped) => 'You have been through every room' +
      (skipped ? ` (${skipped} step${skipped === 1 ? '' : 's'} skipped)` : '') +
      '. Start over any time, cross to the glitch range, where the badge does the pressing, or make a room of your own in the level maker.',
  },
  prepare(step, { show: bring = false, why = 'step' } = {}) {
    if (!step?.stage) return;
    const want = STAGE_OF[step.stage];
    if (why !== 'step' && want && current?.id !== want && byId(want)) open(want, { tell: false });
    if (!bring) return;
    // the step's level when it is the open one, else the list to pick it from
    const there = want ? current?.id === want : current?.group !== 'stages';
    show(there ? 'play' : 'levels');
  },
});

// ?level=<token> in the address is a room that came in a link: a card of its
// own, the one open, and on a phone the one on screen, whatever the
// tutorial's step says (play=1, the studio's, changes nothing here). Else
// ?room=<id> is the one open - or, naming no level, the status says so.
{
  const q = new URLSearchParams(location.search);
  if (q.get('level') !== null) openShared(q.get('level'));
  else if (q.get('room') !== null) {
    const wanted = q.get('room');
    if (byId(wanted)) open(wanted, { tell: false, show: phone(), remember: true });
    else {
      const glitch = listed.find(s => s.id === wanted && s.kind && s.kind !== 'tea' && s.kind !== 'chase');
      if (glitch) say(`"${glitch.name ?? wanted}" is a glitch level, not a room: `, 'hot', { href: 'glitch.html', text: `play it on the range page, the last tab of the ${glitch.kind} range` });
      else say(`no level "${wanted}" - ${current.name} is open instead`, 'hot');
    }
  }
  // ?autosolve=tea|chase kicks the solver on load - a screenshot or a smoke test; the bench only
  const auto = q.get('autosolve');
  if (mode === 'dev' && STAGE_OF[auto]) { open(STAGE_OF[auto], { tell: false }); setTimeout(() => room.solve(), 400); }
}

// scripted tests read the page through this (dev hosts; nothing here plays)
window.__stages = {
  get tutor() { return tutor; }, room, levels, open, openShared, progress,
  get current() { return current; }, get board() { return room.state; }, get history() { return room.history; },
  get chase() { return { state: room.state, ticks: room.count, dead: room.dead, waiting: room.waiting }; },
  get par() { return Object.fromEntries(levels.map(l => [l.id, l.par])); },
};

// The render loop starts last: everything it draws has to exist first.
function tick(now) {
  room.draw(now);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
