// Alice in AI Land - the tutorials: "Down the Rabbit Hole" (the glitch
// range) and "A Caucus Race" (the stages).
//
// A guided first visit to a page, as a list of steps that watch what the
// player actually does. Pure logic, no DOM: the page feeds it events - every
// button edge, every result a range or a stage produces - and src/coach.js
// renders the current step as a coach line above the panels and a checklist
// in the Learn panel. Progress is remembered on the device, a step can be
// skipped, the whole thing started over.
//
// Events are { kind, ...}:
//   edge      { button, down, source }            from src/pad.js
//   watch     { level, result }                    a combo closed              (the range)
//   glass     { level, result }                    a run landed
//   lock      { level, answer }                    the door answered
//   dog       { level, result }                    the watchdog closed
//   wall      { level, result }                    Humpty answered
//   fire      { }                                  a badge fire was seen: START from the pad, then a take
//   tea       { what, ... }                        the tea party did something (the stages)
//   chase     { what, ... }                        the gauntlet did something
//   room      { id, what, ... }                    a community room did something (src/room.js)
//
// The range's tutorial has two chapters. The first needs only a controller
// of some kind - on a checkout the keyboard, on the site the badge's
// buttons - and visits every range's hand level. The second is the badge
// itself: a take, speed, offset, repeat, one badge-only level per range.
// Steps the player cannot do with what they have are skipped, not failed.

const win = (kind, levelId) => (ev) => ev.kind === kind && ev.level === levelId && (ev.result ?? ev.answer)?.win === true;
const lose = (kind, levelId) => (ev) => ev.kind === kind && ev.level === levelId && (ev.result ?? ev.answer)?.win === false;

export const TUTORIAL = [
  // ---- chapter 1: by hand ----
  {
    id: 'wake', chapter: 1, title: 'Wake up', range: null,
    say: 'Press any button.',
    why: 'The header lights the button the browser sees. Everything on this page is built from those edges and the instant each one arrived.',
    done: (ev) => ev.kind === 'edge' && ev.down,
  },
  {
    id: 'trigger', chapter: 1, title: 'The trigger', range: null,
    say: 'Press START.',
    why: 'START is the trigger: every range measures time from it, and it is the first thing the badge taps when it fires a take.',
    done: (ev) => ev.kind === 'edge' && ev.down && ev.button === 'START',
  },
  {
    id: 'tea-time', chapter: 1, title: 'Tea time', range: 'watch', level: 'tea-time',
    say: "Play the Rabbit's tune, in order, inside two seconds.",
    why: 'A combo inside a window. Later levels shrink the window until no thumb is fast enough - that is where the badge comes in.',
    done: win('watch', 'tea-time'),
  },
  {
    id: 'miss', chapter: 1, title: 'A measurement', range: 'glass', level: 'sleepy',
    say: 'Press START to run the guard, then tap X anywhere while he runs. Read where it landed.',
    why: 'Every landing is a measurement: which line, how many lines early or late, how many milliseconds. A miss is data.',
    done: (ev) => ev.kind === 'glass' && ev.level === 'sleepy' && ev.result && ev.result.verdict !== 'denied' && ev.result.verdict !== 'skip',
  },
  {
    id: 'skip', chapter: 1, title: 'The sleepy guard', range: 'glass', level: 'sleepy',
    say: 'Now land the tap on the check - the green line - and the door opens.',
    why: 'A pulse whose rising edge lands while the check executes skips it: the routine falls through to the good ending. That is a fault injection.',
    done: win('glass', 'sleepy'),
  },
  {
    id: 'no', chapter: 1, title: 'Who are you?', range: 'lock', level: 'who',
    say: 'START, then four directions - any four. Hear the Caterpillar say no, and note how long he took.',
    why: 'He checks one symbol per tick and stops at the first wrong one, so the time he takes to say no is the number of symbols you had right, plus one.',
    done: lose('lock', 'who'),
  },
  {
    id: 'enter', chapter: 1, title: 'Read the clock', range: 'lock', level: 'who',
    say: 'Change one symbol at a time. When he takes a tick longer, keep it. Open the door.',
    why: 'A timing side channel: 256 passwords collapse to a dozen guesses for anyone who reads the clock. Constant-time compares are the fix.',
    done: win('lock', 'who'),
  },
  {
    id: 'winks', chapter: 1, title: 'Forty winks', range: 'dog', level: 'forty-winks',
    say: 'START puts the Dormouse to sleep. Nudge it with A while the window is lit - six times.',
    why: 'A window watchdog: too late and it resets the chip, too early and it resets it too. Any glitch that misses its window gets reset before the payload runs.',
    done: win('dog', 'forty-winks'),
  },
  {
    id: 'polite', chapter: 1, title: 'Pleased to meet you', range: 'wall', level: 'pleased',
    say: 'START, then tell Humpty a name of four symbols or fewer. Wait for him to answer.',
    why: 'He reads your name into a four-slot buffer with no bound. Four fit. The interesting part is what the fifth lands on.',
    done: (ev) => ev.kind === 'wall' && ev.level === 'pleased' && ev.result?.verdict === 'polite',
  },
  {
    id: 'fall', chapter: 1, title: 'A great fall', range: 'wall', level: 'pleased',
    say: 'Give him a longer name - six symbols - and watch what happens.',
    why: 'The fifth and sixth symbols overwrote his return address. He returned to it, and fell. A stack overflow, one button at a time.',
    done: (ev) => ev.kind === 'wall' && ev.level === 'pleased' && ev.result?.verdict === 'fall',
  },
  {
    id: 'open', chapter: 1, title: 'Through the wall', range: 'wall', level: 'pleased',
    say: 'Now make the last two symbols ▲ ▶ - the address of open_wall in his listing.',
    why: 'Control of the return address is control of where he goes next. The listing gave the address away, as a firmware image would.',
    done: win('wall', 'pleased'),
  },
  // ---- chapter 2: the badge ----
  {
    id: 'fire', chapter: 2, title: 'Record and fire', range: 'watch', level: 'tea-time', badge: true,
    say: 'On the badge: SELECT+SL, tap the tune, SELECT+SL again. Then SELECT+SR to fire it.',
    why: 'A take. The fire taps START, waits the offset, then replays the take at the speed. From here on the badge presses the buttons and you set the numbers.',
    done: (ev) => ev.kind === 'fire',
  },
  {
    id: 'very-late', chapter: 2, title: 'Very, very late', range: 'watch', level: 'very-late', badge: true,
    say: 'Record the tune slowly, then SELECT+UP until it fits 500 ms. Fire.',
    why: 'Speed scales the whole take, gaps and holds alike. A take recorded at 1x and played at 4x is the same fingers, four times as quick.',
    done: win('watch', 'very-late'),
  },
  {
    id: 'quick', chapter: 2, title: 'The quick guard', range: 'glass', level: 'quick', badge: true,
    say: 'Record one X tap. Read the check’s tick off the listing, set the offset with SELECT+RIGHT, fire. Nudge and fire again.',
    why: 'Offset is the glitcher’s dial: trigger to rising edge, a millisecond at a time. The readout says how far you were; the next shot corrects it.',
    done: win('glass', 'quick'),
  },
  {
    id: 'temper', chapter: 2, title: 'Keep your temper', range: 'lock', level: 'temper', badge: true,
    say: 'Record a guess (symbols only), offset 40 ms, then hold SELECT+SR: the same guess every 600 ms. Read the median.',
    why: 'Jitter hides a one-tick difference in one reading and not in the median of ten. Repeat is how a side channel is read through noise.',
    done: win('lock', 'temper'),
  },
  {
    id: 'twinkle', chapter: 2, title: 'Twinkle, twinkle', range: 'dog', level: 'twinkle', badge: true,
    say: 'Ten taps at an easy pace, speed 2x, offset to match the gap. Keep the Dormouse asleep.',
    why: 'The first gap is the offset and the rest are the tempo: two dials, one window. Get both inside it and the dog never barks.',
    done: win('dog', 'twinkle'),
  },
  {
    id: 'horses', chapter: 2, title: "All the king's horses", range: 'wall', level: 'kings-horses', badge: true,
    say: 'Find the size, then the canary, then write the address - each name a take, each take a fire.',
    why: 'Size, canary, address: three leaks, read one at a time, exactly how a real stack smash is built when the binary is in hand.',
    done: win('wall', 'kings-horses'),
  },
];

// --------------------------------------------------------------- the stages ----
// A Caucus Race: the two rooms on index.html, one chapter each. A step names
// its `stage` (tea / chase) so the page can arm it and, on a phone, show it.
// Events from src/gallery.js:
//   tea    { what: 'move' | 'push' | 'blocked' | 'lever' | 'button' | 'undo' | 'reset' | 'win', buttons, moves }
//   chase  { what: 'start' | 'tick' | 'wait' | 'caught' | 'restart' | 'button' | 'win', ticks }

const did = (kind, what) => (ev) => ev.kind === kind && ev.what === what;

export const STAGES_TUTORIAL = [
  // ---- chapter 1: a mad tea party ----
  {
    id: 'wake', chapter: 1, title: 'Wake up', stage: 'tea',
    say: 'Press any button on the badge.',
    why: 'The badge is the controller. The stage with the green mark is the one it drives; tap a stage to switch.',
    done: (ev) => ev.kind === 'edge' && ev.down,
  },
  {
    id: 'walk', chapter: 1, title: 'Take a step', stage: 'tea',
    say: 'Move Alice with the d-pad.',
    why: 'One press, one cell. The garden has no clock: nothing moves until you do, so take all the time you like.',
    done: did('tea', 'move'),
  },
  {
    id: 'shove', chapter: 1, title: 'Shove a rock', stage: 'tea',
    say: 'Walk into a rock. It slides one cell ahead of you.',
    why: 'Rocks only move when pushed and only one at a time: two in a row will not budge, and neither will one against a hedge.',
    done: did('tea', 'push'),
  },
  {
    id: 'lever', chapter: 1, title: 'The lever', stage: 'tea',
    say: 'Step on the lever. Watch the gate.',
    why: 'The gate in the wall is shut until Alice stands on the lever, and stepping on it again shuts the gate. Every rock has to pass through that gap.',
    done: did('tea', 'lever'),
  },
  {
    id: 'button', chapter: 1, title: 'A button held', stage: 'tea',
    say: 'Push a rock onto one of the three buttons.',
    why: 'A button is held while a rock sits on it. The status line counts them; the door opens when all three are down.',
    done: did('tea', 'button'),
  },
  {
    id: 'undo', chapter: 1, title: 'A step back', stage: 'tea',
    say: 'Press B to take your last move back.',
    why: 'A rock pushed into a corner is lost, and so is the puzzle. B undoes one move at a time, as far back as you like; the status line warns when a rock is stuck.',
    done: did('tea', 'undo'),
  },
  {
    id: 'reset', chapter: 1, title: 'Start again', stage: 'tea',
    say: 'Press START. The garden is as it was.',
    why: 'START resets the stage on every page. It costs nothing: the puzzle is the order of the pushes, not the number of tries.',
    done: did('tea', 'reset'),
  },
  {
    id: 'tea', chapter: 1, title: 'Tea is served', stage: 'tea',
    say: 'Hold all three buttons and walk Alice to the door.',
    why: "Each rock has to be lined up on the gate's row and shoved through the corridor; the order is the whole puzzle. The best known answer is 106 moves.",
    done: did('tea', 'win'),
  },
  // ---- chapter 2: the queen's gauntlet ----
  {
    id: 'clock', chapter: 2, title: 'The clock starts', stage: 'chase',
    say: 'Tap the Gauntlet, then press any direction. The room starts.',
    why: 'This room runs on a clock: every tick the cast walks one cell along its loop whether you move or not. It waits for your first press, and from then on your input is read once a tick.',
    done: did('chase', 'start'),
  },
  {
    id: 'wait', chapter: 2, title: 'Stand still', stage: 'chase',
    say: 'Press Y to wait one tick where you are.',
    why: 'Standing still is a move. The shortest way out waits five times; a plan here is a schedule, not a path.',
    done: did('chase', 'wait'),
  },
  {
    id: 'seen', chapter: 2, title: "The Queen's eyes", stage: 'chase',
    say: 'Step into the red. See what happens.',
    why: 'The red cells are what the Queen sees this tick: three cells ahead of her. Being seen, or walked into by anyone in the cast, ends the run.',
    done: did('chase', 'caught'),
  },
  {
    id: 'restart', chapter: 2, title: 'Once more', stage: 'chase',
    say: 'Press START to restart the run.',
    why: 'The cast goes back to its starting cells and the clock waits for you again, so every run begins on the same beat.',
    done: did('chase', 'restart'),
  },
  {
    id: 'cross', chapter: 2, title: 'Across the corridor', stage: 'chase',
    say: 'Push a rock onto a button on the far side.',
    why: 'One corridor joins the two halves and the Queen walks it. Count her ticks, cross between her passes, and the rocks have to cross too.',
    done: did('chase', 'button'),
  },
  {
    id: 'out', chapter: 2, title: 'Out', stage: 'chase',
    say: 'Hold both buttons and reach the door.',
    why: 'Par is 64 ticks: an empty room takes 41, the cast costs 23 more. Every input inside its tick, or the plan slips a beat.',
    done: did('chase', 'win'),
  },
  // ---- chapter 3: the community's rooms ----
  {
    id: 'room', chapter: 3, title: 'A room from the community', stage: 'rooms',
    say: 'Open Rooms and pick one. The first is a lesson.',
    why: 'Anyone with a checkout can make a room in the level maker and send it in; every room listed here solves, the checks proved it before it shipped. The badge plays them by the same rules as the two stages.',
    done: (ev) => ev.kind === 'room' && ev.what === 'open',
  },
  {
    id: 'lesson', chapter: 3, title: 'Follow the lesson', stage: 'rooms',
    say: 'Do what the line under the room says, to the door.',
    why: 'A room can carry a lesson: a few lines that tick themselves off as you do what they say. The first two rooms are the demos - one untimed, one on a clock. Then make one of your own.',
    done: (ev) => ev.kind === 'room' && ev.what === 'win',
  },
];

// ------------------------------------------------------------ a lesson ----
// A room's own tutorial: `lesson` on a stage module is a list of steps, each
// a thing the room does and a line about it, shown under the room by
// src/room.js and walked by a Tutor with no store. The events are the room's
// (what src/room.js reports) and the titles are fixed per event, so a lesson
// is written as one line per step: `event: what to say`.

export const LESSON_TITLES = {
  open: 'A room', move: 'A step', push: 'A shove', lever: 'The lever', button: 'A button held', blocked: 'A bump',
  undo: 'A step back', reset: 'Start again', start: 'The clock starts', wait: 'Stand still', tick: 'A tick',
  caught: 'Caught', restart: 'Once more', win: 'Out',
};
export const LESSON_EVENTS = Object.keys(LESSON_TITLES);

/** The Tutor steps of a level's lesson: [] when it has none. */
export const lessonSteps = (level) => (level.lesson ?? []).map((s, i) => ({
  id: `lesson-${i + 1}-${s.on}`, chapter: 1, title: LESSON_TITLES[s.on] ?? s.on, say: String(s.say ?? ''), why: '',
  done: (ev) => ev.kind === 'room' && ev.what === s.on,
}));

// --------------------------------------------------- the level studio's ----
// "Painting the Roses": a first room in the studio (maker.html on a checkout).
// Chapter one draws, chapter two proves and plays, chapter three ships and
// hands the room to an assistant. Every step names the panel it happens in
// (`panel`), which the page scrolls to when the step comes up on request.
// Events from src/maker.js:
//   maker  { what: 'brush' | 'paint' | 'tool' | 'symmetry' | 'overlay' | 'transform' | 'lint' | 'check' |
//                  'generate' | 'shelf' | 'lesson' | 'play' | 'move' | 'win' | 'solution' | 'export' | 'chat' | 'hello', ... }

const made = (what, test = () => true) => (ev) => ev.kind === 'maker' && ev.what === what && test(ev);

export const MAKER_TUTORIAL = [
  // ---- chapter 1: the brushes ----
  {
    id: 'brush', chapter: 1, title: 'Pick up a brush', panel: 'edit',
    say: 'Click the wall brush in the palette, or press 1.',
    why: 'The palette is the legend of the map: eight characters, eight brushes. The keys 1 to 8 pick them without leaving the board.',
    done: made('brush', (ev) => ev.ch === '#'),
  },
  {
    id: 'paint', chapter: 1, title: 'Paint a wall', panel: 'edit',
    say: 'Click or drag on the board. Right-click paints floor.',
    why: 'A drag is one stroke and one undo step. The map box on the right is the same room as text: edit whichever you like, the other follows.',
    done: made('paint', (ev) => ev.ch === '#'),
  },
  {
    id: 'rock', chapter: 1, title: 'A rock', panel: 'edit',
    say: 'Place a rock (brush 4) somewhere Alice can get behind it.',
    why: 'Rocks only move when pushed, one cell at a time, and a rock in a corner is lost. The studio shades the cells where a rock would be lost; keep rocks off them.',
    done: made('paint', (ev) => ev.ch === 'O'),
  },
  {
    id: 'button', chapter: 1, title: 'And its button', panel: 'edit',
    say: 'Place a button (brush 5) for the rock to end on.',
    why: 'Every rock needs a button and every button a rock: the door opens when all of them are held. The lint under the map counts them for you.',
    done: made('paint', (ev) => ev.ch === 'b'),
  },
  {
    id: 'formed', chapter: 1, title: 'Well formed', panel: 'edit',
    say: 'Make the lint go green: one Alice, one door, as many rocks as buttons, walls all round.',
    why: 'Lint is the shape of the room, not its difficulty. A room that passes it may still be unsolvable; that is what Check is for.',
    done: made('lint', (ev) => ev.ok === true),
  },
  {
    id: 'tool', chapter: 1, title: 'A bigger brush', panel: 'edit',
    say: 'Pick the rectangle, line or fill tool and draw with it.',
    why: 'The pencil paints a cell, the line a straight run, the rectangle an outline (hold Shift to fill it), the fill a whole region. The pick tool reads a brush off the board.',
    done: made('tool', (ev) => ['line', 'rect', 'fill'].includes(ev.tool) && ev.used),
  },
  {
    id: 'overlay', chapter: 1, title: 'See the room as the solver does', panel: 'edit',
    say: "Switch on Alice's reach, or off the stuck corners, under the board.",
    why: 'The overlays are the solver\'s own bookkeeping: where a rock is lost, where Alice can walk right now, the path of the last solution, what the cast can see.',
    done: made('overlay'),
  },
  {
    id: 'surprise', chapter: 1, title: 'Surprise me', panel: 'edit',
    say: 'Open Surprise me and draw a room from a seed.',
    why: 'The generator draws rooms until the solver clears one. A room is named by its seed, so the same knobs and seed draw the same room on any machine.',
    done: made('generate'),
  },
  // ---- chapter 2: the proof ----
  {
    id: 'check', chapter: 2, title: 'Prove it', panel: 'edit',
    say: 'Press Check.',
    why: 'Check runs the real solver, the same search CI runs before a room ships: par, the states it searched, whether the gate earns its keep, and a word for how hard it found the room.',
    done: made('check', (ev) => ev.ok === true),
  },
  {
    id: 'play', chapter: 2, title: 'Play it', panel: 'play',
    say: 'Press Run & debug.',
    why: 'The room is played with the rules the site uses, from the keyboard, a click on the simulated badge, or a real badge on USB. Every press is logged with its time.',
    done: made('play'),
  },
  {
    id: 'move', chapter: 2, title: 'Take a step', panel: 'play',
    say: 'Move Alice: WASD, the arrows, or click the d-pad.',
    why: 'Here the keyboard stands in for the badge. On the published site only the badge plays.',
    done: made('move'),
  },
  {
    id: 'solution', chapter: 2, title: 'Watch the answer', panel: 'play',
    say: 'Press Play the solution.',
    why: 'Alice walks the solver\'s moves. If the answer looks like a chore, the room is one; if it looks like a trick, you have a puzzle.',
    done: made('solution'),
  },
  // ---- chapter 3: ship it ----
  {
    id: 'shelf', chapter: 3, title: 'Keep it', panel: 'edit',
    say: 'Put the room on your shelf.',
    why: 'The shelf is in this browser only: as many rooms as you like, each with its last verdict. The room in the editor is also kept between visits on its own.',
    done: made('shelf', (ev) => ev.did === 'save'),
  },
  {
    id: 'lesson', chapter: 3, title: 'Write a lesson', panel: 'edit',
    say: 'Give the room a lesson: one line per step in the box under the map, `event: what to say`.',
    why: 'A lesson is what the stages page shows under your room, and it ticks itself off as the player does what it says. The events are what a room does: move, push, lever, button, wait, win. The first community room is one.',
    done: made('lesson', (ev) => ev.steps > 0),
  },
  {
    id: 'export', chapter: 3, title: 'Send it in', panel: 'export',
    say: 'Copy the module, download it, or copy a link.',
    why: 'The module is the file a pull request carries, stages/community/<id>.js, plus one line in the index. A link carries the whole room to a friend with a checkout.',
    done: made('export'),
  },
  {
    id: 'assistant', chapter: 3, title: 'Bring an assistant', panel: 'assistant',
    say: 'Type to the assistant, or connect one: the prompt under the hero tells it how.',
    why: 'With `npm run maker` serving the page, an assistant on this machine can see the room, paint it, prove it, play it and talk to you here. Skip this if you would rather build alone.',
    done: (ev) => ev.kind === 'maker' && (ev.what === 'chat' || ev.what === 'hello'),
  },
];

/**
 * The engine. `at` is the index of the current step; past the end it is
 * done. feed(ev) advances when the current step's predicate accepts the
 * event and returns the step that was just completed, else null. skip()
 * moves on without it. Progress is kept through `store` - { load(), save(at) }
 * - so a page reload resumes.
 */
export class Tutor {
  constructor(steps = TUTORIAL, store = null) {
    this.steps = steps;
    this.store = store;
    this.at = Math.min(Math.max(0, store?.load?.() ?? 0), steps.length);
    this.skipped = new Set();
  }

  get step() { return this.steps[this.at] ?? null; }
  get done() { return this.at >= this.steps.length; }
  get chapter() { return this.step?.chapter ?? null; }

  feed(ev) {
    const s = this.step;
    if (!s || !s.done(ev)) return null;
    this.advance();
    return s;
  }

  skip() {
    const s = this.step;
    if (!s) return null;
    this.skipped.add(s.id);
    this.advance();
    return s;
  }

  restart() { this.at = 0; this.skipped.clear(); this.store?.save?.(0); }

  /** Jump to a step by index (the checklist is clickable); only backwards or to a finished one. */
  goto(i) { this.at = Math.min(Math.max(0, i), this.steps.length); this.store?.save?.(this.at); }

  advance() { this.at++; this.store?.save?.(this.at); }
}
