// Alice in AI Land - the gate: the badge is the key.
//
// On the published site a page does not play until a badge has shown its
// vault (src/vault.js), and src/pad.js then only listens to that gamepad.
// This module is the dialog that asks for it and the two ways of answering:
//
//   Connect     WebHID. One click, the browser's chooser, one feature report.
//               Chrome and Edge on a computer.
//   The beacon  SELECT + Y held on the badge spells the vault out on the
//               stick axes; the pad's poll feeds the decoder and a bar fills.
//               Any browser with a Gamepad API, which is every phone.
//
// What passing buys: the page's `badge` - serial, label and the 32-byte key
// that opens sealed stages (src/seal.js). Nothing is stored; unplug and
// reload and the badge is asked again. A blank badge (no key yet) passes
// too, since it is the board, and sealed stages then stay shut.
//
// On a dev host (localhost, see pad.js) there is no gate and every input
// source works, because that is how the pages are developed and driven
// headless. `?gate=1` brings the dialog up there to try it; it is ignored
// on the site, where the gate is always on.
//
// Honest limit: this is a static site and the gate is JavaScript in the
// visitor's browser. It decides what the *page* does; it cannot stop a
// visitor from editing it. What it cannot be edited around is the key, and
// that is why the stages worth protecting are sealed under it.

import { isDevHost, sourcesFor } from './pad.js';
import { hasHid, requestBadgeHid, grantedBadgesHid, readVaultHid, BeaconDecoder, BEACON } from './vault.js';

/** 'dev' or 'site': how this page should behave, from where it is served. */
export function gateMode(loc = location) {
  const dev = isDevHost(loc.hostname);
  if (!dev) return 'site';
  return new URLSearchParams(loc.search).get('gate') === '1' ? 'site' : 'dev';
}

/** The edge sources for this page's Pad, from the same answer. */
export const gateSources = (mode = gateMode()) => sourcesFor(mode === 'dev');

const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else n.setAttribute(k, v); }
  n.append(...children);
  return n;
};

/**
 * A stage that would not open - the words on the page instead of only in
 * the console. The page then stops where it is, which is the point.
 */
export function showRefusal(message) {
  const p = el('p', { class: 'refusal', role: 'alert' }, message);
  (document.querySelector('main') ?? document.body).prepend(p);
  return p;
}

/**
 * Ask for the badge and resolve with it. In dev mode resolves null at once.
 * `pad` is the page's Pad, already started: the beacon reads its axes and
 * the dialog shows what it sees.
 */
export function openGate({ pad, mode = gateMode() } = {}) {
  if (mode === 'dev') return Promise.resolve(null);

  return new Promise((resolve) => {
    const status = el('p', { class: 'gate-status', id: 'gateStatus' }, 'waiting for the badge…');
    const bar = el('progress', { class: 'gate-beacon', id: 'gateBeacon', max: '1', value: '0' });
    const connect = el('button', { class: 'btn', id: 'gateConnect', type: 'button' }, 'Connect the badge');
    const device = el('span', { class: 'gate-device', id: 'gateDevice' }, 'no gamepad seen yet');

    const dialog = el('dialog', { class: 'gate', id: 'gate', 'aria-labelledby': 'gateTitle' },
      el('div', { class: 'gate-mark', 'aria-hidden': 'true' }, '◆'),
      el('h2', { id: 'gateTitle' }, 'The badge is the key'),
      el('p', { class: 'note' }, 'Nothing here plays from a keyboard or a screen. Plug the BSidesTLV badge into this device and press any button on it.'),
      el('div', { class: 'gate-ways' },
        el('div', { class: 'gate-way' },
          el('h3', {}, hasHid() ? 'On this computer' : 'On a computer'),
          el('p', { class: 'note' }, hasHid()
            ? 'Press Connect and pick “Wireless Controller” in the chooser. The badge answers with its vault in one report.'
            : 'Chrome or Edge can read the badge directly over WebHID. This browser cannot, so use the beacon.'),
          hasHid() ? connect : el('span', {})),
        el('div', { class: 'gate-way' },
          el('h3', {}, 'On a phone, or any browser'),
          el('p', { class: 'note', html: 'Hold <kbd>SELECT</kbd> + <kbd>Y</kbd> on the badge. It spells its vault out on the stick axes; keep holding until the bar fills, about two seconds.' }),
          bar)),
      status,
      el('p', { class: 'gate-foot' }, 'gamepad: ', device),
    );
    document.body.append(dialog);
    dialog.addEventListener('cancel', (e) => e.preventDefault());   // Esc does not open the gate
    dialog.showModal();

    const decoder = new BeaconDecoder();
    let done = false;
    const say = (text, kind = '') => { status.textContent = text; status.className = `gate-status ${kind}`; };

    const pass = (vault, source) => {
      if (done) return;
      done = true;
      pad.onAxes = null;
      const badge = { serialHex: vault.serialHex, label: vault.label, key: vault.key, provisioned: vault.provisioned, source };
      document.documentElement.dataset.badge = badge.provisioned ? 'key' : 'blank';
      say(badge.provisioned
        ? `badge ${badge.serialHex} · ${badge.label || 'keyed'} · the key is in`
        : `badge ${badge.serialHex} · no key yet - the practice rooms are open, sealed stages are not`, 'win');
      bar.value = 1;
      setTimeout(() => { dialog.close(); dialog.remove(); clearInterval(watch); resolve(badge); }, 900);
    };

    // the beacon, off the pad's own poll
    pad.onAxes = (axes) => {
      const frame = decoder.sample(axes);
      bar.value = decoder.active ? decoder.progress : 0;
      if (frame) pass(frame, 'beacon');
      else if (decoder.active) say(`reading the beacon… ${Math.round(decoder.progress * BEACON.SYMBOLS)} of ${BEACON.SYMBOLS}`, 'busy');
      else if (decoder.bad && !done) say(`a frame did not check (${decoder.bad}); keep holding SELECT + Y`, 'hot');
    };

    // WebHID: a click, or a badge this origin was already granted
    const readHid = async (dev) => {
      try {
        const vault = await readVaultHid(dev);
        pass(vault, 'hid');
      } catch (e) {
        say(/not a badge/.test(e.message) ? 'that is a DualShock 4, not the badge' : `could not read the badge: ${e.message}`, 'hot');
      }
    };
    connect.addEventListener('click', async () => {
      connect.disabled = true;
      try {
        const dev = await requestBadgeHid();
        if (!dev) say('no device chosen', '');
        else await readHid(dev);
      } catch (e) {
        say(`WebHID refused: ${e.message}`, 'hot');
      } finally { connect.disabled = false; }
    });
    if (hasHid()) grantedBadgesHid().then(async (devs) => { if (devs[0] && !done) await readHid(devs[0]); }).catch(() => {});

    const watch = setInterval(() => {
      device.textContent = pad.device ? `${pad.device.id.replace(/\s*\(.*$/, '').slice(0, 40)} (${pad.device.mapping || 'raw'})` : 'none seen yet - press a button on it';
    }, 250);
  });
}
