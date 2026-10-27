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

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const base = () => (process.env.MAKER_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const NAME = process.env.MAKER_AGENT ?? 'an assistant';

const LEVEL_SCHEMA = {
  type: 'object', description: 'A stage: the same object a stages/*.js module exports.',
  properties: {
    name: { type: 'string' },
    theme: { type: 'string', enum: ['garden', 'hall', 'court'] },
    rows: { type: 'array', items: { type: 'string' }, description: "The ASCII map, one string per row: # wall, . floor, A Alice, O rock, b button, L lever, G gate, D door. Walled all round, 4x4 to 24x24." },
    tickMs: { type: 'number', description: 'Timed rooms only: the clock, 100..2000 ms (320 is the shipped one).' },
    hazards: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, character: { type: 'string', enum: ['queen', 'cheshire', 'rabbit', 'hatter'] }, route: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, sight: { type: 'number' } }, required: ['id', 'route'] } },
  },
  required: ['name', 'rows'],
};

const TOOLS = [
  { name: 'maker_status', description: 'Is the level maker serving and is its page open? Says how to get there when not. Call this first.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_open', description: 'Start `npm run maker` (the server and the bridge) and open maker.html in the browser, if nothing is listening yet. Returns the status.', inputSchema: { type: 'object', properties: { port: { type: 'number' } } } },
  { name: 'maker_get', description: 'The room on the page right now: the level, what lint says, the last Check, the game if one is running, the tool and brush in hand.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_set_level', description: 'Replace the room on the page with this level. Returns what lint says about it. The person sees it drawn at once.', inputSchema: { type: 'object', properties: { level: LEVEL_SCHEMA }, required: ['level'] } },
  { name: 'maker_paint', description: 'Paint cells of the room on the page: a list of [x, y, ch] (x from the left, y from the top, ch one of # . A O b L G D). One undo step.', inputSchema: { type: 'object', properties: { cells: { type: 'array', items: { type: 'array', items: {} } } }, required: ['cells'] } },
  { name: 'maker_check', description: 'Run the real solver on the room (what CI runs): solvable or not, par in moves or ticks, states searched, whether the gate is load-bearing, the difficulty, the moves.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_play', description: 'Start Run & debug on the page: the room is played with the rules the site uses. Returns the game state.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_moves', description: "Play moves in the running game as the badge would press them: a list of N S W E (and 'wait' in a timed room). Returns the game state after them, and the log lines.", inputSchema: { type: 'object', properties: { moves: { type: 'array', items: { type: 'string' } }, stepMs: { type: 'number' } }, required: ['moves'] } },
  { name: 'maker_press', description: 'Press one badge button on the page (UP DOWN LEFT RIGHT A B X Y SL SR START SELECT), held for holdMs.', inputSchema: { type: 'object', properties: { button: { type: 'string' }, holdMs: { type: 'number' } }, required: ['button'] } },
  { name: 'maker_reset', description: 'Reset the running game (START).', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_stop', description: 'Leave Run & debug and go back to the editor.', inputSchema: { type: 'object', properties: {} } },
  { name: 'maker_say', description: 'Say something to the person in the page\'s chat panel. Keep it short; they see it at once.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'maker_read_chat', description: 'What the person typed in the page\'s chat after message number `since` (0 = everything). With waitMs, waits up to that long for a new line.', inputSchema: { type: 'object', properties: { since: { type: 'number' }, waitMs: { type: 'number' } } } },
  { name: 'maker_snapshot', description: 'A picture of the board (the editor) or the run (the game), as the person sees it.', inputSchema: { type: 'object', properties: { what: { type: 'string', enum: ['board', 'run'] } } } },
  { name: 'maker_load', description: 'Load a shipped stage (tea-party, queens-gauntlet), a starter (blank, wide, corridor, gate, two-rooms, hall) or a community room by its id into the page.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'maker_generate', description: 'Draw a random room from a seed and put it on the page, keeping only one the solver clears. Options: width, height, rocks, walls (0..0.3 density), gate, timed, cast, seed, minPar.', inputSchema: { type: 'object', properties: { seed: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, rocks: { type: 'number' }, walls: { type: 'number' }, gate: { type: 'boolean' }, timed: { type: 'boolean' }, cast: { type: 'number' }, minPar: { type: 'number' } } } },
  { name: 'maker_module', description: 'The stage module for the room as the page would export it: the file that goes to stages/community/<id>.js, with its id and the index.json line.', inputSchema: { type: 'object', properties: { author: { type: 'string' } } } },
  { name: 'maker_tool', description: 'Set the studio\'s tool (pencil, line, rect, fill, pick), brush (# . A O b L G D), symmetry (none, h, v, both) or an overlay (grid, coords, stuck, reach, path, sight: true/false).', inputSchema: { type: 'object', properties: { tool: { type: 'string' }, brush: { type: 'string' }, symmetry: { type: 'string' }, overlay: { type: 'string' }, on: { type: 'boolean' } } } },
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
    case 'maker_tool': return rpc('tool', a);
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
    if (method === 'initialize') return reply({ protocolVersion: params.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'alice-maker', version: '1.0.0' }, instructions: 'The level studio of Alice in AI Land. Call maker_status first; maker_open starts the page when nothing is listening. The person sees every change you make on their screen, so say what you are doing with maker_say and read their replies with maker_read_chat.' });
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
