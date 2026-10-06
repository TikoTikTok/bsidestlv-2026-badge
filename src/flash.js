// Alice in AI Land - the flash page: a firmware onto the badge, from the
// browser, over WebUSB.
//
// The protocol is src/picoboot.js and the image handling src/uf2.js; this
// file is the page: which firmwares are on offer, where their builds come
// from, the button, the progress bar and the words the log says.
//
// The images are built by the site's own deploy (.github/workflows/pages.yml)
// into firmware/, next to a firmware/index.json that says which commit they
// came from. A local checkout served by ./serve.sh has no firmware/ - the
// cards say so, and a .uf2 from disk still flashes.

import { parseUf2, planSectors, describe } from './uf2.js';
import { Picoboot, flashSectors, BOOT_FILTERS, BOOT_VID, BOOT_PID_RP2040 } from './picoboot.js';

const $ = (sel) => document.querySelector(sel);

// What is on offer. `file` is relative to the site root; the manifest fills
// in the build facts at load time.
const IMAGES = [
  {
    id: 'glitch',
    name: 'Quick glitch controller',
    file: 'firmware/glitch.uf2',
    blurb: 'The badge as a wired DualShock 4 with the quick-glitch layer the range is played with: ' +
           'SELECT is the shift key, SELECT+SL records, SELECT+SR fires, and SELECT+START held two ' +
           'seconds brings the badge back to this page. Built from software/controller.',
  },
];

const MANIFEST = 'firmware/index.json';

// ------------------------------------------------------------------ the log ----

const logEl = $('#flashLog');
const statusEl = $('#flashStatus');
const progressEl = $('#progress');
const flashBtn = $('#flashBtn');
const downloadBtn = $('#downloadBtn');

function log(text, kind = '') {
  const li = document.createElement('li');
  li.textContent = text;
  if (kind) li.className = kind;
  logEl.prepend(li);
  return li;
}
const setStatus = (text, kind = '') => { statusEl.textContent = text; statusEl.className = `status ${kind}`; };
const fmtBytes = (n) => n.toLocaleString('en') + ' bytes';
const hexId = (vid, pid) => `${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')}`;

// ----------------------------------------------------------------- WebUSB ----

const usb = navigator.usb ?? null;
const usbState = $('#usbState');

function refreshUsbState(extra) {
  if (!usb) {
    usbState.textContent = 'no WebUSB in this browser';
    usbState.classList.remove('on');
    return;
  }
  usbState.textContent = extra ?? 'WebUSB ready';
  usbState.classList.toggle('on', !!extra);
}

if (usb) {
  refreshUsbState();
  // a bootloader this page was once allowed to use shows up without asking
  usb.getDevices?.().then(devs => {
    const boot = devs.find(d => d.vendorId === BOOT_VID && d.productId === BOOT_PID_RP2040);
    if (boot) refreshUsbState(`bootloader on the bus (${boot.productName ?? 'RP2 Boot'})`);
  }).catch(() => {});
  usb.addEventListener('connect', (e) => {
    if (e.device.vendorId === BOOT_VID && e.device.productId === BOOT_PID_RP2040) {
      refreshUsbState(`bootloader on the bus (${e.device.productName ?? 'RP2 Boot'})`);
      log('a bootloader appeared on the bus');
    }
  });
  usb.addEventListener('disconnect', (e) => {
    if (e.device.vendorId === BOOT_VID && e.device.productId === BOOT_PID_RP2040) {
      refreshUsbState();
      log('the bootloader dropped off the bus' + (flashing ? '' : ' - the badge rebooted, or was unplugged'));
    }
  });
} else {
  refreshUsbState();
  log('this browser has no WebUSB; download the .uf2 and copy it onto RPI-RP2 instead', 'hot');
}

// -------------------------------------------------------------- the images ----

let manifest = null;        // firmware/index.json, when the host has one
let selected = null;        // { kind: 'image', image, build } | { kind: 'file', name, bytes }
let flashing = false;
let fakeDevice = null;      // scripted tests drop a model of the bootloader here

const cards = new Map();

function buildCards() {
  const host = $('#images');
  host.textContent = '';
  for (const image of IMAGES) {
    const label = document.createElement('label');
    label.className = 'image';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'image';
    radio.value = image.id;
    const title = document.createElement('b');
    title.textContent = image.name;
    const facts = document.createElement('small');
    facts.className = 'facts';
    facts.textContent = 'looking for a build…';
    const blurb = document.createElement('span');
    blurb.className = 'blurb';
    blurb.textContent = image.blurb;
    label.append(radio, title, facts, blurb);
    radio.addEventListener('change', () => { if (radio.checked) selectImage(image); });
    host.append(label);
    cards.set(image.id, { label, radio, facts });
  }
}

function showBuild(image) {
  const { label, facts, radio } = cards.get(image.id);
  const build = manifest?.images?.[image.id];
  facts.textContent = '';
  if (!build) {
    label.classList.add('off');
    radio.disabled = true;
    facts.textContent = manifest
      ? 'this deploy did not build it'
      : 'no build on this host - the site\'s deploy makes one; locally, pick a .uf2 below';
    return;
  }
  label.classList.remove('off');
  radio.disabled = false;
  const when = manifest.built ? new Date(manifest.built) : null;
  const parts = [];
  if (when && !Number.isNaN(when.getTime())) parts.push('built ' + when.toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
  if (build.bytes) parts.push(fmtBytes(build.bytes));
  facts.append(parts.join(' · '));
  if (manifest.commit) {
    facts.append(' · ');
    const short = manifest.commit.slice(0, 7);
    if (manifest.repository) {
      const a = document.createElement('a');
      a.href = `${manifest.repository}/commit/${manifest.commit}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = short;
      facts.append(a);
    } else {
      facts.append(short);
    }
    if (manifest.branch) facts.append(` on ${manifest.branch}`);
  }
}

function selectImage(image) {
  const build = manifest?.images?.[image.id];
  if (!build) return;
  selected = { kind: 'image', image, build, bytes: null };
  $('#file').value = '';
  for (const [id, c] of cards) c.label.classList.toggle('on', id === image.id);
  downloadBtn.href = image.file;
  downloadBtn.download = build.file ?? image.file.split('/').pop();
  downloadBtn.hidden = false;
  setStatus(`${image.name} · ${fmtBytes(build.bytes)}` + (usb ? ' — put the badge in the bootloader and press Flash' : ''));
  flashBtn.disabled = !usb;
  // have the bytes ready before the button is pressed: requestDevice() must
  // run inside the click, and a slow fetch would spend the gesture
  fetchImage(selected).catch(e => { log(`could not load ${image.file}: ${e.message}`, 'hot'); });
}

async function fetchImage(sel) {
  if (sel.bytes) return sel.bytes;
  const r = await fetch(sel.image.file, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (sel.build.sha256 && crypto?.subtle) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hex = [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex !== sel.build.sha256.toLowerCase()) {
      throw new Error('the download does not match the manifest\'s SHA-256 - a stale cache or a cut-off transfer; reload and try again');
    }
  } else if (sel.build.bytes && bytes.length !== sel.build.bytes) {
    throw new Error(`the download is ${bytes.length} bytes, the manifest says ${sel.build.bytes}`);
  }
  sel.bytes = bytes;
  return bytes;
}

$('#file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  for (const c of cards.values()) { c.label.classList.remove('on'); c.radio.checked = false; }
  downloadBtn.hidden = true;
  try {
    const image = parseUf2(bytes);
    selected = { kind: 'file', name: f.name, bytes };
    setStatus(`${f.name} · ${describe(image)}` + (usb ? ' — put the badge in the bootloader and press Flash' : ''));
    flashBtn.disabled = !usb;
  } catch (err) {
    selected = null;
    flashBtn.disabled = true;
    setStatus(`${f.name}: ${err.message}`, 'hot');
  }
});

async function loadManifest() {
  try {
    const r = await fetch(MANIFEST, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    manifest = await r.json();
  } catch (e) {
    manifest = null;
    log(`no ${MANIFEST} on this host (${e.message}); the deploy writes it`);
  }
  for (const image of IMAGES) showBuild(image);
  const first = IMAGES.find(i => manifest?.images?.[i.id]);
  if (first) { cards.get(first.id).radio.checked = true; selectImage(first); }
}

// ------------------------------------------------------------- the flash ----

function progress({ phase, done, total }) {
  const span = { erase: [0, 0.45], write: [0, 0.45], verify: [0.45, 0.95], reboot: [0.95, 1] }[phase] ?? [0, 1];
  const frac = total ? done / total : 1;
  progressEl.value = span[0] + (span[1] - span[0]) * (phase === 'erase' ? frac : phase === 'write' ? frac : frac);
  progressEl.hidden = false;
  const words = { erase: 'erasing', write: 'writing', verify: 'reading back', reboot: 'rebooting' };
  setStatus(`${words[phase]} ${Math.min(done + 1, total)} of ${total} sectors`, 'busy');
}

async function flash() {
  if (flashing || !selected) return;
  if (!usb && !fakeDevice) { setStatus('no WebUSB in this browser', 'hot'); return; }
  flashing = true;
  flashBtn.disabled = true;
  progressEl.hidden = false;
  progressEl.value = 0;
  let conn = null;
  try {
    // the chooser first: it must run inside the click
    setStatus('choose RP2 Boot in the browser\'s list', 'busy');
    const device = fakeDevice ?? await usb.requestDevice({ filters: BOOT_FILTERS });
    log(`bootloader: ${device.manufacturerName ?? '?'} ${device.productName ?? '?'} ${hexId(device.vendorId, device.productId)}` +
        (device.serialNumber ? ` serial ${device.serialNumber}` : ''));

    const bytes = selected.kind === 'file' ? selected.bytes : await fetchImage(selected);
    const image = parseUf2(bytes);
    const sectors = planSectors(image);
    const what = selected.kind === 'file' ? selected.name : selected.image.file;
    log(`${what}: ${describe(image)} → ${sectors.length} sectors`);

    conn = new Picoboot(device);
    conn.log = (line) => log('  ' + line, 'dim');
    const iface = await conn.open();
    log(`claimed interface ${iface.interfaceNumber}, endpoints out ${iface.outEp} / in ${iface.inEp}`);

    const t0 = performance.now();
    await flashSectors(conn, sectors, { onProgress: progress });
    const ms = Math.round(performance.now() - t0);
    progressEl.value = 1;
    log(`✓ ${sectors.length} sectors written and read back in ${ms} ms; the badge is rebooting`, 'win');
    await conn.close();
    conn = null;
    setStatus('done — press any button on the badge', 'win');
    watchForController();
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (/No device selected/i.test(msg)) {
      setStatus('no device chosen - is the badge in the bootloader?');
      log('the chooser was closed without a device; hold BootSel while plugging the badge in, or SELECT+START for two seconds');
    } else if (/Access denied|LIBUSB_ERROR_ACCESS|permission/i.test(msg)) {
      setStatus('the browser may not open the device', 'hot');
      log(`${msg} — on Linux this is the udev rule below; on Windows, close anything else holding the bootloader`, 'hot');
    } else if (/Unable to claim|claim/i.test(msg)) {
      setStatus('could not claim the PICOBOOT interface', 'hot');
      log(`${msg} — another program (picotool?) has it, or the driver did not bind; re-plug and try again`, 'hot');
    } else {
      setStatus(msg, 'hot');
      log(`✗ ${msg}`, 'hot');
    }
    if (conn) await conn.close().catch(() => {});
  } finally {
    flashing = false;
    flashBtn.disabled = !selected || !(usb || fakeDevice);
  }
}
flashBtn.addEventListener('click', flash);

// After the reboot the badge is a gamepad again, and a browser only lists a
// gamepad once a button on it has been pressed: so ask for one, and watch.
let watchTimer = null;
function watchForController() {
  clearInterval(watchTimer);
  const t0 = performance.now();
  watchTimer = setInterval(() => {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find(p => p && p.connected);
    if (gp) {
      clearInterval(watchTimer);
      log(`the browser sees the controller: ${gp.id}`, 'win');
      setStatus('the badge is back as the controller — the glitch range is a tab away', 'win');
    } else if (performance.now() - t0 > 60000) {
      clearInterval(watchTimer);
      log('no gamepad seen in 60 s; if the LED blinks at 250 ms the badge is waiting for a host - re-plug it');
    }
  }, 250);
}

// ------------------------------------------------------------------ start ----

buildCards();
await loadManifest();

// scripted tests: drop a model of the bootloader in, select, flash
window.__flash = {
  useDevice(dev) { fakeDevice = dev; flashBtn.disabled = !selected; },
  useFile(name, bytes) { selected = { kind: 'file', name, bytes }; flashBtn.disabled = false; },
  flash,
  get selected() { return selected; },
  get manifest() { return manifest; },
};
