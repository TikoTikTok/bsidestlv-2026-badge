// Range: "The Looking-Glass Glitch"
//
// A fault-injection game. The Queen's guard runs a routine at the treasure
// room door, one line per tick, and somewhere in it is the check that turns
// Alice away. A pulse on X that lands while that line executes skips it and
// the routine falls through to the good ending: the door opens and Alice
// jumps to the treasure. Land anywhere else and the game tells you where you
// hit - that measurement is the game.
//
// Listing syntax (see src/range.js):
//   label:        a label, one tick        ! line   the target check
//   ... goto x    a taken branch           * line   crashes the guard if hit
//   delay(n)      holds n ticks            ret      end
//
// Every goto is taken in the honest run, so the only branch is the target:
// straight-line code everywhere else keeps the trace honest.
//
// The map is the same for every level. Alice left of the wall, the guard in
// the doorway, the treasure behind it:
//   #  wall   .  floor   A  Alice   G  guard in the doorway   T  treasure

export const LOOKING_GLASS = {
  name: 'The Looking-Glass Glitch',
  rows: [
    '#########',
    '#....#..#',
    '#A...G.T#',
    '#....#..#',
    '#########',
  ],
  levels: [
    {
      id: 'sleepy', name: 'The sleepy guard', lineMs: 120, pulseMaxLines: 3,
      blurb: 'Ticks are slow enough to see. Press START, watch the cursor, tap X on the check. ' +
             'A hand can do this one with a little practice.',
      listing: [
        'guard_wake:',
        '  yawn()',
        '  led(RED)',
        '* stack_push(lr)',
        '  key = read_key(ALICE)',
        '  suit = key & 0x0f',
        '  delay(2)',
        '! if (suit != HEARTS) goto deny',
        '  door_open(TREASURE)',
        '  alice_jump(TREASURE)',
        '  goto done',
        'deny:',
        '  say("No key, no treasure.")',
        '  alice_bounce()',
        '  goto done',
        'done:',
        '* stack_pop(lr)',
        '  led(OFF)',
        '  ret',
      ],
    },
    {
      id: 'quick', name: 'The quick guard', lineMs: 40, pulseMaxLines: 3,
      blurb: 'Three times faster, and a crash line two ticks before the check. ' +
             'A hand lands somewhere within about ±40 ms of where it meant to; the check is 40 ms wide. ' +
             'Dial the offset in on the badge instead.',
      listing: [
        'guard_wake:',
        '  led(RED)',
        '* sp = stack_init()',
        '  wdt_kick()',
        '  key = read_key(ALICE)',
        '  crc = crc8(key)',
        '  suit = key & 0x0f',
        '  ok = (crc == KEY_CRC)',
        '  ok &= (suit == HEARTS)',
        '  delay(3)',
        '* wdt_kick()',
        '  led(AMBER)',
        '! if (!ok) goto deny',
        '  door_open(TREASURE)',
        '  alice_jump(TREASURE)',
        '  goto done',
        'deny:',
        '  say("Off with her head!")',
        '  alice_bounce()',
        '  delay(2)',
        '  goto done',
        'done:',
        '* stack_free(sp)',
        '  led(OFF)',
        '  ret',
      ],
    },
    {
      id: 'blind', name: 'The blind guard', lineMs: 20, pulseMaxLines: 3, hidden: true,
      blurb: 'Cheshire faded the source. All you know is the routine is 34 ticks of 20 ms and ' +
             'somewhere in it is the check. Each miss tells you whether the guard had decided yet. ' +
             'Sweep: hold the fire chord and tap RIGHT between shots.',
      listing: [
        'guard_wake:',
        '  led(RED)',
        '* sp = stack_init()',
        '  wdt_kick()',
        '  cfg = load_cfg()',
        '  seed = rng()',
        '  delay(2)',
        '  key = read_key(ALICE)',
        '  crc = crc8(key)',
        '  suit = key & 0x0f',
        '  ok = (crc == KEY_CRC)',
        '  ok &= (suit == HEARTS)',
        '  ok &= (cfg.mode == TRUSTED)',
        '  delay(2)',
        '* wdt_kick()',
        '  mask = ok ? 0xff : 0x00',
        '  led(AMBER)',
        '  mask ^= seed & 0',
        '  ok = (mask == 0xff)',
        '! if (!ok) goto deny',
        '  door_open(TREASURE)',
        '  alice_jump(TREASURE)',
        '  goto done',
        'deny:',
        '  say("Off with her head!")',
        '  alice_bounce()',
        '  delay(3)',
        '  log(key, crc)',
        '  goto done',
        'done:',
        '* stack_free(sp)',
        '  led(OFF)',
        '  ret',
      ],
    },
  ],
};
