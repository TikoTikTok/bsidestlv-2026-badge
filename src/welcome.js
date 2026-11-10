// The welcome: what a new visitor sees first. One dialog, raised once per
// device on the published site (localStorage alice.welcome) and again
// whenever "about" in the header is pressed: the promo, embedded
// (images/promo.mp4, 88 s, every frame a real capture of these pages;
// pages.yml stages it and its poster with the site, since images/ is not
// otherwise published), the three steps from the badge in the hand to Alice
// moving, what each page is, and the repository's doors. Every link is worked
// out from the address (src/repo.js), so a fork's site points at the fork; the
// header's GitHub link (#ghLink, written with the upstream URL) is pointed the
// same way, on every page, by this module.
//
// On the site the gate (src/gate.js) is already up when a page mounts this,
// so the welcome lands on top of it in the top layer: read, press "Let's go",
// and the gate is there. A dev host (localhost) opens it only when asked -
// ?welcome=1 always opens it, ?welcome=0 never - so a recording, a headless
// run or the maker's own first-visit picker is not interrupted; ?gate=1 on
// localhost is the site, as everywhere (src/look-boot.js sets data-host).
//
//   import { mountWelcome } from ./welcome.js   (no quotes here: the deploy's checker reads every quoted `from`)
//   mountWelcome()                      once per page, after openGate()
//   window.__welcome.show() / .hide()   headless; .open says whether it is up

import { repoUrlFor } from './repo.js';
import { mountPrompt } from './prompt.js';

export const WELCOME_KEY = 'alice.welcome';
export const PROMO = { src: 'images/promo.mp4', poster: 'images/promo-poster.jpg', seconds: 88 };

/** The pages, in the header's order, a line each. */
export const PLACES = [
  { href: 'index.html', name: 'The stages',
    what: 'Push every rock onto a button and walk Alice to the door. Two stages, every room the community made, thirteen prizes, and a guided first visit that ticks itself off as you play.' },
  { href: 'glitch.html', name: 'The glitch range',
    what: 'Five ranges for the badge\'s quick-glitch layer: a combo faster than a hand, a 20 ms pulse through a guard\'s one check, a door that gives its password away by how long it takes to say no, a watchdog\'s window, a stack to smash.' },
  { href: 'flash.html', name: 'Flash the badge',
    what: 'A new badge needs the firmware: hold BootSel, plug it in, press Flash. From this browser, over WebUSB, nothing to install.' },
  { href: 'badge.html', name: 'The vault',
    what: 'Read the stage key your badge carries - written at the booth, the key the sealed stages open under - and try the beacon.' },
  { href: 'maker.html', name: 'The level maker',
    what: 'Build a room of your own, with your favourite AI if you like, and send it in as a pull request. Every room is proved solvable before it ships.' },
];

/** The three steps. The second draws the badge with the chord held (src/prompt.js). */
export const STEPS = [
  { name: 'Plug the badge in',
    html: 'USB-C, into a phone or a computer. To the operating system it is a wired DualShock 4, so a phone binds it with no app to install. ' +
          'A badge still on the stock firmware shows up as a plain “Wireless Controller”: <a href="flash.html">flash it</a> first, from the browser.' },
  { name: 'Pass the gate', keys: ['SELECT', 'Y'],
    html: 'Nothing here plays from a keyboard or a screen. Press <b>Connect</b> (Chrome or Edge read the badge over WebHID) or hold ' +
          '<kbd>SELECT</kbd> + <kbd>Y</kbd> on the badge until the bar fills - that works in any browser, phones included.' },
  { name: 'Play',
    html: 'The d-pad moves Alice, <kbd>B</kbd> takes a move back, <kbd>START</kbd> starts over, <kbd>Y</kbd> waits a tick in a timed room. ' +
          'New here? <b>Learn</b> walks you through one press at a time, and the prizes say what else there is to do.' },
];

/** The repository's doors, for the repository at `repo`. */
export const repoLinks = (repo) => [
  { href: repo, name: 'The repository', what: 'the site, the boards, the firmware and every tool, in one place' },
  { href: `${repo}#readme`, name: 'The README', what: 'the long version of this page' },
  { href: `${repo}/tree/main/hardware`, name: 'The hardware', what: 'two KiCad 9 boards: the badge and the soldering kit' },
  { href: `${repo}/tree/main/software/controller`, name: 'The firmware', what: 'RP2040: a DualShock 4 with a quick-glitch layer and a vault' },
  { href: `${repo}/tree/main/software/docs`, name: 'The design', what: 'the game, the badge gate, the level maker, what a model does to a site' },
  { href: `${repo}/issues`, name: 'Issues', what: 'a bug, an idea, a question' },
  { href: `${repo}/fork`, name: 'Fork it', what: 'your copy publishes its own site, and the level maker\'s guide knows the way' },
];

/**
 * Whether the welcome opens by itself: ?welcome=1 always, ?welcome=0 never,
 * a dev host only when asked, the site once per device.
 */
export function welcomeWanted({ query = null, dev = false, seen = false } = {}) {
  if (query === '1') return true;
  if (query === '0') return false;
  if (dev) return false;
  return !seen;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const card = (cls, { href, name, what }, extra = '') =>
  `<a class="${cls}${extra}" href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}><b>${esc(name)}</b><small>${esc(what)}</small></a>`;

/** Build the dialog, point the header at the repository, open it when wanted. */
export function mountWelcome({ repo = repoUrlFor() } = {}) {
  const html = document.documentElement;
  const here = location.pathname.split('/').pop() || 'index.html';
  const gh = document.getElementById('ghLink');
  if (gh) gh.href = repo;

  const dialog = document.createElement('dialog');
  dialog.id = 'welcome'; dialog.className = 'welcome';
  dialog.setAttribute('aria-labelledby', 'welcomeTitle');
  dialog.innerHTML = `
    <button type="button" class="welcome-x" id="welcomeClose" aria-label="close">×</button>
    <p class="welcome-kicker">BSidesTLV 2026 · the badge and its challenge</p>
    <h2 id="welcomeTitle">Welcome to Alice in AI Land</h2>
    <p class="note welcome-lead">The badge in your hand is a game controller, the key to this site and a glitching tool. Plug it in and
      the site is yours: a boulder-pushing puzzle whose last answer is a program, five ranges to glitch, a level maker that takes your
      rooms - and all of it is open, the boards, the firmware and every page.</p>
    <div class="welcome-video">
      <video id="welcomeVideo" controls playsinline preload="none" poster="${PROMO.poster}" src="${PROMO.src}"></video>
      <small>The promo, ${PROMO.seconds} seconds: every frame is a real capture of these pages ·
        <a href="${PROMO.src}" download>download</a> · <a href="${esc(repo)}/tree/main/software/promo" target="_blank" rel="noopener">how it was made</a></small>
    </div>
    <h3>From the badge to Alice</h3>
    <div class="welcome-start">
      <ol class="welcome-steps">${STEPS.map(s => `<li><b>${esc(s.name)}</b>${s.html}</li>`).join('')}</ol>
      <div class="prompts welcome-art" aria-hidden="true"></div>
    </div>
    <h3>What is here</h3>
    <div class="welcome-places">${PLACES.map(p => card('welcome-place', p, p.href === here ? ' here' : '')).join('')}</div>
    <h3>On GitHub</h3>
    <p class="note">Everything is in one repository - the site you are reading, the boards, the firmware, the tools that proved every
      room solvable. Star it, fork it, build the next room.</p>
    <div class="welcome-links">${repoLinks(repo).map(l => card('welcome-link', l)).join('')}</div>
    <p class="note welcome-licence">The site, the tools and the firmware are MIT; the boards CERN-OHL-S-2.0. Made for BSidesTLV 2026.
      We're all mad here.</p>
    <div class="stage-bar welcome-foot">
      <button type="button" class="btn" id="welcomeGo">Let's go</button>
      <span class="status">“about” in the header brings this back.</span>
    </div>`;
  for (const a of dialog.querySelectorAll('.welcome-place.here')) a.setAttribute('aria-current', 'page');
  document.body.append(dialog);

  const video = dialog.querySelector('video');
  const artHost = dialog.querySelector('.welcome-art');
  const chord = STEPS.find(s => s.keys)?.keys ?? ['SELECT', 'Y'];
  let art = null;
  const seen = () => { try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* storage may be off */ } };
  const show = () => {
    if (dialog.open) return;
    if (!art) art = mountPrompt(artHost, { beats: [chord], hold: 2000, frame: 'cap', caption: 'hold both until the bar fills' });
    dialog.showModal();
  };
  const hide = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => { seen(); video.pause(); art?.stop(); art = null; });
  dialog.querySelector('#welcomeGo').addEventListener('click', hide);
  dialog.querySelector('#welcomeClose').addEventListener('click', hide);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) hide(); });
  // Escape closes this dialog alone, by hand: Chrome groups the close watchers of dialogs opened without a user gesture, so
  // the browser's own Escape would take the gate under this one down with it (and the gate's cancel is not asked first).
  // Every other key stays out of the page (the studio's tools, the range's pad).
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); hide(); } e.stopPropagation(); });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); hide(); });   // a close request that is not a key (a phone's back gesture)
  document.getElementById('aboutLink')?.addEventListener('click', (e) => { e.preventDefault(); show(); });

  let query = null;
  try { query = new URLSearchParams(location.search).get('welcome'); } catch { query = null; }
  let was = false;
  try { was = !!localStorage.getItem(WELCOME_KEY); } catch { was = false; }
  const wanted = welcomeWanted({ query, dev: html.dataset.host === 'dev', seen: was });
  if (wanted) show();

  const api = { show, hide, dialog, repo, wanted, get open() { return dialog.open; } };
  window.__welcome = api;
  return api;
}
