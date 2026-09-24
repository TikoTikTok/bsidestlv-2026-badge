// Range: "The Rabbit's Pocket Watch"
//
// A combo game. The Rabbit chimes a sequence of buttons and it has to be
// entered, in order, inside a window measured from the first press to the
// last. The sequence is fixed per level - the point of the later levels is
// that a hand cannot do them, but a take recorded once on the badge and
// replayed at 4x or 8x can.
//
// `hand` is the design intent and what verify-range.mjs checks against the
// human budget from GAME_DESIGN.md: 4-6 accurate presses a second.

export const RABBIT_WATCH = {
  name: "The Rabbit's Pocket Watch",
  pool: ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y'],
  levels: [
    { id: 'tea-time',  name: 'Tea time',                length: 4,  windowMs: 2000, hand: true },
    { id: 'late',      name: "I'm late!",               length: 6,  windowMs: 1000, hand: true },
    { id: 'very-late', name: 'Very, very late',         length: 8,  windowMs: 500,  hand: false },
    { id: 'no-hello',  name: 'No time to say hello',    length: 12, windowMs: 600,  hand: false },
  ],
};
