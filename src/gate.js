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
// A new badge, or one still on the stock firmware, has neither: it shows
// up as a plain "Wireless Controller" (the badge firmware names itself, see
// BADGE_PRODUCT in src/pad.js). The dialog says so when it sees one and
// points at flash.html, which is never gated, so the way in for a fresh
// badge is: flash, come back, press a button.
//
// What passing buys: the page's `badge` - serial, label and the 32-byte key
// that opens sealed stages (src/seal.js). Nothing is stored; unplug and
// reload and the badge is asked again. A blank badge (no key yet) passes
// too, since it is the board, and sealed stages then stay shut.
//
// Passing is not the end of it. The badge is the only controller, so while
// it is away nothing can play: once a page has its badge the gate keeps
// watching the gamepad poll (and, after a WebHID pass, the device's own
// disconnect event), and when the badge goes the page is paused - the pad
// is muted, the page's clocks are told to stop (`onPause`) - and the same
// dialog comes back asking for the same badge. It proves itself again the
// same two ways; after a WebHID pass that happens by itself when the badge
// is plugged back in, since the grant stands. The page then carries on
// where it was (`onResume`). A different badge is a different key, so the
// page reloads to play under it. Cables wobble and a badge rebooting into
// the bootloader (SELECT + START) is a disconnect too; both land here.
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

import { isDevHost, sourcesFor, BADGE_PRODUCT } from './pad.js';
import { hasHid, requestBadgeHid, grantedBadgesHid, readVaultHid, BeaconDecoder, BEACON, BADGE_VID, BADGE_PID } from './vault.js';

/** 'dev' or 'site': how this page should behave, from where it is served. */
export function gateMode(loc = location) {
  const dev = isDevHost(loc.hostname);
  if (!dev) return 'site';
  return new URLSearchParams(loc.search).get('gate') === '1' ? 'site' : 'dev';
}

/** The edge sources for this page's Pad, from the same answer. */
export const gateSources = (mode = gateMode()) => sourcesFor(mode === 'dev');

/**
 * The rule for "the badge has gone", kept apart from the DOM so
 * verify-badge.mjs can prove it. Fed every poll's `pad.device`, it arms once
 * a named badge has shown on the gamepad side - after a WebHID pass Chrome
 * lists no gamepad until a button is pressed, and that is not a loss - and
 * then answers 'lost' once when the badge has been away, or another
 * controller has stood in its place, for `graceMs`. The grace is for a
 * poll that blinks; a real unplug is well past it.
 */
export class BadgeWatch {
  constructor({ graceMs = 300 } = {}) {
    this.graceMs = graceMs;
    this.reset();
  }

  /** Disarm: the next badge sighting arms it again. */
  reset() { this.seen = false; this.goneAt = null; }

  /** @param device the pad's current device record (or null) @param t now, ms */
  sample(device, t) {
    if (device && device.badge) { this.seen = true; this.goneAt = null; return null; }
    if (!this.seen) return null;
    if (this.goneAt === null) { this.goneAt = t; return null; }
    if (t - this.goneAt < this.graceMs) return null;
    this.reset();
    return 'lost';
  }
}

const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else n.setAttribute(k, v); }
  n.append(...children);
  return n;
};

const isBadgeDevice = (d) => !!d && d.vendorId === BADGE_VID && d.productId === BADGE_PID;

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
 * the dialog shows what it sees. After the pass the gate keeps watching:
 * `onPause(why)` is called when the badge goes (the pad is already muted),
 * `onResume()` when the same badge has proven itself again.
 */
export function openGate({ pad, mode = gateMode(), onPause, onResume } = {}) {
  if (mode === 'dev') return Promise.resolve(null);
  return ask(pad).then(({ badge, dev }) => {
    document.documentElement.dataset.badge = badge.provisioned ? 'key' : 'blank';
    keep({ pad, badge, dev, onPause, onResume });
    return badge;
  });
}

/**
 * After a pass: pause the page when the badge goes, bring the dialog back
 * for it, carry on when it is back. Two signals, either is enough: the
 * gamepad poll (BadgeWatch) and, after a WebHID pass, the HID disconnect
 * event - which also covers a browser that lists no gamepad until a press.
 */
function keep({ pad, badge, dev, onPause, onResume }) {
  const watch = new BadgeWatch();
  const passed = document.documentElement.dataset.badge;
  let paused = false;

  const lost = async (why) => {
    if (paused) return;
    paused = true;
    pad.muted = true;
    document.documentElement.dataset.badge = 'gone';
    onPause?.(why);

    const back = await ask(pad, badge);
    if (back.other) { location.reload(); return; }
    dev = back.dev;
    watch.reset();                      // arms again when the badge shows on the gamepad side
    pad.muted = false;
    document.documentElement.dataset.badge = passed;
    paused = false;
    onResume?.();
  };

  setInterval(() => {
    if (paused) return;
    if (watch.sample(pad.device, performance.now()) === 'lost') lost(pad.device ? 'another controller is in its place' : 'unplugged');
  }, 100);
  if (hasHid()) navigator.hid.addEventListener('disconnect', (e) => {
    if (dev && (e.device === dev || (isBadgeDevice(e.device) && !pad.device?.badge))) lost('unplugged');
  });
}

/**
 * The dialog. `again` is the badge to get back after a disconnect, null the
 * first time. Resolves { badge, dev, other }: the vault as the page's badge
 * record, the HIDDevice it came over (null for the beacon), and whether it
 * is a different badge from `again`.
 */
function ask(pad, again = null) {
  return new Promise((resolve) => {
    const hid = hasHid();
    const status = el('p', { class: 'gate-status', id: 'gateStatus' }, again ? 'paused - waiting for the badge to come back…' : 'waiting for the badge…');
    const bar = el('progress', { class: 'gate-beacon', id: 'gateBeacon', max: '1', value: '0' });
    const connect = el('button', { class: 'btn', id: 'gateConnect', type: 'button' }, 'Connect the badge');
    const device = el('span', { class: 'gate-device', id: 'gateDevice' }, 'no gamepad seen yet');
    const flashNote = el('p', { class: 'note gate-flash', id: 'gateFlash',
      html: `A <b>new badge</b>, or one still on the stock firmware, has no vault and no beacon yet - it shows up as a plain “Wireless Controller”. ` +
            `<a href="flash.html">Flash the firmware from this browser</a> (hold BootSel while plugging it in), then come back here and press a button on it.` });
    const who = again ? (again.label ? `“${again.label}” (${again.serialHex})` : `badge ${again.serialHex}`) : null;

    const dialog = el('dialog', { class: `gate${again ? ' reconnect' : ''}`, id: 'gate', 'aria-labelledby': 'gateTitle' },
      el('div', { class: 'gate-mark', 'aria-hidden': 'true' }, '◆'),
      el('h2', { id: 'gateTitle' }, again ? 'The badge is gone' : 'The badge is the key'),
      el('p', { class: 'note' }, again
        ? `The badge went away and the page is paused with it: nothing moves and nothing plays until it is back. Plug ${who} into this device again and press a button on it.`
        : 'Nothing here plays from a keyboard or a screen. Plug the BSidesTLV badge into this device and press any button on it.'),
      el('div', { class: 'gate-ways' },
        el('div', { class: 'gate-way' },
          el('h3', {}, hid ? 'On this computer' : 'On a computer'),
          el('p', { class: 'note' }, hid
            ? (again ? `Already granted: the badge is read again by itself when it comes back. Or press Connect and pick “${BADGE_PRODUCT}”.`
                     : `Press Connect and pick “${BADGE_PRODUCT}” in the chooser. The badge answers with its vault in one report.`)
            : 'Chrome or Edge can read the badge directly over WebHID. This browser cannot, so use the beacon.'),
          hid ? connect : el('span', {})),
        el('div', { class: 'gate-way' },
          el('h3', {}, 'On a phone, or any browser'),
          el('p', { class: 'note', html: 'Hold <kbd>SELECT</kbd> + <kbd>Y</kbd> on the badge. It spells its vault out on the stick axes; keep holding until the bar fills, about two seconds.' }),
          bar)),
      status,
      el('p', { class: 'gate-foot' }, 'gamepad: ', device),
    );
    if (!again) dialog.append(flashNote);   // a badge that has come back once had the firmware already
    document.body.append(dialog);
    dialog.addEventListener('cancel', (e) => e.preventDefault());   // Esc does not open the gate
    dialog.showModal();

    const decoder = new BeaconDecoder();
    let done = false;
    const say = (text, kind = '') => { status.textContent = text; status.className = `gate-status ${kind}`; };

    const pass = (vault, source, dev = null) => {
      if (done) return;
      done = true;
      pad.onAxes = null;
      if (hid) navigator.hid.removeEventListener('connect', onConnect);
      const badge = { serialHex: vault.serialHex, label: vault.label, key: vault.key, provisioned: vault.provisioned, source };
      const other = !!again && again.serialHex !== badge.serialHex;
      if (other) say(`badge ${badge.serialHex} is not ${again.serialHex}: a different badge, a different key - reloading to play under it`, 'hot');
      else if (again) say(`badge ${badge.serialHex} is back · ${badge.label || (badge.provisioned ? 'keyed' : 'no key')} · carrying on`, 'win');
      else say(badge.provisioned
        ? `badge ${badge.serialHex} · ${badge.label || 'keyed'} · the key is in`
        : `badge ${badge.serialHex} · no key yet - the practice rooms are open, sealed stages are not`, 'win');
      bar.value = 1;
      setTimeout(() => { dialog.close(); dialog.remove(); clearInterval(watch); resolve({ badge, dev, other }); }, 900);
    };

    // the beacon, off the pad's own poll
    pad.onAxes = (axes) => {
      const frame = decoder.sample(axes);
      bar.value = decoder.active ? decoder.progress : 0;
      if (frame) pass(frame, 'beacon');
      else if (decoder.active) say(`reading the beacon… ${Math.round(decoder.progress * BEACON.SYMBOLS)} of ${BEACON.SYMBOLS}`, 'busy');
      else if (decoder.bad && !done) say(`a frame did not check (${decoder.bad}); keep holding SELECT + Y`, 'hot');
    };

    // WebHID: a click, a badge this origin was already granted, or one that
    // is plugged in while the dialog is up (the grant stands across a replug)
    const readHid = async (dev) => {
      try {
        if (!dev.opened) await dev.open();
        const vault = await readVaultHid(dev);
        pass(vault, 'hid', dev);
      } catch (e) {
        if (/not a badge/.test(e.message)) {
          say('that controller has no vault: a DualShock 4, or a badge still on the stock firmware - flash it first (below), then come back', 'hot');
          flashNote.classList.add('hot');
        } else {
          say(`could not read the badge: ${e.message}`, 'hot');
        }
      }
    };
    const onConnect = (e) => { if (!done && isBadgeDevice(e.device)) readHid(e.device); };
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
    if (hid) {
      navigator.hid.addEventListener('connect', onConnect);
      grantedBadgesHid().then(async (devs) => { if (devs[0] && !done) await readHid(devs[0]); }).catch(() => {});
    }

    // the gamepad line, redrawn only when what it says changes (it holds a link)
    let shown = null;
    const watch = setInterval(() => {
      const d = pad.device;
      const key = d ? `${d.id}|${d.badge}` : '';
      if (key === shown) return;
      shown = key;
      device.textContent = '';
      device.className = 'gate-device';
      if (!d) { device.textContent = 'none seen yet - press a button on it'; return; }
      const name = `${d.id.replace(/\s*\(.*$/, '').slice(0, 40)} (${d.mapping || 'raw'})`;
      if (d.badge) {
        device.textContent = `${name} - the badge firmware is on it: Connect, or hold SELECT + Y`;
        device.classList.add('on');
      } else {
        device.append(`${name} - not announcing itself as the badge: a DualShock 4, or a badge still on the stock firmware. `,
                      el('a', { href: 'flash.html' }, 'Flash it'), ' and come back.');
        device.classList.add('hot');
        flashNote.classList.add('hot');
      }
    }, 250);
  });
}
