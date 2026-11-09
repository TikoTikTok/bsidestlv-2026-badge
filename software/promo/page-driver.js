// The in-page half of record.mjs: evaluated in every page the promo records.
//
// It adds a cursor the screencast can see (the OS pointer is not in a CDP
// screencast), a click ripple, a smooth scroll, and drives the pages through
// their own test hooks - window.__pad.inject on a dev host, window.__range,
// window.__stages - logging every press with its performance.now() stamp so
// the composition can light the badge in step. Nothing in the repository
// changes: this is DOM added to a page served from a local checkout.
(() => {
  const now = () => performance.now();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // wait for an absolute performance.now(): a timer, then spin the last couple of ms
  const until = async (t) => { const d = t - now(); if (d > 4) await sleep(d - 3); while (now() < t) { /* spin */ } };
  const $ = (s) => document.querySelector(s);

  // ----------------------------------------------------------- the overlay --
  const style = document.createElement('style');
  style.textContent = `
    #coach, #touchPad, #turnBtn { display: none !important; }
    html { scroll-behavior: auto !important; }
    /* a backdrop blur costs the software rasterizer most of its frames at 2x (the gate's: 5 fps); the tint stays */
    *, ::backdrop { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
    #hfCursor { position: fixed; left: 0; top: 0; inset: auto; margin: 0; padding: 0; border: 0; background: transparent;
      overflow: visible; width: 28px; height: 28px; pointer-events: none; z-index: 2147483647; display: none;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
    #hfCursor:popover-open { display: block; }
    #hfCursor svg { display: block; width: 28px; height: 28px; transform-origin: 5px 3px; }
    #hfCursor.down svg { transform: scale(.88); }
    #hfCursor path { fill: #fff; stroke: #141414; stroke-width: 1.4; stroke-linejoin: round; }
    #hfCursor .ripple { position: absolute; left: 5px; top: 3px; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
      border: 2.5px solid var(--accent, #a3e635); opacity: 0; animation: hfRipple .55s ease-out forwards; }
    @keyframes hfRipple { from { transform: scale(.6); opacity: .95 } to { transform: scale(4.2); opacity: 0 } }
  `;
  document.head.append(style);

  // The cursor is a manual popover: a modal <dialog> paints in the top layer
  // over any z-index, and the top layer stacks in opening order, so the cursor
  // is re-shown whenever a dialog opens and stays on top of it.
  const cur = document.createElement('div');
  cur.id = 'hfCursor';
  cur.setAttribute('popover', 'manual');
  cur.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3 L5 19 L9 15 L12 22 L15 20.5 L11.5 14 L18 14 Z"/></svg>';
  document.body.append(cur);
  let shown = false;
  const lift = () => { try { if (cur.matches(':popover-open')) cur.hidePopover(); cur.showPopover(); shown = true; } catch { cur.style.display = 'block'; } };
  let at = { x: innerWidth * 0.62, y: innerHeight * 0.72 };
  const place = (x, y) => { at = { x, y }; cur.style.transform = `translate(${x - 5}px, ${y - 3}px)`; };
  addEventListener('mousemove', (e) => { if (!shown) lift(); place(e.clientX, e.clientY); }, true);
  /** glide the cursor to (x, y) over ms, eased out - driven here so a busy renderer never stretches it */
  const glide = (x, y, ms = 380) => new Promise((resolve) => {
    if (!shown) lift();
    const from = { ...at }, t0 = now();
    const step = () => {
      const p = Math.min(1, (now() - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      place(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      if (p < 1) setTimeout(step, 16); else resolve();
    };
    step();
  });
  addEventListener('mousedown', () => {
    cur.classList.add('down');
    const r = document.createElement('span'); r.className = 'ripple'; cur.append(r);
    setTimeout(() => r.remove(), 600);
  }, true);
  addEventListener('mouseup', () => cur.classList.remove('down'), true);
  new MutationObserver((muts) => { for (const m of muts) if (m.target.open) { lift(); break; } })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

  /** scroll the window so `sel` sits `offset` px under the top, eased over `ms` */
  const scrollTo = (sel, { offset = 12, ms = 500 } = {}) => new Promise((resolve) => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return resolve(false);
    const from = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const to = Math.max(0, Math.min(max, from + el.getBoundingClientRect().top - offset));
    const t0 = now();
    const ease = (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const step = () => {
      const p = Math.min(1, (now() - t0) / ms);
      scrollTo_(from + (to - from) * ease(p));
      if (p < 1) requestAnimationFrame(step); else resolve(true);
    };
    const scrollTo_ = (y) => window.scrollTo(0, y);
    requestAnimationFrame(step);
  });

  // --------------------------------------------------------------- the pad --
  const pad = () => window.__pad;
  const log = [];
  const down = (b, t = now()) => { pad().inject(b, true, t); log.push({ t, button: b, down: true }); };
  const up = (b, t = now()) => { pad().inject(b, false, t); log.push({ t, button: b, down: false }); };
  const pressAt = async (b, t, hold) => { await until(t); down(b, t); await until(t + hold); up(b, t + hold); };
  const tap = async (b, hold = 40) => { down(b); await sleep(hold); up(b); };
  const takeLog = () => log.splice(0, log.length);

  /** a room's moves (N S W E wait) as d-pad presses, `gap` ms apart, each held `hold` ms */
  const MOVE_KEY = { N: 'UP', S: 'DOWN', W: 'LEFT', E: 'RIGHT', wait: 'Y' };
  async function playMoves(moves, { gap = 230, hold = 70 } = {}) {
    let t = now() + 60;
    for (const m of moves) { await pressAt(MOVE_KEY[m] ?? m, t, hold); t += gap; }
  }

  // ------------------------------------------------------------- the range --
  // The players of the five ranges, as the solution video drove them.
  const R = () => window.__range;
  const waitFor = async (test, maxMs = 6000, every = 10) => {
    const deadline = now() + maxMs;
    while (!test()) { if (now() > deadline) return false; await sleep(every); }
    return true;
  };
  const level = async (kind, id) => {
    if (!R().select(kind, id)) throw new Error(`no level ${kind}:${id}`);
    await sleep(300);
  };
  async function watch(id, gap, jitter = 0) {
    await level('watch', id);
    const seq = R().combo.sequence;
    const hold = Math.max(15, Math.min(gap * 0.45, 110));
    let r = null;
    for (let attempt = 0; attempt < 3 && !r?.win; attempt++) {
      if (attempt) await sleep(700);
      let t = now() + 60;
      for (let i = 0; i < seq.length; i++) {
        await pressAt(seq[i], t, hold);
        t += gap + (jitter ? ((i % 2 ? 1 : -1) * (i % 3) / 2) * jitter : 0);
      }
      r = R().combo.result;
    }
    await sleep(1600);
    return { id, seq, win: r?.win, ms: Math.round(r?.ms ?? -1) };
  }
  async function glassRun(offset, width) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const t0 = now() + 40;
      await pressAt('START', t0, 25);
      await pressAt('X', t0 + offset, width);
      await waitFor(() => R().run?.result, 4000);
      if (R().run?.result && R().run.result.verdict !== 'denied') return R().run.result;
      await sleep(700);
    }
    return R().run?.result ?? { verdict: 'denied', deltaLines: null };
  }
  async function glass(id, { offset = null } = {}) {
    await level('glass', id);
    const L = R().level('glass');
    const width = Math.max(10, Math.round(L.lineMs * 0.6));
    const o = offset ?? (L.targetStartMs + L.targetEndMs) / 2;
    const r = await glassRun(o, width);
    await sleep(r.verdict === 'skip' ? 2600 : 1400);
    return { id, offset: o, verdict: r.verdict, deltaLines: r.deltaLines };
  }
  async function lockSubmit(guess, gap, pause) {
    const lock = R().lock;
    await tap('START', Math.min(30, gap / 2));
    await sleep(gap - Math.min(30, gap / 2));
    for (const s of guess) { await tap(s, Math.min(gap / 2, 60)); await sleep(gap - Math.min(gap / 2, 60)); }
    await waitFor(() => !lock.waiting && !lock.entering, 6000);
    const ms = +$('#lrMs').textContent;
    await sleep(pause);
    return { ms, win: lock.opened };
  }
  // the prefix attack on a quiet clock: the next position to fix is the run so far
  async function lock(id, { gap = 170, pause = 400, maxSubs = 8 } = {}) {
    await level('lock', id);
    const L = R().level('lock'), lk = R().lock;
    const tick = L.tickMs;
    const guess = Array(L.length).fill(L.pool[0]);
    let subs = 0, m = await lockSubmit(guess, gap, pause); subs++;
    let run = Math.max(0, Math.round(m.ms / tick) - 2);
    while (!m.win && run < L.length && subs < maxSubs) {
      const pos = run;
      let found = false;
      for (const sym of L.pool) {
        if (sym === guess[pos]) continue;
        const was = guess[pos]; guess[pos] = sym;
        m = await lockSubmit(guess, gap, pause); subs++;
        if (m.win) return { id, subs, win: true, guess };
        const got = Math.round(m.ms / tick) - 2;
        if (got > run) { run = got; found = true; break; }
        guess[pos] = was;
        if (subs >= maxSubs) break;
      }
      if (!found) break;
    }
    return { id, subs, win: lk.opened, guess };
  }
  async function dog(id, { gap = null, jitter = 0 } = {}) {
    await level('dog', id);
    const L = R().level('dog');
    const G = gap ?? (L.openMs + L.timeoutMs) / 2;
    const hold = Math.max(15, Math.min(G / 3, 80));
    let r = null;
    for (let attempt = 0; attempt < 3 && !r?.win; attempt++) {
      if (attempt) await sleep(900);
      const t0 = now() + 40;
      await pressAt('START', t0, 25);
      let t = t0;
      for (let i = 0; i < L.kicks; i++) {
        t += G + (jitter ? ((i % 2 ? 1 : -1) * ((i % 3) + 1) / 3) * jitter : 0);
        await pressAt(L.button, t, hold);
        if (R().dog.result) break;
      }
      await waitFor(() => R().dog.result, 3000);
      r = R().dog.result;
    }
    await sleep(1800);
    return { id, win: r?.win, verdict: r?.verdict };
  }
  async function wallName(symbols, gap, pause) {
    const wall = R().wall;
    const spacing = Math.min(gap * 0.4, 320), hold = Math.max(15, Math.min(spacing * 0.45, 110));
    for (let attempt = 0; attempt < 3; attempt++) {
      let t = now() + 40;
      await pressAt('START', t, Math.min(25, hold));
      for (const s of symbols) { t += spacing; await pressAt(s, t, hold); }
      await waitFor(() => !wall.listening && wall.result, 6000);
      const r = wall.result;
      if (r?.length === symbols.length) { await sleep(pause); return r; }
      await sleep(700);
    }
    return wall.result;
  }
  async function wall(id, { gap = 800, pause = 600, name }) {
    await level('wall', id);
    const r = await wallName(name, gap, pause);
    await sleep(1200);
    return { id, win: r?.win, verdict: r?.verdict };
  }

  // --------------------------------------------------------- the badge art --
  /** the badge drawn by src/prompt.js, as markup, with the theme's colours resolved */
  async function badgeSvg() {
    const P = await import('./src/prompt.js');
    const svg = P.badgeArt({ frame: 'full' });
    const cs = getComputedStyle(document.documentElement);
    const vars = {};
    for (const v of ['well', 'line', 'panel-2', 'dim', 'accent', 'accent-2', 'on-accent', 'glow', 'ink-2', 'text', 'font', 'font-display', 'ink', 'panel'])
      vars[v] = cs.getPropertyValue(`--${v}`).trim();
    return { svg: svg.outerHTML, vars, keys: Object.keys(P.KEYWORDS ?? {}) };
  }

  window.__hf = { sleep, now, scrollTo, glide, tap, down, up, pressAt, playMoves, takeLog, level, watch, glass, lock, dog, wall, badgeSvg, waitFor, lift };
})();
