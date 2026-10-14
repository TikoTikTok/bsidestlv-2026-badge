// Alice in AI Land - the vault page (badge.html): read a badge's vault over
// WebHID, provision one at the booth, and try the beacon.
//
// The wire formats live in src/vault.js; this file is the page. A model of
// the badge (software/tools/fake-badge.mjs) can stand in for a board:
// window.__vault.useDevice(badge) makes the Connect button talk to it, and
// window.__vault.pad is the gamepad poll the beacon test reads.

import { Pad } from './pad.js';
import { hasHid, requestBadgeHid, readVaultHid, writeVaultHid, BeaconDecoder, BEACON, CMD, hex, unhex, KEY_LEN, LABEL_LEN } from './vault.js';

const $ = (sel) => document.querySelector(sel);

let device = null;          // the HIDDevice, or an injected model
let vault = null;           // the last parse
let revealed = false;

const setStatus = (sel, text, kind = '') => { const e = $(sel); e.textContent = text; e.className = `status ${kind}`; };

// ------------------------------------------------------------------- read ----

const maskKey = (k) => revealed ? hex(k) : `${hex(k).slice(0, 8)}…${hex(k).slice(-4)} (${KEY_LEN} bytes)`;

function show(v) {
  vault = v;
  $('#vSerial').textContent = v.serialHex;
  $('#vLabel').textContent = v.provisioned ? (v.label || '(none)') : '—';
  const state = [v.provisioned ? 'provisioned' : 'blank', v.selectHeld ? 'SELECT held' : null,
                 v.writeOk ? 'last write ok' : null, v.writeDenied ? 'last write denied' : null].filter(Boolean).join(' · ');
  $('#vState').textContent = state;
  $('#vState').className = v.writeDenied ? 'hot' : '';
  $('#vKey').textContent = v.key ? maskKey(v.key) : 'none';
  $('#vKey').className = v.key ? 'on' : '';
  $('#writeBtn').disabled = false;
  $('#eraseBtn').disabled = !v.provisioned;
  $('#readBtn').disabled = false;
  setStatus('#vaultStatus', v.provisioned ? `badge ${v.serialHex} · ${v.label || 'keyed'}` : `badge ${v.serialHex} · no key yet`, 'win');
  setStatus('#writeStatus', v.provisioned ? 'this badge has a key: hold SELECT on it to replace or erase' : 'blank badge: it takes its first key as it is');
}

async function read() {
  if (!device) return;
  try {
    show(await readVaultHid(device));
  } catch (e) {
    vault = null;
    setStatus('#vaultStatus', /not a badge/.test(e.message) ? 'that is a DualShock 4, not the badge: no vault in report 0xF1' : `read failed: ${e.message}`, 'hot');
    for (const id of ['vSerial', 'vLabel', 'vState', 'vKey']) $(`#${id}`).textContent = '—';
    $('#writeBtn').disabled = $('#eraseBtn').disabled = true;
  }
}

$('#connectBtn').addEventListener('click', async () => {
  if (!hasHid() && !device) { setStatus('#vaultStatus', 'no WebHID in this browser: use Chrome or Edge on a computer', 'hot'); return; }
  try {
    if (!device || !device.opened) {
      const d = await requestBadgeHid();
      if (!d) { setStatus('#vaultStatus', 'no device chosen'); return; }
      device = d;
    }
    await read();
  } catch (e) {
    setStatus('#vaultStatus', `WebHID: ${e.message}`, 'hot');
  }
});
$('#readBtn').addEventListener('click', read);
$('#revealBtn').addEventListener('click', () => {
  revealed = !revealed;
  $('#revealBtn').textContent = revealed ? 'hide' : 'show';
  if (vault?.key) $('#vKey').textContent = maskKey(vault.key);
});

// ------------------------------------------------------------------ write ----

$('#genBtn').addEventListener('click', () => {
  $('#keyInput').value = hex(crypto.getRandomValues(new Uint8Array(KEY_LEN)));
  setStatus('#writeStatus', 'a fresh key - copy it somewhere safe before writing it to anything');
});

function keyFromInput() {
  const key = unhex($('#keyInput').value);
  if (key.length !== KEY_LEN) throw new Error(`the key is ${key.length} bytes of hex, it needs ${KEY_LEN}`);
  return key;
}

async function write(cmd) {
  if (!device) return;
  try {
    const key = cmd === CMD.STORE ? keyFromInput() : null;
    const label = $('#labelInput').value.trim();
    if (new TextEncoder().encode(label).length > LABEL_LEN) throw new Error(`label over ${LABEL_LEN} bytes`);
    $('#writeBtn').disabled = $('#eraseBtn').disabled = true;
    setStatus('#writeStatus', cmd === CMD.STORE ? 'writing…' : 'erasing…', 'busy');
    const v = await writeVaultHid(device, cmd, key, label);
    show(v);
    if (v.writeDenied) setStatus('#writeStatus', 'the badge refused: hold SELECT on it and try again', 'hot');
    else if (cmd === CMD.STORE && v.key && hex(v.key) === hex(key)) setStatus('#writeStatus', `written and read back: ${v.label || '(no label)'}`, 'win');
    else if (cmd === CMD.ERASE && !v.provisioned) setStatus('#writeStatus', 'erased and read back blank', 'win');
    else setStatus('#writeStatus', 'the read-back does not match what was sent', 'hot');
  } catch (e) {
    setStatus('#writeStatus', e.message, 'hot');
    $('#writeBtn').disabled = false;
    $('#eraseBtn').disabled = !vault?.provisioned;
  }
}
$('#writeBtn').addEventListener('click', () => write(CMD.STORE));
$('#eraseBtn').addEventListener('click', () => write(CMD.ERASE));

// ----------------------------------------------------------------- beacon ----

const pad = new Pad().start();
const decoder = new BeaconDecoder();
pad.onAxes = (axes) => {
  const frame = decoder.sample(axes);
  $('#beaconBar').value = decoder.active ? decoder.progress : (frame ? 1 : 0);
  $('#bFrames').textContent = `${decoder.frames} good · ${decoder.bad} bad`;
  if (frame) {
    $('#bSerial').textContent = frame.serialHex;
    $('#bKey').textContent = frame.key ? maskKey(frame.key) : 'none (blank badge)';
    $('#bKey').className = frame.key ? 'on' : '';
    const matches = vault && vault.serialHex === frame.serialHex && hex(vault.key ?? []) === hex(frame.key ?? []);
    setStatus('#beaconStatus', `frame decoded · badge ${frame.serialHex}` + (vault ? (matches ? ' · matches the WebHID read' : ' · differs from the WebHID read') : ''), 'win');
  } else if (decoder.active) {
    setStatus('#beaconStatus', `reading… ${Math.round(decoder.progress * BEACON.SYMBOLS)} of ${BEACON.SYMBOLS} symbols`, 'busy');
  }
};
setInterval(() => {
  $('#bDevice').textContent = pad.device ? `${pad.device.id.replace(/\s*\(.*$/, '').slice(0, 40)} (${pad.device.mapping || 'raw'})` : 'none seen yet';
}, 300);

// ----------------------------------------------------------------- header ----

$('#hidState').textContent = hasHid() ? 'WebHID available' : 'no WebHID here - reading needs Chrome or Edge on a computer; the beacon works';
$('#hidState').classList.toggle('on', hasHid());

window.__vault = {
  pad, decoder,
  useDevice(dev) { device = dev; return read(); },
  get vault() { return vault; },
};
