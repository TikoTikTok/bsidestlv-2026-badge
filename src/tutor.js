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
// The guided builds of the studio (maker.html on a checkout). MAKER_TUTORIALS
// is the catalogue the Learn panel offers as cards, one entry per build: its
// id, title and blurb, the chapter titles, what the coach says once it is
// finished, and the steps. "Painting the Roses" is the tour of the studio;
// each of the others leads to one particular finished room - a room the gate
// holds shut, a timed room with a watcher on a loop, a room with a name, a
// blurb and a lesson. Every step names the panel it happens in (`panel`),
// which the page scrolls to when the step comes up on request, and its
// `done` predicate is made with made(what, test), which carries the event it
// waits on as `.what` so the verifier can prove src/maker.js emits it.
// Events from src/maker.js:
//   maker  { what: 'brush' | 'paint' | 'tool' | 'symmetry' | 'overlay' | 'transform' | 'lint' | 'check' |
//                  'generate' | 'shelf' | 'lesson' | 'play' | 'move' | 'win' | 'solution' | 'export' | 'chat' | 'hello' |
//                  'load' | 'tick' | 'hazard' | 'caught' | 'restart' | 'name' | 'blurb', ... }
//     paint { ch, cells, tool }      check { ok, par, rules, gate: 'load-bearing' | 'decoration' | null }
//     load { id, from }              tick { ms, timed }        hazard { did: 'add' | 'route' | 'edit', n, route, sight, character }
//     move { dir: N S W E | 'wait' } caught { ticks }          restart { rules }     name { name }     blurb { chars }
//     export { how: 'copy' | 'download' | 'link' | 'pr' | 'png' }

const made = (what, test = () => true) => Object.assign(
  (ev) => ev.kind === 'maker' && (Array.isArray(what) ? what.includes(ev.what) : ev.what === what) && test(ev), { what });
const skippedNote = (n) => (n ? ` (${n} step${n === 1 ? '' : 's'} skipped)` : '');
/** An export that sends the room somewhere (not the picture): the last step of every build. */
const SENT = (ev) => ['copy', 'download', 'link', 'pr'].includes(ev.how);

// "Painting the Roses": the tour. Chapter one draws, chapter two proves and
// plays, chapter three ships and hands the room to an assistant.
const ROSES = [
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
    done: made('move', (ev) => ev.dir !== 'wait'),
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
    done: made(['chat', 'hello']),
  },
];

// "A Room with a Gate": from a blank room to one the gate holds shut - a wall
// across, a gate in it, the lever on Alice's side, the rock's button and the
// door behind - proven load-bearing by Check, played to the door, sent in.
const GATE = [
  {
    id: 'blank', chapter: 1, title: 'A blank room', panel: 'edit',
    say: 'Open Start from… under the map and pick A blank room.',
    why: 'A starter is a room to begin from: a blank is walls all round, Alice in one corner and the door in the other. Each of the six is one idea; the community\'s rooms are listed after them.',
    done: made('load', (ev) => ev.id === 'blank' || ev.id === 'wide'),
  },
  {
    id: 'alice', chapter: 1, title: 'Alice', panel: 'edit',
    say: 'Paint Alice (brush 3) on the left side of the room, a cell or two in from the wall.',
    why: 'Alice is single: painting her moves her. Keep her and the lever on one side of the wall you are about to draw, the door and the button on the other.',
    done: made('paint', (ev) => ev.ch === 'A'),
  },
  {
    id: 'wall', chapter: 1, title: 'A wall across', panel: 'edit',
    say: 'Pick the line tool (I) and drag a wall from the top edge to the bottom, a few cells right of Alice.',
    why: 'The line tool paints a straight run in one stroke, one undo step. A wall that reaches both edges splits the room in two; the only way through will be the gate.',
    done: made('paint', (ev) => ev.ch === '#' && ev.cells >= 3),
  },
  {
    id: 'gate', chapter: 1, title: 'A gate in it', panel: 'edit',
    say: 'Paint a gate (brush 7) over one cell of the wall.',
    why: 'A gate is a wall until the lever is thrown, then floor; the next step on the lever shuts it again. Every gate in a room answers the one lever.',
    done: made('paint', (ev) => ev.ch === 'G'),
  },
  {
    id: 'lever', chapter: 1, title: 'The lever on her side', panel: 'edit',
    say: 'Paint the lever (brush 6) on Alice\'s side of the wall.',
    why: 'Alice steps on the lever and the gate opens; steps on it again and it shuts. On her side she can reach it; behind the wall she never could.',
    done: made('paint', (ev) => ev.ch === 'L'),
  },
  {
    id: 'rock', chapter: 1, title: 'A rock', panel: 'edit',
    say: 'Paint a rock (brush 4) on Alice\'s side, in the gate\'s row, with floor behind it for her to push from.',
    why: 'A rock moves one cell per push, away from Alice, so she needs the cell behind it. The rock has to go through the gate to reach its button: that is what makes the gate matter. The hatched cells are corners where a rock is lost.',
    done: made('paint', (ev) => ev.ch === 'O'),
  },
  {
    id: 'button', chapter: 1, title: 'And its button behind', panel: 'edit',
    say: 'Paint a button (brush 5) behind the wall, in the gate\'s row.',
    why: 'The door opens when every button holds a rock. One rock and one button is a room; the lint counts them for you.',
    done: made('paint', (ev) => ev.ch === 'b'),
  },
  {
    id: 'door', chapter: 1, title: 'The door behind', panel: 'edit',
    say: 'Paint the door (brush 8) behind the wall too.',
    why: 'The door is single like Alice; painting it moves it. Behind the wall, the gate is the only way to it, which Check is about to confirm.',
    done: made('paint', (ev) => ev.ch === 'D'),
  },
  {
    id: 'formed', chapter: 1, title: 'Well formed', panel: 'edit',
    say: 'Make the lint go green: walls all round, one Alice, one door, a rock for the button, the lever for the gate.',
    why: 'Lint is the shape of the room: a gate without a lever or a button without a rock is refused before the solver ever runs.',
    done: made('lint', (ev) => ev.ok === true),
  },
  {
    id: 'check', chapter: 2, title: 'Prove the gate', panel: 'edit',
    say: 'Press Check and read the verdict: the gate must be load-bearing.',
    why: 'Check solves the room twice: as it is, and with the gate welded shut. If it still solves welded, the gate is decoration - there is a way round - and this step waits until the wall is closed.',
    done: made('check', (ev) => ev.ok === true && ev.gate === 'load-bearing'),
  },
  {
    id: 'play', chapter: 2, title: 'Play it', panel: 'play',
    say: 'Press Run & debug.',
    why: 'The room is played with the rules the site uses. The gate is drawn shut until Alice stands on the lever.',
    done: made('play'),
  },
  {
    id: 'win', chapter: 2, title: 'Through the gate to the door', panel: 'play',
    say: 'Throw the lever, push the rock through the gate onto its button, and walk to the door.',
    why: 'What the solver found in a second you have to find by hand: that is the test of the room, and of its par. B takes a move back; START starts again.',
    done: made('win'),
  },
  {
    id: 'export', chapter: 3, title: 'Send it in', panel: 'export',
    say: 'Copy the module, download it, copy a link, or hand it to your AI to open the pull request.',
    why: 'The module is the file a pull request carries, stages/community/<id>.js, plus one line in the index. CI runs the same Check before the room ships.',
    done: made('export', SENT),
  },
];

// "The Clock and the Cast": an untimed room turned into a chase - the clock,
// a watcher on a loop - then proved, played with a wait, lost to the cast,
// restarted and won, and sent in.
const CLOCK = [
  {
    id: 'corridor', chapter: 1, title: 'A room to time', panel: 'edit',
    say: 'Open Start from… and pick The corridor.',
    why: 'A timed room is an untimed one with a clock and a cast: the same walls, rocks and buttons. The corridor is one rock and a straight run, so a watcher has somewhere to walk.',
    done: made('load', (ev) => ev.id === 'corridor'),
  },
  {
    id: 'tick', chapter: 1, title: 'The clock', panel: 'edit',
    say: 'Switch Clock to timed, under the map, and set the tick. 320 ms is the shipped pace.',
    why: 'Every tick the player acts - a step or a wait - and then the cast moves one cell. The tick is how long a tick lasts: 100 ms is frantic, 2000 a crawl.',
    done: made('tick', (ev) => ev.timed === true),
  },
  {
    id: 'hazard', chapter: 1, title: 'Add a hazard', panel: 'edit',
    say: 'Press Add a hazard. The Red Queen comes first.',
    why: 'A hazard is one of the cast - the Queen, the Cheshire Cat, the White Rabbit, the Hatter - with a route and, for a watcher, a sight: how many cells of open floor ahead she sees. Sharing her cell, swapping places with her or standing in her sight ends the run.',
    done: made('hazard', (ev) => ev.did === 'add'),
  },
  {
    id: 'route', chapter: 1, title: 'Lay her route', panel: 'edit',
    say: 'With "laying the route…" lit, click two floor cells in one row, in the order she walks them.',
    why: 'A route is a loop through its points and back: two points is a patrol there and back. Consecutive points share a row or a column and lie on floor. Click the last point again to take it back.',
    done: made('hazard', (ev) => ev.route.length >= 2),
  },
  {
    id: 'check', chapter: 2, title: 'Prove it', panel: 'edit',
    say: 'Press Check.',
    why: 'The timed solver searches Alice, the rocks and the clock together, so the par is in ticks, and the notes say how many of them are waits and what the cast costs over an empty room.',
    done: made('check', (ev) => ev.ok === true && ev.rules === 'chase'),
  },
  {
    id: 'play', chapter: 2, title: 'Play it', panel: 'play',
    say: 'Press Run & debug. The clock holds until your first press.',
    why: 'Every run starts on the beat the solver assumes: the first press is taken at once and starts the clock.',
    done: made('play', (ev) => ev.rules === 'chase'),
  },
  {
    id: 'wait', chapter: 2, title: 'Stand still', panel: 'play',
    say: 'Wait a tick: Y on the badge, or Space.',
    why: 'A wait is a move in a timed room: the cast walks on while Alice stands. The par counts it, and most timed rooms need a few.',
    done: made('move', (ev) => ev.dir === 'wait'),
  },
  {
    id: 'caught', chapter: 2, title: 'Get caught', panel: 'play',
    say: 'Walk into the Queen\'s path and let her catch you.',
    why: 'Caught ends the run, not the room: the log says on which tick, and the cast\'s sight overlay under the board shows what she sees. Knowing where a room catches people is knowing where its difficulty is.',
    done: made('caught'),
  },
  {
    id: 'restart', chapter: 2, title: 'Once more', panel: 'play',
    say: 'Press START.',
    why: 'START puts everyone back on their marks and holds the clock again until the first press.',
    done: made('restart'),
  },
  {
    id: 'win', chapter: 2, title: 'Out', panel: 'play',
    say: 'Push the rock onto its button and reach the door while she looks away.',
    why: 'The timed rules forbid nothing the untimed ones allow; they add the clock. If the room needed a wait, you now know where.',
    done: made('win'),
  },
  {
    id: 'export', chapter: 3, title: 'Send it in', panel: 'export',
    say: 'Copy the module, download it, copy a link, or hand it to your AI to open the pull request.',
    why: 'The module carries the clock and the cast with the map. A timed room with a par over about 120 ticks is unplayable by hand; the verdict says what yours is.',
    done: made('export', SENT),
  },
];

// "A Room that Teaches": a room with a name, a blurb and a lesson the stages
// page follows, proved and played, kept on the shelf and sent in.
const TEACH = [
  {
    id: 'room', chapter: 1, title: 'A room to teach with', panel: 'edit',
    say: 'Open Start from… and pick The gate - or any room that checks.',
    why: 'A lesson is written against one room: what it asks for has to happen on the solver\'s own way out, or CI refuses it. The gate has a shove, a lever and a button to talk about.',
    done: made('load'),
  },
  {
    id: 'name', chapter: 1, title: 'Name it', panel: 'edit',
    say: 'Type a name of your own in the Name box.',
    why: 'The name is the room\'s title on the stages page and, lower-case with hyphens, the id of its file and its index line. Two rooms cannot share one.',
    done: made('name', (ev) => ev.name.trim().length >= 3 && !/untitled/i.test(ev.name)),
  },
  {
    id: 'blurb', chapter: 1, title: 'A line about it', panel: 'edit',
    say: 'Write a blurb: one line, what the room is about.',
    why: 'The blurb is what the card on the stages page shows beside the room, up to 160 characters. Say what the idea is, not how to solve it.',
    done: made('blurb', (ev) => ev.chars >= 10),
  },
  {
    id: 'lesson', chapter: 1, title: 'Three steps of a lesson', panel: 'edit',
    say: 'Write a lesson of at least three steps in the box under the map, one a line: `move: …`, `push: …`, `win: …`.',
    why: 'Each step is an event the room reports and the line to show for it: move, push, lever, button, blocked, undo, reset in any room; start, wait, tick, caught, restart in a timed one; win for the door. The stages page ticks them off as the player does them; the lint refuses an event it does not know.',
    done: made('lesson', (ev) => ev.steps >= 3 && ev.malformed === 0),
  },
  {
    id: 'check', chapter: 2, title: 'Prove it', panel: 'edit',
    say: 'Press Check.',
    why: 'The solver\'s answer is what proves the lesson: replayed as the room\'s events, it has to complete every step in order. A lesson that asks for a lever the par never throws fails in CI, so keep the steps to what the room must do.',
    done: made('check', (ev) => ev.ok === true),
  },
  {
    id: 'play', chapter: 2, title: 'Play it', panel: 'play',
    say: 'Press Run & debug.',
    why: 'Play the room the way the lesson tells it, and see whether the words come in the order the room does things.',
    done: made('play'),
  },
  {
    id: 'win', chapter: 2, title: 'To the door', panel: 'play',
    say: 'Play through to the door.',
    why: 'If you had to do something the lesson does not mention, add it; if the lesson mentions something you never did, cut it.',
    done: made('win'),
  },
  {
    id: 'shelf', chapter: 3, title: 'Keep it', panel: 'edit',
    say: 'Put the room on your shelf (Ctrl+S).',
    why: 'The shelf keeps the room, words and all, with its last verdict, in this browser. The room in the editor is kept between visits on its own too.',
    done: made('shelf', (ev) => ev.did === 'save'),
  },
  {
    id: 'export', chapter: 3, title: 'Send it in', panel: 'export',
    say: 'Copy the module, download it, copy a link, or hand it to your AI to open the pull request.',
    why: 'The module carries the name, the blurb and the lesson with the map; the index line names the author. One room per pull request.',
    done: made('export', SENT),
  },
];

/** The catalogue: what the Learn panel offers as cards, in this order. */
export const MAKER_TUTORIALS = [
  {
    id: 'roses', title: 'Painting the Roses',
    blurb: 'The tour of the studio: the brushes, the proof, the shelf, the export, an assistant.',
    chapters: { 1: 'Chapter one · the brushes', 2: 'Chapter two · the proof', 3: 'Chapter three · ship it' },
    finish: {
      title: 'The roses are painted',
      say: 'You know the studio. Make a room nobody has seen.',
      note: (skipped) => `You have been through the whole studio${skippedNote(skipped)}. Start over any time; the shelf keeps your rooms, the export sends one in.`,
    },
    steps: ROSES,
  },
  {
    id: 'gate', title: 'A Room with a Gate',
    blurb: 'From a blank room to one the gate holds shut: a wall, a gate, its lever, a rock through it, the door behind.',
    chapters: { 1: 'Chapter one · the room', 2: 'Chapter two · the proof', 3: 'Chapter three · ship it' },
    finish: {
      title: 'The gate holds',
      say: 'A wall, a gate and a lever the room cannot do without. Now make it harder.',
      note: (skipped) => `You built a room around a gate that earns its keep${skippedNote(skipped)}. Start from a blank again and try two rocks behind the wall, or a second gate.`,
    },
    steps: GATE,
  },
  {
    id: 'clock', title: 'The Clock and the Cast',
    blurb: 'A timed room: the clock, a watcher on a loop, a wait, a catch, a restart and the way out.',
    chapters: { 1: 'Chapter one · the clock', 2: 'Chapter two · the chase', 3: 'Chapter three · ship it' },
    finish: {
      title: 'The cast is on its marks',
      say: 'A room with a clock. Tighten the tick, or give the Queen a longer walk.',
      note: (skipped) => `You turned a room into a chase${skippedNote(skipped)}. The par of a timed room counts ticks, waits included; keep it under about 120 so it can be played by hand.`,
    },
    steps: CLOCK,
  },
  {
    id: 'teach', title: 'A Room that Teaches',
    blurb: 'A name, a blurb and a lesson the stages page follows; kept on the shelf and sent in.',
    chapters: { 1: 'Chapter one · the words', 2: 'Chapter two · the proof', 3: 'Chapter three · ship it' },
    finish: {
      title: 'The room has a voice',
      say: 'A room that explains itself. The stages page will show every word.',
      note: (skipped) => `Your room has a name, a blurb and a lesson${skippedNote(skipped)}. The two demo rooms under Start from… are lessons too; open one to see what one reads like.`,
    },
    steps: TEACH,
  },
];

/** "Painting the Roses", the first of the catalogue, as it has always been exported. */
export const MAKER_TUTORIAL = ROSES;

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
