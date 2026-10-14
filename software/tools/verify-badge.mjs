// Proves the badge gate works without a badge: src/vault.js reads and writes
// the vault of a model of the firmware (fake-badge.mjs) over the WebHID
// surface and decodes its stick-axis beacon at browser sampling rates, the
// wire formats match the firmware's host test (test_vault.c) byte for byte,
// src/seal.js round-trips a stage under a badge key and refuses the wrong
// one, src/pad.js only lets the badge in outside a dev host, and src/gate.js
// knows when the badge has gone (the watch behind the reconnect dialog).
//
//   node software/tools/verify-badge.mjs

import { parseVaultReport, buildSetReport, BeaconDecoder, beaconAxes, beaconFrame, crc32,
         CMD, STATE, REPORT_ID, REPORT_LEN, BEACON, hex, unhex } from '../../src/vault.js';
import { seal, unseal, isSealed } from '../../src/seal.js';
import { Pad, isDevHost, sourcesFor, isBadgeId, BADGE_PRODUCT, BUTTONS, FLIP, flipButton, isUpsideDown, flipFor, readGamepad } from '../../src/pad.js';
import { BadgeWatch } from '../../src/gate.js';
import { FakeBadge } from './fake-badge.mjs';

let failed = 0;
const fail = (msg) => { failed++; console.error(`  FAIL ${msg}`); };
const ok = (cond, msg) => { if (!cond) fail(msg); };
const throws = (fn, re, msg) => {
  try { fn(); fail(`${msg}: did not throw`); }
  catch (e) { if (!re.test(e.message)) fail(`${msg}: threw "${e.message}"`); }
};
const rejects = async (p, re, msg) => {
  try { await p; fail(`${msg}: did not reject`); }
  catch (e) { if (!re.test(e.message)) fail(`${msg}: rejected with "${e.message}"`); }
};
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// the key and serial test_vault.c uses, so both tests can pin the same bytes
const KEY = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xFF);
const SERIAL = Uint8Array.from([0xE6, 0x60, 0x58, 0x38, 0x83, 0x4B, 0x5A, 0x2E]);

// ------------------------------------------------------------ formats ----

console.log('vault: wire formats');
ok(crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, 'crc32 check value');
ok(crc32(new Uint8Array(0)) === 0, 'crc32 of nothing');
ok(hex(unhex('00ff10')) === '00ff10', 'hex round trip');
throws(() => unhex('abc'), /odd/, 'odd hex');

{
  const blank = new FakeBadge({ serial: SERIAL });
  const r = parseVaultReport(await blank.receiveFeatureReport(REPORT_ID));
  ok(r.version === 1 && !r.provisioned && r.key === null && r.label === '', 'blank badge parses as unprovisioned');
  ok(r.serialHex === 'e66058 38834b5a2e'.replace(' ', ''), `serial ${r.serialHex}`);
  ok(!r.selectHeld && !r.writeDenied && !r.writeOk, 'blank state flags');

  // a plain DualShock 4 answers 0xF1 with zeros: not a badge
  const zeros = new DataView(new Uint8Array(REPORT_LEN + 1).fill(0).buffer);
  zeros.setUint8(0, REPORT_ID);
  throws(() => parseVaultReport(zeros), /not a badge/, 'a real controller is refused');
  throws(() => parseVaultReport(new Uint8Array(10)), /expected 63/, 'short report refused');

  const set = buildSetReport(CMD.STORE, KEY, 'bsidestlv26');
  ok(set.length === REPORT_LEN && String.fromCharCode(...set.subarray(0, 5)) === 'ALICE' && set[5] === CMD.STORE, 'SET header');
  ok(same(set.subarray(6, 38), KEY) && String.fromCharCode(...set.subarray(38, 49)) === 'bsidestlv26', 'SET body');
  throws(() => buildSetReport(CMD.STORE, new Uint8Array(32), 'x'), /zero/, 'zero key refused by the page too');
  throws(() => buildSetReport(CMD.STORE, new Uint8Array(16), 'x'), /32 bytes/, 'short key refused');
  throws(() => buildSetReport(CMD.STORE, KEY, 'a label that is too long'), /at most 15/, 'long label refused');
  throws(() => buildSetReport(7), /unknown/, 'unknown command refused');
  ok(buildSetReport(CMD.ERASE)[5] === CMD.ERASE, 'ERASE builds');
}

// ------------------------------------------------------- write policy ----

console.log('vault: provisioning over WebHID');
{
  const badge = new FakeBadge({ serial: SERIAL });
  await badge.sendFeatureReport(REPORT_ID, buildSetReport(CMD.STORE, KEY, 'first'));
  let r = parseVaultReport(await badge.receiveFeatureReport(REPORT_ID));
  ok(r.provisioned && same(r.key, KEY) && r.label === 'first' && r.writeOk, 'first key stored without the chord');

  const other = Uint8Array.from({ length: 32 }, (_, i) => 0xA0 + i);
  await badge.sendFeatureReport(REPORT_ID, buildSetReport(CMD.STORE, other, 'second'));
  r = parseVaultReport(await badge.receiveFeatureReport(REPORT_ID));
  ok(same(r.key, KEY) && r.writeDenied && !r.writeOk, 'a re-key without SELECT is denied and reported');

  badge.selectHeld = true;
  r = parseVaultReport(await badge.receiveFeatureReport(REPORT_ID));
  ok(r.selectHeld, 'the chord shows in the state');
  await badge.sendFeatureReport(REPORT_ID, buildSetReport(CMD.STORE, other, 'second'));
  r = parseVaultReport(await badge.receiveFeatureReport(REPORT_ID));
  ok(same(r.key, other) && r.label === 'second' && r.writeOk, 're-key with SELECT held');

  badge.selectHeld = false;
  await badge.sendFeatureReport(REPORT_ID, buildSetReport(CMD.ERASE));
  ok(badge.provisioned, 'erase without SELECT is denied');
  badge.selectHeld = true;
  await badge.sendFeatureReport(REPORT_ID, buildSetReport(CMD.ERASE));
  r = parseVaultReport(await badge.receiveFeatureReport(REPORT_ID));
  ok(!r.provisioned && r.key === null && r.writeOk, 'erase with SELECT held');
  ok(badge.writes.length === 3, `three flash writes (${badge.writes.length})`);
}

// -------------------------------------------------------------- beacon ----

console.log('vault: the beacon');
{
  const badge = new FakeBadge({ serial: SERIAL, key: KEY, label: 'beacon' });
  const frame = badge.frame();
  ok(frame.length === BEACON.FRAME_BYTES && frame[0] === 1 && frame[1] === STATE.PROVISIONED, 'frame header');
  ok(same(frame.subarray(2, 10), SERIAL) && same(frame.subarray(10, 42), KEY), 'frame body');

  // the symbols test_vault.c pins, so the C encoder and this one agree
  ok(same(beaconAxes(frame, 0), [0x30, BEACON.level(0), BEACON.level(1), BEACON.level(0)]), 'symbol 0 as in test_vault.c');
  ok(same(beaconAxes(frame, 50), [0xD0, BEACON.level(1), BEACON.level(14), BEACON.level(6)]), 'symbol 1 as in test_vault.c');
  ok(same(beaconAxes(frame, 31 * 50), [0x80, 0x80, 0x80, 0x80]), 'the gap');
  ok(beaconAxes(frame, BEACON.PERIOD_MS)[0] === 0x30, 'repeats');

  // decode what a browser would hand the page, sampled at 60 Hz from any phase
  for (let phase = 0; phase < 50; phase += 7.3) {
    const dec = new BeaconDecoder();
    badge.chord(true, 1000);
    let got = null;
    for (let t = 1000 + phase; t < 1000 + 2 * BEACON.PERIOD_MS + 100 && !got; t += 1000 / 60) got = dec.sample(badge.gamepad(t).axes);
    ok(got && same(got.key, KEY) && got.serialHex === hex(SERIAL) && got.provisioned && got.source === 'beacon',
       `60 Hz, phase ${phase.toFixed(1)} ms decodes`);
    badge.chord(false, 5000);
  }
  // slow and fast samplers, and the 4 ms poll pad.js uses
  for (const stepMs of [1000 / 30, 4, 1]) {
    const dec = new BeaconDecoder();
    badge.chord(true, 0);
    let got = null;
    for (let t = 3; t < 2 * BEACON.PERIOD_MS + 100 && !got; t += stepMs) got = dec.sample(badge.gamepad(t).axes);
    ok(got && same(got.key, KEY), `${(1000 / stepMs).toFixed(0)} Hz decodes`);
    badge.chord(false, 9999);
  }
  // nothing to decode from a plain pad: centred sticks never open a frame
  {
    const dec = new BeaconDecoder();
    badge.chord(false, 0);
    for (let t = 0; t < 3000; t += 16) ok(dec.sample(badge.gamepad(t).axes) === null, 'centred sticks are silence');
    ok(dec.progress === 0 && !dec.active, 'no frame in progress');
  }
  // a corrupted symbol fails the CRC and the decoder goes on to the next frame
  {
    const dec = new BeaconDecoder();
    badge.chord(true, 0);
    let got = null, n = 0;
    for (let t = 2; t < 3 * BEACON.PERIOD_MS && !got; t += 16, n++) {
      const axes = badge.gamepad(t).axes;
      if (t > 600 && t < 700) axes[2] = axes[2] > 0 ? axes[2] - 0.13 : axes[2] + 0.13;   // one nibble off by a level
      got = dec.sample(axes);
    }
    ok(got && same(got.key, KEY) && dec.bad >= 1 && dec.frames === 1, `a damaged frame is dropped (${dec.bad} bad), the next one lands`);
  }
  // an unprovisioned badge beacons its serial and no key
  {
    const blank = new FakeBadge({ serial: SERIAL });
    const dec = new BeaconDecoder();
    blank.chord(true, 0);
    let got = null;
    for (let t = 0; t < 2 * BEACON.PERIOD_MS && !got; t += 16) got = dec.sample(blank.gamepad(t).axes);
    ok(got && !got.provisioned && got.key === null && got.serialHex === hex(SERIAL), 'blank badge beacons without a key');
  }
  // the progress bar moves
  {
    const dec = new BeaconDecoder();
    badge.chord(true, 0);
    for (let t = 0; t < 800; t += 16) dec.sample(badge.gamepad(t).axes);
    ok(dec.active && dec.progress > 0.4 && dec.progress < 0.6, `progress mid-frame ${dec.progress.toFixed(2)}`);
  }
}

// ------------------------------------------------------- sealed stages ----

console.log('seal: a stage under the badge key');
{
  const { QUEENS_GAUNTLET } = await import('../../stages/queens-gauntlet.js');
  const blob = await seal(QUEENS_GAUNTLET, KEY, 'queens-gauntlet');
  ok(isSealed(blob) && blob.id === 'queens-gauntlet' && blob.kdf === 'HKDF-SHA256', 'sealed blob shape');
  ok(/^[0-9a-f]{32}$/.test(blob.salt) && /^[0-9a-f]{24}$/.test(blob.iv), 'salt and iv');
  ok(!JSON.stringify(blob).includes('#########'), 'the map is not in the clear');

  const back = await unseal(blob, KEY);
  ok(JSON.stringify(back) === JSON.stringify(QUEENS_GAUNTLET), 'round trip');

  const wrong = Uint8Array.from(KEY); wrong[3] ^= 1;
  await rejects(unseal(blob, wrong), /does not open/, 'wrong key');
  await rejects(unseal(blob, null), /needs the key/, 'no key');
  const tampered = { ...blob, ct: blob.ct.slice(0, 10) + (blob.ct[10] === 'A' ? 'B' : 'A') + blob.ct.slice(11) };
  await rejects(unseal(tampered, KEY), /does not open/, 'tampered ciphertext');
  await rejects(unseal({ ...blob, id: 'tea-party' }, KEY), /does not open/, 'renamed stage');
  await rejects(unseal({ sealed: 2 }, KEY), /not a sealed/, 'unknown format');
  await rejects(seal({}, KEY, 'Bad Id'), /stage id/, 'id rules');
  await rejects(seal({}, new Uint8Array(16), 'x'), /32 bytes/, 'key length');

  // two seals of the same stage differ (fresh salt and iv) and both open
  const again = await seal(QUEENS_GAUNTLET, KEY, 'queens-gauntlet');
  ok(again.ct !== blob.ct && again.salt !== blob.salt, 'fresh salt and iv per seal');
  ok(JSON.stringify(await unseal(again, KEY)) === JSON.stringify(QUEENS_GAUNTLET), 'second seal opens');
}

// --------------------------------------------------------- input policy ----

console.log('pad: who may play');
{
  // the badge is known by its name, in every browser's spelling of Gamepad.id
  ok(BADGE_PRODUCT.length <= 32, 'the product string fits the firmware\'s 32-character descriptor buffer');
  ok(isBadgeId(new FakeBadge().gamepad(0).id), 'the fake badge announces itself');
  for (const id of [`${BADGE_PRODUCT} (STANDARD GAMEPAD Vendor: 054c Product: 09cc)`, `054c-09cc-${BADGE_PRODUCT}`, BADGE_PRODUCT])
    ok(isBadgeId(id), `badge id recognised: ${id}`);
  for (const id of ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', '054c-09cc-Wireless Controller', 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', undefined])
    ok(!isBadgeId(id), `not a badge: ${id}`);
  ok(isDevHost('localhost') && isDevHost('127.0.0.1') && isDevHost('[::1]') && isDevHost(''), 'dev hosts');
  ok(!isDevHost('tikotiktok.github.io') && !isDevHost('bsidestlv.github.io') && !isDevHost('localhost.evil.example'), 'the site is not dev');
  ok(same([...sourcesFor(true)].sort(), ['key', 'pad', 'ui']), 'dev: every source');
  ok(same([...sourcesFor(false)], ['pad']), 'site: the badge only');

  const seen = [];
  const pad = new Pad({ sources: sourcesFor(false) });
  pad.on(e => seen.push(e));
  ok(pad.inject('A', true) === false && seen.length === 0, 'inject refused on the site');
  pad._emit('A', true, 1, 'key');
  ok(seen.length === 0 && !pad.held.has('A'), 'keyboard edge dropped on the site');
  pad._emit('A', true, 2, 'pad');
  ok(seen.length === 1 && seen[0].source === 'pad' && pad.held.has('A'), 'badge edge passes');

  const dev = new Pad({ sources: sourcesFor(true) });
  const got = [];
  dev.on(e => got.push(e));
  ok(dev.inject('B', true, 3) === true && got.length === 1 && got[0].source === 'ui', 'inject works in dev');

  // the gate's pause: while the badge is away no source reaches a listener
  pad.muted = true;
  pad._emit('B', true, 4, 'pad');
  ok(seen.length === 1 && !pad.held.has('B'), 'a badge edge is dropped while muted');
  dev.muted = true;
  ok(dev.inject('X', true, 5) === false && got.length === 1, 'inject says no while muted, even in dev');
  pad.muted = false;
  pad._emit('B', true, 6, 'pad');
  ok(seen.length === 2 && pad.held.has('B'), 'and passes again after');
}

// ------------------------------------------------- the phone upside down ----

console.log('pad: the phone (and so the badge) upside down');
{
  // a half turn is its own inverse, and it only moves the d-pad and the diamond
  ok(Object.keys(FLIP).every(b => FLIP[FLIP[b]] === b), 'FLIP is an involution');
  ok(same(Object.keys(FLIP).sort(), ['A', 'B', 'DOWN', 'LEFT', 'RIGHT', 'UP', 'X', 'Y']), 'FLIP turns the d-pad and the diamond only');
  ok(BUTTONS.filter(b => !(b in FLIP)).every(b => flipButton(b) === b), 'SL, SR, START, SELECT stay where they are');
  ok(flipButton('UP') === 'DOWN' && flipButton('LEFT') === 'RIGHT' && flipButton('A') === 'Y' && flipButton('B') === 'X', 'UP<->DOWN, LEFT<->RIGHT, A<->Y, B<->X');

  // what the screen says
  for (const type of ['portrait-secondary', 'landscape-secondary'])
    ok(isUpsideDown({ orientation: { type } }), `${type} is upside down`);
  for (const type of ['portrait-primary', 'landscape-primary'])
    ok(!isUpsideDown({ orientation: { type } }), `${type} is not`);
  ok(isUpsideDown({ orientation: undefined, angle: 180 }) && isUpsideDown({ orientation: {}, angle: -180 }), 'window.orientation 180 when screen.orientation is missing');
  ok(!isUpsideDown({ orientation: undefined, angle: 0 }) && !isUpsideDown({ orientation: undefined, angle: 90 }) && !isUpsideDown({ orientation: undefined, angle: undefined }), '0 / 90 / unknown are not');
  ok(flipFor('?flip=1') === true && flipFor('?flip=0') === false && flipFor('?look=bench') === 'auto' && flipFor('') === 'auto', '?flip= pins, otherwise auto');

  // a standard-mapping gamepad with cross (0) and d-pad UP (12) down, SL (4) too
  const gp = { mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: [0, 4, 12].includes(i), value: 0 })) };
  ok(same([...readGamepad(gp)].sort(), ['A', 'SL', 'UP']), 'the right way up: A, SL, UP');
  ok(same([...readGamepad(gp, true)].sort(), ['DOWN', 'SL', 'Y']), 'upside down: the same presses read DOWN, SL, Y');
  // the hat (Firefox raw mapping) turns too: north reads DOWN
  const raw = { mapping: '', axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -1], buttons: [] };
  ok(same([...readGamepad(raw)], ['UP']) && same([...readGamepad(raw, true)], ['DOWN']), 'the hat turns with it');

  // through a Pad: only gamepad edges turn; the keyboard and inject() are the right way up already
  const upside = new Pad({ sources: sourcesFor(true), flip: true });
  const got = [];
  upside.on(e => got.push(e.button));
  ok(upside.flipped === true, 'flip pinned on');
  upside.inject('A', true, 1);
  upside._emit('UP', true, 2, 'key');
  ok(same(got, ['A', 'UP']), 'inject and keyboard edges are not turned');
  ok(new Pad({ flip: false }).flipped === false && new Pad().flip === 'auto', 'pinned off, and auto is the default');
  const auto = new Pad();
  ok(auto.flipped === false, 'auto on a host with no screen.orientation: the right way up');
  const screenWas = globalThis.screen;
  globalThis.screen = { orientation: { type: 'landscape-secondary' } };
  ok(auto.flipped === true, 'auto follows screen.orientation');
  globalThis.screen = screenWas;

  // turned while a button is held: the next poll lets go of the old name and presses the new
  const gp2 = { id: BADGE_PRODUCT, index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
                buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 12, value: 0 })) };
  const navWas = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [gp2] }, configurable: true });
  const live = new Pad({ flip: false });
  const edges = [];
  live.on(e => edges.push(`${e.button}${e.down ? '+' : '-'}`));
  live._poll();
  live.flip = true;
  live._poll();
  live._poll();
  ok(same(edges, ['UP+', 'DOWN+', 'UP-']) && live.held.has('DOWN') && !live.held.has('UP'), 'held UP becomes a press of DOWN and a release of UP in the same poll');
  Object.defineProperty(globalThis, 'navigator', { value: navWas, configurable: true });
}

// ---------------------------------------------------------- the watch ----

console.log('gate: when the badge has gone');
{
  const badge = { id: `${BADGE_PRODUCT} (STANDARD GAMEPAD Vendor: 054c Product: 09cc)`, index: 0, mapping: 'standard', badge: true };
  const ds4 = { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', index: 0, mapping: 'standard', badge: false };
  const w = new BadgeWatch({ graceMs: 300 });
  ok(w.sample(null, 0) === null && w.sample(null, 5000) === null && !w.seen,
     'no gamepad before the badge ever showed is not a loss (a WebHID pass lists none until a press)');
  ok(w.sample(badge, 5100) === null && w.seen, 'the badge shows on the gamepad side: armed');
  ok(w.sample(null, 5200) === null && w.sample(null, 5400) === null, 'a blink shorter than the grace is not a loss');
  ok(w.sample(badge, 5450) === null && w.goneAt === null, 'back inside the grace: nothing happened');
  ok(w.sample(null, 5500) === null && w.sample(null, 5799) === null && w.sample(null, 5800) === 'lost', 'gone for the grace: lost');
  ok(w.sample(null, 6000) === null && w.sample(null, 9000) === null, 'said once, then quiet until the badge is seen again');
  ok(w.sample(badge, 9100) === null && w.sample(ds4, 9200) === null && w.sample(ds4, 9500) === 'lost',
     'another controller standing in for the badge is a loss too');
  w.sample(badge, 9600);
  w.reset();
  ok(!w.seen && w.sample(null, 20000) === null, 'reset disarms: a resume over WebHID waits for the badge to show again');
  ok(new BadgeWatch().graceMs === 300, 'the default grace');
}

if (failed) { console.error(`verify-badge: ${failed} failure(s)`); process.exit(1); }
console.log('verify-badge: the vault, the beacon, sealed stages, the input policy and the badge watch all check out');
