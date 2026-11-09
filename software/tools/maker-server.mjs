// Alice in AI Land - the level maker's server: the checkout as static files,
// and the bridge an assistant drives the studio through.
//
//   import { startMaker } from './maker-server.mjs';
//   const { url, close } = await startMaker({ root, port: 8080 });
//
// The static part is what GitHub Pages would serve (the repository root,
// the media types the pages expect, no listings, no writes). The bridge is
// everything under /__maker/, on the loopback interface only:
//
//   the page (src/bridge.js, a dev host only)
//     GET  /__maker/events        an SSE stream of commands { id, op, args }; the page runs
//                                 each one in the studio and answers on /__maker/reply
//     POST /__maker/reply         { id, result } | { id, error }
//     POST /__maker/state         a mirror of the room (level, lint, report, game, tutorial) after every change
//     POST /__maker/post          { text, kind?, data? }: a line the person typed in the page's chat
//                                 (kind 'chat'), or an event the page reports (kind 'tutorial': a step done)
//     POST /__maker/guide         { mode, from: 'page' }: the person picked a way on the welcome banner;
//                                 { answer, at, from: 'page' }: they pressed one of the question's buttons on the page;
//                                 { help: true, run: true, at, from: 'page' }: they pressed "Do it for me" there
//                                 (the bridge shows every step of the guide on the page too, op 'ask' - the line, the
//                                 why, what the assistant does, the question's buttons, Do it for me - so the person
//                                 follows and answers there or in the assistant's chat, whichever comes first)
//
//   an assistant (curl, or software/tools/maker-mcp.mjs)
//     GET  /__maker/              status: is a page open, which assistants said hello, the ops, the guide
//     POST /__maker/hello         { name }: announce yourself; the page shows it and pops the welcome banner
//     POST /__maker/rpc           { op, args?, timeoutMs? } -> the page's answer (503 with no page open)
//     GET  /__maker/inbox?since=N&wait=MS    what the person typed (and the guide's events) after message N, long-polled
//     GET  /__maker/level         the mirrored room (what the page last reported)
//     PUT  /__maker/level         a room -> rpc 'set'
//     GET  /__maker/guide         the White Rabbit's guide (src/guide.js): which way the person picked and
//                                 the current step as instructions - what to say, ask and do, and when it is
//                                 done; ?wait=MS waits for the pick; ?mode=&step= previews a step; ?platform=
//                                 words the ask for that assistant; ?platforms=1 lists what each assistant has
//     POST /__maker/guide         drive it: { mode } picks a way (the page follows), { answer } passes the
//                                 person's answer (the guide decides: next, again, help, why), { run: true }
//                                 runs the step's ops through the page, { help: true, run? } the help plan,
//                                 { next | back | restart: true }, { step: N }, { vars: {...} }, { show: true }
//                                 (the banner again), { platform }
//     GET  /__maker/platforms     what each assistant platform has: how it connects, asks, runs the maker
//
// The ops are the page's (src/maker.js, `ops`): get, set, patch, paint, check,
// play, stop, reset, press, moves, say, snapshot, module, load, generate,
// tool, share (a link that carries the room), pr (the pull request's brief),
// tutorial (the guided builds), guide (the welcome banner), ask (the guide's
// question as a card with buttons). A request is
// refused unless its Host is the loopback and, when it carries an Origin,
// that Origin is this server: no page on the web can reach it.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { GUIDE_IDS, GUIDE_MODES, PLATFORMS, modeById, guideStep, guideText, guideWelcome, applyAnswer, boardLine } from '../../src/guide.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.uf2': 'application/octet-stream', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

export const OPS = ['get', 'set', 'patch', 'paint', 'check', 'play', 'stop', 'reset', 'press', 'moves', 'say', 'snapshot', 'module', 'load', 'generate', 'tool', 'share', 'pr', 'tutorial', 'guide', 'ask'];
/** How long the page may take over each op before the bridge gives up (ms); the default is 30 s. */
const OP_TIMEOUT = { check: 90_000, generate: 120_000, moves: 120_000 };

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const json = (res, code, body) => {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) });
  res.end(text);
};
const readBody = (req, max = 4 << 20) => new Promise((ok, fail) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > max) { fail(Object.assign(new Error('body too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { fail(Object.assign(new Error('the body is not JSON'), { code: 400 })); } });
  req.on('error', fail);
});

/**
 * What the checkout's remotes say about where a room would land: the fork
 * (origin, as owner/repo), the upstream, the login and the fork's page. Best
 * effort - no git, no remotes, no answers - and the guide fills its gaps.
 */
export function repoFacts(root) {
  const url = (name) => { try { return execFileSync('git', ['-C', root, 'config', '--get', `remote.${name}.url`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim(); } catch { return ''; } };
  const slug = (u) => { const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(u); return m ? `${m[1]}/${m[2]}` : null; };
  const fork = slug(url('origin')), upstream = slug(url('upstream')) ?? fork;
  const login = fork?.split('/')[0] ?? null;
  return {
    fork, upstream, login,
    page: fork ? `https://${login}.github.io/${fork.split('/')[1]}/` : null,
    repo: upstream ? `https://github.com/${upstream}` : null,
  };
}

/**
 * Open a page in the person's default browser through the system opener. The
 * last resort: an assistant opens the page in its own browser pane first (the
 * one the person sees beside its chat), and only one without a pane comes
 * here. Quiet on failure - the address is printed either way.
 */
export function openInBrowser(page) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', page]]
            : process.platform === 'darwin' ? ['open', [page]] : ['xdg-open', [page]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); return true; } catch { return false; }
}

/** The bridge's state and handlers, apart from the HTTP so a test can hold it. `url` is where the page is served (set once the server listens). */
export function createBridge({ log = () => {}, facts = {}, url = null } = {}) {
  let base = url;                          // http://localhost:<port>, for the guide's "open the page" line
  const pages = new Set();                 // SSE responses of open pages
  const pending = new Map();               // command id -> { resolve, timer }
  const agents = new Map();                // name -> last seen (ms)
  const inbox = [];                        // { n, text, at, kind, data? }: the person typed, or the page / the guide reported
  const waiters = new Set();               // long-polls on the inbox
  const guideWaiters = new Set();          // long-polls on the guide's pick
  const guide = { mode: null, at: 0, vars: {}, by: null, pickedAt: 0, platform: null, last: null, told: null };
  let nextId = 1, nextN = 1, mirror = null, mirrorAt = 0;

  const send = (cmd) => { const line = `data: ${JSON.stringify(cmd)}\n\n`; for (const res of pages) res.write(line); };
  const status = () => ({
    bridge: 1, page: pages.size > 0, pages: pages.size, ops: OPS,
    agents: [...agents].map(([name, at]) => ({ name, seenMs: Date.now() - at })),
    inbox: nextN - 1, mirrorAt, mirror: mirror ? { name: mirror.level?.name, kind: mirror.kind, ok: mirror.report?.ok ?? null, tutorial: mirror.tutorial ?? null } : null,
    guide: { mode: guide.mode, at: guide.mode ? guideAt() : 0, modes: GUIDE_IDS, url: '/__maker/guide' },
    repo: facts,
  });

  function rpc(op, args = {}, { timeoutMs } = {}) {
    if (!OPS.includes(op)) return Promise.reject(Object.assign(new Error(`no such op: ${op}; the ops are ${OPS.join(', ')}`), { code: 400 }));
    if (!pages.size) return Promise.reject(Object.assign(new Error(`no maker page is open: open ${base ?? 'http://localhost:<port>'}/maker.html in your own browser pane first, or in the person's browser (npm run maker opens it; over MCP, maker_open { browser: true })`), { code: 503 }));
    const id = nextId++;
    const ms = timeoutMs ?? OP_TIMEOUT[op] ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error(`the page did not answer '${op}' in ${ms} ms`), { code: 504 })); }, Math.min(Math.max(1000, ms), 120_000));
      pending.set(id, { resolve, reject, timer });
      send({ id, op, args });
    });
  }
  function reply({ id, result, error }) {
    const p = pending.get(id);
    if (!p) return false;
    pending.delete(id); clearTimeout(p.timer);
    if (error !== undefined) p.reject(Object.assign(new Error(String(error)), { code: 422 })); else p.resolve(result ?? null);
    return true;
  }
  function post(text, { kind = 'chat', data } = {}) {
    const m = { n: nextN++, text: String(text), at: Date.now(), kind: String(kind) };
    if (data !== undefined) m.data = data;
    inbox.push(m); while (inbox.length > 500) inbox.shift();
    for (const w of waiters) w();
    return m;
  }
  function read(since = 0, wait = 0) {
    const have = () => inbox.filter(m => m.n > since);
    if (have().length || wait <= 0) return Promise.resolve(have());
    return new Promise((ok) => {
      const timer = setTimeout(() => { waiters.delete(wake); ok(have()); }, Math.min(wait, 25_000));
      const wake = () => { clearTimeout(timer); waiters.delete(wake); ok(have()); };
      waiters.add(wake);
    });
  }
  function attach(res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`data: ${JSON.stringify({ op: 'hello', args: { agents: [...agents.keys()], guide: guide.mode } })}\n\n`);
    pages.add(res);
    if (guide.mode) { guide.told = null; setTimeout(() => tellPage(), 300); }   // a page that (re)opens mid-way gets the current question
    const beat = setInterval(() => res.write(': beat\n\n'), 15_000);
    res.on('close', () => { clearInterval(beat); pages.delete(res); log(`page gone (${pages.size} open)`); });
    log(`page attached (${pages.size} open)`);
  }
  function hello(name) {
    name = String(name || 'an assistant').slice(0, 48);
    agents.set(name, Date.now());
    send({ op: 'hello', args: { name, agents: [...agents.keys()], guide: guide.mode } });
    log(`${name} said hello`);
    return { ...status(), guide: { ...status().guide, text: guide.mode ? guideText(guide.mode, guideAt(), ctx()) : guideWelcome(ctx()) } };
  }
  function state(body) { mirror = body; mirrorAt = Date.now(); }

  // ------------------------------------------------------------- the guide ----
  // src/guide.js is the playbook; this is its state: the way picked, the step,
  // the answers so far (vars). On "Follow the White Rabbit" the step is the
  // page's own - the tutorial the mirror reports - until the page's build is
  // done; then the two closing steps are the bridge's.

  const ctx = (extra = {}) => ({
    vars: guide.vars, level: mirror?.level ?? null, lint: mirror?.lint ?? null, report: mirror?.report ?? null, tutorial: mirror?.tutorial ?? null,
    assistant: [...agents.keys()].at(-1) ?? null, platform: guide.platform, url: base, ...facts, ...extra,
  });
  const pageSteps = () => (guideStep('tutorial', 0, ctx())?.of ?? 14) - 2;    // the Rabbit's steps that are the page's
  /** The room and the tutorial's position straight from the page when one is open, so the guide never trails the mirror. */
  async function refresh() {
    if (!pages.size) return;
    try {
      const g = await rpc('get', {}, { timeoutMs: 5000 });
      if (g && typeof g === 'object') { mirror = { ...(mirror ?? {}), level: g.level ?? mirror?.level ?? null, lint: g.lint ?? mirror?.lint ?? null, report: g.report ?? null, game: g.game ?? null, tutorial: g.tutorial ?? mirror?.tutorial ?? null, kind: g.kind ?? mirror?.kind }; mirrorAt = Date.now(); }
    } catch { /* the mirror will do */ }
  }
  function guideAt() {
    if (guide.mode !== 'tutorial') return guide.at;
    const t = mirror?.tutorial;
    const onPage = t && t.id === modeById('tutorial').tutorial ? Math.min(t.at, pageSteps()) : 0;
    return onPage < pageSteps() ? onPage : Math.max(pageSteps(), guide.at);
  }
  function view(extra = {}) {
    const c = ctx();
    if (!guide.mode) return { mode: null, at: 0, of: 0, over: false, step: null, modes: GUIDE_MODES.map(({ id, title, kicker, time }) => ({ id, title, kicker, time })), vars: guide.vars, last: guide.last, text: guideWelcome(c), page: pageFacts(), ...extra };
    const at = guideAt();
    const step = guideStep(guide.mode, at, c);
    return { mode: guide.mode, title: modeById(guide.mode).title, at, of: step.of, over: !!step.over, step: step.over ? null : step, vars: guide.vars, last: guide.last, text: guideText(guide.mode, at, c), page: pageFacts(), ...extra };
  }
  /**
   * The current step, to the page as well: a card with the whole of it - the
   * line, the why, the board in a line, what the assistant does on it, the
   * question with its options as buttons, Do it for me (op 'ask') - so the
   * person follows and answers on the page or in the assistant's chat,
   * whichever they are looking at. Sent once per step.
   */
  function tellPage({ again = false } = {}) {
    if (!guide.mode || !pages.size) return;
    const v = view();
    const key = v.over ? `${guide.mode}:over` : `${guide.mode}:${v.at}`;
    if (!again && guide.told === key) return;
    guide.told = key;
    const m = modeById(guide.mode);
    if (v.over) { send({ op: 'ask', args: { mode: guide.mode, title: m.title, over: true, say: guideStep(guide.mode, v.of, ctx()).say } }); return; }
    const st = v.step;
    send({ op: 'ask', args: { mode: guide.mode, title: m.title, at: v.at, of: v.of, id: st.id, step: st.title, say: st.say, why: st.why ?? null, board: boardLine(ctx()), next: st.next,
                              q: st.ask?.q ?? null, options: (st.ask?.options ?? []).map(o => ({ label: o.label, hint: o.hint, then: o.then })), other: st.ask?.other?.hint ?? null,
                              help: st.help?.say ?? null, does: st.do.map(d => d.op), before: !!st.before, work: st.work ?? null } });
  }
  /** The page reports a step of the Rabbit's build done: the position is known at once, and the next question goes to the page. */
  function pageStep(data = {}) {
    if (guide.mode !== 'tutorial' || typeof data.at !== 'number') return;
    mirror = { ...(mirror ?? {}), tutorial: { id: data.id, step: data.step, at: data.at, of: data.of } }; mirrorAt = Date.now();
    tellPage();
  }
  const pageFacts = () => ({ open: pages.size > 0, level: mirror?.level?.name ?? null, lintOk: Array.isArray(mirror?.lint) ? mirror.lint.length === 0 : null, checked: mirror?.report?.ok ?? null, tutorial: mirror?.tutorial ?? null });
  function pick(mode, by = 'agent') {
    if (!GUIDE_IDS.includes(mode)) throw Object.assign(new Error(`no such way: ${mode}; the ways are ${GUIDE_IDS.join(', ')}`), { code: 400 });
    const m = modeById(mode);
    Object.assign(guide, { mode, at: 0, vars: {}, by, pickedAt: Date.now(), last: null, told: null });
    post(`[guide] the person picked "${m.title}" (${mode}): read the guide - GET /__maker/guide, or maker_guide - and follow it step by step`, { kind: 'guide', data: { what: 'pick', mode, by } });
    if (by !== 'page') send({ op: 'guide', args: { mode, by } });       // the page follows: its tutorial, its chat line; no answer needed
    for (const w of guideWaiters) w();
    log(`guide: ${mode} picked by ${by}`);
    tellPage();
  }
  function waitPick(wait = 0) {
    if (guide.mode || wait <= 0) return Promise.resolve(!!guide.mode);
    return new Promise((ok) => {
      const timer = setTimeout(() => { guideWaiters.delete(wake); ok(!!guide.mode); }, Math.min(wait, 120_000));
      const wake = () => { clearTimeout(timer); guideWaiters.delete(wake); ok(true); };
      guideWaiters.add(wake);
    });
  }
  /** Run a plan's ops through the page, in order; a placeholder in `moves` takes the moves the Check before it returned. */
  async function runOps(list) {
    const results = [];
    let moves = mirror?.report?.ok ? mirror.report.moves ?? null : null;
    for (const d of list ?? []) {
      let args = d.args ?? {};
      if (d.op === 'moves' && Array.isArray(args.moves) && args.moves.some(m => typeof m === 'string' && m.startsWith('<'))) {
        if (!moves) { results.push({ op: d.op, skipped: 'no solution to play: Check found none' }); continue; }
        args = { ...args, moves: args.moves.length === 1 && /first/.test(args.moves[0]) ? moves.slice(0, 1) : moves };
      }
      try {
        const r = await rpc(d.op, args);
        if (d.op === 'generate' && !r) { results.push({ op: d.op, args, error: 'drew nothing solvable from these knobs: roll again (another seed), or fewer rocks' }); break; }
        if (d.op === 'check' && r?.ok && r.moves) moves = r.moves;
        if (d.op === 'generate' && r?.report?.ok && r.report.moves) moves = r.report.moves;
        const out = r && typeof r === 'object' ? { ...r } : r;
        if (out && typeof out === 'object') { if (out.png) out.png = `<${out.png.length} bytes of PNG: take maker_snapshot to see it>`; if (out.level?.rows) out.level = { name: out.level.name, rows: out.level.rows }; if (out.brief) out.brief = out.brief.slice(0, 400) + '…'; }
        results.push({ op: d.op, args, result: out });
      } catch (e) { results.push({ op: d.op, args, error: e.message }); break; }
    }
    return results;
  }
  /** One request to the guide: what the assistant (or the page) says happened, and what to do next. */
  async function drive(b = {}) {
    const out = await steer(b);
    if (out.did && out.did !== 'nothing picked yet' && out.did !== 'shown') tellPage({ again: out.did === 'again' || out.did === 'restarted' });
    return out;
  }
  async function steer(b = {}) {
    if (b.platform) guide.platform = String(b.platform);
    await refresh();
    if (b.show) { await rpc('guide', { show: true }); return view({ did: 'shown' }); }
    if (b.mode !== undefined) {
      // the person's own pick on the banner stands: an assistant that asked in its chat meanwhile is told, not obeyed
      if (b.from !== 'page' && guide.mode && guide.by === 'page' && Date.now() - guide.pickedAt < 180_000)
        return view({ did: 'already picked on the page', say: `They picked "${modeById(guide.mode).title}" on the banner ${Math.round((Date.now() - guide.pickedAt) / 1000)} s ago: follow that, do not pick again.` });
      pick(b.mode, b.from ?? 'agent'); return view({ did: 'picked' });
    }
    if (!guide.mode) return view({ did: 'nothing picked yet', hint: 'wait with GET ?wait=MS, or pick with { mode }' });
    if (b.vars && typeof b.vars === 'object') Object.assign(guide.vars, b.vars);
    if (b.restart) { guide.at = 0; guide.vars = {}; if (guide.mode === 'tutorial') await rpc('tutorial', { id: modeById('tutorial').tutorial, restart: true }).catch(() => {}); return view({ did: 'restarted' }); }
    if (typeof b.step === 'number') { guide.at = Math.max(0, Math.min(b.step, view().of)); return view({ did: `at step ${guide.at + 1}` }); }
    if (b.back) { guide.at = Math.max(0, guideAt() - 1); return view({ did: 'back' }); }
    const c = ctx();
    const at = guideAt();
    const step = guideStep(guide.mode, at, c);
    const advance = async () => {
      if (guide.mode === 'tutorial' && at < pageSteps()) { await rpc('tutorial', { skip: 1 }).catch(() => {}); guide.at = at + 1; }
      else guide.at = at + 1;
    };
    if (b.next) { if (step.over) return view({ did: 'over' }); await advance(); return view({ did: 'next' }); }
    if (step.over) return view({ did: 'over' });
    if (b.help) {
      // "Do it for me" from a card of a step the page has already moved past is not for this one
      if (typeof b.at === 'number' && b.at < at) return view({ did: 'moved', say: `✓ ${guideStep(guide.mode, b.at, c).title}: that step is done; go on from the step below.` });
      const ran = b.run && step.help ? await runOps(step.help.do) : null;
      if (b.from === 'page') post(`[guide] they pressed "Do it for me" on the page (step ${at + 1}, ${step.id}): ${step.help ? `the help plan ran - ${step.help.say}` : 'this step has no help plan'}`, { kind: 'answer', data: { at, step: step.id, answer: 'Do it for me', option: 'Do it for me', then: 'help', ran: ran?.map(r => r.op) ?? null } });
      return view({ did: 'help', say: step.help?.say ?? null, help: step.help, ran });
    }
    if (b.answer !== undefined) {
      // an answer to a step the page has already moved past (the person did it, or answered on the page, while the assistant was asking) is not an answer to this one
      if (typeof b.at === 'number' && b.at < at) {
        const theirs = guide.last && guide.last.at === b.at && guide.last.by === 'page' ? ` - they answered "${guide.last.answer}" on the page` : '';
        return view({ did: 'moved', say: `✓ ${guideStep(guide.mode, b.at, c).title}${theirs}: go on from the step below, do not ask again.` });
      }
      const r = applyAnswer(step, b.answer, guide.vars);
      guide.vars = r.vars;
      guide.last = { at, step: step.id, answer: String(b.answer), option: r.option, then: r.then, by: b.from ?? 'agent', when: Date.now() };
      if (b.from === 'page') post(`[guide] they pressed "${r.option ?? b.answer}" on the page (step ${at + 1}, ${step.id}): ${r.then}`, { kind: 'answer', data: { at, step: step.id, answer: b.answer, option: r.option, then: r.then } });
      const fresh = guideStep(guide.mode, at, ctx());          // the plan, with the answer in it
      let ran = null, ranNext = null;
      switch (r.then) {
        case 'next': {
          if (b.run && fresh.do.length && !fresh.before) ran = await runOps(fresh.do);
          await advance();
          // answered on the page: a step whose work comes before its question is done right away, so the page shows the room before it asks
          if (b.from === 'page') { const ns = guideStep(guide.mode, guideAt(), ctx()); if (!ns.over && ns.before && ns.do.length) ranNext = await runOps(ns.do); }
          return view({ did: 'next', answered: r.option ?? b.answer, say: r.say, ran, ranNext });
        }
        case 'again': if (b.run) ran = await runOps(fresh.do); return view({ did: 'again', answered: r.option ?? b.answer, say: r.say, ran });
        case 'help': ran = b.run !== false && fresh.help ? await runOps(fresh.help.do) : null; return view({ did: 'help', answered: r.option ?? b.answer, say: fresh.help?.say ?? null, help: fresh.help, ran });
        case 'why': return view({ did: 'why', answered: r.option, say: step.why ?? step.say });
        case 'check': {
          const now = guideAt();
          if (now > at) return view({ did: 'moved', say: `✓ ${step.title}` });
          return view({ did: 'not yet', say: `The board has not seen it yet. ${step.say}` });
        }
        case 'stay': return view({ did: 'stay', answered: r.option ?? b.answer, say: r.say });
        case 'skip': await advance(); return view({ did: 'skipped' });
        case 'finish': { const steps = view().of; const i = guideStep(guide.mode, 0, c) && [...Array(steps).keys()].find(k => guideStep(guide.mode, k, c).id === 'finish'); guide.at = i ?? steps; return view({ did: 'finish' }); }
        case 'restart': guide.at = 0; guide.vars = {}; return view({ did: 'restarted' });
        case 'end': guide.at = view().of; return view({ did: 'end', say: 'The room stays on the board.' });
        default:
          if (r.then?.startsWith('mode:')) { pick(r.then.slice(5), 'agent'); return view({ did: 'picked' }); }
          if (r.then?.startsWith('tutorial:')) { await rpc('tutorial', { id: r.then.slice(9) }).catch(() => {}); guide.at = view().of; return view({ did: 'end', say: `The page opened the guided build "${r.then.slice(9)}".` }); }
          return view({ did: 'stay' });
      }
    }
    if (b.run) { const ran = await runOps(step.do); return view({ did: 'ran', ran }); }
    return view();
  }

  const close = () => { for (const res of pages) res.end(); pages.clear(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('closed')); } pending.clear(); for (const w of guideWaiters) w(); };

  return { status, rpc, reply, post, read, attach, hello, state, close, setUrl: (u) => { base = u; }, guide: { view, drive, pick, waitPick, refresh, pageStep, tellPage, state: guide, text: () => (guide.mode ? guideText(guide.mode, guideAt(), ctx()) : guideWelcome(ctx())) },
           get mirror() { return mirror; }, get pages() { return pages.size; } };
}

/** The static server with the bridge mounted. Resolves once it listens. */
export function startMaker({ root, port = 8080, host = '127.0.0.1', log = console.log, facts } = {}) {
  root = resolve(root);
  const bridge = createBridge({ log, facts: facts ?? repoFacts(root) });

  async function handleBridge(req, res, url) {
    if (!LOOPBACK.test(req.headers.host ?? '')) return json(res, 403, { error: 'the bridge answers the loopback only' });
    const origin = req.headers.origin;
    if (origin && !LOOPBACK.test(origin.replace(/^https?:\/\//, ''))) return json(res, 403, { error: 'not this origin' });
    const path = url.pathname.slice('/__maker'.length) || '/';
    const q = url.searchParams;
    try {
      if (req.method === 'GET' && path === '/') return json(res, 200, bridge.status());
      if (req.method === 'GET' && path === '/events') return bridge.attach(res);
      if (req.method === 'POST' && path === '/reply') return json(res, 200, { ok: bridge.reply(await readBody(req)) });
      if (req.method === 'POST' && path === '/state') { bridge.state(await readBody(req)); return json(res, 200, { ok: true }); }
      if (req.method === 'POST' && path === '/post') { const b = await readBody(req); if (!b.text) return json(res, 400, { error: 'text?' }); const m = bridge.post(b.text, { kind: b.kind, data: b.data }); if (b.kind === 'tutorial') bridge.guide.pageStep(b.data); return json(res, 200, m); }
      if (req.method === 'POST' && path === '/hello') return json(res, 200, bridge.hello((await readBody(req)).name));
      if (req.method === 'GET' && path === '/inbox') return json(res, 200, { messages: await bridge.read(+q.get('since') || 0, +q.get('wait') || 0), latest: bridge.status().inbox });
      if (req.method === 'GET' && path === '/level') return bridge.mirror?.level ? json(res, 200, bridge.mirror.level) : json(res, 404, { error: 'no page has reported a room yet' });
      if (req.method === 'POST' && path === '/rpc') { const b = await readBody(req); return json(res, 200, { ok: true, result: await bridge.rpc(b.op, b.args ?? {}, { timeoutMs: b.timeoutMs }) }); }
      if (req.method === 'PUT' && path === '/level') return json(res, 200, { ok: true, result: await bridge.rpc('set', { level: await readBody(req) }) });
      if (req.method === 'GET' && path === '/platforms') return json(res, 200, { platforms: PLATFORMS });
      if (req.method === 'GET' && path === '/guide') {
        if (q.get('platforms')) return json(res, 200, { platforms: PLATFORMS });
        if (q.get('mode')) {           // a preview of any step, nothing changes
          const mode = q.get('mode'), at = +q.get('step') || 0;
          if (!GUIDE_IDS.includes(mode)) return json(res, 400, { error: `no such way: ${mode}; the ways are ${GUIDE_IDS.join(', ')}` });
          const c = { vars: bridge.guide.state.vars, level: bridge.mirror?.level ?? null, lint: bridge.mirror?.lint ?? null, report: bridge.mirror?.report ?? null, tutorial: bridge.mirror?.tutorial ?? null, platform: q.get('platform') ?? bridge.guide.state.platform, ...(facts ?? repoFacts(root)) };
          return json(res, 200, { preview: true, mode, at, step: guideStep(mode, at, c), text: guideText(mode, at, c) });
        }
        if (q.get('platform')) bridge.guide.state.platform = q.get('platform');
        await bridge.guide.waitPick(+q.get('wait') || 0);
        await bridge.guide.refresh();
        return json(res, 200, bridge.guide.view());
      }
      if (req.method === 'POST' && path === '/guide') return json(res, 200, await bridge.guide.drive(await readBody(req)));
      return json(res, 404, { error: `no ${req.method} ${url.pathname} on the bridge` });
    } catch (e) {
      return json(res, e.code ?? 500, { error: e.message });
    }
  }

  function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); res.end(); return; }
    let st;
    try { st = statSync(file); } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
    if (st.isDirectory()) { res.writeHead(301, { location: path + '/' }); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__maker' || url.pathname.startsWith('/__maker/')) handleBridge(req, res, url);
    else handleStatic(req, res, url);
  });

  return new Promise((ok, fail) => {
    server.on('error', fail);
    server.listen(port, host, () => {
      const at = server.address().port;
      bridge.setUrl(`http://localhost:${at}`);
      ok({ server, bridge, port: at, url: `http://localhost:${at}`, close: () => new Promise((done) => { bridge.close(); server.close(() => done()); }) });
    });
  });
}
