#!/usr/bin/env node
// Serves the checkout and opens the level maker.
//
//   npm run maker                 # http://localhost:8080/maker.html in your browser
//   npm run maker -- --port 9000  # another port
//   npm run maker -- --no-open    # just serve
//
// The site is static files at the repository root and ES modules need
// http://, so a server is the one thing a level builder has to run. This is
// that server, in Node alone (./serve.sh is the same with Python): it serves
// the repo root as GitHub Pages would, with the media types the pages
// expect, and nothing else. No directory listings, no writes.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);
const port = +(args[args.indexOf('--port') + 1] || 0) || 8080;
const open = !args.includes('--no-open');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.uf2': 'application/octet-stream', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(root, '.' + path);
  if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); res.end(); return; }
  let st;
  try { st = statSync(file); } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  if (st.isDirectory()) { res.writeHead(301, { location: path + '/' }); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.error(`port ${port} is taken - is a server already running? try --port ${port + 1}`); process.exit(1); }
  throw e;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}/maker.html`;
  console.log(`Alice in AI Land - the level maker -> ${url}`);
  console.log(`serving ${root}; Ctrl+C stops it`);
  if (!open) return;
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
            : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* the URL is printed */ }
});
