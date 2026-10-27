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
//     POST /__maker/state         a mirror of the room (level, lint, report, game) after every change
//     POST /__maker/post          { text }: a line the person typed in the page's chat
//
//   an assistant (curl, or software/tools/maker-mcp.mjs)
//     GET  /__maker/              status: is a page open, which assistants said hello, the ops
//     POST /__maker/hello         { name }: announce yourself; the page shows it
//     POST /__maker/rpc           { op, args?, timeoutMs? } -> the page's answer (503 with no page open)
//     GET  /__maker/inbox?since=N&wait=MS    what the person typed after message N, long-polled
//     GET  /__maker/level         the mirrored room (what the page last reported)
//     PUT  /__maker/level         a room -> rpc 'set'
//
// The ops are the page's (src/maker.js, `ops`): get, set, paint, check, play,
// stop, reset, press, moves, say, snapshot, module, load, generate, tool.
// A request is refused unless its Host is the loopback and, when it carries
// an Origin, that Origin is this server: no page on the web can reach it.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.uf2': 'application/octet-stream', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

export const OPS = ['get', 'set', 'paint', 'check', 'play', 'stop', 'reset', 'press', 'moves', 'say', 'snapshot', 'module', 'load', 'generate', 'tool'];

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

/** The bridge's state and handlers, apart from the HTTP so a test can hold it. */
export function createBridge({ log = () => {} } = {}) {
  const pages = new Set();                 // SSE responses of open pages
  const pending = new Map();               // command id -> { resolve, timer }
  const agents = new Map();                // name -> last seen (ms)
  const inbox = [];                        // { n, text, at } the person typed
  const waiters = new Set();               // long-polls on the inbox
  let nextId = 1, nextN = 1, mirror = null, mirrorAt = 0;

  const send = (cmd) => { const line = `data: ${JSON.stringify(cmd)}\n\n`; for (const res of pages) res.write(line); };
  const status = () => ({
    bridge: 1, page: pages.size > 0, pages: pages.size, ops: OPS,
    agents: [...agents].map(([name, at]) => ({ name, seenMs: Date.now() - at })),
    inbox: nextN - 1, mirrorAt, mirror: mirror ? { name: mirror.level?.name, kind: mirror.kind, ok: mirror.report?.ok ?? null } : null,
  });

  function rpc(op, args = {}, { timeoutMs = 30_000 } = {}) {
    if (!OPS.includes(op)) return Promise.reject(Object.assign(new Error(`no such op: ${op}; the ops are ${OPS.join(', ')}`), { code: 400 }));
    if (!pages.size) return Promise.reject(Object.assign(new Error('no maker page is open: open http://localhost:<port>/maker.html on this machine (npm run maker opens it)'), { code: 503 }));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error(`the page did not answer '${op}' in ${timeoutMs} ms`), { code: 504 })); }, Math.min(Math.max(1000, timeoutMs), 120_000));
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
  function post(text) {
    const m = { n: nextN++, text: String(text), at: Date.now() };
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
    res.write(`data: ${JSON.stringify({ op: 'hello', args: { agents: [...agents.keys()] } })}\n\n`);
    pages.add(res);
    const beat = setInterval(() => res.write(': beat\n\n'), 15_000);
    res.on('close', () => { clearInterval(beat); pages.delete(res); log(`page gone (${pages.size} open)`); });
    log(`page attached (${pages.size} open)`);
  }
  function hello(name) {
    name = String(name || 'an assistant').slice(0, 48);
    agents.set(name, Date.now());
    send({ op: 'hello', args: { name, agents: [...agents.keys()] } });
    log(`${name} said hello`);
    return status();
  }
  function state(body) { mirror = body; mirrorAt = Date.now(); }
  const close = () => { for (const res of pages) res.end(); pages.clear(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('closed')); } pending.clear(); };

  return { status, rpc, reply, post, read, attach, hello, state, close, get mirror() { return mirror; }, get pages() { return pages.size; } };
}

/** The static server with the bridge mounted. Resolves once it listens. */
export function startMaker({ root, port = 8080, host = '127.0.0.1', log = console.log } = {}) {
  root = resolve(root);
  const bridge = createBridge({ log });

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
      if (req.method === 'POST' && path === '/post') { const b = await readBody(req); if (!b.text) return json(res, 400, { error: 'text?' }); return json(res, 200, bridge.post(b.text)); }
      if (req.method === 'POST' && path === '/hello') return json(res, 200, bridge.hello((await readBody(req)).name));
      if (req.method === 'GET' && path === '/inbox') return json(res, 200, { messages: await bridge.read(+q.get('since') || 0, +q.get('wait') || 0), latest: bridge.status().inbox });
      if (req.method === 'GET' && path === '/level') return bridge.mirror?.level ? json(res, 200, bridge.mirror.level) : json(res, 404, { error: 'no page has reported a room yet' });
      if (req.method === 'POST' && path === '/rpc') { const b = await readBody(req); return json(res, 200, { ok: true, result: await bridge.rpc(b.op, b.args ?? {}, { timeoutMs: b.timeoutMs }) }); }
      if (req.method === 'PUT' && path === '/level') return json(res, 200, { ok: true, result: await bridge.rpc('set', { level: await readBody(req) }) });
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
      ok({ server, bridge, port: at, url: `http://localhost:${at}`, close: () => new Promise((done) => { bridge.close(); server.close(() => done()); }) });
    });
  });
}
