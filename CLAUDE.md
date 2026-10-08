# BSidesTLV 2026 Badge — project context

Read this first. It is the map of the repo and the state of the work, so a new
session does not have to rediscover it. Keep it current when the layout or the
status below changes.

Live site: https://bsidestlv.github.io/bsidestlv-2026-badge/
Fork's site (deployed by `pages.yml` from the fork's `main`, plus whichever
branch `pages.yml` lists while it is in progress; Pages source set to
"GitHub Actions"): https://tikotiktok.github.io/bsidestlv-2026-badge/
Upstream: `bsidestlv/bsidestlv-2026-badge` (this checkout is the `TikoTikTok`
fork; `upstream` remote). The glitch labs merged into the fork's `main` on
2026-10-06 (fork PR #1), so fork `main` is ahead of upstream `main` and no
upstream PR exists yet. Branch from `origin/main`; never commit to `main`
directly, land work there through a PR on the fork.

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
index.html glitch.html flash.html badge.html styles.css src/ stages/ assets/   the published site (MIT)
robots.txt rabbit-hole/                                                       also published: the crawler side
firmware/          NOT in the repo: pages.yml builds glitch.uf2 + index.json there at deploy time
  src/puzzle.js      untimed rules + push-based Dijkstra solver
  src/chase.js       timed rules (periodic hazards) + BFS solver over (Alice, rocks, lever, phase)
  src/gallery.js     the page: both stages, walk-cycle viewer, tile/item sheets
  src/range.js       glitch range rules: combo state machine, guard-routine interpreter, pulse landing
  src/pad.js         input: DS4 gamepad (standard mapping, 4 ms poll) or keyboard -> timestamped edges
  src/glitch.js      the glitch range page (glitch.html)
  src/uf2.js         UF2 parser + folding into 4 KB sectors; mirrors flash-badge.py's checks
  src/picoboot.js    PICOBOOT over WebUSB (the RP2040 ROM bootloader's protocol, as picotool speaks it)
  src/flash.js       the flash page (flash.html): firmware cards from firmware/index.json, progress, log
  src/vault.js       the badge's vault from the browser: feature report 0xF1 over WebHID, the
                     SELECT+Y stick-axis beacon decoder, wire formats mirrored from vault.h
  src/seal.js        sealed stages: AES-256-GCM under HKDF(badge key, stage id); loadStage() picks
                     stages/sealed/<id>.json when stages/sealed.json lists it, else stages/<id>.js
  src/gate.js        the gate dialog (site only): Connect (WebHID) or the beacon; input policy
  src/badge.js       the vault page (badge.html): read, provision at the booth, beacon test
  stages/            one ES module per stage, ASCII map + hazards; rabbit-watch.js and
                     looking-glass.js are the range's levels. sealed.json lists sealed ids
                     (none yet); sealed/ holds ciphertext only, plaintext of event stages
                     stays outside the repo
  rabbit-hole/       the tarpit: one static page, endless generated chapters, canary flags
  assets/characters/ 5 characters x 24 frames (8 dirs x 3), 48x48 + <name>.json
  assets/items/      44 items + items.json      assets/tiles/ 77 tiles + tiles.json
images/              README photos only, not published
hardware/            CERN-OHL-S-2.0
  badge/             "BSidesTLV2026 Alice Controller" v0.4 (KiCad files still named PhoneController.*)
  soldering-kit/     BSidesTLV26TinyBadge: 555 + CD4017 LED chaser, all through-hole
software/            MIT, never published
  controller/        Pico SDK CMake project; src/glitch.c is the quick-glitch record/replay
                     engine (no SDK deps), src/vault.c the stage key (last flash sector,
                     feature report 0xF1, SELECT+Y beacon), test/ builds both on the host with
                     plain cc; main.c also watches SELECT+START (2 s) -> reset_usb_boot
  tools/             slicers (Python, stdlib only) and generators/verifiers (Node ESM);
                     verify-flash.mjs + fake-bootloader.mjs (a model of the ROM; the page can
                     be driven against it via window.__flash.useDevice), verify-badge.mjs +
                     fake-badge.mjs (a model of the vault; badge.html takes it via
                     window.__vault.useDevice), seal-stage.mjs (--new-key, seal, --open),
                     flash-badge.py (UF2 over USB, --fetch takes the CI build, --status),
                     hid-trace.py (Linux HID bench), setup-pico-toolchain.ps1 +
                     build-firmware.ps1 (Windows cross-build)
  references/        source art sheets (15 MB) every asset was cut from
  docs/GAME_DESIGN.md  the five-stage design, tick model, Looking Glass protocol
  docs/BADGE_GATE.md   the badge-is-the-key design: threat model, what tier 1 stops, server tier
  legacy/            old generated-sprite pass, unused by the page, safe to delete
.github/workflows/pages.yml     builds the UF2 (build-uf2.yml), runs `npm run verify`, opens sealed
                                stages with the ALICE_STAGE_KEY secret, stages the site paths +
                                firmware/, deploys
.github/workflows/firmware.yml  host test of the glitch engine + cross-build via build-uf2.yml
.github/workflows/build-uf2.yml the one place the ARM toolchain and pico-sdk version live (reusable)
```

## Commands

```
./serve.sh          # http://localhost:8080 - ES modules need http://, not file://
npm run verify      # solves both stages, checks the range's levels, flashes the fake ROM, drives the fake badge; CI gate before every deploy
npm run seal -- <stage.js>         # ALICE_STAGE_KEY=<64 hex>; writes stages/sealed/<id>.json + updates stages/sealed.json
npm run validate    # legacy sprite integrity only
make -C software/controller/test   # quick-glitch engine + vault tests, plain C
python3 software/tools/flash-badge.py --fetch   # newest green CI UF2 -> badge, no toolchain needed
```

Firmware: see `software/controller/README.md` (needs pico-sdk + arm-none-eabi;
`apt install gcc-arm-none-eabi libnewlib-arm-none-eabi` and a shallow clone of
pico-sdk 2.3.1 with `lib/tinyusb` is enough, that is what firmware.yml does).
On Windows: `software/tools/setup-pico-toolchain.ps1` once, then
`build-firmware.ps1`. The dev machine this was written on has Node and Python
but no C compiler, CMake or Arm toolchain, so the engine test and the UF2 come
from CI there; `flash-badge.py --fetch` closes that gap.

## Rules that matter

- Only `index.html`, `glitch.html`, `flash.html`, `badge.html`, `robots.txt`,
  `styles.css`, `src/`, `stages/`, `assets/`, `rabbit-hole/` are published,
  plus `firmware/`, which `pages.yml` builds at deploy time and is never
  committed (`.gitignore`d). Every path inside them must be relative (site
  lives under `/<repo>/` on Pages). Adding another published path means
  editing `pages.yml` too.
- The published site plays from the badge only: `src/gate.js` gates every
  page outside a dev host and `src/pad.js` drops keyboard and `ui` edges
  there. Do not add a bypass for the site; `localhost` (and `?gate=1` on it)
  is the development path. Event stages are committed sealed only - never
  commit their plaintext, never commit a sealed blob under a throwaway key.
- Obfuscating JavaScript is not a defence against a model; sealing is. See
  `software/docs/BADGE_GATE.md` before adding "anti-AI" measures.
- No npm dependencies. Node ESM + Python 3 stdlib only. `package.json` has no
  `dependencies` block on purpose.
- Assets are generated: re-run the slicer in `software/tools/` and commit the
  PNGs it writes; never hand-edit an output.
- Hardware: commit `.kicad_sch/.kicad_pcb/.kicad_pro` only, regenerate
  `production/` with Fabrication Toolkit as one commit, pass DRC/ERC first.
- The firmware reports Sony's VID/PID (0x054C/0x09CC) so iOS binds it. That is
  deliberate and must not ship on hardware. Do not "fix" it.
- Commits: one concern each; describe the change, not the file list.

## Status (as of 2026-10-06)

Built and live:

| Piece | State |
|---|---|
| Stage "A Mad Tea Party" | playable, 13x9, 3 rocks / 3 buttons / gate + lever. Solver: 106 moves. Gate proven load-bearing by the verifier. |
| Stage "The Queen's Gauntlet" | playable, 9x8, timed at 320 ms/tick, 3 periodic hazards (Queen with sight 3, Cheshire, Rabbit). Par 64 ticks, 5 waits; empty room 41. |
| Asset pipeline | 5 characters, 44 items, 77 tiles cut from reference sheets, all reproducible from `software/tools/`. |
| Page | asset sheet + both stages, Solve buttons run the real solver in-browser. `?autosolve=tea|chase`, `?walk=<id>`. |
| Badge board | v0.4, fab package in `hardware/badge/production/`. |
| Soldering kit | schematic generated from `build_badge_sch.py`, fab package present. |
| Firmware | DualShock 4 HID, 14 inputs + status LED, builds to a ~50 KB UF2. Quick-glitch layer: SELECT is shift; SL record, SR fire (START trigger + offset + take at speed; hold = repeat), UP/DOWN speed 1/4x-32x, LEFT/RIGHT offset 1 ms (auto-repeat, 10 ms after 20), B reset. SELECT+START held 2 s reboots to the UF2 bootloader. 1 ms reports, latched between reports. Host-tested, not yet tried on a badge. |
| Flashing | `software/tools/flash-badge.py`: waits for `RPI-RP2`, checks the UF2 family, copies, confirms 054c:09cc came back; `--fetch` pulls the newest green Firmware-workflow artifact. No picotool route (no reset interface, on purpose). SWD header `J1` + openocd is the fallback, documented, untried. |
| Glitch range | `glitch.html`: Rabbit's Pocket Watch (4 combo levels, 1.5-18 presses/s) and Looking-Glass Glitch (3 fault-injection levels, 120/40/20 ms ticks, last one hidden source). Rising-edge glitch model, crash lines, brown-out, per-attempt measurements. Keyboard fallback, and an on-screen pad (`#touchPad`, fixed at the bottom, open by default on coarse pointers) feeding `pad.inject` as source `ui`. Map scales to the phone's width. Driven headless in Chromium during development via `window.__pad.inject`. |
| Badge gate | `src/gate.js` on `index.html` and `glitch.html` (site only): Connect over WebHID (report `0xF1`) or the `SELECT+Y` beacon on the stick axes. Both stages are driven by the badge (d-pad, `Y` waits, `START` resets, last-tapped stage armed); keyboard, on-screen pad and `inject()` are dropped on the site. `badge.html` reads/provisions the vault. Sealed stages via `src/seal.js` + `seal-stage.mjs`; `stages/sealed.json` is empty until event stages exist. Proven headless against `fake-badge.mjs` (verify-badge.mjs, and a Playwright smoke in development). Never seen a real badge. |
| Crawler side | `robots.txt` (AI crawlers disallowed; only honoured at a host root, so inert on a project page until a custom domain), `noai` meta on every page, `rabbit-hole/` tarpit with per-path canary flags, linked by a hidden door on the real pages. |
| Browser flashing | `flash.html`: WebUSB to the ROM bootloader (2e8a:0003), PICOBOOT exactly as picotool does it - exclusive access, EXIT_XIP, erase + write per 4 KB sector, read back, REBOOT(0, SRAM_END, 500 ms). One firmware on offer (the quick-glitch build) plus a local `.uf2`; the download link and `flash-badge.py` are the no-WebUSB route. Tested only against `fake-bootloader.mjs`; never run against a board. |
| CI | Pages workflow builds the UF2, verifies both stages, the range and the flasher, publishes `firmware/glitch.uf2` + `firmware/index.json` (commit, sha256, size) and deploys; Firmware workflow runs the engine test and cross-builds the UF2 (artifact `controller.uf2`, 90 days). Both builds come from `build-uf2.yml`. On the fork, Pages is on "GitHub Actions" and deploys `main` plus the branch `pages.yml` names. |

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
- The server tier of `BADGE_GATE.md` §4: per-badge keys from the serial,
  challenge-response, revocation, the flag issued server-side. Without it a
  badge holder who posts the key opens every sealed stage for everyone.
- Books/mushrooms/teacups/potions/keys/cards exist as art only; no mechanics
  use them yet. Only rocks, buttons, gate, lever and door are implemented.

Known loose ends:

- The vault has never run on real hardware either: `0xF1` over WebHID (Chrome
  pads feature reports to the declared 63 bytes; Linux needs a udev rule for
  054c:09cc), the beacon on iOS Safari's axes, and the deferred sector write
  (~45 ms with interrupts off while 1 ms reports stall) are all argued from
  the specs and proven against models only. `badge.html` is the diagnostics
  page for the first board. `BADGE_GATE.md` §7 lists what to check.
- The quick-glitch firmware has never run on real hardware: it is verified by
  the host test and by a clean cross-build only. First thing to check on a
  badge: that the 1 ms endpoint interval still binds on iOS, and the LED
  patterns. The macro is not persisted across power cycles. The bootloader
  chord and `flash-badge.py`'s copy-and-verify path are likewise untried on a
  board (the tool's drive scan, UF2 check and status probe were run on
  Windows with no board attached).
- The badge the user holds may be running the upstream firmware (no quick
  glitch, no chord): the first flash goes through BootSel.
- The WebUSB flasher has never seen a real bootloader: the protocol is
  transcribed from picotool and the ROM source and proven against a model.
  First things to check on a board: Chrome's chooser lists "RP2 Boot" on
  Windows without Zadig (the ROM's MS OS descriptors should bind WinUSB), the
  one-byte OUT ack after READ is accepted, and the gamepad shows up after the
  reboot.
- `main.c` leaves the internal pull-ups and the LED's "any button" feedback
  commented out; both came from upstream that way (commit 69d933c). The board
  has its own pull-ups (R3..R9, R14, R18 in the BOM), a bare Pico does not.
  Not changed here; ask the board author before "fixing" either.
- Browsers sample gamepads at ~16 ms, so the range's timing floor is the
  host, not the badge. Chrome's `Gamepad.timestamp` is used when it looks
  sane; Firefox/raw-mapping support is a best guess (hat on axis 9).

- `software/controller/README.md` notes the USB-C CC2 pin needs a 5.1k Rd
  pulldown and references an `hw/usb/...` schematic path that does not exist
  in this repo; the hardware commentary was intentionally reverted to the
  board author (commit ac0fdc7). Do not re-add it without them.
- `assets/characters/alice/` (25 large 113x184 frames) is unused; the page
  uses `alice2/` (48x48). Kept, not loaded.
- `software/legacy/` is dead code kept only so nothing was deleted unasked.
- `npm run verify` takes ~3 s for the tea party on this machine (31k nodes);
  the README quotes 12k nodes / 330 ms from an earlier run.
