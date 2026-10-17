// Alice in AI Land - the looks and the themes: one picker for every page.
//
// Two choices shape a page. The look is how it sits on a screen: the classic
// look is styles.css alone - the whole page, every panel, scrolling - and the
// phone looks each add one stylesheet, src/looks/<id>.css, and share a block
// in styles.css that turns a page into one column with a mode bar (one panel
// on screen at a time, the prose folded) and lets a look reshape the chrome
// on top: bezel, soft keys, the pad. The theme is what the page is painted
// in: the classic theme is styles.css's own palette; every other one is a
// stylesheet, src/themes/<id>.css, that overrides the variables styles.css
// paints from and may add a flourish. Looks are listed in src/looks/index.json
// and themes in src/themes/index.json (id, label, blurb, and for a look its
// shape and flags, for a theme its swatch); adding either is a file and a line.
//
// src/look-boot.js applied both in <head>, before paint. This module does
// the rest, the same on every page:
//
//   initLooks({ onLook, onTheme, onMode })
//     builds the picker - the chip in the header opens a sheet with the
//     theme cards and the look cards, and any .look-cards host on the page
//     (a help panel) gets the same - swaps a stylesheet when a choice changes,
//     remembers it, and wires the page's mode bar (nav.modes) to its panels
//     (main > .panel[data-mode]). onLook(look), onTheme(theme) and
//     onMode(mode) are the page's hooks for what CSS cannot do; onTheme fires
//     once the theme's sheet is in force, so computed colours are the new ones.
//
// This module also owns the page-turn control: a phone held upside down in
// the badge's grip is not rotated by the OS when the page is portrait, so
// src/tilt.js reads gravity and turns the page itself (data-flip on <html>:
// the turn the OS left undone, 180 or a quarter; the rules in styles.css).
// The hand override - auto, no, yes - is localStorage alice.flip, set from a
// small icon beside the chip in every header (a popover of the three, one
// line of what it does, a first-visit tip) and from a row in the sheet;
// src/pad.js turns the badge's buttons by the same decision. On iOS the
// sensors need asking from a tap, and a tap on the icon, the ◐ chip or a
// switch is one.
//
// Every path is relative: the site lives under /<repo>/ on Pages.

import { tilt } from './tilt.js';

const KIND = {
  look:  { dir: 'src/looks/',  key: 'alice.look',  list: 'looks',  title: 'Look',  note: 'how the page sits on this screen' },
  theme: { dir: 'src/themes/', key: 'alice.theme', list: 'themes', title: 'Theme', note: 'what the page is painted in' },
};

// the header icon: a phone with a turning arrow round it; the struck line shows on "no"
const TURN_GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<rect x="8.5" y="4" width="7" height="16" rx="1.8"/>'
  + '<path d="M8 5.3A8.5 8.5 0 0 0 4 10.5M4 7v3.5h3.5M16 18.7a8.5 8.5 0 0 0 4-5.2M20 17v-3.5h-3.5"/>'
  + '<line class="no" x1="4.5" y1="19.5" x2="19.5" y2="4.5"/></svg>';

const html = document.documentElement;
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** The look a device opens on when nothing was chosen: data-look-touch on a touch screen, else classic. */
export const defaultLookFor = (looks) => {
  const touch = html.dataset.lookTouch;
  return (matchMedia('(pointer: coarse)').matches && looks.some(l => l.id === touch)) ? touch : 'classic';
};
/** The theme a page opens on when nothing was chosen: data-theme-default on <html>, else classic. */
export const defaultThemeFor = (themes) => {
  const d = html.dataset.themeDefault;
  return themes.some(t => t.id === d) ? d : 'classic';
};

export async function initLooks({ onLook = null, onTheme = null, onMode = null } = {}) {
  const [looks, themes] = await Promise.all(['look', 'theme'].map(async (k) =>
    (await (await fetch(`${KIND[k].dir}index.json`, { cache: 'no-cache' })).json())[KIND[k].list]));
  const byId = { look: Object.fromEntries(looks.map(l => [l.id, l])), theme: Object.fromEntries(themes.map(t => [t.id, t])) };
  const chip = document.getElementById('lookChip');
  const current = { look: html.dataset.look, theme: html.dataset.theme };

  // --- the stylesheets in force, one per kind: the next one loads before the
  // old one goes, so nothing flashes. The look's link stays ahead of the
  // theme's in the head, so the theme's palette wins whatever a look paints.
  const links = { look: document.querySelector('link[data-look]'), theme: document.querySelector('link[data-theme]') };
  function loadSheet(kind, id, done) {
    const old = links[kind];
    if (id === 'classic') { old?.remove(); links[kind] = null; html.dataset[kind] = id; done?.(); return; }
    if (old?.dataset[kind] === id) { html.dataset[kind] = id; done?.(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${KIND[kind].dir}${id}.css`;
    link.dataset[kind] = id;
    link.onload = link.onerror = () => { html.dataset[kind] = id; old?.remove(); done?.(); };
    if (kind === 'look' && links.theme) document.head.insertBefore(link, links.theme);
    else document.head.append(link);
    links[kind] = link;
  }
  const remember = (kind, id) => { try { localStorage.setItem(KIND[kind].key, id); } catch { /* storage may be off */ } };

  // the chip names the theme, and the look when it is not the classic page; the cards mark what is on
  function mark() {
    if (chip) chip.querySelector('.look-name').textContent =
      byId.theme[current.theme].label + (current.look === 'classic' ? '' : ` · ${byId.look[current.look].label}`);
    for (const c of document.querySelectorAll('.look-card')) c.classList.toggle('on', c.dataset.id === current[c.dataset.kind]);
  }
  function setLook(id, { remember: keep = true } = {}) {
    if (!byId.look[id]) id = 'classic';
    current.look = id;
    loadSheet('look', id, () => applyMode());
    if (keep) remember('look', id);
    for (const d of document.querySelectorAll('details.how')) d.open = id === 'classic';
    applyMode(id);
    mark();
    onLook?.(byId.look[id]);
  }
  function setTheme(id, { remember: keep = true } = {}) {
    if (!byId.theme[id]) id = 'classic';
    current.theme = id;
    loadSheet('theme', id, () => onTheme?.(byId.theme[id]));
    if (keep) remember('theme', id);
    mark();
  }

  // --- the picker: a bottom sheet behind the chip, the theme cards then the
  // look cards; the same groups go into any .look-cards host on the page. A
  // look's miniature is shaped by its `shape` and painted in the theme in
  // force; a theme's is painted in its own five swatch colours. No artwork.
  function card(kind, item) {
    const b = el('button', 'look-card');
    b.type = 'button';
    b.dataset.kind = kind;
    b.dataset.id = item.id;
    let mini;
    if (kind === 'look') {
      mini = el('span', 'look-mini');
      mini.dataset.shape = item.shape;
      mini.append(el('span', 'mini-bar'), el('span', 'mini-panel'), el('span', 'mini-pad'));
    } else {
      mini = el('span', 'theme-mini');
      item.swatch.forEach((c, i) => mini.style.setProperty(`--s${i}`, c));
      for (const part of ['bar', 'dot', 'head', 'text', 'btn', 'ok']) mini.append(el('span', `mini-${part}`));
    }
    b.append(mini, el('span', 'look-label', item.label), el('span', 'look-blurb', item.blurb));
    b.addEventListener('click', () => { (kind === 'look' ? setLook : setTheme)(item.id); sheet.close(); });
    return b;
  }
  function fill(host) {
    for (const [kind, items] of [['theme', themes], ['look', looks]]) {
      const group = el('div', 'pick');
      group.dataset.kind = kind;
      const head = el('div', 'pick-head');
      head.append(el('b', '', KIND[kind].title), el('small', '', KIND[kind].note));
      const cards = el('div', 'cards');
      for (const it of items) cards.append(card(kind, it));
      group.append(head, cards);
      host.append(group);
    }
  }

  const pageHosts = [...document.querySelectorAll('.look-cards')];   // a help panel's cards, before the sheet adds its own
  const sheet = el('dialog', 'look-sheet');
  sheet.id = 'lookSheet';
  sheet.setAttribute('aria-labelledby', 'lookTitle');
  const inner = el('div', 'sheet');
  const head = el('div', 'sheet-head');
  const title = el('b', '', 'Theme · Look');
  title.id = 'lookTitle';
  const close = el('button', 'btn ghost', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'close');
  head.append(title, close);
  const cards = el('div', 'look-cards');
  const foot = el('div', 'sheet-foot');
  const footNote = el('small');
  footNote.append('Default here: ', el('span', '', `${byId.theme[defaultThemeFor(themes)].label} · ${byId.look[defaultLookFor(looks)].label}`),
                  ' · ', el('code', '', '?theme=queen&look=scope'), ' in the address bar overrides.');
  const useDefault = el('button', 'btn ghost', 'use default');
  useDefault.type = 'button';
  foot.append(footNote, useDefault);
  // --- the page turn: one state, localStorage alice.flip through src/tilt.js
  // (auto: gravity decides; 0: never; 180: always), shown in two places. A
  // small icon in the header (#turnBtn, in the page before the chip) opens a
  // popover of the three choices and one line on what the turn is; the icon
  // shows the state (lit while the page is turned, filled on "yes", struck
  // through on "no") and a dot while iOS still has to be asked for the
  // sensors - its tap is the gesture iOS wants, so the prompt comes from it.
  // The sheet below carries the same three choices as a row. On a touch
  // screen the popover opens once by itself, as a tip, on the first visit
  // (localStorage alice.flip.tip; ?tip=1 / ?tip=0 force it either way), goes
  // on any tap outside it and never comes back; a switch set by hand means
  // no tip at all. Nothing here is a dialog: play is never blocked.
  const TIP_KEY = 'alice.flip.tip';
  const tipSeen = () => { try { localStorage.setItem(TIP_KEY, '1'); } catch { /* storage may be off */ } };
  const CHOICES = [['auto', 'auto'], ['0', 'no'], ['180', 'yes']];
  const choices = (host) => CHOICES.map(([v, label]) => {
    const b = el('button', 'flip-chip', label);
    b.type = 'button';
    b.dataset.flip = v;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => { tilt.manual = v; if (v === 'auto' && tilt.needsPermission) tilt.request(); tipSeen(); closePop(); });
    host.append(b);
    return b;
  });
  const STATE = { auto: 'auto', 0: 'off', 180: 'on' };
  const sensors = () => tilt.permission === 'denied' ? 'sensors refused'
    : tilt.needsPermission ? 'sensor not allowed yet'
    : tilt.angle === null ? (tilt.readings ? 'lying flat' : 'no reading yet')
    : `${tilt.upsideDown ? 'upside down' : 'upright'} · ${Math.round(Math.abs(tilt.angle))}°${tilt.screen ? ` · the screen at ${tilt.screen}°` : ''}`;
  const hint = () => 'Hold the phone the other way up and the page turns with it, the right way round in the grip.'
    + (tilt.permission === 'denied' ? ' The tilt sensor was refused: set yes or no by hand, or allow motion in the browser’s settings.'
      : tilt.needsPermission ? ' Tap allow when the phone asks to share its tilt sensor.' : '');

  // the sheet's row
  const flipRow = el('div', 'pick flip-row');
  flipRow.dataset.kind = 'flip';
  const flipHead = el('div', 'pick-head');
  flipHead.append(el('b', '', 'Page turn'), el('small', '', 'the phone held upside down in the grip: the page turns itself the right way up. The controller follows by itself'));
  flipRow.append(flipHead);
  const flipChips = choices(flipRow);
  const flipState = el('small');
  flipRow.append(flipState);

  // the header's icon and its popover
  const turnBtn = document.getElementById('turnBtn');
  const bar = turnBtn?.closest('.bar');
  let pop = null, popChips = [], popState = null, popNote = null;
  function closePop() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    pop.classList.remove('tip');
    turnBtn.setAttribute('aria-expanded', 'false');
  }
  function openPop(tip = false) {
    if (!pop) return;
    pop.hidden = false;
    pop.classList.toggle('tip', tip);
    turnBtn.setAttribute('aria-expanded', 'true');
    // under the icon, in the header's own frame (so a turned page keeps it): the pop's left edge a little
    // left of the icon, kept inside the header's width, and the caret at the icon's middle
    const left = (n) => { let x = 0; for (; n && n !== bar; n = n.offsetParent) x += n.offsetLeft; return x; };
    const gutter = 8, mid = left(turnBtn) + turnBtn.offsetWidth / 2;
    const x = Math.max(gutter, Math.min(mid - 28, bar.clientWidth - pop.offsetWidth - gutter));
    pop.style.left = `${x}px`;
    pop.style.setProperty('--caret', `${mid - x}px`);
  }
  if (turnBtn && bar) {
    turnBtn.innerHTML = TURN_GLYPH;
    pop = el('div', 'turn-pop');
    pop.id = 'turnPop';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-labelledby', 'turnTitle');
    const popHead = el('div', 'turn-head');
    const popTitle = el('b', '', 'Page turn');
    popTitle.id = 'turnTitle';
    popState = el('small');
    popHead.append(popTitle, popState);
    popNote = el('p', 'turn-note');
    const row = el('div', 'turn-choice');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Page turn');
    popChips = choices(row);
    pop.append(popHead, popNote, row);
    bar.append(pop);
    turnBtn.addEventListener('click', () => {
      if (tilt.needsPermission) tilt.request();   // the tap iOS wants: the prompt comes from the icon itself
      tipSeen();
      if (pop.hidden) openPop(); else closePop();
    });
    document.addEventListener('pointerdown', (e) => {   // a tap anywhere else closes it; the tap itself goes through
      if (!pop.hidden && !pop.contains(e.target) && !turnBtn.contains(e.target)) closePop();
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { closePop(); turnBtn.focus(); } });
  }

  function markFlip() {
    const state = STATE[tilt.manual];
    for (const b of [...flipChips, ...popChips]) {
      const on = b.dataset.flip === tilt.manual;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    flipState.textContent = sensors();
    if (turnBtn) {
      turnBtn.dataset.state = state;
      turnBtn.dataset.turned = tilt.turned ? 'yes' : 'no';
      if (tilt.permission === 'denied') turnBtn.dataset.ask = 'denied';
      else if (tilt.needsPermission) turnBtn.dataset.ask = 'yes';
      else delete turnBtn.dataset.ask;
      turnBtn.setAttribute('aria-label', `Page turn: ${state}${tilt.turned ? ', page turned' : ''}${tilt.needsPermission ? ', tilt sensor not allowed yet' : ''}`);
      popState.textContent = sensors();
      popNote.textContent = hint();
    }
  }
  tilt.on(markFlip);
  markFlip();

  // the tip: once, on a touch screen, when nothing was set by hand
  const wantTip = () => {
    let q = null;
    try { q = new URLSearchParams(location.search).get('tip'); } catch { q = null; }
    if (q === '1') return true;
    if (q === '0') return false;
    try { if (localStorage.getItem(TIP_KEY)) return false; } catch { /* storage may be off */ }
    return tilt.manual === 'auto' && matchMedia('(pointer: coarse)').matches;
  };
  if (pop && wantTip()) setTimeout(() => { if (pop.hidden) { openPop(true); tipSeen(); } }, 800);

  inner.append(el('span', 'handle'), head,
               el('p', 'note', 'What the page is painted in, and how it sits on this screen. Tap to switch — the page keeps running. Remembered on this device.'),
               flipRow, cards, foot);
  sheet.append(inner);
  document.body.append(sheet);
  tilt.apply();                     // src/tilt.js listens from load; the switch's remembered say is shown here too
  setInterval(() => { if (sheet.open || !pop?.hidden) markFlip(); }, 500);   // the angle line moves while the sheet or the popover is up

  for (const host of [cards, ...pageHosts]) fill(host);
  chip?.addEventListener('click', () => { if (tilt.needsPermission) tilt.request(); sheet.showModal(); });   // the chip is a tap iOS accepts for the sensors
  close.addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });   // a tap on the backdrop
  useDefault.addEventListener('click', () => {
    try { for (const k of [KIND.look.key, KIND.theme.key, 'glitch.look']) localStorage.removeItem(k); } catch { /* storage may be off */ }
    tilt.manual = 'auto';
    setTheme(defaultThemeFor(themes), { remember: false });
    setLook(defaultLookFor(looks), { remember: false });
    sheet.close();
  });

  // --- the mode bar: one panel on screen at a time in the phone looks. The
  // classic look shows every panel and ignores the mode; the buttons stay
  // wired so switching looks mid-page lands on the mode last picked.
  const modeButtons = [...document.querySelectorAll('nav.modes .mode')];
  const panels = [...document.querySelectorAll('main > .panel[data-mode]')];
  function applyMode(look = html.dataset.look) {
    const mode = html.dataset.mode;
    const classic = look === 'classic';
    for (const b of modeButtons) b.classList.toggle('on', b.dataset.mode === mode);
    for (const p of panels) p.classList.toggle('off', !classic && !!mode && p.dataset.mode !== mode);
  }
  function setMode(mode) {
    html.dataset.mode = mode;
    applyMode();
    document.querySelector('main').scrollTop = 0;
    onMode?.(mode);
  }
  for (const b of modeButtons) b.addEventListener('click', () => setMode(b.dataset.mode));

  setTheme(html.dataset.theme, { remember: false });
  setLook(html.dataset.look, { remember: false });
  if (html.dataset.mode) onMode?.(html.dataset.mode);

  return {
    looks, themes, lookById: byId.look, themeById: byId.theme, setLook, setTheme, setMode,
    get look() { return byId.look[current.look]; },
    get theme() { return byId.theme[current.theme]; },
    get mode() { return html.dataset.mode; },
    tilt,
  };
}
