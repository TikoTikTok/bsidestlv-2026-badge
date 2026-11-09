// Records the footage the promo is cut from: every page of the site, served
// from this checkout on localhost, driven through the pages' own test hooks
// and a cursor the page draws itself. Each scene is one MP4 in footage/ plus a
// JSON sidecar with the clicks and the presses (time in seconds from the
// clip's start, x / y in the clip's CSS pixels) the composition's camera and
// badge follow.
//
//   node record.mjs                 everything
//   ONLY=stages,phone node record.mjs    a subset
//   BASE=http://127.0.0.1:8873      the server (python -m http.server in the checkout)
//
// The screencast comes over CDP with each frame's wall-clock stamp and is
// resampled to a steady 30 fps (Playwright's own recorder writes one output
// frame per screencast frame, so a page that redraws every rAF plays slow).
// Playwright is borrowed from a sibling project; Chromium gets
// --no-proxy-server because a proxy may own 8080 on this machine.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://127.0.0.1:8873';
const OUT = path.join(HERE, 'footage');
const ASSETS = path.join(HERE, 'assets');
const FPS = 30;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const DRIVER = fs.readFileSync(path.join(HERE, 'page-driver.js'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ASSETS, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const want = (name) => !ONLY || ONLY.includes(name);
const DESK = { w: 1280, h: 720, dpr: 2 };
const PHONE = { w: 390, h: 844, dpr: 2 };
const THEME = 'bsides';
const DONE = { 'alice.flip.tip': '1', 'alice.tutor': '17', 'alice.tutor.stages': '16' };   // the tutorials done: the coach arms nothing

async function open({ url, w, h, dpr, store = {} }) {
  const browser = await chromium.launch({ args: ['--no-proxy-server', `--force-device-scale-factor=${dpr}`, '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: 'dark' });
  await ctx.addInitScript((kv) => { try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } catch {} }, store);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  console error:', m.text().slice(0, 160)); });
  await page.goto(`${BASE}/${url}`, { waitUntil: 'load' });
  return { browser, ctx, page };
}

/** record one scene: run(api) drives the page while the screencast is written to footage/<name>.mp4 */
async function clip(name, { url, w, h, dpr = 2, store = {}, ready, run }) {
  if (!want(name)) return;
  console.log(`\n=== ${name}  ${url}  ${w}x${h}@${dpr}`);
  const { browser, ctx, page } = await open({ url, w, h, dpr, store: { ...DONE, ...store } });
  if (ready) await ready(page);
  await page.evaluate(DRIVER);
  await page.mouse.move(w * 0.62, h * 0.72);

  const dst = path.join(OUT, `${name}.mp4`);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',   // a keyframe every second: the renderer seeks anywhere
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  let prev = null, nextSlot = null, t0 = null, written = 0, received = 0;
  const fill = (upTo, frame) => { while (nextSlot <= upTo) { ff.stdin.write(frame); written++; nextSlot += 1 / FPS; } };
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const buf = Buffer.from(data, 'base64');
    const ts = metadata?.timestamp ?? Date.now() / 1000;
    received++;
    if (nextSlot === null) { nextSlot = ts; t0 = ts; }
    fill(ts, prev ?? buf);
    prev = buf;
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: w * dpr, maxHeight: h * dpr, everyNthFrame: 1 });
  while (t0 === null) await sleep(20);
  const wall = () => Date.now() / 1000;
  const vt = () => +(wall() - t0).toFixed(3);          // the clip's time now

  const events = [], marks = [];
  let cur = { x: w * 0.62, y: h * 0.72 };
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const api = {
    page, w, h, vt, sleep,
    mark: (label, extra = {}) => { marks.push({ t: vt(), label, ...extra }); console.log(`  ${vt().toFixed(1).padStart(5)}s  ${label}${extra.result ? '  ' + JSON.stringify(extra.result) : ''}`); },
    /** glide the cursor to (x, y) in CSS px over ms, easing out */
    moveTo: async (x, y, ms = 380) => {
      const from = { ...cur };
      events.push({ t: vt(), type: 'move', x: from.x, y: from.y, to: { x, y }, ms });
      await page.evaluate(([x, y, ms]) => window.__hf.glide(x, y, ms), [x, y, ms]);   // the page draws the glide
      await page.mouse.move(x, y);                                                     // the real pointer lands once
      cur = { x, y };
    },
    click: async (x, y, { ms = 380, hold = 90 } = {}) => {
      await api.moveTo(x, y, ms);
      await sleep(120);
      await page.mouse.down();
      events.push({ t: vt(), type: 'click', x, y });
      await sleep(hold);
      await page.mouse.up();
    },
    /** the element's box, after scrolling it to ~70% down the viewport when it is off-screen (what is above it stays in view) */
    box: async (sel) => {
      let b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error(`no box for ${sel}`);
      if (b.y < 56 || b.y + b.height > h - 24) {
        await page.evaluate(([s, o]) => window.__hf.scrollTo(s, o), [sel, { offset: Math.round(h * 0.7) - Math.round(b.height / 2), ms: 450 }]);
        await sleep(80);
        b = await page.locator(sel).first().boundingBox();
      }
      return b;
    },
    centre: async (sel) => { const b = await api.box(sel); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; },
    clickEl: async (sel, opts = {}) => { const c = await api.centre(sel); await api.click(c.x + (opts.dx ?? 0), c.y + (opts.dy ?? 0), opts); },
    hoverEl: async (sel, opts = {}) => { const c = await api.centre(sel); await api.moveTo(c.x + (opts.dx ?? 0), c.y + (opts.dy ?? 0), opts.ms); events.push({ t: vt(), type: 'hover', x: c.x, y: c.y }); },
    scrollTo: async (sel, opts = {}) => { await page.evaluate(([s, o]) => window.__hf.scrollTo(s, o), [sel, opts]); await sleep(60); },
    /** the page's clock against the clip's: presses logged in the page are mapped through it */
    sync: async () => ({ p0: await page.evaluate(() => performance.now()), v0: vt() }),
    presses: async (s) => { const log = await page.evaluate(() => window.__hf.takeLog()); for (const e of log) events.push({ t: +(s.v0 + (e.t - s.p0) / 1000).toFixed(3), type: 'press', button: e.button, down: e.down }); return log.length; },
    hf: (fn, ...args) => page.evaluate(([f, a]) => window.__hf[f](...a), [fn, args]),
  };
  api.mark('start');
  let result = null;
  try { result = await run(api); }
  catch (e) { console.log('  FAILED:', e.message); result = { error: e.message }; }
  api.mark('end');

  await cdp.send('Page.stopScreencast').catch(() => {});
  if (prev) fill(wall(), prev);
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  const duration = +(written / FPS).toFixed(3);
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ name, url, w, h, dpr, fps: FPS, duration, frames: { received, written }, marks, events, result }, null, 1));
  console.log(`  ${duration}s  frames ${received} in / ${written} out  -> ${path.relative(HERE, dst)}`);
  await ctx.close();
  await browser.close();
}

/** a still of a page */
async function still(name, { url, w, h, dpr = 2, store = {}, ready, before }) {
  if (!want('stills')) return;
  const { browser, page } = await open({ url, w, h, dpr, store: { ...DONE, ...store } });
  if (ready) await ready(page);
  await page.evaluate(DRIVER);
  if (before) await before(page);
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  still ${name}.png`);
  await browser.close();
}

const stagesReady = async (page) => {
  await page.waitForFunction(() => window.__stages && window.__pad, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.level-card').length > 3, null, { timeout: 30000 });
  await sleep(600);
};
const rangeReady = async (page) => {
  await page.waitForFunction(() => window.__range?.ready, null, { timeout: 30000 });
  await page.evaluate(() => window.__range.ready);
  await sleep(400);
};
const cardFor = (name) => `.level-card:has(b:text-is("${name}"))`;

const FIRST_LESSON = 'S E S W S S E N N N E E E S S S E E N'.split(' ');   // par 19, src/puzzle.js on the room

// --------------------------------------------------------------------- the gate --
await clip('gate', { url: `index.html?gate=1&look=classic&theme=${THEME}`, ...DESK,
  ready: async (page) => { await page.waitForSelector('#gateConnect', { timeout: 30000 }); await sleep(900); },
  run: async (a) => {
    await a.sleep(1800);
    await a.hoverEl('#gateConnect', { ms: 600 });
    a.mark('connect');
    await a.sleep(1600);
    await a.hoverEl('dialog.gate .badge-art', { ms: 500 }).catch(() => {});
    a.mark('beacon');
    await a.sleep(2200);
  } });

// ------------------------------------------------------------------- the stages --
await clip('stages', { url: `index.html?look=classic&theme=${THEME}&room=tea-party`, ...DESK, ready: stagesReady,
  run: async (a) => {
    await a.page.waitForFunction(() => window.__stages.par?.['the-first-lesson'] != null, null, { timeout: 15000 }).catch(() => {});
    await a.sleep(1600);
    await a.scrollTo('#levelsPanel', { offset: 10, ms: 700 });
    a.mark('levels');
    await a.sleep(900);
    await a.hoverEl(cardFor("The Queen's Gauntlet"), { ms: 500 });
    await a.sleep(500);
    await a.hoverEl(cardFor('Tick Tock'), { ms: 450 });
    await a.sleep(500);
    await a.clickEl(cardFor('The First Lesson'), { ms: 500 });
    a.mark('open-first-lesson');
    await a.sleep(500);
    // the room whole, its lesson line above it: the room's bottom a little above the fold
    const roomInView = async () => { const rh = await a.page.evaluate(() => document.querySelector('#room').getBoundingClientRect().height); await a.scrollTo('#room', { offset: Math.max(8, a.h - rh - 56), ms: 600 }); };
    await roomInView();
    await a.sleep(700);
    const s = await a.sync();
    a.mark('play');
    await a.hf('playMoves', FIRST_LESSON, { gap: 240, hold: 70 });
    await a.presses(s);
    a.mark('won', { result: { won: await a.page.evaluate(() => !!window.__stages.room?.won) } });
    await a.sleep(2600);
    await a.scrollTo('#prizes', { offset: 60, ms: 700 });
    a.mark('prizes');
    await a.sleep(2200);
    await a.scrollTo('#levelsPanel', { offset: 10, ms: 600 });
    await a.sleep(400);
    await a.clickEl(cardFor('A Mad Tea Party'), { ms: 500 });
    a.mark('open-tea');
    await roomInView();
    await a.sleep(500);
    await a.clickEl('#roomSolve', { ms: 450 });
    a.mark('solve');
    await a.sleep(8000);
  } });

// -------------------------------------------------------------------- the phone --
await clip('phone', { url: `index.html?look=handheld&theme=${THEME}&room=the-first-lesson`, ...PHONE, ready: stagesReady,
  run: async (a) => {
    await a.page.mouse.move(-10, -10);     // no cursor on a phone
    await a.sleep(1400);
    const s = await a.sync();
    a.mark('play');
    await a.hf('playMoves', FIRST_LESSON, { gap: 420, hold: 150 });
    await a.presses(s);
    a.mark('won', { result: { won: await a.page.evaluate(() => !!window.__stages.room?.won) } });
    await a.sleep(2800);
  } });

// -------------------------------------------------------------------- the range --
await clip('range', { url: `glitch.html?look=classic&theme=${THEME}`, ...DESK, ready: rangeReady,
  run: async (a) => {
    const tabs = await a.page.evaluate(() => window.__range.tabs());
    const first = (kind, wanted) => (tabs[kind].includes(wanted) ? wanted : tabs[kind][0]);
    const show = async (kind) => { await a.scrollTo(`#${kind}Panel`, { offset: 8, ms: 600 }); await a.sleep(300); await a.clickEl(`#${kind}Tabs .tab`, { ms: 400 }); await a.sleep(500); };
    await a.sleep(800);
    await show('watch');
    a.mark('watch', { result: await a.hf('watch', first('watch', 'tea-time'), 450, 40) });
    await show('glass');
    a.mark('glass', { result: await a.hf('glass', first('glass', 'sleepy')) });
    await show('lock');
    a.mark('lock', { result: await a.hf('lock', first('lock', 'who'), { gap: 170, pause: 350, maxSubs: 7 }) });
    await show('dog');
    a.mark('dog', { result: await a.hf('dog', first('dog', 'forty-winks'), { gap: 750, jitter: 60 }) });
    await show('wall');
    a.mark('wall', { result: await a.hf('wall', first('wall', 'pleased'), { gap: 800, pause: 600, name: ['A', 'A', 'A', 'A', 'UP', 'RIGHT'] }) });
    await a.sleep(600);
  } });

// ----------------------------------------------------------------- the tutorial --
await clip('tutorial', { url: `glitch.html?look=classic&theme=${THEME}`, ...DESK, store: { 'alice.tutor': '0' }, ready: rangeReady,
  run: async (a) => {
    await a.page.evaluate(() => { const st = document.createElement('style'); st.textContent = '#coach { display: flex !important; }'; document.head.append(st); });
    await a.scrollTo('#learnPanel', { offset: 8, ms: 500 });
    await a.sleep(1500);
    a.mark('wake');
    await a.hf('tap', 'A', 60); await a.sleep(1500);
    await a.hf('tap', 'START', 60); await a.sleep(1200);
    const seq = await a.page.evaluate(() => window.__range.combo?.sequence ?? []);
    a.mark('tune', { result: { seq } });
    for (const b of seq) { await a.hf('tap', b, 60); await a.sleep(420); }
    await a.sleep(2200);
  } });

// -------------------------------------------------------------------- the maker --
await clip('maker', { url: `maker.html?look=classic&theme=${THEME}`, ...DESK, dpr: 1.5,     // the heaviest page: 1.5x keeps the screencast near 20 fps
  ready: async (page) => { await page.waitForFunction(() => window.__maker?.dev, null, { timeout: 30000 }); await sleep(800); },
  run: async (a) => {
    const isOpen = await a.page.evaluate(() => document.querySelector('#openDialog')?.open);
    if (!isOpen) await a.page.evaluate(() => window.__maker.openLevel());
    await a.sleep(1200);
    a.mark('picker');
    await a.clickEl('#openNew .open-pick', { ms: 550 });
    await a.sleep(600);
    await a.scrollTo('#editPanel', { offset: 8, ms: 500 });
    await a.sleep(500);
    // paint by hand: a wall with a gap, a rock, its button
    const cell = async (x, y) => { const b = await a.box('#board'); const { w, h } = await a.page.evaluate(() => { const l = window.__maker.level; return { w: l.rows[0].length, h: l.rows.length }; }); return { x: b.x + (x + 0.5) * b.width / w, y: b.y + (y + 0.5) * b.height / h }; };
    const paint = async (ch, cells) => { await a.clickEl(`.brush[data-ch="${ch}"]`, { ms: 350 }); for (const [x, y] of cells) { const c = await cell(x, y); await a.click(c.x, c.y, { ms: 220, hold: 60 }); } };
    a.mark('paint');
    await paint('#', [[4, 1], [4, 2], [4, 4], [4, 5]]);
    await paint('O', [[2, 3]]);
    await paint('b', [[6, 3]]);
    await a.sleep(400);
    await a.clickEl('#checkBtn', { ms: 450 });
    a.mark('check');
    await a.page.waitForFunction(() => /move|par|solv/i.test(document.querySelector('#verdict')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    await a.sleep(1800);
    await a.clickEl('#playBtn', { ms: 450 });
    a.mark('run');
    await a.sleep(900);
    await a.scrollTo('#run', { offset: 120, ms: 500 });     // in the classic look the room plays in the editor (the rig), #playPanel itself is hidden
    await a.sleep(300);
    await a.clickEl('#solveBtn', { ms: 400 });
    a.mark('solution');
    await a.sleep(4500);
    await a.clickEl('#editBtn', { ms: 400 });
    await a.sleep(500);
    await a.scrollTo('#exportPanel', { offset: 8, ms: 500 });
    await a.sleep(400);
    await a.clickEl('#prBtn', { ms: 450 });
    a.mark('pr');
    await a.sleep(2600);
    await a.clickEl('#aiClose', { ms: 350 }).catch(() => a.page.keyboard.press('Escape'));
    await a.sleep(400);
    await a.page.evaluate(() => window.__maker.guide.show());
    a.mark('guide');
    await a.sleep(700);
    await a.hoverEl('#guidePicks button, #guidePicks .guide-pick, #guidePicks > *', { ms: 500 }).catch(() => {});
    await a.sleep(2400);
  } });

// -------------------------------------------------------------------- the flash --
await clip('flash', { url: `flash.html?theme=${THEME}`, ...DESK,
  ready: async (page) => { await page.waitForSelector('#bootPrompts .badge-art', { timeout: 30000 }); await sleep(600); },
  run: async (a) => {
    await a.sleep(1200);
    await a.hoverEl('#bootPrompts .badge-art', { ms: 600 });
    a.mark('boot');
    await a.sleep(3800);
    await a.hoverEl('#flashBtn', { ms: 600 }).catch(() => {});
    a.mark('flash');
    await a.sleep(3000);
  } });

// -------------------------------------------------------------------- the vault --
await clip('vault', { url: `badge.html?theme=${THEME}`, ...DESK,
  ready: async (page) => { await page.waitForSelector('#connectBtn', { timeout: 30000 }); await sleep(600); },
  run: async (a) => { await a.sleep(1200); await a.hoverEl('#connectBtn', { ms: 600 }); a.mark('connect'); await a.sleep(2600); } });

// ------------------------------------------------------------------- the stills --
for (const theme of ['bsides', 'classic', 'teaparty', 'queen', 'cheshire', 'phosphor'])
  await still(`theme-${theme}`, { url: `index.html?look=classic&theme=${theme}&room=the-first-lesson`, ...DESK, ready: stagesReady });
for (const look of ['bench', 'handheld', 'scope'])
  await still(`look-${look}`, { url: `glitch.html?look=${look}&theme=${THEME}`, ...PHONE, ready: rangeReady,
    before: async (page) => { await page.evaluate(() => { document.querySelector('nav.modes .mode[data-mode=glass]')?.click(); window.__range.arm('glass'); }); } });
await still('flip', { url: `index.html?look=handheld&theme=${THEME}&room=the-first-lesson`, ...PHONE, ready: stagesReady,
  before: async (page) => { await page.evaluate(() => { document.documentElement.dataset.flip = '180'; }); } });

// ---------------------------------------------------------------- the badge art --
if (want('badge')) {
  const { browser, page } = await open({ url: `flash.html?theme=${THEME}`, ...DESK });
  await page.waitForSelector('#bootPrompts .badge-art', { timeout: 30000 });
  await page.evaluate(DRIVER);
  const art = await page.evaluate(() => window.__hf.badgeSvg());
  fs.writeFileSync(path.join(ASSETS, 'badge.svg'), art.svg);
  fs.writeFileSync(path.join(ASSETS, 'badge-theme.json'), JSON.stringify(art.vars, null, 1));
  console.log(`\n  badge.svg ${art.svg.length} bytes, theme vars`, Object.keys(art.vars).length);
  await browser.close();
}
console.log('\ndone');
