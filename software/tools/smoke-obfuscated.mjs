// A browser smoke of the obfuscated site: every page in headless Chromium,
// no console or page error, the tea party's autosolve plays, the range
// takes injected edges, the gate comes up under ?gate=1. Development only -
// it needs Playwright, which is not a dependency of this repository (npm i -g
// playwright, or any install that `import('playwright')` resolves), and a
// server over the obfuscated tree:
//
//   mkdir -p /tmp/site && cp -r index.html glitch.html flash.html badge.html styles.css src stages assets rabbit-hole /tmp/site
//   node software/tools/obfuscate.mjs /tmp/site
//   (cd /tmp/site && python3 -m http.server 8099) &
//   node software/tools/smoke-obfuscated.mjs http://localhost:8099
//
// flash.html logs one 404 for firmware/index.json unless the deploy's
// firmware/ is copied in too; that one is ignored here.

let pw;
try { pw = await import('playwright'); } catch { console.error('playwright is not installed; see the note at the top of this file'); process.exit(2); }
const { chromium } = pw.default ?? pw;
const base = process.argv[2] ?? 'http://localhost:8099';

const PAGES = [
  ['index.html?autosolve=tea', 'the tea party solves itself'],
  ['index.html?look=handheld', 'the handheld look'],
  ['glitch.html', 'the range'],
  ['glitch.html?look=scope', 'the scope look'],
  ['flash.html', 'the flasher'],
  ['badge.html', 'the vault page'],
  ['index.html?gate=1', 'the gate'],
];

const browser = await chromium.launch();
let bad = 0;
for (const [page, what] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/firmware\/index\.json|404/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(`${base}/${page}`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({
    look: document.documentElement.dataset.look,
    status: document.querySelector('#stageStatus, #watchStatus')?.textContent?.trim().slice(0, 60),
    pad: !!window.__pad, gate: !!document.querySelector('dialog.gate[open]'),
  }));
  if (page.startsWith('glitch.html')) {
    const r = await p.evaluate(async () => {
      const t = performance.now();
      return { injected: window.__pad.inject('A', true, t) && window.__pad.inject('A', false, t + 30), armed: String(window.__range?.armed) };
    });
    Object.assign(info, r);
    if (!r.injected) errs.push('the pad did not take an injected edge');
  }
  if (page.includes('autosolve')) {
    await p.waitForTimeout(6000);
    info.after = await p.evaluate(() => document.querySelector('#stageStatus')?.textContent?.trim());
    if (!/move \d+ of 106/.test(info.after ?? '')) errs.push(`the tea party did not play: ${info.after}`);
  }
  if (page.includes('gate=1') && !info.gate) errs.push('no gate dialog');
  console.log(`${errs.length ? 'FAIL' : 'ok  '} ${what}: ${JSON.stringify(info)}${errs.length ? '\n     ' + errs.join('\n     ') : ''}`);
  if (errs.length) bad++;
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
