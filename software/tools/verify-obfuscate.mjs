// Proves the deploy-time obfuscation (obfuscate.mjs) changes nothing a page
// does: obfuscates a copy of the published tree into a temporary directory,
// parses every output, runs the verify suite against the copy (the solvers,
// the ranges, the flasher, the vault, the gate - every module Node can load)
// and checks the surface a page depends on is intact: every export, every
// import specifier, no comment left, every string packed, the lure in.
//
// A handful of constructs that bit while writing the renamer are pinned as
// regressions, each run plain and obfuscated with the same result.
//
//   node software/tools/verify-obfuscate.mjs

import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { obfuscate, obfuscateTree, tokenize, lurePath } from './obfuscate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
let failed = 0;
const fail = (msg) => { failed++; console.error(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok   ${msg}`);

// ---------------------------------------------------------------- regressions
// Each sample exports `result`; plain and obfuscated must agree.
const SAMPLES = {
  'multiplication is not a generator method': `
    const BEACON = { level: (n) => 8 + 16 * n, x: 2 };
    export function f(w) { const y = 3; return (() => y * w + 1)() + BEACON.level(w) * BEACON.x; }
    export const result = f(2);`,
  'a property called catch, for or function is not a keyword': `
    const p = { catch: (f) => f(1), for: 2, function: 3 };
    export function loadStage(id) { return p.catch(x => x + id) + p.for + p.function; }
    export const result = loadStage(4);`,
  'template literals inside arrow bodies and declarations': `
    const tag = (a) => \`\${a.map(x => \`<\${x}>\`).join('')}\`;
    export function f(list) { const s = \`n=\${list.length} \${tag(list)}\`; return s; }
    export const result = f(['a', 'b']);`,
  'shorthand properties and destructuring': `
    export function f({ a, b: c = 2, ...rest }, [d, , e = 5]) {
      const { x, y = 1 } = { x: a };
      const o = { a, c, x, y, d, e, rest };
      return JSON.stringify(o);
    }
    export const result = f({ a: 1, k: 9 }, [3, 4]);`,
  'block, for-head and catch scopes': `
    const i = 'outer';
    export function f() {
      let out = [];
      for (let i = 0; i < 2; i++) out.push(i);
      for (const i of ['x']) out.push(i);
      { const i = 'block'; out.push(i); }
      try { throw new Error('e'); } catch (i) { out.push(i.message); } catch2: ;
      out.push(i);
      return out.join(',');
    }
    export const result = f();`,
  'classes, getters, methods and labels': `
    class Heap {
      constructor(size) { this.size = size; this.items = []; }
      get length() { return this.items.length; }
      push(v) { this.items.push(v); return this; }
      static of(size) { return new Heap(size); }
    }
    export function f(size) {
      const h = Heap.of(size).push(1).push(2);
      let n = 0;
      outer: for (const a of [1, 2]) { for (const b of [3]) { n += a * b; if (a === 2) break outer; } }
      return h.length + n + h.size;
    }
    export const result = f(7);`,
  'strings in every position': `
    'use strict';
    const o = { 'quoted key': 1, plain: 'value', ['comp' + 'uted']: 2 };
    export function f(k) { switch (k) { case 'a': return o['quoted key'] + o.plain.length; default: return o.computed + "\\u00b0\\n".length; } }
    export const result = f('a') + f('z');`,
  'regex after a close paren is a division, elsewhere a literal': `
    export function f(s) { const n = (s.length) / 2; return /a+/.test(s) ? n : -n; }
    export const result = f('baaa');`,
  'var hoisting and function declarations in blocks': `
    export function f(flag) {
      if (flag) { var v = 1; function g() { return v + 1; } return g(); }
      return v === undefined ? 'hoisted' : 'no';
    }
    export const result = String(f(true)) + f(false);`,
};

console.log('obfuscate: regressions');
const tmp = mkdtempSync(join(tmpdir(), 'alice-obf-'));
try {
  for (const [name, src] of Object.entries(SAMPLES)) {
    const plain = join(tmp, 'plain.mjs');
    const obf = join(tmp, 'obf.mjs');
    writeFileSync(plain, src);
    const { out } = obfuscate(src, `samples/${name.replace(/\W+/g, '-')}.js`);
    writeFileSync(obf, out);
    try {
      const a = (await import(pathToFileURL(plain).href + '?v=' + Math.random())).result;
      const b = (await import(pathToFileURL(obf).href + '?v=' + Math.random())).result;
      if (a !== b) fail(`${name}: plain ${JSON.stringify(a)} vs obfuscated ${JSON.stringify(b)}\n${out}`);
      else ok(name);
    } catch (e) { fail(`${name}: ${e.message}\n${out}`); }
  }

  // ---------------------------------------------------------------- the tree
  console.log('obfuscate: the published tree');
  const site = join(tmp, 'site');
  mkdirSync(join(site, 'software', 'tools'), { recursive: true });
  for (const f of ['index.html', 'glitch.html', 'flash.html', 'badge.html', 'maker.html']) cpSync(join(repo, f), join(site, f));
  for (const d of ['src', 'stages']) cpSync(join(repo, d), join(site, d), { recursive: true });
  for (const f of ['verify-stage', 'verify-chase', 'verify-range', 'verify-flash', 'verify-badge', 'check-stage', 'fake-badge', 'fake-bootloader'])
    cpSync(join(here, `${f}.mjs`), join(site, 'software', 'tools', `${f}.mjs`));

  const originals = new Map();
  const walk = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name), out) : out.push(join(d, e.name)); return out; };
  for (const f of walk(site).filter(f => f.endsWith('.js') && !f.includes('software'))) originals.set(f, readFileSync(f, 'utf8'));

  const report = obfuscateTree(site);
  const modules = report.filter(r => r.renamed !== undefined);
  if (modules.length !== originals.size) fail(`obfuscated ${modules.length} modules, expected ${originals.size}`);
  const totalRenamed = modules.reduce((a, r) => a + r.renamed, 0);
  const totalPacked = modules.reduce((a, r) => a + r.packed, 0);
  if (totalRenamed < 1000) fail(`only ${totalRenamed} bindings renamed`);
  if (totalPacked < 500) fail(`only ${totalPacked} strings packed`);
  ok(`${modules.length} modules, ${totalRenamed} bindings renamed, ${totalPacked} strings packed`);

  const exportsOf = (src) => {
    const names = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\s*\*?\s*|class\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const n of m[1].split(',')) { const nm = n.trim().split(/\s+as\s+/).pop(); if (nm) names.add(nm); }
    return names;
  };
  const specifiersOf = (src) => new Set([...src.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)].map(m => m[2]));
  for (const [f, src] of originals) {
    const out = readFileSync(f, 'utf8');
    const rel = f.slice(site.length + 1);
    // parses
    const check = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (check.status !== 0) { fail(`${rel} does not parse:\n${check.stderr}`); continue; }
    // exports and import specifiers intact
    const a = exportsOf(src), b = exportsOf(out);
    for (const n of a) if (!b.has(n)) fail(`${rel}: export ${n} lost`);
    const sa = specifiersOf(src), sb = specifiersOf(out);
    for (const n of sa) if (!sb.has(n)) fail(`${rel}: import from ${n} lost`);
    // no comment from the source survives (only the lure's), no string literal left outside the lure and the blob
    const toks = tokenize(out);
    const comments = toks.filter(t => t.t === 'comment');
    if (comments.length !== 1 || !comments[0].v.includes('rabbit-hole/?p=' + lurePath(rel))) fail(`${rel}: expected exactly the lure comment, found ${comments.length}`);
    const srcComments = tokenize(src).filter(t => t.t === 'comment').map(t => t.v.replace(/^\/\/\s*|^\/\*+\s*|\s*\*+\/$/g, '').trim()).filter(c => c.length > 24);
    for (const c of srcComments) if (out.includes(c)) { fail(`${rel}: a source comment survived: ${c.slice(0, 60)}`); break; }
    // what may stay: object keys, import specifiers, the packed blob (after atob) and the decoy's own literals
    const sigToks = toks.map((t, i) => ({ ...t, i })).filter(t => t.t !== 'ws' && t.t !== 'comment');
    const leaked = [];
    sigToks.forEach((t, k) => {
      if (t.t !== 'str' || t.v.length <= 2) return;
      const p = sigToks[k - 1], nx = sigToks[k + 1];
      const key = p && p.t === 'punct' && (p.v === '{' || p.v === ',') && nx && nx.t === 'punct' && nx.v === ':';
      const specifier = p && p.t === 'id' && (p.v === 'from' || p.v === 'import');
      const blob = p && p.t === 'punct' && p.v === '(' && sigToks[k - 2]?.v === 'atob';
      const decoy = t.v.includes(lurePath(rel)) || /^['"](flag:|alice:|BSidesTLV\{|\}|\/|0)['"]$/.test(t.v);
      if (!(key || specifier || blob || decoy)) leaked.push(t.v);
    });
    if (leaked.length) fail(`${rel}: ${leaked.length} string literal(s) not packed, e.g. ${leaked[0]}`);
  }
  if (!failed) ok('every module parses, keeps its exports and imports, carries one comment (the lure) and no bare strings');

  for (const page of ['index.html', 'glitch.html', 'flash.html', 'badge.html', 'maker.html']) {
    const out = readFileSync(join(site, page), 'utf8');
    const comments = [...out.matchAll(/<!--[\s\S]*?-->/g)];
    if (comments.length !== 1 || !comments[0][0].includes('rabbit-hole/?p=' + lurePath(page))) fail(`${page}: expected exactly the lure comment`);
    if (!out.includes('src="src/')) fail(`${page}: lost its scripts`);
  }
  ok('every page carries the lure and nothing else in comments');

  // the verify suite against the obfuscated copy
  for (const v of ['verify-stage', 'verify-chase', 'verify-range', 'verify-flash', 'verify-badge', 'check-stage']) {
    const args = v === 'check-stage' ? ['stages/tea-party.js', 'stages/queens-gauntlet.js'] : [];
    const r = spawnSync(process.execPath, [join(site, 'software', 'tools', `${v}.mjs`), ...args], { cwd: site, encoding: 'utf8' });
    if (r.status !== 0) fail(`${v} against the obfuscated copy:\n${r.stdout}\n${r.stderr}`);
    else ok(`${v} passes against the obfuscated copy`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failed) { console.error(`verify-obfuscate: ${failed} failure(s)`); process.exit(1); }
console.log('verify-obfuscate: the obfuscated site behaves exactly like the source');
