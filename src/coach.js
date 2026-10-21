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
//   const coach = mountCoach(tutor, {
//     looks,                       // from initLooks(): the phone looks' mode bar
//     chapters: { 1: 'Chapter one · by hand', 2: 'Chapter two · the badge' },
//     finish: { title, say, note },// what the coach and the panel say when every step is done
//     prepare(step, { show }),     // a step came up; show: put its panel on screen too
//     learnMode: 'learn',          // the mode bar's name for the Learn panel
//   });
//   coach.feed(ev);                // every event the page produces; renders on a completed step
//   coach.render();

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function mountCoach(tutor, { looks, chapters = {}, finish, prepare = () => {}, learnMode = 'learn' } = {}) {
  const n = tutor.steps.length;
  const classic = () => !looks || looks.look.id === 'classic';

  function render() {
    const step = tutor.step;
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
    const now = $('#learnCoach');
    now.textContent = '';
    if (tutor.done) {
      const skipped = tutor.skipped.size;
      now.append(el('b', '', finish.title), finish.note(skipped));
    } else {
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
      li.addEventListener('click', () => { tutor.goto(i); render(); prepare(tutor.step, { show: true }); });
      ol.append(li);
    });
    $('#learnProgress').textContent = `${Math.min(tutor.at, n)} / ${n}`;
    $('#learnProgress').style.visibility = 'visible';
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
    queueMicrotask(() => prepare(next, { show: !classic() && (next?.range ?? next?.stage) !== (s.range ?? s.stage) }));
    return s;
  }

  function skip() {
    const s = tutor.skip();
    if (!s) return;
    $('#learnStatus').textContent = `skipped ${s.title}`;
    $('#learnStatus').className = 'status';
    render();
    prepare(tutor.step, { show: true });
  }

  $('#coachSkip').addEventListener('click', skip);
  $('#learnSkip').addEventListener('click', skip);
  $('#coachOpen').addEventListener('click', () => {
    if (!classic()) looks.setMode(learnMode);
    else $('#learnPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#learnRestart').addEventListener('click', () => {
    tutor.restart();
    $('#learnStatus').textContent = '';
    render();
    prepare(tutor.step, { show: !classic() });
  });

  render();
  prepare(tutor.step, { show: false });
  return { feed, render, skip };
}

/** Progress in localStorage under `key`, the store a Tutor takes. */
export const tutorStore = (key) => ({
  load() { try { return +(localStorage.getItem(key) ?? 0) || 0; } catch { return 0; } },
  save(at) { try { localStorage.setItem(key, String(at)); } catch { /* storage may be off */ } },
});
