// Alice in AI Land - the looks: one picker for every page.
//
// A look is how the site sits on a screen. The classic look is styles.css
// alone: the whole page, every panel, scrolling. The phone looks each add
// one stylesheet, src/looks/<id>.css, and share a block in styles.css that
// turns a page into one column with a mode bar - one panel on screen at a
// time, the prose folded - and lets a look restyle the chrome on top:
// palette, bezel, soft keys. The looks are listed in src/looks/index.json
// (id, label, blurb, swatch, shape, flags); adding one is a file and a line.
//
// src/look-boot.js applied the chosen look in <head>, before paint. This
// module does the rest, the same on every page:
//
//   initLooks({ onLook, onMode })
//     builds the picker - the chip in the header opens a sheet of cards,
//     and any .look-cards host on the page (a help panel) gets the same
//     cards - swaps the look's stylesheet when the choice changes, remembers
//     it, and wires the page's mode bar (nav.modes) to its panels
//     (main > .panel[data-mode]). onLook(look) and onMode(mode) are the
//     page's hooks for what CSS cannot do.
//
// Every path is relative: the site lives under /<repo>/ on Pages.

const LOOK_DIR = 'src/looks/';
const KEY = 'alice.look';

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

export async function initLooks({ onLook = null, onMode = null } = {}) {
  const looks = (await (await fetch(`${LOOK_DIR}index.json`, { cache: 'no-cache' })).json()).looks;
  const lookById = Object.fromEntries(looks.map(l => [l.id, l]));
  const chip = document.getElementById('lookChip');

  // --- the stylesheet in force: the next one loads before the old one goes, so nothing flashes
  let lookLink = document.querySelector('link[data-look]');
  function loadSheet(id) {
    const old = lookLink;
    if (id === 'classic') { old?.remove(); lookLink = null; html.dataset.theme = id; return; }
    if (old?.dataset.look === id) { html.dataset.theme = id; return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${LOOK_DIR}${id}.css`;
    link.dataset.look = id;
    link.onload = link.onerror = () => { html.dataset.theme = id; old?.remove(); applyMode(); };
    document.head.append(link);
    lookLink = link;
  }

  function setLook(id, { remember = true } = {}) {
    if (!lookById[id]) id = 'classic';
    loadSheet(id);
    if (remember) try { localStorage.setItem(KEY, id); } catch { /* storage may be off */ }
    if (chip) chip.querySelector('.look-name').textContent = lookById[id].label;
    for (const c of document.querySelectorAll('.look-card')) c.classList.toggle('on', c.dataset.look === id);
    for (const d of document.querySelectorAll('details.how')) d.open = id === 'classic';
    applyMode(id);
    onLook?.(lookById[id]);
  }

  // --- the picker: a bottom sheet behind the chip, one card per look. Each
  // card's miniature is painted in the look's two swatch colours and shaped
  // by its `shape`, so a new look needs no artwork.
  function card(l) {
    const b = el('button', 'look-card');
    b.type = 'button';
    b.dataset.look = l.id;
    b.style.setProperty('--ground', l.swatch[0]);
    b.style.setProperty('--tint', l.swatch[1]);
    const mini = el('span', 'look-mini');
    mini.dataset.shape = l.shape;
    mini.append(el('span', 'mini-bar'), el('span', 'mini-panel'), el('span', 'mini-pad'));
    b.append(mini, el('span', 'look-label', l.label), el('span', 'look-blurb', l.blurb));
    b.addEventListener('click', () => { setLook(l.id); sheet.close(); });
    return b;
  }

  const pageHosts = [...document.querySelectorAll('.look-cards')];   // a help panel's cards, before the sheet adds its own
  const sheet = el('dialog', 'look-sheet');
  sheet.id = 'lookSheet';
  sheet.setAttribute('aria-labelledby', 'lookTitle');
  const inner = el('div', 'sheet');
  const head = el('div', 'sheet-head');
  const title = el('b', '', 'Look');
  title.id = 'lookTitle';
  const close = el('button', 'btn ghost', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'close');
  head.append(title, close);
  const cards = el('div', 'look-cards');
  const foot = el('div', 'sheet-foot');
  const footNote = el('small');
  footNote.append('Default here: ', el('span', '', lookById[defaultLookFor(looks)].label), ' · ', el('code', '', '?look=scope'), ' in the address bar overrides.');
  const useDefault = el('button', 'btn ghost', 'use default');
  useDefault.type = 'button';
  foot.append(footNote, useDefault);
  inner.append(el('span', 'handle'), head,
               el('p', 'note', 'How the page sits on this screen. Tap to switch — the page keeps running. Remembered on this device.'),
               cards, foot);
  sheet.append(inner);
  document.body.append(sheet);

  for (const host of [cards, ...pageHosts]) for (const l of looks) host.append(card(l));
  chip?.addEventListener('click', () => sheet.showModal());
  close.addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });   // a tap on the backdrop
  useDefault.addEventListener('click', () => {
    try { localStorage.removeItem(KEY); localStorage.removeItem('glitch.look'); } catch { /* storage may be off */ }
    setLook(defaultLookFor(looks), { remember: false });
    sheet.close();
  });

  // --- the mode bar: one panel on screen at a time in the phone looks. The
  // classic look shows every panel and ignores the mode; the buttons stay
  // wired so switching looks mid-page lands on the mode last picked.
  const modeButtons = [...document.querySelectorAll('nav.modes .mode')];
  const panels = [...document.querySelectorAll('main > .panel[data-mode]')];
  function applyMode(theme = html.dataset.theme) {
    const mode = html.dataset.mode;
    const classic = theme === 'classic';
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

  setLook(html.dataset.theme, { remember: false });
  if (html.dataset.mode) onMode?.(html.dataset.mode);

  return {
    looks, lookById, setLook, setMode,
    get look() { return lookById[html.dataset.theme]; },
    get mode() { return html.dataset.mode; },
  };
}
