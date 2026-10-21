// Range: "The Dormouse's Watchdog"
//
// A window-watchdog game. The Dormouse sleeps through the tea party as long
// as somebody nudges it every so often - but not too often: a nudge before
// the window opens wakes it just as surely as one after the window closes.
// That is a window watchdog, the guard dog of embedded firmware, and the
// reason a glitch has to be clean: miss its window and the chip resets
// before the payload gets a word in.
//
// START puts the Dormouse to sleep; every press of `button` is a nudge that
// has to land inside [openMs, timeoutMs] of the previous nudge (or of START,
// for the first). `kicks` good nudges in a row and Alice has tiptoed past.
//
// A hand sustains 4-6 presses a second and lands each within about +/-40 ms,
// so two consecutive presses can be up to 80 ms apart from the schedule:
// the window has to be wider than that for a hand. The badge replays a
// take; the gaps are the recorded tempo divided by the speed, so a tempo
// recorded at 0.8 s and played at 8x is 100 ms, and the first gap is the
// fire's offset. `src/watchdog.js` holds the rules; this file is only the
// levels, and `hand` is the design intent verify-range.mjs checks.

export const DORMOUSE_WATCHDOG = {
  name: "The Dormouse's Watchdog",
  levels: [
    {
      id: 'forty-winks', name: 'Forty winks', short: 'Winks', button: 'A',
      kicks: 6, openMs: 500, timeoutMs: 1000, hand: true,
      blurb: 'Nudge the Dormouse six times, each between half a second and a second after the last. ' +
             'Watch the window fill: nudge while it is lit, not before, not after.',
    },
    {
      id: 'twinkle', name: 'Twinkle, twinkle', short: 'Twinkle', button: 'A',
      kicks: 10, openMs: 240, timeoutMs: 300, hand: false,
      blurb: 'Ten nudges, and the window is only 60 ms wide: a hand lands one in it, not ten in a row. ' +
             'Record ten taps at an easy 0.55 s, speed 2× puts them at 270 ms. Offset 270 ms so the first one fits.',
    },
    {
      id: 'treacle-well', name: 'The treacle well', short: 'Treacle', button: 'A',
      kicks: 16, openMs: 80, timeoutMs: 120, hand: false,
      blurb: 'Sixteen nudges, 80 to 120 ms apart: ten a second, inside 40 ms. Record at 0.8 s a tap, ' +
             'holding each a good moment, and play it at 8× - a tap shorter than 20 ms is one the browser never sees.',
    },
  ],
};
