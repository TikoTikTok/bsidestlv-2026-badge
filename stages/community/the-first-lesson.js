// Stage: "The First Lesson"
// By the maker, made with the level maker (maker.html)
//
//   #  wall     .  floor    A  Alice    O  rock
//   b  button   L  lever    G  gate     D  door
//
// The demo room: every rule of an untimed room, once, in order. One rock, one
// button, a wall with a gate in it and the lever that opens it. The lesson
// under the room says what to do next and why; the stages page shows it.
// Par 19 moves. The gate is load-bearing.

export const THE_FIRST_LESSON = {
  name: 'The First Lesson',
  theme: 'garden',
  blurb: 'A first room: one rock, one button, a gate and its lever. The lesson tells you what to do.',
  rows: [
    '#########',
    '#A..#...#',
    '#.O.G.b.#',
    '#...#...#',
    '#.L.#..D#',
    '#...#...#',
    '#########',
  ],
  lesson: [
    { on: 'move', say: "Move Alice with the badge's d-pad. One press, one cell; the garden has no clock, so take your time." },
    { on: 'push', say: 'Walk into the rock. It slides one cell ahead of you: only one rock at a time, never into a wall. A rock in a corner is lost, and B takes a move back.' },
    { on: 'lever', say: 'Step on the lever, bottom left. The gate in the wall opens while the lever is thrown; stepping on it again shuts it.' },
    { on: 'button', say: 'Push the rock through the open gate and onto the button. A button is held while a rock sits on it.' },
    { on: 'win', say: 'Walk Alice to the door. It opens once every button is held, and here there is one. The best answer is 19 moves.' },
  ],
};
