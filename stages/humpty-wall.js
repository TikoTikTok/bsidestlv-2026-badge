// Range: "Humpty Dumpty's Wall"
//
// A stack-smashing game. Humpty sits on the wall between Alice and the
// garden and asks her name, which he reads into a buffer on his stack
// without checking its length. The frame behind the buffer is the canary
// (on the level that has one) and then the saved return address, two
// symbols; whatever a long enough name writes there is where Humpty goes
// when he returns. One address opens the wall. Every other one is a great
// fall, and all the king's horses cannot put him together again.
//
// What leaks: Humpty's answer changes exactly when the name reaches the
// next thing on his stack. "Pleased to meet you" up to the buffer's size;
// one more and either the canary complains ("stack smashing detected") or,
// without one, the return goes wrong. So the size is found by lengthening,
// the canary by trying each symbol in its slot until Humpty is polite
// again, and the address is in the listing - as it is in any firmware
// image.
//
// The name is read like a UART line with a per-character timeout: START is
// the prompt, every symbol must follow the one before within `gapMs`, and
// the read ends when nothing comes. Level 1 leaves time for a thumb; the
// others do not, and the name becomes a take recorded on the badge and
// fired with START as the trigger (offset ~40 ms so the prompt lands first).
//
//   size      the buffer, in symbols     canary    true when a symbol of his own guards lr (which one is per seed)
//   address   open_wall's address, two symbols from the pool, shown in the listing
//   gapMs     the per-symbol timeout     hidden    the listing shows name[?] instead of the size
//   hand      the design intent, checked by verify-range.mjs
//
// The pool is the badge's eight face and direction buttons: one symbol is
// three bits, a "byte" of Humpty's. The map is the same for every level:
//   #  wall   .  floor   A  Alice   H  Humpty on the wall   D  the door he sits over
//
// `src/wall.js` holds the rules; this file is only the levels.

const POOL = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y'];

export const HUMPTY_WALL = {
  name: "Humpty Dumpty's Wall",
  rows: [
    '#########',
    '#...#...#',
    '#A..H...#',
    '#...#...#',
    '#########',
  ],
  levels: [
    {
      id: 'pleased', name: 'Pleased to meet you', short: 'Pleased', pool: POOL,
      size: 4, canary: false, address: ['UP', 'RIGHT'], gapMs: 800, hidden: false, hand: true,
      listing: [
        'humpty_greet:',
        '  char name[4]',
        '  say("And what is your name?")',
        '  read_line(name)        // no bound',
        '  say("Pleased to meet you, " + name)',
        '  ret                    // to wherever lr says',
        '',
        'open_wall:  @ ▲ ▶',
        '  door_open(GARDEN)',
      ],
      blurb: 'Four symbols fit. The fifth and sixth land on the return address, and open_wall lives at ▲ ▶. ' +
             'START, four of anything, then ▲ ▶ - with less than 0.8 s between presses.',
    },
    {
      id: 'great-fall', name: 'A great fall', short: 'Fall', pool: POOL,
      size: 7, canary: false, address: ['B', 'LEFT'], gapMs: 120, hidden: true, hand: false,
      listing: [
        'humpty_greet:',
        '  char name[?]',
        '  say("And what is your name?")',
        '  read_line(name)        // no bound',
        '  say("Pleased to meet you, " + name)',
        '  ret',
        '',
        'open_wall:  @ B ◀',
        '  door_open(GARDEN)',
      ],
      blurb: 'The buffer is some size; Humpty stops being polite one past it. Lengthen the name a symbol at ' +
             'a time, then put B ◀ where the fall began. 120 ms a symbol is eight a second: a take, fired with ' +
             'a 40 ms offset so START lands first.',
    },
    {
      id: 'kings-horses', name: "All the king's horses", short: 'Horses', pool: POOL,
      size: 5, canary: true, address: ['DOWN', 'A'], gapMs: 100, hidden: true, hand: false,
      listing: [
        'humpty_greet:',
        '  char name[?]',
        '  canary = CANARY        // a symbol of his own',
        '  say("And what is your name?")',
        '  read_line(name)        // no bound',
        '  if (canary != CANARY) goto smashed',
        '  say("Pleased to meet you, " + name)',
        '  ret',
        'smashed:',
        '  say("*** stack smashing detected ***")',
        '  halt()',
        '',
        'open_wall:  @ ▼ A',
        '  door_open(GARDEN)',
      ],
      blurb: 'Now a canary sits between the name and the return address: overwrite it with anything but its own ' +
             'symbol and Humpty halts instead of returning. He is polite again the moment the slot holds the right ' +
             'one - eight tries at most. Then ▼ A. Ten symbols a second: a take.',
    },
  ],
};
