// Stage: "The Garden Gate"
// By TikoTikTok, made with the level maker (maker.html)
//
//   #  wall     .  floor    A  Alice    O  rock
//   b  button   L  lever    G  gate     D  door
//
// A room built around the lever and the gate it opens: the first rock can
// only reach its button through the gate in the middle wall, and the lever
// that throws it sits in the far corner, across the room. The second rock
// waits below, one straight shove from its button.
// Par 56 moves, 10 shoves. The gate is load-bearing.

export const THE_GARDEN_GATE = {
  name: 'The Garden Gate',
  theme: 'garden',
  blurb: 'Two rocks, two buttons, and a gate in the wall between them. Find the lever first.',
  rows: [
    '###########',
    '#A...#....#',
    '#.O..#....#',
    '#....G..b.#',
    '#..########',
    '#.L.#.....#',
    '#....O..b.#',
    '#....#...D#',
    '###########',
  ],
  lesson: [
    { on: 'lever', say: 'The gate in the middle wall is shut. Walk down the left side and step on the lever to open it.' },
    { on: 'push', say: 'Line Alice up behind a rock and walk into it: it slides one cell. Mind the corners, a rock in one is lost.' },
    { on: 'button', say: 'A rock on a button holds it. The top rock goes through the gate, the bottom one straight east.' },
    { on: 'win', say: 'Both buttons held, the door at the bottom right opens. The best answer is 56 moves.' },
  ],
};
