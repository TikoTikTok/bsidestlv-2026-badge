// Range level: "Which side?" - for The Caterpillar's Lock (range 'lock')
// By the maker, made with the level maker (maker.html)
//
//   pool         the symbols of the password   length  symbols in it      tickMs  one comparison
//   jitterTicks  noise on the answer (sigma)   order   'prefix' first to last, 'secret' an order of his own
//   hand         the design intent: a hand types at most 150 presses before the door opens
//
// glitch.html lists it as a tab of its range once stages/community/index.json carries
// { "id": "which-side", "name": "Which side?", "author": "the maker", "kind": "lock" }.

export const WHICH_SIDE = {
  name: "Which side?",
  range: "lock",
  id: "which-side",
  short: "Side",
  blurb: "Three of the four directions: 64 passwords, a quarter of a second a comparison and no jitter, so the clock says exactly how far you got. Ten guesses or so, by hand.",
  pool: ["UP", "DOWN", "LEFT", "RIGHT"],
  length: 3,
  tickMs: 250,
  jitterTicks: 0,
  order: "prefix",
  hand: true,
};
