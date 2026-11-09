// Stage: "The Queen's Court"
//
//   #  wall     .  floor    A  Alice    O  rock
//   b  button   L  lever    G  gate     D  door
//
// A timed room: every tick the cast advances one cell along its loop.

export const THE_QUEENS_COURT = {
  name: "The Queen's Court",
  theme: "court",
  blurb: "A pillared court on the clock: roll two rocks through the gate onto the hearts while the Queen, the Cheshire and the Rabbit walk the aisles.",
  tickMs: 320,
  rows: [
    '###############',
    '#A..#.........#',
    '#.O.#.#.#.#b#.#',
    '#...#.........#',
    '##.##.#.#.#.#.#',
    '#..OG.........#',
    '#...#.#.#.#.#.#',
    '#...#.......b.#',
    '#.L.####..###.#',
    '#...#.......D.#',
    '###############',
  ],
  hazards: [
    { id: "queen", route: [[9, 5], [11, 5]], sight: 2 },
    { id: "cheshire", route: [[13, 7], [13, 9]] },
    { id: "rabbit", route: [[6, 7], [8, 7]] },
  ],
};
