// Stage: "A Mad Tea Party"
//
//   #  wall     .  floor    A  Alice    O  rock
//   b  button   L  lever    G  gate     D  door
//
// One wall splits the room, and the only way through is the gate - shut until
// Alice walks onto the lever. Every rock starts on the wrong side of it, so each
// has to be lined up on the gate's row and shoved through a one-tile corridor.

export const TEA_PARTY = {
  name: 'A Mad Tea Party',
  rows: [
    '#############',
    '#A...#..b...#',
    '#..O.#......#',
    '#....G......#',
    '#..O.#.###..#',
    '#....#.b...D#',
    '#..O.#......#',
    '#..L.#..b...#',
    '#############',
  ],
};
