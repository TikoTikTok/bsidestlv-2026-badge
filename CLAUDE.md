# BSidesTLV 2026 Badge — project context

Read this first. It is the map of the repo and the state of the work, so a new
session does not have to rediscover it. Keep it current when the layout or the
status below changes.

Live site: https://bsidestlv.github.io/bsidestlv-2026-badge/
Upstream: `bsidestlv/bsidestlv-2026-badge` (this checkout is the `TikoTikTok`
fork; pull requests go upstream).

## What this is

One repo, three things:

1. **The challenge** — *Alice in AI Land*, a boulder-pushing puzzle game whose
   final answer is a *program*. Served as plain static files from the repo
   root by GitHub Pages. No server, no build step, no dependencies.
2. **The hardware** — two KiCad 9 boards under `hardware/`.
3. **The firmware** — RP2040 firmware under `software/controller/` that makes
   the badge enumerate as a wired DualShock 4.

## Layout

```
index.html styles.css src/ stages/ assets/   the published site (MIT)
  src/puzzle.js      untimed rules + push-based Dijkstra solver
  src/chase.js       timed rules (periodic hazards) + BFS solver over (Alice, rocks, lever, phase)
  src/gallery.js     the page: both stages, walk-cycle viewer, tile/item sheets
  stages/            one ES module per stage, ASCII map + hazards
  assets/characters/ 5 characters x 24 frames (8 dirs x 3), 48x48 + <name>.json
  assets/items/      44 items + items.json      assets/tiles/ 77 tiles + tiles.json
images/              README photos only, not published
hardware/            CERN-OHL-S-2.0
  badge/             "BSidesTLV2026 Alice Controller" v0.4 (KiCad files still named PhoneController.*)
  soldering-kit/     BSidesTLV26TinyBadge: 555 + CD4017 LED chaser, all through-hole
software/            MIT, never published
  controller/        Pico SDK CMake project, ~900 lines of C
  tools/             slicers (Python, stdlib only) and generators/verifiers (Node ESM)
  references/        source art sheets (15 MB) every asset was cut from
  docs/GAME_DESIGN.md  the five-stage design, tick model, Looking Glass protocol
  legacy/            old generated-sprite pass, unused by the page, safe to delete
.github/workflows/pages.yml  runs `npm run verify`, stages the five site paths, deploys
```

## Commands

```
./serve.sh          # http://localhost:8080 - ES modules need http://, not file://
npm run verify      # solves both stages from the CLI; CI gate before every deploy
npm run validate    # legacy sprite integrity only
```

Firmware: see `software/controller/README.md` (needs pico-sdk + arm-none-eabi).

## Rules that matter

- Only `index.html`, `styles.css`, `src/`, `stages/`, `assets/` are published.
  Every path inside them must be relative (site lives under `/<repo>/` on
  Pages). Adding a sixth published path means editing `pages.yml` too.
- No npm dependencies. Node ESM + Python 3 stdlib only. `package.json` has no
  `dependencies` block on purpose.
- Assets are generated: re-run the slicer in `software/tools/` and commit the
  PNGs it writes; never hand-edit an output.
- Hardware: commit `.kicad_sch/.kicad_pcb/.kicad_pro` only, regenerate
  `production/` with Fabrication Toolkit as one commit, pass DRC/ERC first.
- The firmware reports Sony's VID/PID (0x054C/0x09CC) so iOS binds it. That is
  deliberate and must not ship on hardware. Do not "fix" it.
- Commits: one concern each; describe the change, not the file list.

## Status (as of 2026-09-23)

Built and live:

| Piece | State |
|---|---|
| Stage "A Mad Tea Party" | playable, 13x9, 3 rocks / 3 buttons / gate + lever. Solver: 106 moves. Gate proven load-bearing by the verifier. |
| Stage "The Queen's Gauntlet" | playable, 9x8, timed at 320 ms/tick, 3 periodic hazards (Queen with sight 3, Cheshire, Rabbit). Par 64 ticks, 5 waits; empty room 41. |
| Asset pipeline | 5 characters, 44 items, 77 tiles cut from reference sheets, all reproducible from `software/tools/`. |
| Page | asset sheet + both stages, Solve buttons run the real solver in-browser. `?autosolve=tea|chase`, `?walk=<id>`. |
| Badge board | v0.4, fab package in `hardware/badge/production/`. |
| Soldering kit | schematic generated from `build_badge_sch.py`, fab package present. |
| Firmware | DualShock 4 HID, 14 inputs + status LED, builds to a ~41 KB UF2. |
| CI | Pages workflow verifies both stages before deploy. |

Designed but not built (see `software/docs/GAME_DESIGN.md`):

- The game as shipped on the page is the *prototype*: two rooms with a shared
  rules engine. The design calls for five stages, a 60 Hz tick sim, and a
  server that owns the seed and issues the flag.
- Stage 1 "Down the Rabbit Hole", stage 3 "The Card Soldiers' Drill" (the wall:
  board hidden, reseeded, only scriptable), stage 4 "The Queen's Croquet"
  (four boards, one input), stage 5 "The Trial" (adversarial, replanning).
- The Looking Glass WebSocket protocol (`ws://localhost:7777/looking-glass`),
  server-side simulation, HMAC flag, practice mode, leaderboard.
- Reference solvers for stages 3–5 (design rule: must clear in < 60% of budget).
- Gamepad input on the page. The firmware presents a DS4 but `src/gallery.js`
  only reads the keyboard today; the Gamepad API is the missing link between
  the badge and the challenge.
- Books/mushrooms/teacups/potions/keys/cards exist as art only; no mechanics
  use them yet. Only rocks, buttons, gate, lever and door are implemented.

Known loose ends:

- `software/controller/README.md` notes the USB-C CC2 pin needs a 5.1k Rd
  pulldown and references an `hw/usb/...` schematic path that does not exist
  in this repo; the hardware commentary was intentionally reverted to the
  board author (commit ac0fdc7). Do not re-add it without them.
- `assets/characters/alice/` (25 large 113x184 frames) is unused; the page
  uses `alice2/` (48x48). Kept, not loaded.
- `software/legacy/` is dead code kept only so nothing was deleted unasked.
- `npm run verify` takes ~3 s for the tea party on this machine (31k nodes);
  the README quotes 12k nodes / 330 ms from an earlier run.
