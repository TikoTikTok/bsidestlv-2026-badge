// Alice in AI Land - "press this": where the next press goes, shown.
//
// Three things, all one idea - the way a console's pairing screen draws the
// controller and blinks the button it wants:
//
//   badgeArt(opts)        the badge as the player holds it (src/badge-shape.js, read
//                         off the board), the buttons a page asks for lit and
//                         rippling, a hold drawn as a gauge filling, a USB-C plug
//                         sliding into the stalk for "hold BootSel while plugging in"
//   keyGlyphs(beats)      the same buttons as glyphs in a line of text: (A), [▲], a
//                         START pill, pulsing - for the coach's one-liners
//   cue(el)               a control of the page itself - Flash, Connect, a card -
//                         with a breathing outline and a pointing hand bobbing at it
//
//   import { mountPrompt, keyGlyphs, cue } from ./prompt.js   (no quotes here: the deploy's checker reads every quoted `from`)
//   mountPrompt(host, { beats: [['SELECT', 'START']], hold: 2000, caption: 'hold two seconds' });
//   mountPrompt(host, { beats: ['BOOT'], plug: true, frame: 'cap' });
//   line.append(keyGlyphs(['START', 'X']));      // START, then X
//   const off = cue(flashBtn);  …  off();
//
// A prompt is a list of *beats*, each a button or a chord (an array held
// together), played in order and looped. 'ANY' is every button in a wave,
// 'DPAD' the four directions. `hold` makes the last beat a hold of that many
// milliseconds; in a chord with SELECT, SELECT goes down first, as the shift
// key it is; `plug` slides a USB-C plug into the stalk while a BOOT beat is
// held. schedule() is the whole timeline as data, so Node can check it
// (verify-badge.mjs); play() runs it on an element with timers. A player who
// prefers reduced motion gets no motion: the keys named are lit and stay lit.
//
// Under the page turn (html[data-flip], src/tilt.js) the badge is upside
// down in the hand: the shell, the shoulders, START, SELECT and the tiny
// buttons turn a half turn with it (styles.css rotates .phys), while the
// d-pad and the diamond stay where the thumbs find them, because src/pad.js
// renames those to match - the page's UP is whatever sits at the top.

import { BUTTONS } from './pad.js';
import { OUTLINE, BOX, CAP, KEYS, LED, USB } from './badge-shape.js';

export const KEYWORDS = { ANY: [...BUTTONS], DPAD: ['UP', 'DOWN', 'LEFT', 'RIGHT'] };
export const EXTRA = ['BOOT', 'RESET'];           // on the board, not on the pad
const KNOWN = new Set([...BUTTONS, ...EXTRA]);

/** The buttons a beat names, in order; throws on a name the badge has not got. */
export function expandBeat(beat) {
  const list = Array.isArray(beat) ? beat : [beat];
  const out = [];
  for (const b of list) {
    const names = KEYWORDS[b] ?? [b];
    for (const n of names) {
      if (!KNOWN.has(n)) throw new Error(`no such button: ${b}`);
      if (!out.includes(n)) out.push(n);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the timeline ----

export const TIMING = { tap: 380, gap: 260, rest: 1100, shift: 260, wave: 45, ripple: 1000, plugIn: 700, plugHold: 900, settle: 220 };

/**
 * The prompt as events on a clock: { at, on?, off?, tap?, hold?, untap?, plug? }
 * sorted by `at`, and the period after which it loops. Pure.
 */
export function schedule({ beats = [], hold = 0, plug = false } = {}) {
  if (!Array.isArray(beats) || !beats.length) throw new Error('a prompt needs at least one beat');
  const T = TIMING;
  const events = [];
  const ev = (e) => { events.push(e); return e; };
  let t = 0;
  beats.forEach((beat, i) => {
    const keys = expandBeat(beat);
    const last = i === beats.length - 1;
    const h = last ? Math.max(0, hold | 0) : 0;
    if (beat === 'ANY') {
      // a wave across the badge: left thumb, the middle, right thumb, the shoulders
      const order = ['UP', 'LEFT', 'DOWN', 'RIGHT', 'START', 'SELECT', 'Y', 'X', 'B', 'A', 'SR', 'SL'];
      order.forEach((k, j) => { ev({ at: t + j * T.wave, on: [k], tap: true }); ev({ at: t + j * T.wave + T.ripple, untap: [k] }); });
      t += order.length * T.wave + T.tap;
      ev({ at: t, off: keys });
    } else {
      let down = keys;
      if (keys.length > 1 && keys.includes('SELECT')) {       // the shift key goes first
        ev({ at: t, on: ['SELECT'], tap: true });
        ev({ at: t + T.ripple, untap: ['SELECT'] });
        t += T.shift;
        down = keys.filter(k => k !== 'SELECT');
      }
      const e = ev({ at: t, on: down, tap: true });
      if (h) e.hold = h;
      ev({ at: t + T.ripple, untap: down });
      if (plug && keys.includes('BOOT')) {        // the bootloader's way: the plug goes in while BootSel is held
        ev({ at: t + T.settle, plug: true });
        t += T.settle + T.plugIn + T.plugHold;
        ev({ at: t, off: keys, plug: false });
      } else {
        t += h ? h + T.settle : T.tap;
        ev({ at: t, off: keys });
      }
    }
    t += T.gap;
  });
  t += T.rest - T.gap;
  events.sort((a, b) => a.at - b.at);
  return { events, period: t };
}

// ------------------------------------------------------------------- the art ----

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
};
const f = (n) => String(Math.round(n * 100) / 100);

const DPAD = { s: 6.4, r: 0.9 };            // a d-pad arm
const FACE = 3.4;                          // a face button's radius
const SHOULDER = { w: 11, h: 3.6 };
const PILL = { w: 7, h: 3 };               // START / SELECT
const TINY = 1.3;                          // BootSel / reset
const ARROW = { UP: 'M0 -1.3L1.3 .9H-1.3Z', DOWN: 'M0 1.3L1.3 -.9H-1.3Z', LEFT: 'M-1.3 0L.9 -1.3V1.3Z', RIGHT: 'M1.3 0L-.9 -1.3V1.3Z' };
const GROUP = { UP: 'thumbs', DOWN: 'thumbs', LEFT: 'thumbs', RIGHT: 'thumbs', X: 'thumbs', A: 'thumbs', B: 'thumbs', Y: 'thumbs' };
const centre = (names) => names.reduce((c, n) => ({ x: c.x + KEYS[n].x / names.length, y: c.y + KEYS[n].y / names.length }), { x: 0, y: 0 });
/** Where the shell turns about under the page turn: between the two thumbs. */
export const PIVOT = centre(['UP', 'DOWN', 'LEFT', 'RIGHT', 'X', 'A', 'B', 'Y']);

/** The viewBox for a frame: 'full' is the whole mushroom, 'cap' the part under the thumbs. */
export function frameBox(frame = 'full', { plug = false } = {}) {
  const pad = 3;
  const b = frame === 'cap'
    ? { x0: CAP.x0 - pad, y0: CAP.y0 - 1, x1: CAP.x1 + pad, y1: CAP.y1 + 1 }
    : { x0: BOX.x0 - pad, y0: BOX.y0 - pad, x1: BOX.x1 + pad, y1: BOX.y1 + pad };
  if (plug) b.y0 = Math.min(b.y0, USB.y - 24);     // room for the plug above the stalk
  return b;
}

function keyShape(name, grow = 0) {
  const k = KEYS[name];
  if (name in ARROW) return svgEl('rect', { x: f(k.x - DPAD.s / 2 - grow), y: f(k.y - DPAD.s / 2 - grow), width: f(DPAD.s + 2 * grow), height: f(DPAD.s + 2 * grow), rx: f(DPAD.r + grow) });
  if (name === 'SL' || name === 'SR') return svgEl('rect', { x: f(k.x - SHOULDER.w / 2 - grow), y: f(k.y - SHOULDER.h / 2 - grow), width: f(SHOULDER.w + 2 * grow), height: f(SHOULDER.h + 2 * grow), rx: f(SHOULDER.h / 2 + grow) });
  if (name === 'START' || name === 'SELECT') return svgEl('rect', { x: f(k.x - PILL.w / 2 - grow), y: f(k.y - PILL.h / 2 - grow), width: f(PILL.w + 2 * grow), height: f(PILL.h + 2 * grow), rx: f(PILL.h / 2 + grow) });
  if (name === 'BOOT' || name === 'RESET') return svgEl('circle', { cx: f(k.x), cy: f(k.y), r: f(TINY + grow) });
  return svgEl('circle', { cx: f(k.x), cy: f(k.y), r: f(FACE + grow) });
}

function keyGroup(name) {
  const k = KEYS[name];
  const g = svgEl('g', { class: 'key', 'data-key': name });
  const ring = keyShape(name, 0.6); ring.setAttribute('class', 'ring');
  const gauge = keyShape(name, 1.5); gauge.setAttribute('class', 'gauge'); gauge.setAttribute('pathLength', '100');
  const cap = keyShape(name); cap.setAttribute('class', 'cap');
  g.append(ring, gauge, cap);
  if (name in ARROW) g.append(svgEl('path', { class: 'glyph', d: ARROW[name], transform: `translate(${f(k.x)} ${f(k.y)})` }));
  else if (name === 'START' || name === 'SELECT') g.append(svgEl('text', { class: 'word', x: f(k.x), y: f(k.y + PILL.h / 2 + 2.4) }, name));
  else if (name === 'BOOT') g.append(svgEl('text', { class: 'word tiny', x: f(k.x - 1.2), y: f(k.y + 3.3) }, 'BootSel'));
  else if (name === 'RESET') g.append(svgEl('text', { class: 'word tiny', x: f(k.x + 1.2), y: f(k.y - 2.6) }, 'reset'));
  else g.append(svgEl('text', { x: f(k.x), y: f(k.y) }, name));
  return g;
}

/**
 * The badge, as an <svg class="badge-art">. opts: { frame: 'full' | 'cap', plug }.
 * Nothing is lit yet: light(svg, names) / play(svg, schedule) do that.
 */
export function badgeArt({ frame = 'full', plug = false } = {}) {
  const b = frameBox(frame, { plug });
  const svg = svgEl('svg', { class: 'badge-art', viewBox: `${f(b.x0)} ${f(b.y0)} ${f(b.x1 - b.x0)} ${f(b.y1 - b.y0)}`, 'data-frame': frame, role: 'img', 'aria-hidden': 'true' });
  // what turns with the board when it is upside down in the hand
  const phys = svgEl('g', { class: 'phys', style: `transform-origin: ${f(PIVOT.x)}px ${f(PIVOT.y)}px` });
  phys.append(svgEl('path', { class: 'shell', d: OUTLINE }));
  phys.append(svgEl('rect', { class: 'usb', x: f(USB.x - 4.45), y: f(USB.y - 1.6), width: 8.9, height: 3.2, rx: 1.4 }));
  if (plug) {
    const p = svgEl('g', { class: 'plug' });
    p.append(svgEl('path', { class: 'cable', d: `M${f(USB.x)} ${f(USB.y - 9)}V${f(USB.y - 24)}` }));
    p.append(svgEl('rect', { class: 'body', x: f(USB.x - 5), y: f(USB.y - 10.5), width: 10, height: 8, rx: 2.4 }));
    p.append(svgEl('rect', { class: 'tongue', x: f(USB.x - 3.3), y: f(USB.y - 3), width: 6.6, height: 3.6, rx: 1.2 }));
    phys.append(p);
  }
  for (const name of ['SL', 'SR', 'START', 'SELECT', 'BOOT', 'RESET']) phys.append(keyGroup(name));
  phys.append(svgEl('circle', { class: 'led', cx: f(LED.x), cy: f(LED.y), r: 1.1 }));
  svg.append(phys);
  // what the thumbs find in the same place either way up
  const thumbs = svgEl('g', { class: 'thumbs' });
  const dc = centre(['UP', 'DOWN', 'LEFT', 'RIGHT']);
  thumbs.append(svgEl('rect', { class: 'hub', x: f(dc.x - DPAD.s / 2), y: f(dc.y - DPAD.s / 2), width: f(DPAD.s), height: f(DPAD.s) }));
  for (const name of Object.keys(GROUP)) thumbs.append(keyGroup(name));
  svg.append(thumbs);
  return svg;
}

const keyOf = (svg, name) => svg.querySelector(`.key[data-key="${name}"]`);

/** Light these keys and leave them lit (reduced motion, or a page's own state). */
export function light(svg, names, on = true) {
  for (const g of svg.querySelectorAll('.key')) g.classList.toggle('on', on && names.includes(g.dataset.key));
  svg.classList.toggle('lit', on && names.length > 0);
}

/** Whether the player asked for no motion. */
export const stillPlease = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Run a schedule on the art, looping until stop() or the element leaves the
 * document. Returns { stop }. With reduced motion the keys of every beat are
 * lit at once and nothing moves.
 */
export function play(svg, sched, { still = stillPlease() } = {}) {
  const every = [...new Set(sched.events.flatMap(e => e.on ?? []))];
  if (still) {
    light(svg, every);
    if (sched.events.some(e => e.plug)) svg.classList.add('plugged');
    return { stop() {} };
  }
  let timers = [];
  let stopped = false;
  const apply = (e) => {
    for (const n of e.on ?? []) {
      const g = keyOf(svg, n);
      if (!g) continue;
      g.classList.add('on');
      if (e.tap) g.classList.add('tap');
      if (e.hold) { g.style.setProperty('--hold', `${e.hold}ms`); g.classList.add('hold'); }
    }
    for (const n of e.untap ?? []) keyOf(svg, n)?.classList.remove('tap');
    for (const n of e.off ?? []) { const g = keyOf(svg, n); if (g) { g.classList.remove('on', 'hold'); } }
    if ('plug' in e) svg.classList.toggle('plugged', !!e.plug);
    svg.classList.toggle('lit', !!svg.querySelector('.key.on'));
  };
  const loop = () => {
    if (stopped || !svg.isConnected) { stopped = true; return; }
    timers = sched.events.map(e => setTimeout(() => apply(e), e.at));
    timers.push(setTimeout(loop, sched.period));
  };
  loop();
  return { stop() { stopped = true; for (const t of timers) clearTimeout(t); light(svg, []); svg.classList.remove('plugged'); } };
}

/**
 * The art with its prompt running, under a caption, mounted in `host`
 * (replacing what was there). opts: beats, hold, plug, frame, caption.
 * Returns { el, svg, stop }.
 */
export function mountPrompt(host, { beats = ['ANY'], hold = 0, plug = false, frame = 'full', caption = '' } = {}) {
  const el = document.createElement('figure');
  el.className = 'prompt';
  const svg = badgeArt({ frame, plug });
  el.append(svg);
  if (caption) { const c = document.createElement('figcaption'); c.textContent = caption; el.append(c); }
  host.replaceChildren(el);
  const run = play(svg, schedule({ beats, hold, plug }));
  return { el, svg, stop: run.stop };
}

// ---------------------------------------------------------------- the glyphs ----

const GLYPH = { UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', DPAD: '✚', ANY: 'any button', BOOT: 'BootSel', RESET: 'reset' };

/** One button as an inline glyph: <kbd class="key-glyph" data-key="A">A</kbd>. */
export function keyGlyph(name) {
  if (!KNOWN.has(name) && !(name in KEYWORDS)) throw new Error(`no such button: ${name}`);
  const k = document.createElement('kbd');
  k.className = 'key-glyph';
  k.dataset.key = name;
  k.textContent = GLYPH[name] ?? name;
  k.setAttribute('aria-label', name === 'DPAD' ? 'the d-pad' : name === 'ANY' ? 'any button' : name);
  return k;
}

/**
 * A line of glyphs for `beats`: chords joined with +, beats with ›, an
 * optional "hold" tail. <span class="key-glyphs">.
 */
export function keyGlyphs(beats, { hold = 0 } = {}) {
  const span = document.createElement('span');
  span.className = 'key-glyphs';
  beats.forEach((beat, i) => {
    if (i) { const t = document.createElement('i'); t.className = 'then'; t.textContent = '›'; span.append(t); }
    const names = Array.isArray(beat) ? beat : [beat];
    names.forEach((n, j) => {
      if (j) { const p = document.createElement('i'); p.className = 'plus'; p.textContent = '+'; span.append(p); }
      span.append(keyGlyph(n));
    });
  });
  if (hold) { const s = document.createElement('small'); s.textContent = `hold ${hold >= 1000 ? `${Math.round(hold / 100) / 10} s` : `${hold} ms`}`; span.append(s); }
  return span;
}

// ------------------------------------------------------------------- the cue ----

// a pointing hand, index finger up; it sits at a control's lower right and
// nods at it (styles.css turns and bobs it)
const HAND = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12 3.5a2.5 2.5 0 0 1 5 0V15h1.2a2.3 2.3 0 0 1 4.6 0v1h1.2a2.3 2.3 0 0 1 4.6 0v7.5c0 3.6-2.9 6.5-6.5 6.5h-7.1c-1.7 0-3.3-.7-4.5-1.9L4.3 21.9a2.2 2.2 0 0 1 3.1-3.1L12 23.4z"/></svg>';
const HOLLOW = new Set(['INPUT', 'PROGRESS', 'SELECT', 'TEXTAREA', 'IMG', 'CANVAS', 'HR', 'BR']);

/**
 * Point at a control of the page: a breathing outline on `el` and a hand at
 * its corner. One cue per element; a second call on the same element just
 * returns the same off(). Returns the function that takes it away.
 */
export function cue(el) {
  if (!el) return () => {};
  if (el.__cueOff) return el.__cueOff;
  const hollow = HOLLOW.has(el.tagName) || el.tagName === 'A' && el.hidden;
  const anchor = hollow ? el.parentElement : el;
  const hand = document.createElement('span');
  hand.className = 'cue-hand';
  hand.setAttribute('aria-hidden', 'true');
  hand.innerHTML = HAND;
  el.classList.add('cued');
  if (getComputedStyle(anchor).position === 'static') anchor.classList.add('cue-anchor');
  anchor.append(hand);
  const off = () => { el.classList.remove('cued'); anchor.classList.remove('cue-anchor'); hand.remove(); delete el.__cueOff; };
  el.__cueOff = off;
  return off;
}

/** Take a cue off an element, if it has one. */
export const uncue = (el) => { el?.__cueOff?.(); };
