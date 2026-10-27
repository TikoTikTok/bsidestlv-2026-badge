#!/usr/bin/env node
// Checks the level maker: src/level.js's judgement against the shipped
// stages and a few rooms built by hand (lint catches what it should, the
// module it writes reads back as the same room, a link carries it); the
// studio's tools, transforms, analysis, starters and generator; the
// tutorial "Painting the Roses" walked on the events src/maker.js emits;
// that maker.html keeps the studio to a checkout (class dev-only) and the
// landing to the site (class site-only); the assistant's bridge (a server on
// a free port, a fake page on its event stream, the round trips, the
// guards) and the MCP server over stdio; and the community's rooms - every
// one listed in stages/community/index.json exists, is well formed and
// solves, and nothing in that folder goes unlisted. Part of `npm run verify`.
//
//   node software/tools/verify-maker.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { blank, setCell, resize, lint, check, kindOf, toModule, fromModule, encodeShare, decodeShare, idOf, normalize,
         lineCells, rectCells, regionCells, paintCells, mirrorCells, flipH, flipV, rotate, shift, analyse, difficulty,
         STARTERS, rng, generate, generateSolvable } from '../../src/level.js';
import { MAKER_TUTORIAL, Tutor } from '../../src/tutor.js';
import { startMaker, OPS } from './maker-server.mjs';
import { TEA_PARTY } from '../../stages/tea-party.js';
import { QUEENS_GAUNTLET } from '../../stages/queens-gauntlet.js';

const root = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
let failed = 0;
const fail = (m) => { failed++; console.error(`  FAIL ${m}`); };
const ok = (c, m) => { if (c) console.log(`  ok   ${m}`); else fail(m); };
const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

// ------------------------------------------------------------- the judgement ----
console.log('the maker judges the shipped stages as the verifiers do');
{
  const tea = check(TEA_PARTY);
  ok(tea.ok && tea.kind === 'tea' && tea.par === 106, `the tea party: untimed, par ${tea.par} (106)`);
  ok(tea.notes.includes('the gate is load-bearing'), 'the tea party: the gate is load-bearing');
  const chase = check(QUEENS_GAUNTLET);
  ok(chase.ok && chase.kind === 'chase' && chase.par === 64, `the gauntlet: timed, par ${chase.par} (64)`);
  ok(chase.notes.some(n => /costs 23 tick/.test(n)), 'the gauntlet: the cast costs 23 ticks over an empty room');
}

console.log('lint says what is wrong, and nothing when nothing is');
{
  const b = blank(9, 7);
  ok(lint(b).length === 1 && /no rock/.test(lint(b)[0]), 'a blank room is a walk, not a puzzle');
  let l = setCell(setCell(b, 3, 3, 'O'), 5, 3, 'b');
  ok(lint(l).length === 0, 'a rock and a button make it well formed');
  ok(check(l).ok && check(l).par === 10, `and solvable in ${check(l).par} moves`);
  ok(lint(setCell(l, 2, 2, 'O')).some(p => /rock\(s\) but/.test(p)), 'a spare rock is reported');
  ok(lint(setCell(l, 4, 0, '.')).some(p => /top and bottom/.test(p)), 'a hole in the top wall is reported');
  ok(lint({ ...l, rows: l.rows.map((r, i) => (i === 2 ? r + '.' : r)) }).some(p => /same length/.test(p)), 'a ragged row is reported');
  ok(lint(setCell(l, 6, 2, 'G')).some(p => /no lever/.test(p)), 'a gate without a lever is reported');
  ok(lint({ ...l, rows: l.rows.map(r => r.replace('D', '.')) }).some(p => /one door/.test(p)), 'a missing door is reported');
  const walled = setCell(setCell(l, 1, 1, '.'), 1, 2, 'A');
  const boxed = setCell(setCell(setCell(walled, 2, 2, '#'), 1, 3, '#'), 2, 1, '#');
  const r = check(boxed);
  ok(!r.ok && /unsolvable/.test(r.problems[0]), 'Alice walled in is unsolvable, and says so');
  // Alice and the door are single: painting another moves the first
  const moved = setCell(l, 4, 4, 'A');
  ok(moved.rows.join('').split('A').length === 2 && moved.rows[4][4] === 'A', 'painting Alice elsewhere moves her');
  const big = resize(l, 12, 9);
  ok(big.rows.length === 9 && big.rows.every(r => r.length === 12) && big.rows[3][3] === 'O' && lint(big).length === 0, 'resizing keeps the room and walls the new edge');
  const small = resize(l, 6, 7);
  ok(small.rows.every(r => r.length === 6) && lint(small).some(p => /rock\(s\) but/.test(p)), 'shrinking over a button is reported, not hidden');
  // routes
  const timed = { ...l, tickMs: 320, hazards: [{ id: 'queen', route: [[1, 5], [7, 5]], sight: 3 }] };
  ok(lint(timed).length === 0 && kindOf(timed) === 'chase', 'a hazard on a straight loop makes a timed room');
  ok(lint({ ...timed, hazards: [{ id: 'queen', route: [[1, 5], [7, 4]] }] }).some(p => /not in a line/.test(p)), 'a diagonal route is reported');
  ok(lint({ ...timed, hazards: [{ id: 'queen', route: [[1, 5], [1, 0]] }] }).some(p => /through a wall/.test(p)), 'a route through a wall is reported');
  ok(lint({ ...timed, hazards: [{ id: 'queen', route: [[1, 5]] }] }).some(p => /two points/.test(p)), 'a one-point route is reported');
  const tr = check(timed);
  ok(tr.ok && tr.kind === 'chase' && tr.par >= 10, `the timed room solves in ${tr.par} ticks`);
}

console.log('the module the maker writes reads back as the same room, and so does a link');
for (const stage of [TEA_PARTY, QUEENS_GAUNTLET]) {
  const src = toModule(stage, { author: 'the verifier' });
  const back = await fromModule(src);
  ok(same(back, stage), `${stage.name}: toModule -> fromModule is the identity`);
  ok(/^\/\/ Stage: /.test(src) && src.includes('// By the verifier') && src.includes('#  wall'), `${stage.name}: the module carries the header and the legend`);
  ok(same(decodeShare(encodeShare(stage)), stage), `${stage.name}: encodeShare -> decodeShare is the identity`);
  ok(/^[A-Za-z0-9_-]+$/.test(encodeShare(stage)), `${stage.name}: the share token is URL-safe`);
}
ok(idOf({ name: "The Queen's Gauntlet" }) === 'the-queens-gauntlet', 'the id of a name drops the apostrophe');
try { await fromModule('export const X = 1;'); fail('a module with no stage should be refused'); } catch (e) { ok(/no stage/.test(e.message), 'a module with no stage is refused'); }

// ------------------------------------------------------------ the studio ----
console.log('the studio\'s tools paint what they say');
{
  const room = blank(9, 7);
  ok(lineCells(1, 1, 5, 1).length === 5 && lineCells(1, 1, 1, 4).length === 4 && lineCells(1, 1, 4, 4).length === 4, 'a line is every cell from one end to the other');
  ok(rectCells(1, 1, 4, 3).length === 10 && rectCells(1, 1, 4, 3, { filled: true }).length === 12 && rectCells(4, 3, 1, 1).length === 10, 'a rectangle is its outline, or all of it, whichever corner comes first');
  ok(regionCells(room, 2, 2).length === 7 * 5 - 2, 'a fill finds the whole floor (less Alice and the door)');
  ok(regionCells(room, 0, 0).length === 2 * 9 + 2 * 5, 'a fill of the wall finds the wall');
  const walled = paintCells(room, lineCells(4, 1, 4, 5), '#');
  ok(walled.rows.slice(1, 6).every(r => r[4] === '#') && regionCells(walled, 2, 2).length === 3 * 5 - 1, 'a painted line splits the floor');
  ok(mirrorCells(room, 1, 1, 'h').some(([x, y]) => x === 7 && y === 1) && mirrorCells(room, 1, 1, 'v').some(([x, y]) => x === 1 && y === 5) && mirrorCells(room, 1, 1, 'both').length === 4 && mirrorCells(room, 4, 3, 'both').length === 1, 'the mirror images of a cell');
  ok(paintCells(room, [[2, 2], [3, 3]], 'A').rows.join('').split('A').length === 2, 'painting Alice twice leaves one Alice');
}

console.log('the transforms keep the room a room');
{
  const gate = STARTERS.find(s => s.id === 'gate').level();
  const hall = STARTERS.find(s => s.id === 'hall').level();
  ok(same(flipH(flipH(gate)), gate) && same(flipV(flipV(gate)), gate), 'a flip twice is the identity');
  ok(same(rotate(rotate(rotate(rotate(gate)))), gate), 'four quarter turns are the identity');
  const turned = rotate(gate);
  ok(turned.rows.length === gate.rows[0].length && turned.rows[0].length === gate.rows.length, 'a quarter turn swaps width and height');
  ok(check(flipH(gate)).par === check(gate).par && check(rotate(gate)).ok, 'a flipped room solves in the same par, a turned one solves');
  ok(same(flipH(flipH(hall)), hall) && lint(rotate(hall)).length === 0 && check(rotate(hall)).ok, 'routes turn with the room and the turned hall still solves');
  const loose = setCell(setCell(setCell(setCell(setCell(setCell(blank(9, 7), 1, 1, '.'), 7, 5, '.'), 3, 3, 'A'), 4, 3, 'O'), 5, 3, 'b'), 5, 4, 'D');
  const moved = shift(loose, 1, 0);
  ok(moved.rows[3][4] === 'A' && moved.rows[3][5] === 'O' && moved.rows[4][6] === 'D' && lint(moved).length === 0, 'a shift moves the inside one cell');
  ok(same(shift(shift(loose, 1, 1), -1, -1), loose) && same(shift(shift(gate, 0, 0), 0, 0), gate), 'a shift there and back is the identity while nothing crosses the wall');
  const lost = shift(gate, -1, 0);
  ok(!lost.rows.join('').includes('A') && lint(lost).some(p => /one Alice/.test(p)), 'what crosses the wall is lost, and the lint says so');
}

console.log('the analysis is the solver\'s own bookkeeping');
{
  const gate = STARTERS.find(s => s.id === 'gate').level();
  const r = check(gate);
  const a = analyse(gate, r);
  ok(a && a.stuck.size > 0 && ![...a.stuck].some(i => gate.rows[(i / a.w) | 0][i % a.w] === 'b'), 'stuck cells exist and no button is one');
  ok(a.stuck.has(1 * a.w + 1), 'the corner behind Alice is a stuck cell');
  ok(a.reach.has(1 * a.w + 1) && !a.reach.has(2 * a.w + 4) && !a.reach.has(1 * a.w + 9), 'Alice reaches her side, not the gate, not the far side');
  ok(a.path.length === r.par + 1 && a.pushes > 0 && a.pushes < r.par, `the path is par + 1 cells with ${a.pushes} pushes`);
  ok(analyse(blank(9, 7)) === null, 'a malformed room has no analysis');
  ok(difficulty(r, a.pushes).label && difficulty({ ok: true, par: 8, explored: 5, kind: 'tea' }, 1).level === 1 && difficulty({ ok: true, par: 300, explored: 200000, kind: 'tea' }, 40).level === 5, 'difficulty runs from a stroll to a nightmare');
  ok(difficulty({ ok: false }) === null, 'no verdict, no difficulty');
}

console.log('every starter solves, and the generator draws the same room from the same seed');
{
  for (const s of STARTERS) {
    const l = s.level();
    const problems = lint(l);
    if (s.id === 'blank' || s.id === 'wide') ok(problems.length === 1 && /no rock/.test(problems[0]), `starter ${s.id}: a blank room, one rock short of a puzzle`);
    else { const r = check(l); ok(!problems.length && r.ok, `starter ${s.id}: ${l.name}, par ${r.par}`); }
  }
  const r1 = rng(42), r2 = rng(42);
  ok(r1() === r2() && r1() === r2() && r1() !== r1(), 'the seeded generator repeats itself and nothing else');
  ok(same(generate({ seed: 7 }), generate({ seed: 7 })) && !same(generate({ seed: 7 }), generate({ seed: 8 })), 'a seed names a room');
  const g = generate({ seed: 7, gate: true, timed: true, width: 13, height: 9, rocks: 2 });
  ok(g && g.rows.length === 9 && g.rows[0].length === 13 && g.rows.join('').includes('G') && g.hazards?.length >= 1 && g.tickMs === 320, 'the knobs are honoured: size, a gate, a cast');
  const found = generateSolvable({ seed: 7, rocks: 2 }, { tries: 30, minPar: 10 });
  ok(found && found.report.ok && found.report.par >= 10 && same(generate({ ...{ seed: found.seed, rocks: 2 } }), found.level), `generateSolvable finds one (seed ${found?.seed}, ${found?.tries} tries, par ${found?.report.par}) and it is the seed's room`);
  ok(generateSolvable({ seed: 1, rocks: 6, width: 5, height: 5 }, { tries: 3 }) === null, 'and says so when it cannot');
}

// ---------------------------------------------------------------- the tutorial ----
console.log('the tutorial "Painting the Roses" ticks on the studio\'s events');
{
  const ids = new Set();
  for (const s of MAKER_TUTORIAL) {
    ok(!ids.has(s.id), `tutorial: duplicate step ${s.id}`); ids.add(s.id);
    ok(typeof s.say === 'string' && s.say.length && typeof s.why === 'string' && s.why.length, `tutorial ${s.id}: say and why`);
    ok([1, 2, 3].includes(s.chapter) && ['edit', 'play', 'export', 'assistant'].includes(s.panel), `tutorial ${s.id}: a chapter and a panel`);
  }
  const chapters = MAKER_TUTORIAL.map(s => s.chapter);
  ok(chapters.every((c, i) => !i || c >= chapters[i - 1]), 'tutorial: the chapters come in order');
  let at = 0;
  const store = { load: () => 0, save: (n) => { at = n; } };
  const tutor = new Tutor(MAKER_TUTORIAL, store);
  const ev = (what, extra = {}) => ({ ...extra, kind: 'maker', what });
  const walk = [
    ['brush', ev('brush', { ch: '#' })], ['paint', ev('paint', { ch: '#', cells: 1, tool: 'pencil' })],
    ['rock', ev('paint', { ch: 'O', cells: 1, tool: 'pencil' })], ['button', ev('paint', { ch: 'b', cells: 1, tool: 'pencil' })],
    ['formed', ev('lint', { ok: true, problems: [] })], ['tool', ev('tool', { tool: 'rect', used: true })],
    ['overlay', ev('overlay', { overlay: 'reach', on: true })], ['surprise', ev('generate', { seed: 7, par: 23 })],
    ['check', ev('check', { ok: true, par: 23, rules: 'tea' })], ['play', ev('play', { rules: 'tea' })],
    ['move', ev('move', { dir: 'E' })], ['solution', ev('solution', { par: 23 })],
    ['shelf', ev('shelf', { did: 'save' })], ['export', ev('export', { how: 'copy' })], ['assistant', ev('chat', { text: 'hi' })],
  ];
  const wrong = [ev('brush', { ch: 'O' }), ev('paint', { ch: '.', cells: 1 }), ev('lint', { ok: false }), ev('tool', { tool: 'rect', used: false }), ev('check', { ok: false }), ev('shelf', { did: 'open' }), { kind: 'edge', button: 'A', down: true }];
  for (const [id, e] of walk) {
    ok(tutor.step?.id === id, `tutorial: at ${id}`);
    for (const w of wrong) tutor.feed(w);
    ok(tutor.step?.id === id, `tutorial: ${id} ignores what is not it`);
    ok(tutor.feed(e)?.id === id, `tutorial: ${id} completes`);
  }
  ok(tutor.done && at === MAKER_TUTORIAL.length, 'tutorial: done, progress saved');
  tutor.restart(); ok(tutor.at === 0 && at === 0, 'tutorial: start over');
}

// ------------------------------------------------------------------ the bridge ----
console.log('the bridge carries commands to a page and its answers back');
{
  const { port, url, bridge, close } = await startMaker({ root, port: 0 });
  const api = async (method, path, body, headers = {}) => { const r = await fetch(`${url}/__maker${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  ok(port > 0 && (await api('GET', '/')).body.bridge === 1, `the bridge answers on a free port (${port})`);
  ok((await api('GET', '/')).body.ops.join() === OPS.join(), 'and names its ops');
  ok((await fetch(`${url}/maker.html`)).status === 200 && (await fetch(`${url}/src/level.js`)).headers.get('content-type').startsWith('text/javascript'), 'the static side still serves the page and its modules');
  let r = await api('POST', '/rpc', { op: 'get' });
  ok(r.status === 503 && /no maker page/.test(r.body.error), 'an rpc with no page open is refused with a hint');
  // a fake page: the event stream, run each command, answer
  const seen = [];
  const page = await fetch(`${url}/__maker/events`);
  const reader = page.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const pump = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = chunk.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const cmd = JSON.parse(line.slice(6));
        seen.push(cmd);
        if (cmd.id === undefined) continue;
        if (cmd.op === 'get') await api('POST', '/reply', { id: cmd.id, result: { level: TEA_PARTY, lint: [] } });
        else if (cmd.op === 'set') await api('POST', '/reply', { id: cmd.id, result: { lint: lint(cmd.args.level) } });
        else if (cmd.op === 'check') await api('POST', '/reply', { id: cmd.id, error: 'the room is malformed' });
        // 'play' is never answered: the timeout path
      }
    }
  })();
  const settle = () => new Promise(r => setTimeout(r, 80));
  await settle();
  ok(bridge.pages === 1 && seen[0]?.op === 'hello', 'a page attaches and is greeted');
  r = await api('POST', '/rpc', { op: 'get' });
  ok(r.status === 200 && r.body.result.level.name === TEA_PARTY.name, 'get: the page\'s answer comes back');
  r = await api('PUT', '/level', blank(9, 7));
  await settle();
  ok(r.status === 200 && seen.at(-1).op === 'set' && r.body.result.lint.length === 1, 'PUT /level is an rpc set, answered with the lint');
  r = await api('POST', '/rpc', { op: 'check' });
  ok(r.status === 422 && /malformed/.test(r.body.error), 'an error from the page is an error for the assistant');
  r = await api('POST', '/rpc', { op: 'play', timeoutMs: 1000 });
  ok(r.status === 504 && /did not answer/.test(r.body.error), 'a page that does not answer times out');
  r = await api('POST', '/rpc', { op: 'nope' });
  ok(r.status === 400 && /no such op/.test(r.body.error), 'an unknown op is refused with the list');
  r = await api('POST', '/hello', { name: 'the verifier' });
  await settle();
  ok(r.status === 200 && r.body.agents[0].name === 'the verifier' && seen.at(-1).op === 'hello' && seen.at(-1).args.name === 'the verifier', 'hello is shown to the page');
  // the chat: the page posts, the assistant long-polls
  const wait = api('GET', '/inbox?since=0&wait=5000');
  await new Promise(r => setTimeout(r, 50));
  await api('POST', '/post', { text: 'make it timed' });
  r = await wait;
  ok(r.status === 200 && r.body.messages.length === 1 && r.body.messages[0].text === 'make it timed' && r.body.messages[0].n === 1, 'a line the person typed wakes the long-poll');
  r = await api('GET', '/inbox?since=1');
  ok(r.body.messages.length === 0 && r.body.latest === 1, 'and is not repeated');
  // the mirror
  ok((await api('GET', '/level')).status === 404, 'no mirror until the page reports');
  await api('POST', '/state', { level: QUEENS_GAUNTLET, kind: 'chase' });
  ok((await api('GET', '/level')).body.name === QUEENS_GAUNTLET.name && (await api('GET', '/')).body.mirror.kind === 'chase', 'the mirror is what the page last reported');
  // the guards
  r = await api('POST', '/rpc', { op: 'get' }, { origin: 'http://evil.example' });
  ok(r.status === 403, 'a foreign origin is refused');
  r = await new Promise((res) => { const q = request({ host: '127.0.0.1', port, method: 'POST', path: '/__maker/rpc', headers: { host: 'evil.example', 'content-type': 'application/json' } }, (m) => { m.resume(); m.on('end', () => res({ status: m.statusCode })); }); q.end('{"op":"get"}'); });
  ok(r.status === 403, 'a foreign host is refused (DNS rebinding)');
  r = await api('POST', '/rpc', { op: 'get' }, { origin: `http://localhost:${port}` });
  ok(r.status === 200, 'the page\'s own origin is let through');
  ok((await fetch(`${url}/__maker/reply`, { method: 'POST', body: '{' })).status === 400, 'a body that is not JSON is refused');
  // the MCP server over stdio against this very server
  const mcp = spawn(process.execPath, [resolve(root, 'software/tools/maker-mcp.mjs')], { env: { ...process.env, MAKER_URL: url, MAKER_AGENT: 'the verifier over MCP' } });
  const replies = new Map(); let out = '';
  mcp.stdout.on('data', (d) => { out += d; let i; while ((i = out.indexOf('\n')) >= 0) { const l = out.slice(0, i); out = out.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); replies.get(m.id)?.(m); } } });
  let n = 0;
  const call = (method, params) => new Promise((res) => { const id = ++n; replies.set(id, res); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  ok(init.result?.serverInfo?.name === 'alice-maker' && init.result.capabilities.tools, 'mcp: initialize');
  const tools = (await call('tools/list')).result.tools;
  ok(tools.length >= 15 && tools.every(t => t.name.startsWith('maker_') && t.inputSchema?.type === 'object' && t.description), `mcp: ${tools.length} tools, all described`);
  let c = await call('tools/call', { name: 'maker_status', arguments: {} });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).page === true, 'mcp: maker_status sees the page');
  c = await call('tools/call', { name: 'maker_get', arguments: {} });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).level.name === TEA_PARTY.name && (await api('GET', '/')).body.agents.some(a => a.name === 'the verifier over MCP'), 'mcp: maker_get goes through the bridge, and the server said hello first');
  c = await call('tools/call', { name: 'maker_check', arguments: {} });
  ok(c.result.isError && /malformed/.test(c.result.content[0].text), 'mcp: an error is an error result, not a crash');
  c = await call('tools/call', { name: 'maker_read_chat', arguments: { since: 0 } });
  ok(!c.result.isError && JSON.parse(c.result.content[0].text).messages[0].text === 'make it timed', 'mcp: maker_read_chat reads the inbox');
  const unknown = await call('no/such');
  ok(unknown.error?.code === -32601, 'mcp: an unknown method is a JSON-RPC error');
  mcp.stdin.end();
  await new Promise(r => mcp.on('close', r));
  reader.cancel().catch(() => {});
  await pump.catch(() => {});
  await close();
  ok(true, 'the bridge closes');
}

// ------------------------------------------------------------------ the page ----
console.log('maker.html keeps the studio to a checkout and the landing to the site');
{
  const html = readFileSync(resolve(root, 'maker.html'), 'utf8');
  for (const id of ['editPanel', 'playPanel', 'exportPanel', 'assistantPanel', 'learnPanel'])
    ok(new RegExp(`<section class="panel dev-only" id="${id}">`).test(html), `#${id} is class dev-only`);
  ok(/<div id="coach" class="coach dev-only" hidden>/.test(html), 'the coach line is dev-only: the tutorial is the studio\'s');
  for (const id of ['coachTitle', 'coachCount', 'coachSay', 'coachSkip', 'coachOpen', 'learnProgress', 'learnCoach', 'learnSteps', 'learnSkip', 'learnRestart', 'learnStatus'])
    ok(new RegExp(`id="${id}"`).test(html), `the coach has #${id}`);
  for (const t of ['pencil', 'line', 'rect', 'fill', 'pick']) ok(new RegExp(`data-tool="${t}"`).test(html), `the studio bar has the ${t} tool`);
  for (const o of ['grid', 'coords', 'stuck', 'reach', 'path', 'sight']) ok(new RegExp(`data-overlay="${o}"`).test(html), `the board has the ${o} overlay`);
  for (const id of ['symmetry', 'flipH', 'flipV', 'rotateBtn', 'undoEdit', 'redoEdit', 'zoom', 'keysBtn', 'starters', 'genBtn', 'genSeed', 'shelf', 'shelfSave', 'autoCheck', 'pngBtn', 'verdict', 'chatLog', 'chatText', 'chatSend', 'bridgeChip', 'bridgeState', 'keysDialog'])
    ok(new RegExp(`id="${id}"`).test(html), `the studio has #${id}`);
  const mod = readFileSync(resolve(root, 'src/maker.js'), 'utf8');
  for (const op of OPS) ok(new RegExp(`^  ${op}: `, 'm').test(mod), `src/maker.js implements the bridge op '${op}'`);
  ok(/from '\.\/bridge\.js'/.test(mod) && /from '\.\/coach\.js'/.test(mod) && /MAKER_TUTORIAL/.test(mod), 'src/maker.js reaches the bridge, the coach and the tutorial');
  ok(/__maker\//.test(mod) && /maker-mcp\.mjs|\.mcp\.json/.test(mod), 'the prompt tells the assistant about the bridge and the MCP server');
  const mcpJson = JSON.parse(readFileSync(resolve(root, '.mcp.json'), 'utf8'));
  ok(mcpJson.mcpServers?.['alice-maker']?.args?.includes('software/tools/maker-mcp.mjs'), '.mcp.json registers the MCP server for a clone opened in Claude Code');
  ok(!/\.mcp\.json|maker-mcp/.test(readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8')), 'pages.yml does not publish the MCP server or .mcp.json');
  ok(/id="padDevice" class="pad-device dev-only"/.test(html), 'the controller name in the header is dev-only');
  ok((html.match(/class="panel site-only"/g) ?? []).length >= 3, 'the landing prose panels are class site-only');
  ok(/<section class="panel hero" id="hero">/.test(html), 'the hero is on both faces');
  for (const id of ['aiDialog', 'aiPrompt', 'aiCopy', 'aiClaude', 'aiChatGPT', 'aiBtn', 'repoClone', 'docsLink'])
    ok(new RegExp(`id="${id}"`).test(html), `the invitation has #${id}`);
  ok(!/id="modes"/.test(html), 'no mode bar: the maker is one column in the phone looks');
  const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
  ok(/html\[data-host=dev\] \.site-only \{ display: none !important; \}/.test(css), 'styles.css hides .site-only on a dev host');
  ok(/<link rel="stylesheet" href="src\/maker\.css">/.test(html), 'the page loads src/maker.css');
  const js = readFileSync(resolve(root, 'src/maker.js'), 'utf8');
  ok(/const dev = mode === 'dev'/.test(js) && /if \(!dev\) \{/.test(js) && /new Pad\(\{ sources: sourcesFor\(true\) \}\)/.test(js), 'the pad with every source is built on a dev host only');
  ok(/stages\/community\/index\.json/.test(js), 'the maker lists the community rooms');
  ok(/maker\.html/.test(readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8')), 'pages.yml publishes maker.html');
  const makerCss = readFileSync(resolve(root, 'src/maker.css'), 'utf8');
  ok(!/data-theme=|data-flip/.test(makerCss), 'src/maker.css paints from the variables and never names a theme or the turn');
}

// ------------------------------------------------------------- the community ----
console.log('the community\'s rooms');
{
  const dir = resolve(root, 'stages/community');
  const index = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8'));
  const listed = new Set();
  ok(Array.isArray(index.stages), 'stages/community/index.json has a "stages" list');
  for (const s of index.stages ?? []) {
    const at = `community "${s?.id ?? '?'}"`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s?.id ?? '')) { fail(`${at}: id must be a lower-case slug`); continue; }
    if (listed.has(s.id)) fail(`${at}: duplicate id`);
    listed.add(s.id);
    for (const k of ['name', 'author']) if (typeof s[k] !== 'string' || !s[k].trim()) fail(`${at}: ${k} is required`);
    const file = resolve(dir, `${s.id}.js`);
    if (!existsSync(file)) { fail(`${at}: stages/community/${s.id}.js is missing`); continue; }
    let stage;
    try {
      const mod = await import(pathToFileURL(file).href);
      stage = Object.values(mod).find(v => v && Array.isArray(v.rows));
    } catch (e) { fail(`${at}: ${e.message}`); continue; }
    if (!stage) { fail(`${at}: exports no stage`); continue; }
    const problems = lint(stage);
    for (const p of problems) fail(`${at}: ${p}`);
    if (problems.length) continue;
    if (s.kind && s.kind !== kindOf(stage)) fail(`${at}: listed as ${s.kind} but the module is ${kindOf(stage)}`);
    const r = check(stage, { limit: 2_000_000 });
    if (!r.ok) for (const p of r.problems) fail(`${at}: ${p}`);
    else ok(true, `${at}: ${stage.name}, ${kindOf(stage)}, par ${r.par}`);
  }
  for (const f of readdirSync(dir)) {
    const m = /^([a-z0-9][a-z0-9-]*)\.js$/.exec(f);
    if (f.endsWith('.js') && !m) fail(`stages/community/${f}: the file name must be a lower-case slug`);
    if (m && !listed.has(m[1])) fail(`stages/community/${f} is not in index.json`);
  }
  ok(true, `${listed.size} community room(s) listed`);
}

if (failed) { console.error(`verify-maker: ${failed} failure(s)`); process.exit(1); }
console.log('verify-maker: the maker judges, writes and reads rooms as the site does');
