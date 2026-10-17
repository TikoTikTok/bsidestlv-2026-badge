// Alice in AI Land - the look and the theme, before first paint.
//
// Every page loads this from <head> as a plain script, before its body. Two
// choices shape a page: the look, how it sits on the screen (the classic page,
// or a phone look that shows one panel at a time), and the theme, what it is
// painted in. This decides both - ?look= and ?theme= in the URL, else what was
// chosen last time on this device, else the page's own defaults: data-look-touch
// on <html> when the screen is a touch screen, data-theme-default always - and
// puts their stylesheets in the head right away, so the page never paints in the
// wrong shape or colour. A look is one file in src/looks/<id>.css, a theme one
// in src/themes/<id>.css; the classic look and the classic theme are styles.css
// alone. The look's sheet goes in first and the theme's after it, so a theme's
// palette wins over anything a look paints. Once the body exists it folds what
// the phone looks fold (the prose behind "how it works") and hides the panels
// the page's mode bar did not pick, so there is nothing for the module to undo.
//
// src/looks.js owns everything else: the manifests, the picker, switching.
(function () {
  var html = document.documentElement;
  var slug = /^[a-z][a-z0-9-]*$/;
  var query = null;
  try { query = new URLSearchParams(location.search); } catch (e) { query = null; }

  // the URL, then the device's memory, then the page's default, else classic
  function pick(name, key, fallback) {
    var v = null;
    try {
      v = (query && query.get(name)) || localStorage.getItem(key)
        // 'glitch.look' is the key the range used before every page had looks
        || (name === 'look' ? localStorage.getItem('glitch.look') : null);
    } catch (e) { v = null; }
    v = v || fallback || 'classic';
    return slug.test(v) ? v : 'classic';
  }
  var touch = false;
  try { touch = matchMedia('(pointer: coarse)').matches; } catch (e) { touch = false; }
  var look = pick('look', 'alice.look', touch ? html.dataset.lookTouch : null);
  var theme = pick('theme', 'alice.theme', html.dataset.themeDefault);
  html.dataset.look = look;
  html.dataset.theme = theme;
  // the bench or the site: the asset sheet, the solvers, the tuning sliders and
  // the keyboard prose are the bench's (class dev-only); styles.css hides them
  // on html[data-host=site]. The same answer as gateMode in src/gate.js: the
  // four dev hosts of isDevHost (src/pad.js), and ?gate=1 on one of them is the site.
  var h = location.hostname;
  var dev = (h === '' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]') && !(query && query.get('gate') === '1');
  html.dataset.host = dev ? 'dev' : 'site';
  // the hand switch for a phone held upside down (src/tilt.js): '180' turns the
  // page before paint, by what the OS has not already turned it - a half turn,
  // or a quarter when auto-rotate parked the page in landscape on the way round
  var flip = null;
  try { flip = localStorage.getItem('alice.flip'); } catch (e) { flip = null; }
  if (flip === '180') {
    var angle = 0;
    try {
      angle = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle
        : typeof window.orientation === 'number' ? window.orientation : 0;
    } catch (e) { angle = 0; }
    var turn = ((180 - angle) % 360 + 360) % 360;
    if (turn) html.dataset.flip = String(turn);
  }

  function sheet(kind, dir, id) {
    if (id === 'classic') return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = dir + id + '.css';
    link.dataset[kind] = id;
    document.head.appendChild(link);
  }
  sheet('look', 'src/looks/', look);      // the look first, the theme after it: the theme's palette wins
  sheet('theme', 'src/themes/', theme);

  document.addEventListener('DOMContentLoaded', function () {
    var classic = html.dataset.look === 'classic';
    var d = document.querySelectorAll('details.how');
    for (var i = 0; i < d.length; i++) d[i].open = classic;
    if (!classic && html.dataset.mode) {
      var panels = document.querySelectorAll('main > .panel[data-mode]');
      for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('off', panels[j].dataset.mode !== html.dataset.mode);
    }
  });
})();
