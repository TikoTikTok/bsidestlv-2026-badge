# The level maker

How a room for *Alice in AI Land* is made, checked and sent in. This is the
document the landing page (`maker.html` on the published site) points an
assistant or a person at; everything it needs is here.

## In one minute

```
git clone https://github.com/bsidestlv/bsidestlv-2026-badge.git
cd bsidestlv-2026-badge
npm run maker                                    # serves the checkout, opens http://localhost:8080/maker.html
# draw, Check, Run & debug, Export -> stages/community/<id>.js, plus one line in stages/community/index.json
npm run stage -- stages/community/<id>.js        # what CI will say
# commit on a branch, open a pull request
```

Node 20 or newer. No packages are installed, there is no build step; the
site is static files at the repository root and the maker is one of them.
`./serve.sh` (Python) serves the same files if you would rather.

## What a stage is

A stage is an ES module exporting one object. The ASCII map is the whole
room; the legend is `src/puzzle.js`'s:

```
#  wall     .  floor    A  Alice    O  rock
b  button   L  lever    G  gate     D  door
```

```js
// Stage: "A Small Garden"
export const A_SMALL_GARDEN = {
  name: 'A Small Garden',
  theme: 'garden',          // garden | hall | court - what the room is dressed in
  rows: [
    '#########',
    '#A..#..b#',
    '#.O.G...#',
    '#...#...#',
    '#.L.#..D#',
    '#########',
  ],
};
```

The rules (`src/puzzle.js`): Alice walks four ways and pushes a rock one
cell when she walks into it, never two rocks at once, never into a wall or
off the board. A gate is solid until she steps on a lever, which throws it
(and again on the next step, so the lever is a switch). Every button must
have a rock on it before the door lets her in, and the stage is won when
she stands in the door. A rock against two walls at a corner can never be
pushed again; the stages page says so and offers undo.

A **timed** room (`src/chase.js`) adds a clock and a cast:

```js
export const THE_HALL = {
  name: 'The Hall',
  theme: 'hall',
  tickMs: 320,                                     // the clock; 100..2000, the shipped room uses 320
  rows: [ /* as above */ ],
  hazards: [
    { id: 'queen',    route: [[2, 3], [7, 3]], sight: 3 },   // walks 2,3 -> 7,3 -> back, looks 3 cells ahead
    { id: 'cheshire', route: [[4, 1], [7, 1]] },
    { id: 'rabbit',   character: 'rabbit', route: [[4, 6], [7, 6]] },
  ],
};
```

Every tick the player acts (a step, or a wait) and then every hazard
advances one cell along its route, which is a closed loop through its
points in order and back to the first; consecutive points must share a row
or a column. Sharing a cell with a hazard, swapping places with one, or
standing in a straight line of open floor within `sight` cells of where a
watcher is walking ends the run. A hazard standing where a rock would go
blocks the shove. `id` must be unique; `character` picks the sprite
(`queen`, `cheshire`, `rabbit`, `hatter`; defaults to the id). The world
repeats every lcm of the loop lengths, which is what keeps it solvable by
search.

Limits the checker enforces: between 4×4 and 24×24, walled all the way
round, exactly one `A` and one `D`, as many rocks as buttons, at least one
rock, a lever wherever there is a gate, routes on floor and in straight
lines. The art, the names and the colours come from `src/scene.js`.

Two more fields are optional and travel with the room:

```js
  blurb: 'A first room: one rock, one button, a gate and its lever.',   // one line, up to 160 characters
  lesson: [                                                              // the room's own tutorial, up to 12 steps
    { on: 'move',  say: "Move Alice with the badge's d-pad." },
    { on: 'push',  say: 'Walk into the rock. It slides one cell.' },
    { on: 'lever', say: 'Step on the lever. The gate opens.' },
    { on: 'win',   say: 'Walk to the door.' },
  ],
```

The **blurb** is what the stages page shows beside the room. The **lesson**
is shown under it and ticks itself off as the player does what each step
says: `on` is a thing the room does - `move push lever button blocked undo
reset` in any room, `start wait tick caught restart` in a timed one, `win`
for the door - and `say` is the line for it (`src/tutor.js` `LESSON_EVENTS`;
`lessonSteps` turns a lesson into the tutorials' own engine, `src/room.js`
drives it). The checker proves a lesson can be followed: the solver's answer,
replayed as the room's events, has to complete every step in order, so a
lesson that asks for something the par never does is refused. The two demo
rooms, `stages/community/the-first-lesson.js` (untimed) and `tick-tock.js`
(timed), are lessons; copy one.

## The studio

`maker.html` on a local checkout (`localhost`, `127.0.0.1`) is the studio.
On the published site the same page is only the landing: the editor, the
bench, the export, the assistant panel and the tutorial are class
`dev-only` and the keyboard is not a controller there (`src/pad.js` builds
the site's pad with the badge as its only source; the studio builds a pad
with every source on a dev host and none at all on the site).

The first visit is guided: **Painting the Roses** (`MAKER_TUTORIAL` in
`src/tutor.js`, drawn by `src/coach.js` as the line at the top of the page
and the Learn panel at the bottom) is sixteen steps that watch what you do
and tick themselves off - chapter one draws (a brush, a wall, a rock, its
button, the lint green, a bigger tool, an overlay, Surprise me), chapter
two proves and plays (Check, Run & debug, a step, the solution), chapter
three ships (the shelf, a lesson, the export, an assistant). Skip any step; start
over from the panel; progress is in `localStorage alice.tutor.maker`.
`?` lists every key.

- **The room.** A palette of brushes (also keys `1`–`8`) and a bar of
  tools: the **pencil** (`P`, one cell or a drag), the **line** (`I`, drag
  end to end), the **rectangle** (`R`, drag corner to corner; hold `Shift`
  to fill it), the **fill** (`F`, every joined cell that is the same), the
  **pick** (`K`, or `Alt`+click: take the brush under the pointer).
  Right-click paints floor. A stroke is one undo step (`Ctrl`+`Z`, `Ctrl`+`Y`
  or the buttons). **Mirror** (`M` cycles none, ↔, ↕, both) paints every
  stroke's reflection too; the dashed line shows the axis. **flip ↔ / ↕**,
  **turn ↻** and the four arrows move the whole room, routes included; what
  crosses the wall is lost. Zoom draws cells from 24 to 80 px. Alice and the
  door are single, so painting one moves it. The map box on the right is the
  same room as text; edit either. Width, height, dressing, the clock; *Add a
  hazard* puts one of the cast on the board and *lay the route* turns clicks
  into its waypoints (click the last one again to take it back). **Blurb** is the room's one line; **the lesson** is written one
  step a line as `event: what to say` and lints like the rest. The lint
  under the map says what is malformed as you go.
- **The overlays**, under the board, are the solver's own bookkeeping drawn
  over the room: the grid and the coordinates; **stuck corners** (hatched:
  a rock that lands there can never reach a button, `src/puzzle.js`
  `liveSquares` in reverse); **Alice's reach** (where she can walk right
  now, rocks in place, gate shut); **the solution** (the green line Alice
  walks in the last Check); **the cast's sight** (what a watcher sees on
  the first tick). `G` toggles the grid.
- **Start from…** are six rooms, each a lesson in one idea (a blank, a wide
  blank, the corridor, the gate, two rooms, the hall), and then every room
  the community has sent in, the two demos first. **Surprise me**
  draws a room from a seed with the knobs you set (size, rocks, wall
  density, a gate, timed) and keeps drawing until the solver clears one
  with at least the par you ask; the seed is shown and can be typed back,
  so a room is named by its seed and the same knobs draw the same room on
  any machine (`generate` / `generateSolvable` in `src/level.js`).
  **My shelf** keeps rooms in this browser (`Ctrl`+`S` or *Keep this
  room*), each with its last verdict; a room on the shelf opens with one
  click.
- **Check** runs the real solver (`src/level.js` `check()`, in a worker so
  the page stays live; `Ctrl`+`Enter`): par in moves or ticks, how many
  states it searched, whether the gate is load-bearing or decoration
  (welded shut, does the room still solve?), what the cast costs over an
  empty room, and the **verdict** - how many shoves the answer takes and a
  word for the difficulty, from *a stroll* to *a nightmare* (`difficulty()`:
  par, shoves and the size of the search). *auto-check* runs it after every
  edit. A room the solver cannot clear is refused, here and in CI. *Save a
  picture* writes the board as a PNG.
- **Run & debug** plays the room with the rules the site uses: the d-pad
  moves, `B` undoes (untimed), `Y` waits a tick (timed), `START` resets;
  the clock of a timed room holds until the first press. The simulated
  badge lights whatever is held, from the keyboard (`WASD` or arrows,
  `Z X C V` for `A B X Y`, `Q E` for the shoulders, `Enter` for START,
  `Backspace` for SELECT, `Esc` back to the editor), from a click on one of
  its keys, from a real badge on USB, or from an assistant over the bridge;
  the log is every edge with its time and what the room made of it. *Play
  the solution* replays the checker's answer.
- **Send it in** writes the module (copy or download), names the file,
  and makes a link that carries the whole room (`?level=`), for a friend
  with a checkout. *Import* reads a pasted module back.
- **The assistant** is the chat the bridge carries (next section): what you
  type goes to whoever is connected, what they say comes back here, and
  everything they do to the room is listed as it happens. The header's chip
  says who is on the bridge.

The room is kept in the browser (`localStorage` `alice.maker.level`, the
shelf under `alice.maker.shelf`, the overlays and zoom under
`alice.maker.prefs`), so a reload keeps it. Headless, the page is driven
through `window.__maker` (`level`, `setLevel`, `lint`, `check`, `play`,
`solution`, `game`, `module`, `share`, `tool` / `setTool`, `brush` /
`setBrush`, `symmetry` / `setSymmetry`, `overlays` / `setOverlay`, `undo` /
`redo`, `surprise`, `shelf` / `shelfSave`, `loadById`, `ops`, `bridge`,
`tutor`, `chat`) and `window.__pad.inject`.

## The bridge: an assistant in the studio

`npm run maker` (`software/tools/maker.mjs`, the server in
`maker-server.mjs`) serves the checkout and mounts a bridge under
`/__maker/`, on the loopback only, through which an assistant on the same
machine drives the studio while you watch. The page connects to it by
itself (`src/bridge.js`); served any other way (`serve.sh`, the site) the
page says so and works alone.

Two ways in:

- **MCP.** `.mcp.json` at the repository root registers
  `software/tools/maker-mcp.mjs` as the server `alice-maker`, so a clone
  opened in Claude Code (or any client that reads `.mcp.json`; by hand,
  `claude mcp add alice-maker -- node software/tools/maker-mcp.mjs`, or
  command `node`, args `software/tools/maker-mcp.mjs`, env `MAKER_URL`)
  has the studio as tools: `maker_status`, `maker_open` (starts the server
  and the page when nothing is listening), `maker_get`, `maker_set_level`,
  `maker_paint`, `maker_check`, `maker_play`, `maker_moves`, `maker_press`,
  `maker_reset`, `maker_stop`, `maker_say`, `maker_read_chat`,
  `maker_snapshot` (a picture of the board or the run, as an image),
  `maker_load`, `maker_generate`, `maker_module`, `maker_tool`. No
  dependencies: JSON-RPC over stdio.
- **HTTP.** Anything that can `curl`:

  ```
  curl -X POST localhost:8080/__maker/hello -d '{"name":"my assistant"}'          # the page shows who is here
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"get"}'                        # the room, the lint, the last check, the game
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"set","args":{"level":{...}}}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"check"}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"play"}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"moves","args":{"moves":["E","E","S"]}}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"say","args":{"text":"try the gate on the left"}}'
  curl "localhost:8080/__maker/inbox?since=0&wait=20000"                           # what you typed in the chat, long-polled
  curl localhost:8080/__maker/level                                                # the room as the page last reported it
  ```

  The ops are `get`, `set`, `paint`, `check`, `play`, `stop`, `reset`,
  `press`, `moves`, `say`, `snapshot`, `module`, `load`, `generate`,
  `tool` - the same table (`ops` in `src/maker.js`) the MCP tools call. An
  rpc waits for the page's answer (30 s by default, `timeoutMs`); with no
  page open it is 503, an error the page raised is 422, an op the page
  does not know is 400.

What an assistant does shows at once: the board redraws, the chat lists
each action (*set the room to…*, *checked: par 26, a riddle*, *played 6
moves*), the run plays its presses through the same pad a badge would. The
bridge answers the loopback only and refuses a request whose `Host` is not
it or whose `Origin` is another site, so a page on the web cannot reach
it. The landing's prompt ("Try it now with your favourite AI") tells an
assistant all of this.

## Sending a room in

1. Export → `stages/community/<id>.js`. The id is the name, lower-case,
   hyphens; the export's name is the same in capitals. Keep the header the
   maker writes, it is the file's documentation.
2. Add a line to `stages/community/index.json`:
   `{ "id": "<id>", "name": "<name>", "author": "<you>", "kind": "tea" | "chase" }`.
3. `npm run stage -- stages/community/<id>.js` prints the verdict CI will
   reach. `npm run verify` runs everything the deploy runs, including
   `verify-maker.mjs`, which checks every listed room and that nothing in
   the folder is unlisted.
4. Open a pull request. Say in a sentence what the room is about and
   roughly how hard; the checks prove it solves, a maintainer plays it.

What gets a room merged: it solves, the gate (if any) is load-bearing, the
par is honest (a 400-move untimed room is a chore, a timed room with a par
over about 120 ticks is unplayable by hand), and the name is its own.
Rooms are MIT like everything else under the site.

## How the community's rooms reach the site

`stages/community/` is published with the rest of the site, and
`verify-maker.mjs` gates the deploy on every listed room, so a merged room
is live at the next deploy, in two places: the maker's *Load* menu and
*Start from…* list it beside the shipped stages, and the stages page
(`index.html`) plays it. There, **Rooms** (a panel behind the mode bar, the
third stage of the page) lists every room in the index as a card, in the
index's order, opens one at a time (`?room=<id>` opens straight on one) and
plays it with the badge by the rules of whichever stage it is like -
`src/room.js`, one player for both rules, with the room's blurb beside it
and its lesson under it. The stages' tutorial, *A Caucus Race*, ends in
that panel: its third chapter opens a room and follows its lesson to the
door. A community room can be sealed like any other (`npm run seal`,
`stages/community/sealed.json` is that folder's manifest) if an event
wants it hidden until the day.

Suggested handling of pull requests:

- One room per pull request, one commit (the module and the index line).
- The CI run is the review of the mechanics. A maintainer plays it once on
  a checkout before merging and says what the par felt like.
- A room that changes `src/` or the shipped stages is not a room pull
  request; ask for it to be split.
- Keep the index sorted by id, so two pull requests seldom conflict on it.

## Files

```
maker.html                      the page: the landing (site) and the studio (checkout)
src/maker.js                    the page's module: hero, invitation, the studio, checker, bench, export, the assistant panel and the bridge's ops, the coach
src/maker.css                   its styles, on top of styles.css
src/level.js                    a level as data: lint, check, toModule / fromModule, share links; the tools (line, rect, region, mirror), the transforms, analyse / difficulty, STARTERS, generate / generateSolvable
src/scene.js                    the art: assets, dressings, drawRoom - shared with the stages page
src/check-worker.js             check() and generateSolvable() off the page's thread
src/bridge.js                   the page's end of the bridge: the event stream, the replies, the mirror, the chat
src/tutor.js                    MAKER_TUTORIAL, "Painting the Roses" (with the other two tutorials); src/coach.js draws it; LESSON_EVENTS + lessonSteps, a room's lesson as tutorial steps
src/room.js                     the stages page's player for a community room: either rules, the badge, the lesson under it
stages/community/               the community's rooms and index.json; the-first-lesson.js and tick-tock.js are the demos, one lesson each
software/tools/maker.mjs        npm run maker: serves the checkout, opens the page
software/tools/maker-server.mjs the server: static files + the bridge under /__maker/ (loopback only)
software/tools/maker-mcp.mjs    the bridge as MCP tools over stdio; .mcp.json at the root registers it
software/tools/check-stage.mjs  npm run stage -- <file>: the verdict on a module
software/tools/verify-maker.mjs part of npm run verify: level.js and the studio's logic, the tutorial, the bridge and the MCP server, the page's two faces, the community index
```
