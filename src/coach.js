// Alice in AI Land - the coach: the tutorial on a page.
//
// src/tutor.js is the engine and the steps; this is what the player sees of
// it, the same on every page that carries one: the coach line pinned above
// the panels (#coach: the step's title, its count, what to do, skip / learn)
// and the Learn panel (#learnPanel: the current step with its why, the
// checklist, skip / start over). A page mounts it once and feeds it events;
// what a step does to the page when it comes up - arm a range, pick a level,
// a stage - is the page's `prepare` hook.
//
// Where the panel sits is the coach's too (styles.css, html[data-learn]): in
// the classic look it is beside the stage - a sticky column at the right of
// main on a wide window, a drawer over the right edge on a narrow one that the
// line's "learn" opens and the panel's x closes - unless "unpin" (#learnPin)
// put it back in the page. One breakpoint, WIDE, is the CSS's too; the choice
// is kept in localStorage alice.learn and src/look-boot.js honours it before
// paint. In the phone looks the panel is the mode bar's Learn mode.
//
//   const coach = mountCoach(tutor, {
//     looks,                       // from initLooks(): the phone looks' mode bar
//     title: 'A Caucus Race',      // the panel's heading (#learnTitle), on a page that has one
//     chapters: { 1: 'Chapter one · by hand', 2: 'Chapter two · the badge' },
//     finish: { title, say, note },// what the coach and the panel say when every step is done
//     prepare(step, { show, why }),// a step came up; show: put its panel on screen too; why: 'mount' | 'step' (one completed
//                                  //   itself) | 'skip' | 'goto' | 'restart' | 'use' - so a page can move the player only when they asked
//     onRender(),                  // the checklist was redrawn: a step done or skipped, a swap
//     learnMode: 'learn',          // the mode bar's name for the Learn panel
//   });
//   coach.feed(ev);                // every event the page produces; renders on a completed step
//   coach.render();
//   coach.skip(); coach.restart(); // what the buttons do
//   coach.use(other, { title, chapters, finish });   // another tutorial under the same coach (the maker's builds)
//   coach.tutor                    // the one in use
//   coach.setLearn('side' | 'page', { remember }); coach.openLearn(bool?); coach.learn   // the panel's place: { where, open, wide }

import { keyGlyphs, mountPrompt } from './prompt.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** localStorage key of the guide's place in the classic look: 'side' (the default) or 'page'. src/look-boot.js reads it before paint. */
export const LEARN_KEY = 'alice.learn';
/** The one breakpoint of the guide beside the stage: a column from here up, a drawer below (styles.css asks the same). */
export const LEARN_WIDE = '(min-width: 1000px)';

export function mountCoach(first, { looks, title = '', chapters = {}, finish, prepare = () => {}, onRender = () => {}, learnMode = 'learn' } = {}) {
  let tutor = first;            // the tutorial in use; use() swaps it, the buttons stay bound once
  let art = null;               // the Learn panel's badge, lit with the step's keys
  const classic = () => !looks || looks.look.id === 'classic';
  const html = document.documentElement;

  // the line's height, for what sits under it in the classic look (a panel scrolled to, the drawer): --coach-h on <html>, 0 while hidden
  const line = $('#coach');
  const measure = () => html.style.setProperty('--coach-h', `${line.offsetHeight}px`);
  measure();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(line);

  // ---- the panel's place in the classic look: beside the stage (a column or a drawer) or in the page
  const WIDE = matchMedia(LEARN_WIDE);
  const pin = $('#learnPin');
  /** The drawer (a narrow window): open, closed, or toggled; the coach line's "learn" says which it is. */
  function openLearn(open = !('learnOpen' in html.dataset)) {
    if (open && html.dataset.learn === 'side') html.dataset.learnOpen = ''; else delete html.dataset.learnOpen;
    $('#coachOpen').setAttribute('aria-expanded', String('learnOpen' in html.dataset));
    return 'learnOpen' in html.dataset;
  }
  /** Beside the stage ('side', a column or a drawer) or in the page ('page'); remembered unless told not to. */
  function setLearn(where, { remember = true } = {}) {
    html.dataset.learn = where === 'page' ? 'page' : 'side';
    if (html.dataset.learn === 'page') openLearn(false);
    if (remember) try { localStorage.setItem(LEARN_KEY, html.dataset.learn); } catch { /* storage may be off */ }
    if (pin) { pin.textContent = html.dataset.learn === 'side' ? 'unpin' : 'pin'; pin.setAttribute('aria-pressed', String(html.dataset.learn === 'side')); }
    return html.dataset.learn;
  }
  if ('learn' in html.dataset) {   // a page with the guide beside the stage (the maker's site face has none: look-boot dropped it)
    setLearn(html.dataset.learn, { remember: false });
    pin?.addEventListener('click', () => setLearn(html.dataset.learn === 'side' ? 'page' : 'side'));
    $('#learnClose')?.addEventListener('click', () => openLearn(false));
    WIDE.addEventListener('change', () => openLearn(false));   // grown into the column or shrunk out of it: the drawer starts closed
  }
  /** The coach line's "learn" in the classic look: the drawer on a narrow window; the column is on screen already; else the panel is in the page. */
  function open() {
    if (html.dataset.learn !== 'side') { $('#learnPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (WIDE.matches) { $('#learnCoach').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    openLearn();
  }

  function render() {
    const n = tutor.steps.length;
    const step = tutor.step;
    const heading = $('#learnTitle');
    if (heading && title) heading.textContent = title;
    const coach = $('#coach');
    coach.hidden = false;
    coach.classList.toggle('done', tutor.done);
    if (tutor.done) {
      $('#coachTitle').textContent = finish.title;
      $('#coachCount').textContent = `${n} of ${n}`;
      $('#coachSay').textContent = finish.say;
      $('#coachSkip').hidden = true;
    } else {
      $('#coachTitle').textContent = step.title;
      $('#coachCount').textContent = `${tutor.at + 1} of ${n}${step.badge ? ' · badge' : ''}`;
      $('#coachSay').textContent = step.say;
      $('#coachSkip').hidden = false;
    }
    // the buttons the step asks for (src/prompt.js): glyphs after the line, the badge in the panel
    let keysEl = $('#coachKeys');
    if (!keysEl) { keysEl = el('span', 'coach-keys'); keysEl.id = 'coachKeys'; $('#coachSay').after(keysEl); }
    keysEl.replaceChildren();
    if (!tutor.done && step.keys) keysEl.append(keyGlyphs(step.keys, { hold: step.hold }));
    const now = $('#learnCoach');
    now.textContent = '';
    art?.stop();
    art = null;
    if (tutor.done) {
      const skipped = tutor.skipped.size;
      now.append(el('b', '', finish.title), finish.note(skipped));
    } else {
      if (step.keys) { const host = el('div', 'prompts'); now.append(host); art = mountPrompt(host, { beats: step.keys, hold: step.hold, frame: 'cap' }); }
      now.append(el('b', '', `${tutor.at + 1}. ${step.title}`), step.say, el('div', 'why', step.why));
    }
    const ol = $('#learnSteps');
    ol.textContent = '';
    let chapter = 0;
    tutor.steps.forEach((s, i) => {
      if (s.chapter !== chapter) {
        chapter = s.chapter;
        if (chapters[chapter]) ol.append(el('li', 'chapter', chapters[chapter]));
      }
      const li = el('li', '', s.title);
      li.value = i + 1;
      if (i < tutor.at) li.classList.add(tutor.skipped.has(s.id) ? 'skipped' : 'done');
      if (i === tutor.at) li.classList.add('now');
      if (s.badge) li.classList.add('badge');
      li.title = s.say;
      li.addEventListener('click', () => { tutor.goto(i); render(); prepare(tutor.step, { show: true, why: 'goto' }); });
      ol.append(li);
    });
    $('#learnProgress').textContent = `${Math.min(tutor.at, n)} / ${n}`;
    $('#learnProgress').style.visibility = 'visible';
    onRender();
  }

  function feed(ev) {
    const s = tutor.feed(ev);
    if (!s) return null;
    $('#learnStatus').textContent = `✓ ${s.title}`;
    $('#learnStatus').className = 'status win';
    render();
    // The next step is prepared after the event that completed this one has
    // been delivered everywhere: a press that finishes a step must not also
    // land on the range or stage the step after it arms. On a phone, follow
    // the tutorial to the next step's panel when it moves on.
    const next = tutor.step;
    queueMicrotask(() => prepare(next, { show: !classic() && (next?.range ?? next?.stage ?? next?.panel) !== (s.range ?? s.stage ?? s.panel), why: 'step' }));
    return s;
  }

  function skip() {
    const s = tutor.skip();
    if (!s) return;
    $('#learnStatus').textContent = `skipped ${s.title}`;
    $('#learnStatus').className = 'status';
    render();
    prepare(tutor.step, { show: true, why: 'skip' });
  }

  $('#coachSkip').addEventListener('click', skip);
  $('#learnSkip').addEventListener('click', skip);
  $('#coachOpen').addEventListener('click', () => {
    if (!classic()) looks.setMode(learnMode);
    else open();
  });
  function restart() {
    tutor.restart();
    $('#learnStatus').textContent = '';
    render();
    prepare(tutor.step, { show: !classic(), why: 'restart' });
  }
  $('#learnRestart').addEventListener('click', restart);

  /** Put another tutorial under the coach: the maker's guided builds share one coach line and one panel. */
  function use(next, opts = {}) {
    tutor = next;
    if (opts.title !== undefined) title = opts.title;
    if (opts.chapters) chapters = opts.chapters;
    if (opts.finish) finish = opts.finish;
    $('#learnStatus').textContent = '';
    render();
    prepare(tutor.step, { show: false, why: 'use' });
  }

  render();
  prepare(tutor.step, { show: false, why: 'mount' });
  return { feed, render, skip, restart, use, get tutor() { return tutor; },
           setLearn, openLearn, get learn() { return { where: html.dataset.learn ?? null, open: 'learnOpen' in html.dataset, wide: WIDE.matches }; } };
}

/** Progress in localStorage under `key`, the store a Tutor takes. */
export const tutorStore = (key) => ({
  load() { try { return +(localStorage.getItem(key) ?? 0) || 0; } catch { return 0; } },
  save(at) { try { localStorage.setItem(key, String(at)); } catch { /* storage may be off */ } },
});
