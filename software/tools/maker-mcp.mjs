#!/usr/bin/env node
// Alice in AI Land - the level studio as MCP tools, so an assistant that
// speaks the Model Context Protocol (Claude Code, Claude Desktop, Cursor,
// anything with a stdio MCP client) can look at the room on the page, paint
// it, prove it, play it, talk to the person at the keyboard and ship it.
//
//   .mcp.json at the repository root registers it: open the clone in Claude
//   Code and the tools are there. By hand:
//     claude mcp add alice-maker -- node software/tools/maker-mcp.mjs
//   or any client: command `node`, args `software/tools/maker-mcp.mjs`,
//   env MAKER_URL (default http://localhost:8080).
//
// Every tool is one request to the bridge software/tools/maker-server.mjs
// mounts under /__maker/ when `npm run maker` is serving the checkout; the
// page (src/bridge.js) does the work and answers. maker_open starts that
// server and the page when nothing is listening. No dependencies: JSON-RPC
// over stdio, newline-delimited, as the protocol specifies.
//
// The first room with a person goes through maker_guide (src/guide.js): say
// hello (any tool does), wait for their pick on the welcome banner
// (maker_guide { waitMs }), then follow the step it returns - what to say,
// what to ask, what to do - and pass every answer back (maker_guide { answer }).

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { MAKER_TUTORIALS } from '../../src/tutor.js';   // pure data, no DOM: the guided builds' ids for maker_tutorial
import { GUIDE_MODES, GUIDE_IDS } from '../../src/guide.js';   // the White Rabbit's guide: the three ways, for maker_guide

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const base = () => (process.env.MAKER_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const NAME = process.env.MAKER_AGENT ?? 'an assistant';

const LEVEL_SCHEMA = {
  type: 'object', description: 'A stage: the same object a stages/*.js module exports. A room has rows; a glitch range level has range and that range\'s fields instead (src/rangecheck.js RANGE_FIELDS).',
  properties: {
    name: { type: 'string' },
    theme: { type: 'string', enum: ['garden', 'hall', 'court'] },
    rows: { type: 'array', items: { type: 'string' }, description: "A room's ASCII map, one string per row: # wall, . floor, A Alice, O rock, b button, L lever, G gate, D door. Walled all round, 4x4 to 24x24." },
    tickMs: { type: 'number', description: 'Timed rooms only: the clock, 100..2000 ms (320 is the shipped one). A lock level: one comparison, in ms.' },
    hazards: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, character: { type: 'string', enum: ['queen', 'cheshire', 'rabbit', 'hatter'] }, route: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, sight: { type: 'number' } }, required: ['id', 'route'] } },
    range: { type: 'string', enum: ['watch', 'glass', 'lock', 'dog', 'wall'], description: 'A level for one of the glitch range\'s games on glitch.html instead of a room. Its fields: watch { pool, length, windowMs, hand }; glass { lineMs, pulseMaxLines, listing (lines: one "!" target, "*" crash lines, goto label, delay(n), ret; the good ending calls alice_jump, the honest one alice_bounce), hidden }; lock { pool, length, tickMs, jitterTicks, order prefix|secret, hand }; dog { button, kicks, openMs, timeoutMs, hand }; wall { pool, size, canary, address [2], gapMs, hidden, listing, hand }. Pools, buttons and addresses are badge buttons (UP DOWN LEFT RIGHT A B X Y); hand is the design intent the checker measures. short (a word for the tab) and blurb are optional.' },
    blurb: { type: 'string' },
    short: { type: 'string' },
  },
  required: ['name'],
};

const TOOLS = [
  { name: 'maker_status', description: 'Is the level maker serving and is its page open? Says how to get there when not. Call this first.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_open', description: 'Start `npm run maker` (the server and the bridge) and open maker.html in the browser, if nothing is listening yet. Returns the status.', inputSchema: { type: 'object', properties: { port: { type: 'number' } } } },
  { name: 'maker_get', description: 'The room on the page right now: the level, what lint says, the last Check, the game if one is running, the tool and brush in hand.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_guide', description: `The White Rabbit's guide to building a first room WITH the person, one step at a time (src/guide.js). With no arguments: where things stand and the current step as plain instructions - what to SAY, what to ASK (one question, a few options; use your option buttons if you have them), what to DO on the board, when it is DONE. The ways: ${GUIDE_MODES.map(m => `${m.id} ("${m.title}", ${m.kicker})`).join(', ')}. After saying hello, call it with waitMs to wait for the person's pick on the welcome banner; mode picks a way for them (when they answered in words); answer passes their answer to the step's question (the guide decides: next step, this step again with the knobs turned, help, or why) - add run: true to have the bridge run the step's ops for you; help: true (with run) does the step for them when they ask for a shortcut; next / back / restart / step move along; show: true brings the banner back; vars sets what the steps fill in (name, theme, author…); platform ('claude', 'codex', 'cursor', 'copilot', 'gemini', 'hermes', 'grok', 'any') words the ask for your controls. Follow the text it returns exactly.`,
    inputSchema: { type: 'object', properties: { waitMs: { type: 'number' }, mode: { type: 'string', enum: GUIDE_IDS }, answer: { type: 'string' }, at: { type: 'number', description: 'with answer: the step (0-based, the `at` you were shown) the answer is for, so an answer to a step the person has already finished is not taken for the next one' }, run: { type: 'boolean' }, help: { type: 'boolean' }, next: { type: 'boolean' }, back: { type: 'boolean' }, restart: { type: 'boolean' }, step: { type: 'number' }, show: { type: 'boolean' }, vars: { type: 'object' }, platform: { type: 'string' } } } },
  { name: 'maker_patch', description: 'Set some fields of the room on the page and leave the rest: name, theme (garden, hall, court), blurb, lesson (a list of { on, say } or one line a step as "event: words"), tickMs, hazards, short; null removes one. The person sees it at once; the studio\'s tutorial hears it as if typed.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, theme: { type: 'string', enum: ['garden', 'hall', 'court'] }, blurb: { type: 'string' }, lesson: {}, tickMs: { type: 'number' }, hazards: { type: 'array' }, short: { type: 'string' } } } },
  { name: 'maker_set_level', description: 'Replace the room on the page with this level. Returns what lint says about it. The person sees it drawn at once.', inputSchema: { type: 'object', properties: { level: LEVEL_SCHEMA }, required: ['level'] } },
  { name: 'maker_paint', description: 'Paint cells of the room on the page: a list of [x, y, ch] (x from the left, y from the top, ch one of # . A O b L G D). One undo step. Rooms only: a glitch level is set whole with maker_set_level.', inputSchema: { type: 'object', properties: { cells: { type: 'array', items: { type: 'array', items: {} } } }, required: ['cells'] } },
  { name: 'maker_check', description: 'Run what CI runs on the level on the page. A room: the real solver - solvable or not, par in moves or ticks, states searched, whether the gate is load-bearing, the difficulty, the moves. A glitch level: the budgets, a replay, a hand simulated on it, the attacker on a lock or a wall - hand or badge-only, the notes, the problems.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_play', description: 'Start Run & debug on the page: the room is played with the rules the site uses. Returns the game state. Rooms only: a glitch level plays on glitch.html (the studio\'s "Try it on the range").', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_moves', description: "Play moves in the running game as the badge would press them: a list of N S W E (and 'wait' in a timed room). Returns the game state after them, and the log lines. Rooms only.", inputSchema: { type: 'object', properties: { moves: { type: 'array', items: { type: 'string' } }, stepMs: { type: 'number' } }, required: ['moves'] } },
  { name: 'maker_press', description: 'Press one badge button on the page (UP DOWN LEFT RIGHT A B X Y SL SR START SELECT), held for holdMs.', inputSchema: { type: 'object', properties: { button: { type: 'string' }, holdMs: { type: 'number' } }, required: ['button'] } },
  { name: 'maker_reset', description: 'Reset the running game (START).', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_stop', description: 'Leave Run & debug and go back to the editor.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_say', description: 'Say something to the person in the page\'s chat panel. Keep it short; they see it at once.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'maker_read_chat', description: 'What the person typed in the page\'s chat after message number `since` (0 = everything), and the page\'s events between the lines: kind "guide" (they picked a way on the welcome banner), kind "tutorial" (a step of the guided build done: "✓ A rock (4 of 12)"), kind "chat" (their words). With waitMs, waits up to that long for a new line.', inputSchema: { type: 'object', properties: { since: { type: 'number' }, waitMs: { type: 'number' } } } },
  { name: 'maker_snapshot', description: 'A picture of the board (the editor) or the run (the game), as the person sees it.', inputSchema: { type: 'object', properties: { what: { type: 'string', enum: ['board', 'run'] } } } },
  { name: 'maker_load', description: 'Load into the page: a shipped stage (tea-party, queens-gauntlet), a starter (blank, wide, corridor, gate, two-rooms, hall), a community level by its id, or a shipped glitch range level as a copy to edit by <range>:<id> - watch: tea-time, late, very-late, no-hello; glass: sleepy, quick, blind; lock: who, temper, explain; dog: forty-winks, twinkle, treacle-well; wall: pleased, great-fall, kings-horses (the id alone works when one range has it).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'maker_generate', description: 'Draw a random room from a seed and put it on the page, keeping only one the solver clears. Options: width, height, rocks, walls (0..0.3 density), gate, timed, cast, seed, minPar. Rooms only: refused while a glitch level is on the page.', inputSchema: { type: 'object', properties: { seed: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, rocks: { type: 'number' }, walls: { type: 'number' }, gate: { type: 'boolean' }, timed: { type: 'boolean' }, cast: { type: 'number' }, minPar: { type: 'number' } } } },
  { name: 'maker_module', description: 'The stage module for the room as the page would export it: the file that goes to stages/community/<id>.js, with its id and the index.json line.', inputSchema: { type: 'object', properties: { author: { type: 'string' } } } },
  { name: 'maker_pr_brief', description: 'Everything needed to open the pull request for the room on the page: the module, the index line, the branch and the steps, as a brief to follow in a checkout (also id, file, source, indexLine and branch as data). Read it, then do what it says and nothing else.', inputSchema: { type: 'object', properties: { author: { type: 'string' } } } },
  { name: 'maker_tool', description: 'Set the studio\'s tool (pencil, line, rect, fill, pick), brush (# . A O b L G D), symmetry (none, h, v, both) or an overlay (grid, coords, stuck, reach, path, sight: true/false).', inputSchema: { type: 'object', properties: { tool: { type: 'string' }, brush: { type: 'string' }, symmetry: { type: 'string' }, overlay: { type: 'string' }, on: { type: 'boolean' } } } },
  { name: 'maker_share', description: 'A link that carries the room on the page (?level=): nothing is uploaded, the whole room is in the address. Pasted anywhere it opens the same room - in the studio of a checkout (where: "studio", the default; the published landing shows it in its hero), or as a playable card on the stages page (where: "stages"). format "b64" is compact base64url (the default), "json" the room\'s JSON, readable but longer; play: true adds play=1 so the studio opens it in Run & debug; parts: { lesson, blurb, theme } set to false to leave one out. Returns { url, token, chars, format, where, warnings } - a warning says when the link is long enough to be cut by a chat or a QR code.', inputSchema: { type: 'object', properties: { format: { type: 'string', enum: ['b64', 'json'] }, where: { type: 'string', enum: ['studio', 'stages'] }, play: { type: 'boolean' }, parts: { type: 'object', properties: { lesson: { type: 'boolean' }, blurb: { type: 'boolean' }, theme: { type: 'boolean' } } } } } },
  { name: 'maker_tutorial', description: `The studio's guided builds (the Learn panel on the page): which one the person is on, its current step (or 'done'), at / of. With no arguments it only reads. id opens one - ${MAKER_TUTORIALS.map(t => `${t.id} ("${t.title}", ${t.steps.length} steps)`).join(', ')}; skip skips that many steps (1 for the current one); restart starts it over. The coach line on the page follows, so say what you are doing.`, inputSchema: { type: 'object', properties: { id: { type: 'string', enum: MAKER_TUTORIALS.map(t => t.id) }, skip: { type: 'number' }, restart: { type: 'boolean' } } } },
];

async function api(method, path, body) {
  let res;
  try { res = await fetch(`${base()}/__maker${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { throw new Error(`nothing is listening at ${base()} (${e.cause?.code ?? e.message}): run \`npm run maker\` in the checkout, or call maker_open`); }
  const out = await res.json().catch(() => ({ error: `${res.status} from the bridge` }));
  if (!res.ok) throw new Error(out.error ?? `${res.status} from the bridge`);
  return out;
}
const rpc = async (op, args, timeoutMs) => (await api('POST', '/rpc', { op, args, timeoutMs })).result;
let greeted = false;
const greet = async () => { if (!greeted) { await api('POST', '/hello', { name: NAME }).catch(() => {}); greeted = true; } };

async function open(port) {
  const status = await api('GET', '/').catch(() => null);
  if (status) return status;
  const url = new URL(base());
  const p = port ?? (+url.port || 8080);
  const child = spawn(process.execPath, [resolve(root, 'software/tools/maker.mjs'), '--port', String(p)], { cwd: root, stdio: 'ignore', detached: true });
  child.on('error', () => {}); child.unref();
  process.env.MAKER_URL = `http://localhost:${p}`;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    const s = await api('GET', '/').catch(() => null);
    if (s) { greeted = false; return s; }
  }
  throw new Error(`started the maker on port ${p} but it did not answer in 10 s`);
}

async function call(name, a = {}) {
  if (name === 'maker_status') { const s = await api('GET', '/'); return s.page ? s : { ...s, hint: 'the server is up but no maker.html is open: open http://localhost:' + (new URL(base()).port || 80) + '/maker.html, or call maker_open' }; }
  if (name === 'maker_open') return open(a.port);
  await greet();
  switch (name) {
    case 'maker_get': return rpc('get');
    case 'maker_set_level': return rpc('set', { level: a.level });
    case 'maker_patch': return rpc('patch', a);
    case 'maker_guide': {
      if (a.show) return api('POST', '/guide', { show: true, platform: a.platform });
      const drive = ['mode', 'answer', 'run', 'help', 'next', 'back', 'restart', 'step', 'vars'].some(k => a[k] !== undefined);
      if (drive) return api('POST', '/guide', { mode: a.mode, answer: a.answer, at: a.at, run: a.run, help: a.help, next: a.next, back: a.back, restart: a.restart, step: a.step, vars: a.vars, platform: a.platform ?? 'claude' });
      return api('GET', `/guide?wait=${a.waitMs ?? 0}${a.platform ? `&platform=${encodeURIComponent(a.platform)}` : ''}`);
    }
    case 'maker_paint': return rpc('paint', { cells: a.cells });
    case 'maker_check': return rpc('check', {}, 90_000);
    case 'maker_play': return rpc('play');
    case 'maker_moves': return rpc('moves', { moves: a.moves, stepMs: a.stepMs }, 120_000);
    case 'maker_press': return rpc('press', { button: a.button, holdMs: a.holdMs });
    case 'maker_reset': return rpc('reset');
    case 'maker_stop': return rpc('stop');
    case 'maker_say': return rpc('say', { text: a.text, from: NAME });
    case 'maker_read_chat': return api('GET', `/inbox?since=${a.since ?? 0}&wait=${a.waitMs ?? 0}`);
    case 'maker_snapshot': { const r = await rpc('snapshot', { what: a.what ?? 'board' }); return { image: r.png, note: r.note }; }
    case 'maker_load': return rpc('load', { id: a.id });
    case 'maker_generate': return rpc('generate', a, 120_000);
    case 'maker_module': return rpc('module', { author: a.author });
    case 'maker_pr_brief': return rpc('pr', { author: a.author });
    case 'maker_tool': return rpc('tool', a);
    case 'maker_share': return rpc('share', { format: a.format, where: a.where, play: a.play, parts: a.parts });
    case 'maker_tutorial': return rpc('tutorial', { id: a.id, skip: a.skip, restart: a.restart });
    default: throw new Error(`no such tool: ${name}`);
  }
}

const content = (r) => {
  if (r && typeof r === 'object' && typeof r.image === 'string' && r.image.startsWith('data:image/png;base64,'))
    return [{ type: 'image', data: r.image.slice('data:image/png;base64,'.length), mimeType: 'image/png' }, ...(r.note ? [{ type: 'text', text: r.note }] : [])];
  return [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 1) }];
};

const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  const { id, method, params = {} } = msg;
  const reply = (result) => { if (id !== undefined) out({ jsonrpc: '2.0', id, result }); };
  try {
    if (method === 'initialize') return reply({ protocolVersion: params.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'alice-maker', version: '1.0.0' }, instructions: 'The level studio of Alice in AI Land. Call maker_status first; maker_open starts the page when nothing is listening. Your first tool call says hello for you, which pops the welcome banner on the person\'s screen: then maker_guide { waitMs: 120000 } waits for their pick and returns the first step of the White Rabbit\'s guide - follow its text exactly, one step at a time, and pass every answer back with maker_guide { answer }. The person sees every change you make on their screen, so say what you are doing with maker_say and read their replies with maker_read_chat.' });
    if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return;
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: TOOLS });
    if (method === 'tools/call') {
      try { reply({ content: content(await call(params.name, params.arguments ?? {})), isError: false }); }
      catch (e) { reply({ content: [{ type: 'text', text: e.message }], isError: true }); }
      return;
    }
    if (id !== undefined) out({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (e) {
    if (id !== undefined) out({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
  }
});
rl.on('close', () => process.exit(0));
