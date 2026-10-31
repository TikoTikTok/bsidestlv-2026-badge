// Stage: "Tick Tock"
// By the maker, made with the level maker (maker.html)
//
//   #  wall     .  floor    A  Alice    O  rock
//   b  button   L  lever    G  gate     D  door
//
// A timed room: every tick the cast advances one cell along its loop.
//
// The demo of a clock. The Cheshire Cat walks a short loop across the rock's
// row, so the rock can only be pushed past him on the right tick: standing
// still is a move here. Par 14 ticks, two of them waiting; an empty room is 12.

export const TICK_TOCK = {
  name: 'Tick Tock',
  theme: 'hall',
  blurb: 'A first timed room: the Cheshire Cat crosses your path every other tick. Waiting is a move.',
  tickMs: 320,
  rows: [
    '#########',
    '#A......#',
    '#.O.....#',
    '#..#.#..#',
    '#..#.#b.#',
    '#..#.#.D#',
    '#########',
  ],
  hazards: [
    { id: 'cheshire', route: [[4, 1], [4, 3]] },
  ],
  lesson: [
    { on: 'start', say: 'Press any direction. The room waits for your first press, then the clock runs: every tick the Cheshire Cat walks one cell along his loop, whether you move or not.' },
    { on: 'wait', say: 'Press Y to stand still for one tick. The cat crosses the rock\'s row every other tick; let him pass, then push.' },
    { on: 'button', say: 'Push the rock across his path and down onto the button. A cat standing where the rock would go blocks the shove, and sharing a cell with him ends the run: START restarts.' },
    { on: 'win', say: 'Reach the door. The shortest way out is 14 ticks, two of them waiting.' },
  ],
};
