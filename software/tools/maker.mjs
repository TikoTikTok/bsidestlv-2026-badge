#!/usr/bin/env node
// Serves the checkout and opens the level maker.
//
//   npm run maker                 # http://localhost:8080/maker.html in your browser
//   npm run maker -- --port 9000  # another port
//   npm run maker -- --no-open    # just serve: an assistant opens the page in its own browser pane
//
// The site is static files at the repository root and ES modules need
// http://, so a server is the one thing a level builder has to run. This is
// that server, in Node alone (./serve.sh is the same with Python, minus the
// bridge): it serves the repo root as GitHub Pages would, and mounts the
// bridge at /__maker/ through which an assistant drives the studio
// (software/tools/maker-server.mjs says how; maker-mcp.mjs speaks it as MCP
// tools). Loopback only.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMaker, openInBrowser } from './maker-server.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);
const port = +(args[args.indexOf('--port') + 1] || 0) || 8080;
const open = !args.includes('--no-open');

// Windows lets a second server bind a port another process is serving, so EADDRINUSE is not the whole story: ask first
const answering = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(800) }).then(() => true, () => false);
if (answering) { console.error(`port ${port} is taken - is a server already running there? try --port ${port + 1}`); process.exit(1); }

try {
  const { url } = await startMaker({ root, port, log: (s) => console.log(`  bridge: ${s}`) });
  console.log(`Alice in AI Land - the level maker -> ${url}/maker.html`);
  console.log(`serving ${root}; the assistant's bridge is ${url}/__maker/ (loopback only); Ctrl+C stops it`);
  if (open) openInBrowser(`${url}/maker.html`);
  else console.log(`no browser opened: open ${url}/maker.html yourself - an assistant opens it in its own browser pane, the one you both see`);
} catch (e) {
  if (e.code === 'EADDRINUSE') { console.error(`port ${port} is taken - is a server already running? try --port ${port + 1}`); process.exit(1); }
  throw e;
}
