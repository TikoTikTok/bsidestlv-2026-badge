// Stage: "The Queen's Gauntlet"
//
// A timed room. Every tick the cast advances one cell along a fixed loop, so a
// plan is not a route but a schedule - which rock to shove is only half of it,
// the other half is on which tick.
//
//   #  wall   .  floor   A  Alice   O  rock   b  button   L  lever
//   G  gate   D  door
//
// One corridor joins the two halves and the Queen walks it, looking three
// cells ahead. Both rocks have to cross it, and so does Alice, several times
// over - so every crossing is a window, not a route. The Cheshire covers the
// top button and the Rabbit the door, which is why the shortest solution
// stands still five times: waiting is a move here.
//
// Par 64 ticks. An empty room is 41, so the cast costs 23 ticks.

export const QUEENS_GAUNTLET = {
  name: "The Queen's Gauntlet",
  tickMs: 320,
  rows: [
    '#########',
    '#A.#...b#',
    '#.O#....#',
    '#..G....#',
    '#..#....#',
    '#.O#....#',
    '#L.#..bD#',
    '#########',
  ],
  hazards: [
    { id: 'queen',    route: [[2, 3], [7, 3]], sight: 3 },
    { id: 'cheshire', route: [[4, 1], [7, 1]] },
    { id: 'rabbit',   route: [[4, 6], [7, 6]] },
  ],
};
