# Alice in AI Land — asset set

Characters and items for a boulder-pushing puzzle game, cut from the supplied
reference sheets. Everything on the page is real art: nothing is generated.

```
./serve.sh        # http://localhost:8080
```

ES modules need `http://`, not `file://`. That is the whole build system.

## Layout

The site itself is at the repository root — `index.html`, `glitch.html`,
`styles.css`, `src/`, `stages/`, `assets/` — because that is what GitHub Pages
serves. This directory
is everything that produces it and is never published:

```
tools/        slicing and generation, writes into ../assets/
references/   the source sheets the art was cut from (15MB)
docs/         design doc
legacy/       the generated-sprite pass the page no longer loads
controller/   RP2040 firmware for the badge - a separate CMake project
```

Run the tools from the repository root, where `package.json` lives:

```
npm run verify      # both stages solvable, the glitch range's levels honest
npm run validate    # legacy sprite/frame integrity
./serve.sh          # http://localhost:8080
```

`controller/` is the firmware the badge runs — a Pico SDK CMake project with its
own [README](controller/README.md), unrelated to those npm scripts.

Deployment is [`.github/workflows/pages.yml`](../.github/workflows/pages.yml).

## What's here

| Path | What |
|---|---|
| `assets/characters/<name>/` | 24 walk frames (8 directions x 3), 48x48 RGBA, + `<name>.json` |
| `assets/items/` | 44 item PNGs, 48x48 RGBA, + `items.json` |
| `assets/tiles/` | 77 floor, wall, hedge, rail, door and button PNGs, 48x48 RGBA, + `tiles.json` |
| `software/references/` | The supplied reference sheets every asset was cut from |
| `tools/slice-walk-grid.py` | Cuts a character sheet into walk frames |
| `tools/slice-item-sheet.py` | Cuts `software/references/assets-reference.png` into items |
| `tools/slice-tile-sheet.py` | Cuts `software/references/tiles-reference.png` into tiles and props |
| `tools/build-walk-manifest.mjs` | Indexes a character folder into `<name>.json` |
| `tools/sheet-maps/` | Hand-picked cell maps for sheets that are not clean grids |
| `tools/pnglib.py` | Dependency-free PNG read/write + black-background keying |
| `tools/preview/` | Look at what a slice produced: contact sheets, sheet cells, side-by-side frames |
| `index.html`, `src/`, `styles.css` | The page: two playable stages, walk cycles, tile and item sheets |
| `glitch.html`, `src/glitch.js`, `src/pad.js`, `src/range.js` | The glitch range: gamepad/keyboard input, two practice games for the badge's quick-glitch layer |
| `tools/verify-range.mjs` | Proves the range's hand levels fit a hand, its badge levels do not, and all are winnable |
| `tools/hid-trace.py` | Bench tool: prints the badge's button edges off the raw HID reports with µs timestamps, relative to the last START (Linux) |

## Characters

| character | folder | source sheet | how |
|---|---|---|---|
| Alice | `alice2/` | `software/references/alice-reference3.png` | cut by hand |
| White Rabbit | `rabbit/` | `software/references/white-rabbit-reference.png` | `slice-walk-grid.py` (wide) |
| Mad Hatter | `hatter/` | `software/references/mad-hatter-reference.png` | `slice-walk-grid.py` + cell map |
| Red Queen | `queen/` | `software/references/queen-reference.png` | `slice-walk-grid.py` + cell map |
| Cheshire Cat | `cheshire/` | `software/references/cheshire-reference.png` | `slice-walk-grid.py --layout pairs` |

Frames are `<dir><frame>.png` (`s1.png`, `N1.png`, `SW2.png` - case does not
matter). Frame 1 stands, 2 and 3 are the walk pair; the manifest's `cycle` runs
them as stand → step → stand → other step.

```
python3 software/tools/slice-walk-grid.py software/references/white-rabbit-reference.png rabbit
node software/tools/build-walk-manifest.mjs assets/characters/rabbit rabbit
```

**Layouts.** `--layout wide` (default) is 8 columns x 3 rows, one column per
direction. `--layout pairs` is 6 columns x 4 rows — two directions per row —
which is how the Cheshire sheet is arranged.

**Sheets without an alpha channel** (queen, cheshire) sit on pure black. The
tool floods in from the border through *pure* black only, so the background goes
and the character's near-black outline stays; nothing inside the figure is
reachable, so it cannot punch holes.

**Pose sheets.** The hatter and queen sheets are not direction grids — the
facing drifts across each row. `tools/sheet-maps/<name>.json` names the cells to
use per direction, which are mirrored, and which are aliases:

```json
{ "cells":  { "n": [[1,1],[1,8],[1,7]], "sw": [[2,3],[2,2],[2,1]] },
  "mirror": { "ne": "nw", "se": "sw" },
  "alias":  { "w": "sw", "e": "se" } }
```

Direction follows the **body**, not the head — in these sheets a character often
walks one way while glancing back over their shoulder. Reading the face gets the
mapping backwards.

Known compromises, both from the source sheets: the hatter has no true profile,
so his E and W reuse the diagonals; the queen has only two usable side poses, so
her W repeats a frame.

## Tiles

```
python3 software/tools/slice-tile-sheet.py
```

Cuts both tile sheets - `software/references/tiles-reference.png` and `software/references/assets-reference2.png` - into
77 assets under `assets/tiles/`, with one merged manifest and two fit policies,
because these are two kinds of art:

- **tile** (`floor`, `wall`) fills the whole 48x48 cell — these *are* the grid,
  and a gap around them would read as a seam.
- **prop** (`door`, `button`) keeps its aspect and sits on the cell floor, all
  sharing one scale factor so a button stays smaller than a door.

The sheets carry a faint coloured halo around some sprites (alpha 1-4, stray
blues and yellows). Weighting the resample by alpha makes it contribute
essentially nothing, so no keying or clean-up pass touches the colours.

Rows are found from the pixels, except on the second sheet where the walls in
neighbouring rows nearly touch; those band boundaries are given explicitly,
found from the row-occupancy profile rather than from gaps.

**Not every wall piece fills its cell.** Pillars, posts and rails are narrower
than 48px, so the stages draw a floor in every cell first and composite the
wall art on top. Without that, the gap around a pillar is just background
showing through.

## Items

```
python3 software/tools/slice-item-sheet.py
```

Rows and the items inside each row are found from the pixels, so the last row
holding eight instead of six needs no special case. Every item is scaled by one
shared factor — a key stays small next to a boulder — then centred on the bottom
of a 48x48 frame, the same size as a character frame, so items and characters
drop onto the same grid with no per-asset fiddling.

Categories: `scenery` (rocks, mushrooms), `book`, `teapot`, `teacup`, `potion`,
`token` (keys and cards). Names are in `assets/items/items.json`.

## The stage and the solver

`stages/tea-party.js` is a playable Sokoban-with-extras room. `src/puzzle.js`
holds the rules and the solver; `tools/verify-stage.mjs` runs the same solver
from the command line.

```
node software/tools/verify-stage.mjs stages/tea-party.js
```

```
A Mad Tea Party - 13x9, 3 rocks, 3 buttons, 1 gate(s), 1 lever(s)
solved in 106 moves (330ms, 12520 nodes, 12520 states)
gate: load-bearing - unsolvable when welded shut
```

The verifier does three things worth having:

1. **Replays the solution through the rules.** A solver that returns a path the
   game rejects is a bug, and this catches it — it caught one where the search
   walked Alice through the door cell.
2. **Proves the gate matters.** It re-solves the stage with the gate welded shut
   and the lever removed. "The solver happened to use it" is not the same as
   "the puzzle needs it" — a route that merely exists is not a mechanic.
3. **Reports the shortest solution**, which is the yardstick the tick budgets in
   `docs/GAME_DESIGN.md` are set against.

The **Solve** button on the page runs that same search in the browser and plays
back what it finds. It is not a recorded answer: press it after moving Alice
around by hand and it solves from wherever she is, or tells you the position is
already lost.

### How the search stays fast enough for a button

A step-by-step BFS explores ~750k states on this stage and takes a second or
more. Three changes bring it to ~12k states and ~330ms:

- **Dead squares.** Pull a rock backwards from every button; any square not
  reached that way can never deliver a rock, so a state that puts one there is
  abandoned.
- **Search over pushes, not steps.** Walking between pushes is bookkeeping, not
  a decision. The search branches only where the puzzle does: which rock, which
  way, and when to throw the lever.
- **States keyed by region.** Two spots Alice can walk between without touching
  anything are the same position as far as the puzzle is concerned. Working out
  which region a state belongs to costs a flood fill, so it happens once per
  node popped rather than once per edge considered.

The trade: costs are measured from where Alice actually stands, so the result is
near-optimal rather than provably optimal. Worth two orders of magnitude.

## The timed stage

`stages/queens-gauntlet.js` adds the thing the first stage is missing: a clock.
Every tick the cast advances one cell along a fixed loop, so a plan is not a
route but a schedule.

```
node software/tools/verify-chase.mjs stages/queens-gauntlet.js
```

```
The Queen's Gauntlet - 9x8, 2 rocks, 3 hazards, world repeats every 30 ticks
  queen: 10-tick loop, sight 3
  cheshire: 6-tick loop
  rabbit: 6-tick loop
par 64 ticks (5 of them waiting) - 20.5s at 320ms/tick
hazards: cost 23 extra ticks over an empty room (par 41)
```

`src/chase.js` holds the rules. What makes it searchable is that the hazards
are deterministic and periodic: the world's entire future is
`phase mod period`, so a state is `(Alice, rocks, lever, phase)` and plain
breadth-first search returns the fewest ticks — which is also the stage's par,
the exact number of correct inputs a player has to land.

Why it is hard by hand, and not merely fiddly:

- **One corridor joins the halves and the Queen walks it**, looking three cells
  ahead. Both rocks and Alice have to cross it several times, so every crossing
  is a window rather than a route.
- **Standing still is a move.** The shortest solution waits five times; a player
  who only knows how to move cannot express the plan.
- **Being seen ends the run**, so 64 inputs have to be correct *and* on time.
  One late press and it starts over.

The verifier re-solves the room with the cast removed and reports the
difference. If the hazards cost zero ticks they are scenery, which is exactly
what the first three layouts turned out to be — the map was open enough to
route around everyone.

## The page

Both stages pick their look from a theme: each map character maps to a list of
tiles, and which one a cell gets is a hash of its coordinates - deterministic,
so a room looks hand-dressed but never shuffles between frames. The tea party
is a walled garden, the gauntlet is the Queen's hall.

- **Stage — A Mad Tea Party** — the untimed puzzle. Arrow keys or WASD, R to
  reset, Solve to watch the solver do it. `?autosolve=tea` starts it on load.
- **Stage — The Queen's Gauntlet** — the timed one. The clock runs whether you
  act or not; space waits, R restarts, and the red tint is what the Queen can
  see this tick. `?autosolve=chase` starts it on load.
- **8-way walk cycles** — a tab per character, a compass of all eight directions
  each running its own cycle, and a large view you drive by clicking or with the
  arrow keys / WASD (hold two for a diagonal). `?walk=queen` opens on one.
- **Tiles** and **Items** — every asset, filterable by category, click a name
  to copy it.

Adding a character: drop 24 frames in `assets/characters/<name>/`, run the
manifest tool, add `{ id: '<name>', label: '<Name>' }` to `WALK_CHARACTERS` in
`src/gallery.js`.

## Looking at a slice

Slicing is guesswork until you look at the result, so the review tools are in
the repo rather than improvised each time:

```
python3 software/tools/preview/contact.py assets/characters/queen out.png 3
python3 software/tools/preview/cells.py   software/references/queen-reference.png       out.png
python3 software/tools/preview/compare.py assets/characters/queen   out.png w1,e1,sw1,se1
```

- **contact** renders a whole folder as one sheet — 8x3 for a character,
  manifest order for items and tiles.
- **cells** lays a reference sheet out cell by cell in sheet order, indexed
  `[row, col]` from 1. This is the tool for writing a `sheet-maps/*.json`: it
  shows the grid the way the map file indexes it, so the cells can be read off
  rather than guessed at.
- **compare** puts named frames side by side, big. For settling which way a
  sprite faces — the question that got the queen's mapping wrong three times.

## Legacy

An earlier pass generated placeholder sprites in code. It lives in `legacy/`
(`legacy/assets/sprites.*.js`, `legacy/src/pixel.js`, `legacy/dist/`) and is
driven by `tools/gen-*.mjs`, `tools/export-png.mjs` and `tools/validate.mjs`.
The page no longer loads any of it, and it is outside `` so none of it is
published. Kept only so nothing is deleted without asking — safe to remove.

## Licence

MIT — see the repository root [`LICENSE`](../LICENSE). The hardware this runs on
lives in [`../hardware/`](../hardware) under CERN-OHL-S-2.0.
