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

## The maker page

`maker.html` on a local checkout (`localhost`, `127.0.0.1`) is the maker.
On the published site the same page is only the landing: the editor, the
bench and the export are class `dev-only` and the keyboard is not a
controller there (`src/pad.js` builds the site's pad with the badge as its
only source; the maker builds a pad with every source on a dev host and
none at all on the site).

- **The room.** A palette of brushes (also keys `1`–`8`), click or drag to
  paint, right-click paints floor. Alice and the door are single, so
  painting one moves it. The map box on the right is the same room as text;
  edit either. Width, height, dressing, the clock; *Add a hazard* puts one
  of the cast on the board and *lay the route* turns clicks into its
  waypoints (click the last one again to take it back). `Ctrl`+`Z` takes an
  edit back. The lint under the map says what is malformed as you go.
- **Check** runs the real solver (`src/level.js` `check()`, in a worker so
  the page stays live): par in moves or ticks, how many states it searched,
  whether the gate is load-bearing or decoration (welded shut, does the
  room still solve?), what the cast costs over an empty room. A room the
  solver cannot clear is refused, here and in CI.
- **Run & debug** plays the room with the rules the site uses: the d-pad
  moves, `B` undoes (untimed), `Y` waits a tick (timed), `START` resets;
  the clock of a timed room holds until the first press. The simulated
  badge lights whatever is held, from the keyboard (`WASD` or arrows,
  `Z X C V` for `A B X Y`, `Q E` for the shoulders, `Enter` for START,
  `Backspace` for SELECT), from a click on one of its keys, or from a real
  badge on USB; the log is every edge with its time and what the room made
  of it. *Play the solution* replays the checker's answer.
- **Send it in** writes the module (copy or download), names the file,
  and makes a link that carries the whole room (`?level=`), for a friend
  with a checkout. *Import* reads a pasted module back.

The room is kept in the browser (`localStorage` `alice.maker.level`), so a
reload keeps it. Headless, the page is driven through `window.__maker`
(`level`, `setLevel`, `lint`, `check`, `play`, `game`, `module`, `share`)
and `window.__pad.inject`.

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
is live at the next deploy. The maker's *Load* menu lists them beside the
two shipped stages. Putting a community room in front of the player on
`index.html` - a "Community" panel behind the mode bar, picked by the
badge, played by the same rules - is the natural next step and is not done
yet; the stages page plays the two shipped rooms. A community room can be
sealed like any other (`npm run seal`) if an event wants it hidden until
the day.

Suggested handling of pull requests:

- One room per pull request, one commit (the module and the index line).
- The CI run is the review of the mechanics. A maintainer plays it once on
  a checkout before merging and says what the par felt like.
- A room that changes `src/` or the shipped stages is not a room pull
  request; ask for it to be split.
- Keep the index sorted by id, so two pull requests seldom conflict on it.

## Files

```
maker.html                      the page: the landing (site) and the maker (checkout)
src/maker.js                    the page's module: hero, invitation, editor, checker, bench, export
src/maker.css                   its styles, on top of styles.css
src/level.js                    a level as data: lint, check, toModule / fromModule, share links
src/scene.js                    the art: assets, dressings, drawRoom - shared with the stages page
src/check-worker.js             check() off the page's thread
stages/community/               the community's rooms and index.json
software/tools/maker.mjs        npm run maker: a Node static server that opens the page
software/tools/check-stage.mjs  npm run stage -- <file>: the verdict on a module
software/tools/verify-maker.mjs part of npm run verify: level.js, the page's two faces, the community index
```
