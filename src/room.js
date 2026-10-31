// Alice in AI Land - a room played as the stages page plays its own.
//
// The two shipped stages each have their player in src/gallery.js; this is
// the one for any other room - the community's, from stages/community/ - by
// whichever rules the room is: untimed (src/puzzle.js: moves, B undoes) or
// timed (src/chase.js: a clock from the first press, Y waits a tick). The
// badge drives it through the page's pad while the panel is armed; on a dev
// host the keyboard rides the same pad, and R, Backspace and space are the
// page's own keys as they are for the stages.
//
// A room may carry a lesson (`lesson`, see src/tutor.js lessonSteps): a list
// of steps, each a thing the room does (move, push, lever, button, wait,
// win...) and a line about it. The lesson is shown under the room and ticks
// itself off as the player does what it says - the same engine as the
// tutorials, with no store, so it starts over with the room.
//
//   const room = mountRoom({ canvas, scene, pad, armed: () => armedStage === 'rooms',
//                            status: $('#roomStatus'), lesson: $('#roomLesson'), keys: {...},
//                            feed: (ev) => tutorFeed(ev), keyboard: () => pad.allows('key') });
//   room.load(level, { id });    // draws it; room.draw(now) from the page's loop
//
// Everything the room does is reported through `feed` as
//   { kind: 'room', id, what, ... }   what: open | move | push | lever | button | blocked | undo |
//                                           reset | start | wait | tick | caught | restart | win | solve
// so the page's tutorial can watch a community room as it watches the stages.

import { parse as parseTea, step as teaStep, solve as solveTea, isGoal as teaGoal } from './puzzle.js';
import { parse as parseChase, step as chaseStep, solve as solveChase, isGoal as chaseGoal } from './chase.js';
import { TILE, THEMES, drawRoom } from './scene.js';
import { Tutor, lessonSteps } from './tutor.js';

const PAD_DIRS = { UP: 'N', DOWN: 'S', LEFT: 'W', RIGHT: 'E' };
const kindOf = (level) => (level.hazards?.length || level.tickMs ? 'chase' : 'tea');

export function mountRoom({ canvas, scene, pad, armed = () => true, status, lesson: lessonEl, keys = {}, feed = () => {}, keyboard = () => false, playMs = 120 }) {
  const ctx = canvas.getContext('2d');
  let level = null, id = null, kind = 'tea', map = null, theme = THEMES.garden;
  let state = null, facing = 'S', count = 0, history = [], hint = null, dead = false, waiting = true;
  let plan = null, planAt = 0, playTimer = null, clock = null, tickMs = 320, queued = null, paused = false;
  let lesson = null;

  const say = (text, cls = '') => { if (status) { status.textContent = text; status.className = `status ${cls}`; } };
  const tell = (what, extra = {}) => {
    const ev = { kind: 'room', id, what, ...extra };
    feed(ev);
    if (lesson && lesson.feed(ev)) showLesson();
  };
  const held = () => (state ? state.rocks.filter(r => map.buttons.has(r)).length : 0);
  const won = () => (state ? (kind === 'tea' ? teaGoal(map, state) : chaseGoal(map, state)) : false);
  const resetKey = () => (keyboard() ? 'START or R' : 'START');
  const undoKey = () => (keyboard() ? 'B or Backspace' : 'B');

  /** A rock off its button with a wall on two adjacent sides can never be pushed again. */
  function stuck() {
    const solid = (x, y) => x < 0 || y < 0 || x >= map.w || y >= map.h || map.walls.has(y * map.w + x);
    return state.rocks.some((r) => {
      if (map.buttons.has(r)) return false;
      const x = r % map.w, y = (r / map.w) | 0;
      return (solid(x, y - 1) || solid(x, y + 1)) && (solid(x - 1, y) || solid(x + 1, y));
    });
  }

  function refresh() {
    if (!state || paused) return;
    const buttons = `${held()}/${map.buttons.size} buttons`;
    if (kind === 'tea') {
      const n = `${buttons} · ${count} moves`;
      if (won()) say(`solved in ${count} moves`, 'win');
      else if (plan) say(`playing the solution - move ${planAt} of ${plan.length}`, 'busy');
      else if (hint) say(`${hint} · ${n}`, 'hint');
      else if (stuck()) say(`a rock is stuck in a corner - ${undoKey()} takes a move back · ${n}`, 'hot');
      else say(n);
    } else {
      const n = `tick ${count} · ${buttons}`;
      if (dead) say(`caught on tick ${count} - ${resetKey()} restarts`, 'hot');
      else if (won()) say(`out in ${count} ticks`, 'win');
      else if (waiting) say(`the room waits for your first press · ${n}`, 'hint');
      else say(`${n}${plan ? ' · solving' : ''}`, plan ? 'busy' : '');
    }
  }

  function showLesson() {
    if (!lessonEl) return;
    lessonEl.textContent = '';
    if (!lesson) { lessonEl.hidden = true; return; }
    lessonEl.hidden = false;
    const n = lesson.steps.length;
    const b = document.createElement('b');
    if (lesson.done) {
      b.textContent = `Lesson done · ${n} of ${n}`;
      lessonEl.append(b, ' You know this room. The next one is yours.');
      lessonEl.classList.add('done');
      return;
    }
    lessonEl.classList.remove('done');
    b.textContent = `Lesson · ${lesson.at + 1} of ${n} · ${lesson.step.title}`;
    lessonEl.append(b, ` ${lesson.step.say}`);
  }

  // ------------------------------------------------------------- untimed ----

  function move(dir, { loud = true } = {}) {
    const next = teaStep(map, state, dir);
    facing = dir;
    if (!next) {
      const [dx, dy] = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[dir];
      const target = (((state.alice / map.w) | 0) + dy) * map.w + (state.alice % map.w) + dx;
      hint = state.rocks.includes(target) ? 'that rock will not budge'
           : target === map.door ? `the door wants ${map.buttons.size === 1 ? 'the button' : `all ${map.buttons.size} buttons`} held`
           : map.gates.has(target) ? 'the gate is shut - find the lever' : 'blocked';
      refresh();
      if (loud) tell('blocked');
      return false;
    }
    const before = state;
    history.push(before);
    hint = null;
    state = next;
    count++;
    refresh();
    if (loud) {
      const was = before.rocks.filter(r => map.buttons.has(r)).length;
      tell('move', { moves: count });
      if (before.rocks.some((r, i) => r !== state.rocks[i])) tell('push', { moves: count });
      if (before.lever !== state.lever) tell('lever', { moves: count });
      if (held() > was) tell('button', { buttons: held(), moves: count });
      if (won()) tell('win', { moves: count });
    }
    return true;
  }
  function undo() {
    if (kind !== 'tea' || plan || !history.length) return false;
    state = history.pop();
    count = Math.max(0, count - 1);
    hint = null;
    refresh();
    tell('undo', { moves: count });
    return true;
  }
  function playback(moves) {
    stopPlayback();
    plan = moves; planAt = 0;
    playTimer = setInterval(() => {
      if (paused) return;
      if (planAt >= plan.length) { stopPlayback(); return; }
      move(plan[planAt++], { loud: false });
    }, playMs);
    refresh();
  }
  function stopPlayback() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null; plan = null;
    refresh();
  }

  // --------------------------------------------------------------- timed ----

  function go() {
    if (!waiting) return;
    waiting = false;
    tell('start', { ticks: count });
    tick();
    startClock();
  }
  function tick() {
    if (dead || waiting || won()) return;
    const planned = !!plan;
    const action = plan ? (plan[planAt++] ?? 'wait') : (queued ?? 'wait');
    const chosen = planned ? null : queued;
    queued = null;
    if (action !== 'wait') facing = action;
    const was = held();
    const next = chaseStep(map, state, action);
    if (!next) {
      const bumped = chaseStep(map, state, 'wait');
      if (action !== 'wait' && bumped) { state = bumped; count++; refresh(); if (!planned) tell('tick', { ticks: count }); return; }
      dead = true; plan = null;
      refresh();
      tell('caught', { ticks: count });
      return;
    }
    state = next;
    count++;
    if (plan && planAt >= plan.length) plan = null;
    refresh();
    if (!planned) {
      tell('tick', { ticks: count });
      if (chosen === 'wait') tell('wait', { ticks: count });
      if (held() > was) tell('button', { buttons: held(), ticks: count });
      if (won()) tell('win', { ticks: count });
    }
  }
  function startClock() {
    if (clock) clearInterval(clock);
    clock = setInterval(() => { if (!paused) tick(); }, tickMs);
  }

  // ---------------------------------------------------------------- both ----

  function reset({ tell: loud = true } = {}) {
    if (!map) return;
    stopPlayback();
    if (clock) clearInterval(clock);
    clock = null;
    state = map.start; facing = 'S'; count = 0; history = []; hint = null; dead = false; waiting = true; queued = null; plan = null; planAt = 0;
    refresh();
    if (!loud) return;
    if (kind === 'tea') tell('reset'); else tell('restart');
  }

  /** Opens a room: parsed by its rules, drawn at once, its lesson from the top. */
  function load(next, { id: nextId = null, tell: loud = true } = {}) {
    level = next; id = nextId ?? next.name;
    kind = kindOf(level);
    map = kind === 'tea' ? parseTea(level.rows) : parseChase(level);
    theme = THEMES[level.theme] ?? THEMES.garden;
    tickMs = level.tickMs ?? 320;
    canvas.width = map.w * TILE; canvas.height = map.h * TILE;
    if (keys.undo) keys.undo.hidden = kind !== 'tea';
    if (keys.wait) keys.wait.hidden = kind !== 'chase';
    if (keys.reset) keys.reset.textContent = kind === 'tea' ? 'reset' : 'restart';
    lesson = level.lesson?.length ? new Tutor(lessonSteps(level)) : null;
    showLesson();
    reset({ tell: false });
    if (loud) tell('open', { name: level.name, rules: kind });
    return map;
  }

  /** The real solver from where the room stands, played back; the bench's button. */
  function solve() {
    if (!map || dead) return null;
    const from = state;
    const t0 = performance.now();
    const found = kind === 'tea' ? solveTea({ ...map, start: from }) : solveChase(map, from);
    const ms = Math.round(performance.now() - t0);
    if (!found.moves) { say(`no way out from here (${found.explored} states, ${ms} ms) - ${resetKey()} ${kind === 'tea' ? 'resets' : 'restarts'}`, 'hot'); return found; }
    tell('solve', { par: found.moves.length });
    if (kind === 'tea') playback(found.moves);
    else { plan = found.moves; planAt = 0; if (waiting) { waiting = false; startClock(); } refresh(); }
    return found;
  }

  pad.on(({ button, down }) => {
    if (!down || !map || !armed()) return;
    if (button === 'START') { reset(); return; }
    if (kind === 'tea') {
      if (button === 'B') { undo(); return; }
      const dir = PAD_DIRS[button];
      if (dir && !plan) move(dir);
    } else {
      const action = PAD_DIRS[button] ?? (button === 'Y' ? 'wait' : null);
      if (action && !plan) { queued = action; go(); }
    }
  });
  addEventListener('keydown', (e) => {
    if (!map || !keyboard() || !armed()) return;
    if (e.key === 'r' || e.key === 'R') { reset(); return; }
    if (e.key === 'Backspace' && kind === 'tea') { e.preventDefault(); undo(); }
    if (e.key === ' ' && kind === 'chase' && !plan) { e.preventDefault(); queued = 'wait'; go(); }
  });

  function draw(now) {
    if (!map) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoom(ctx, scene, map, state, theme, { now, facing, walking: kind === 'chase' ? !waiting && !dead : !!plan, beatMs: kind === 'chase' ? tickMs : playMs, dead });
  }

  return {
    load, reset, undo, solve, draw,
    pause(why) { paused = true; queued = null; say(`paused - the badge is ${why}`, 'hot'); },
    resume() { paused = false; refresh(); },
    get level() { return level; }, get id() { return id; }, get kind() { return kind; }, get map() { return map; }, get state() { return state; },
    get count() { return count; }, get dead() { return dead; }, get waiting() { return waiting; }, get history() { return history; },
    get lesson() { return lesson; }, get plan() { return plan; },
  };
}
