// Range: "The Caterpillar's Lock"
//
// A timing side-channel game. The Caterpillar's door wants a password of
// button presses and checks it the lazy way: one symbol per tick, in order,
// stopping at the first one that is wrong. The time the door takes to say
// "No." is therefore the number of symbols it agreed with, plus one - and
// that is the leak. A password space of pool^length collapses to about
// pool x length guesses for anyone who reads the clock.
//
// Entering a guess: START opens a fresh one, then one press per symbol; the
// door checks the moment the last symbol is in. On the badge that is a take
// fired with START as the trigger, so a guess is one SELECT+SR and holding
// the chord repeats it - which is the point of the later levels.
//
//   tickMs       one comparison
//   jitterTicks  noise on the answer time, in ticks (sigma). One measurement
//                is then ambiguous; repeat the guess and take the median. By
//                hand that is tedious, with the badge's repeat it is a chord.
//   order        'prefix': compared first to last, the classic leak.
//                'secret': compared in a fixed order of the door's own - the
//                countermeasure people reach for first. It still leaks: the
//                clock counts how far along *his* order you got, so changing
//                one symbol at a time finds both the symbol and which
//                position he checks next. Constant time is the fix, and the
//                Caterpillar never learned it.
//   hand         the design intent, checked by verify-range.mjs
//
// The map is the same for every level: Alice, two mushrooms, the door.
//   #  wall   .  floor   A  Alice   m  mushroom   D  the Caterpillar's door
//
// `src/lock.js` holds the rules; this file is only the levels.

export const CATERPILLAR_LOCK = {
  name: "The Caterpillar's Lock",
  rows: [
    '#######',
    '#.m...#',
    '#A...D#',
    '#...m.#',
    '#######',
  ],
  levels: [
    {
      id: 'who', name: 'Who are you?', short: 'Who', length: 4,
      pool: ['UP', 'DOWN', 'LEFT', 'RIGHT'], tickMs: 300, jitterTicks: 0, order: 'prefix', hand: true,
      blurb: 'Four directions, 256 passwords. The door takes 300 ms per symbol it agrees with before it ' +
             'says no, so every wrong guess tells you how far you got. A dozen guesses or so.',
    },
    {
      id: 'temper', name: 'Keep your temper', short: 'Temper', length: 5,
      pool: ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B'], tickMs: 60, jitterTicks: 0.5, order: 'prefix', hand: false,
      blurb: 'Six symbols, five long, 60 ms a comparison - and the Caterpillar is slow in a different way ' +
             'each time, so one answer proves little. Record a guess, hold the fire chord, read the median. ' +
             'Two dozen takes do what a thousand presses would.',
    },
    {
      id: 'explain', name: 'Explain yourself', short: 'Explain', length: 5,
      pool: ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B'], tickMs: 40, jitterTicks: 0.5, order: 'secret', hand: false,
      blurb: 'The Caterpillar now checks the symbols in an order of his own and will not say which comes ' +
             'first. The clock still counts how far along his order you got: change one symbol at a time, ' +
             'and the change that makes him think longer names both the symbol and the position. ' +
             'A secret order is not constant time.',
    },
  ],
};
