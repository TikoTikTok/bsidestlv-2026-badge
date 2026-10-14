// Alice in AI Land - the look, before first paint.
//
// Every page loads this from <head> as a plain script, before its body. It
// decides which look is in force - ?look= in the URL, else the one chosen
// last time on this device, else data-look-touch on <html> when the screen
// is a touch screen, else the classic page - and puts the look's stylesheet
// in the head right away, so the page never paints in the wrong shape. A
// look is one file in src/looks/<id>.css; the classic look is styles.css
// alone. Once the body exists it folds what the phone looks fold (the prose
// behind "how it works") and hides the panels the page's mode bar did not
// pick, so there is nothing for the module to undo later.
//
// src/looks.js owns everything else: the manifest, the picker, switching.
(function () {
  var html = document.documentElement;
  var KEY = 'alice.look';
  var look = 'classic';
  try {
    var q = new URLSearchParams(location.search).get('look');
    // 'glitch.look' is the key the range used before every page had looks
    var remembered = localStorage.getItem(KEY) || localStorage.getItem('glitch.look');
    var touch = matchMedia('(pointer: coarse)').matches ? html.dataset.lookTouch : null;
    look = q || remembered || touch || 'classic';
    if (!/^[a-z][a-z0-9-]*$/.test(look)) look = 'classic';
  } catch (e) { look = 'classic'; }

  html.dataset.theme = look;
  if (look !== 'classic') {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'src/looks/' + look + '.css';
    link.dataset.look = look;
    document.head.appendChild(link);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var classic = html.dataset.theme === 'classic';
    var d = document.querySelectorAll('details.how');
    for (var i = 0; i < d.length; i++) d[i].open = classic;
    if (!classic && html.dataset.mode) {
      var panels = document.querySelectorAll('main > .panel[data-mode]');
      for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('off', panels[j].dataset.mode !== html.dataset.mode);
    }
  });
})();
