#!/usr/bin/env node
// Seal a stage under the event key, or open a sealed one to check it.
//
//   ALICE_STAGE_KEY=<64 hex> node software/tools/seal-stage.mjs <stage.js|stage.json> [more...]
//       -> stages/sealed/<id>.json for each, where <id> is the file's base name
//   ALICE_STAGE_KEY=<64 hex> node software/tools/seal-stage.mjs --open stages/sealed/<id>.json
//       -> the stage as JSON on stdout
//   node software/tools/seal-stage.mjs --new-key
//       -> a fresh 32-byte key as hex (badge.html's Generate does the same)
//
// The key is the one the badges carry (badge.html writes it at the booth)
// and the one the Pages workflow has as a secret, so a sealed stage can be
// verified before it is deployed. A plain stage module is `export const X =
// { ... }` (stages/*.js); keep the event ones outside the repository - the
// sealed JSON is what gets committed and published, and src/seal.js on the
// page opens it with the key the badge hands over.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { seal, unseal } from '../../src/seal.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO, 'stages', 'sealed');
const MANIFEST = path.join(REPO, 'stages', 'sealed.json');   // the ids the page loads sealed

const args = process.argv.slice(2);
const usage = () => { console.error('usage: seal-stage.mjs [--open] <stage...> | --new-key   (ALICE_STAGE_KEY=<64 hex>)'); process.exit(2); };
if (!args.length) usage();

if (args[0] === '--new-key') {
  console.log(Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''));
  process.exit(0);
}

const keyHex = (process.env.ALICE_STAGE_KEY ?? '').replace(/[^0-9a-f]/gi, '');
if (keyHex.length !== 64) { console.error('ALICE_STAGE_KEY must be 64 hex characters (32 bytes); --new-key makes one'); process.exit(2); }
const key = Uint8Array.from(keyHex.match(/../g), h => parseInt(h, 16));

async function loadPlain(file) {
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const mod = await import(pathToFileURL(path.resolve(file)).href);
  const stage = Object.values(mod)[0];
  if (!stage || typeof stage !== 'object') throw new Error(`${file} exports no stage object`);
  return stage;
}

try {
  if (args[0] === '--open') {
    for (const file of args.slice(1)) {
      const blob = JSON.parse(fs.readFileSync(file, 'utf8'));
      const stage = await unseal(blob, key);
      console.log(JSON.stringify(stage, null, 2));
    }
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    for (const file of args) {
      const id = path.basename(file).replace(/\.(js|mjs|json)$/, '');
      const stage = await loadPlain(file);
      const blob = await seal(stage, key, id);
      const out = path.join(OUT, `${id}.json`);
      fs.writeFileSync(out, JSON.stringify(blob) + '\n');
      // open it again with the same key, so a bad seal never reaches the site
      await unseal(JSON.parse(fs.readFileSync(out, 'utf8')), key);
      console.log(`sealed ${file} -> ${path.relative(REPO, out)} (${blob.ct.length} chars of ciphertext, opens with this key)`);
    }
    // the manifest is what is on disk, so a removed blob drops out of it too
    const sealed = fs.readdirSync(OUT).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
    fs.writeFileSync(MANIFEST, JSON.stringify({ sealed }, null, 2) + '\n');
    console.log(`stages/sealed.json lists ${sealed.length} sealed stage(s)`);
  }
} catch (e) {
  console.error(`seal-stage: ${e.message}`);
  process.exit(1);
}
