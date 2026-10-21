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
2026-10-06 (fork PR #1), the looks on 2026-10-08 (PR #3) and the badge gate
with the site-wide looks and the third range after that, so fork `main` is
well ahead of upstream `main` and no upstream PR exists yet. Branch from `origin/main`; never commit to `main`
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
  src/gallery.js     the stages page: both stages (undo, the stuck-rock and bump hints, the gauntlet's clock that
                     waits for the first press), their tutorial's events; the walk-cycle viewer and tile/item
                     sheets are the bench's (dev host only)
  src/range.js       glitch range rules: combo state machine, guard-routine interpreter, pulse landing
  src/lock.js        the Caterpillar's Lock: a timing side-channel door (prefix or secret compare order,
                     jitter), stats per guess, and a reference attacker the verifier runs
  src/watchdog.js    the Dormouse's Watchdog: a window watchdog (a nudge must land in [openMs, timeoutMs]
                     of the last), plus replay() the verifier uses for hand / host-jitter budgets
  src/wall.js        Humpty Dumpty's Wall: a stack frame name[size] [canary] lr[2], judge() of a typed
                     name (polite / canary / fall / open), the timed read, a reference attacker
  src/tutor.js       the tutorials: the range's "Down the Rabbit Hole" (17 steps) and the stages' "A Caucus
                     Race" (14 steps), each a list of predicates over the page's events, and the Tutor engine
                     (feed / skip / goto / restart, progress via a store)
  src/coach.js       the tutorial on a page: mountCoach() renders #coach (the step line above the panels) and
                     #learnPanel (current step + why, clickable checklist, skip / start over) and feeds the
                     engine; the page's prepare(step) hook arms its range or stage. tutorStore(key) = localStorage
  src/pad.js         input: DS4 gamepad (standard mapping, 4 ms poll) or keyboard -> timestamped edges
  src/tilt.js        which way up the phone is, from deviceorientation: hysteresis on the phone's own
                     angle, the alice.flip hand switch; sets data-flip to the turn the OS left undone
                     (180, or 90 / 270 when auto-rotate parked the page in landscape; styles.css turns it)
  src/glitch.js      the glitch range page (glitch.html)
  src/glitch.css     what only the range page adds in the phone looks: the timing traces, how the
                     range panels and the on-screen pad reshape
  src/look-boot.js   <head> of every page: applies the chosen look and theme before paint (?look= /
                     ?theme=, then localStorage alice.look / alice.theme, then data-look-touch on a
                     touch screen / data-theme-default), folds the prose
  src/looks.js       the picker (chip + sheet of theme cards and look cards on every page) and the
                     mode bar; styles.css carries the picker's styles and the block every phone look
                     shares
  src/looks/         how a page sits on the screen: index.json (one entry per look: id, label, blurb,
                     shape, phone, padAlwaysOut) + <id>.css per phone look, loaded on demand, rules
                     on html[data-look=<id>]. A look shapes, never paints
  src/themes/        what a page is painted in: index.json (id, label, blurb, five-colour swatch) +
                     <id>.css per theme, rules on html[data-theme=<id>] overriding the variables at
                     the top of styles.css (every colour, radius and font there is one). Add a look
                     or a theme = a file + an entry; replace one = swap its file. verify-looks.mjs
                     checks both manifests, the files and all four pages agree
  src/uf2.js         UF2 parser + folding into 4 KB sectors; mirrors flash-badge.py's checks
  src/picoboot.js    PICOBOOT over WebUSB (the RP2040 ROM bootloader's protocol, as picotool speaks it)
  src/flash.js       the flash page (flash.html): firmware cards from firmware/index.json, progress, log
  src/vault.js       the badge's vault from the browser: feature report 0xF1 over WebHID, the
                     SELECT+Y stick-axis beacon decoder, wire formats mirrored from vault.h
  src/seal.js        sealed stages: AES-256-GCM under HKDF(badge key, stage id); loadStage() picks
                     stages/sealed/<id>.json when stages/sealed.json lists it, else stages/<id>.js
  src/gate.js        the gate dialog (site only): Connect (WebHID) or the beacon; input policy; after the
                     pass, the watch: badge gone -> pad muted, page paused (onPause), dialog back (reconnect)
  src/badge.js       the vault page (badge.html): read, provision at the booth, beacon test
  stages/            one ES module per stage, ASCII map + hazards; rabbit-watch.js, looking-glass.js,
                     caterpillar-lock.js, dormouse-watchdog.js and humpty-wall.js are the range's levels. sealed.json lists sealed ids
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
                     build-firmware.ps1 (Windows cross-build), obfuscate.mjs (the deploy's
                     pass over _site: tokenizer + scope-aware renamer, no deps) +
                     verify-obfuscate.mjs (proves the obfuscated tree behaves) +
                     smoke-obfuscated.mjs (Playwright, dev only)
  references/        source art sheets (15 MB) every asset was cut from
  docs/GAME_DESIGN.md  the five-stage design, tick model, Looking Glass protocol
  docs/BADGE_GATE.md   the badge-is-the-key design: threat model, what tier 1 stops, server tier
  docs/AI_THREATS.md   how a model breaks the site, what degrades one (the papers), the lure,
                       the canaries, and what the deploy's obfuscation does and does not do
  legacy/            old generated-sprite pass, unused by the page, safe to delete
.github/workflows/pages.yml     builds the UF2 (build-uf2.yml), runs `npm run verify`, opens sealed
                                stages with the ALICE_STAGE_KEY secret, stages the site paths +
                                firmware/, obfuscates _site in place (obfuscate.mjs), deploys
.github/workflows/firmware.yml  host test of the glitch engine + cross-build via build-uf2.yml
.github/workflows/build-uf2.yml the one place the ARM toolchain and pico-sdk version live (reusable)
```

## Commands

```
./serve.sh          # http://localhost:8080 - ES modules need http://, not file://
npm run verify      # solves both stages, checks the five ranges' levels (attacks the lock and the wall) and the tutorial's steps, the looks on every page, flashes the fake ROM, drives the fake badge, proves the obfuscated tree behaves; CI gate before every deploy
npm run obfuscate -- _site [--dry-run]   # what the deploy does to the staged site: comments out, locals renamed, strings packed, the lure in
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
  `software/docs/BADGE_GATE.md` before adding "anti-AI" measures. The deploy
  does obfuscate the *published* JavaScript (`software/tools/obfuscate.mjs`,
  in `_site/` only, never the repository) - as a speed bump and a tripwire,
  not a wall; `software/docs/AI_THREATS.md` says what it buys. The repository
  stays readable: never commit obfuscated output, and keep the lure and the
  canaries out of the source. A new JavaScript construct that the renamer
  mishandles shows up in `npm run verify` (`verify-obfuscate.mjs` runs the
  whole suite against the obfuscated copy); pin it there as a regression.
- No npm dependencies. Node ESM + Python 3 stdlib only. `package.json` has no
  `dependencies` block on purpose.
- Assets are generated: re-run the slicer in `software/tools/` and commit the
  PNGs it writes; never hand-edit an output.
- Hardware: commit `.kicad_sch/.kicad_pcb/.kicad_pro` only, regenerate
  `production/` with Fabrication Toolkit as one commit, pass DRC/ERC first.
- The firmware reports Sony's VID/PID (0x054C/0x09CC) so iOS binds it. That is
  deliberate and must not ship on hardware. Do not "fix" it. The string
  descriptors are the badge's own and `src/pad.js` recognises them
  (`isBadgeId`); keep the two in step.
- The phone upside down turns the badge over too. `src/pad.js` turns gamepad
  edges through `FLIP` (UP/DOWN, LEFT/RIGHT, A/Y, B/X) while the screen is in
  a `-secondary` orientation (or `window.orientation` is 180); keyboard and
  on-screen edges are never turned. `?flip=1|0` pins it; `pad.flip` at
  runtime. Nothing in the firmware knows about it, on purpose.
- Commits: one concern each; describe the change, not the file list.

## Status (as of 2026-10-21, evening)

Built and live:

| Piece | State |
|---|---|
| Stage "A Mad Tea Party" | playable, 13x9, 3 rocks / 3 buttons / gate + lever. Solver: 106 moves. Gate proven load-bearing by the verifier. |
| Stage "The Queen's Gauntlet" | playable, 9x8, timed at 320 ms/tick, 3 periodic hazards (Queen with sight 3, Cheshire, Rabbit). Par 64 ticks, 5 waits; empty room 41. |
| Asset pipeline | 5 characters, 44 items, 77 tiles cut from reference sheets, all reproducible from `software/tools/`. |
| Page | the stages. On the site they are all the page is: the badge plays, Undo / Reset / Restart, a one-line status (`0/3 buttons · 0 moves`, `tick 12 · 1/2 buttons`), a controls legend under each title (`✚ move · B undo · START reset`), the prose without its keyboard and Solve sentences, and the Learn panel (below). The bench's chrome - the Walk and Art panels and their mode buttons, the Solve buttons (the real solver in-browser), the playback and tick sliders, the clock switch, `?autosolve=tea|chase` - is class `dev-only` in `index.html` and shows on a dev host only: `src/look-boot.js` sets `data-host` on `<html>` before paint by the same answer as `gateMode` (the four dev hosts, `?gate=1` on one of them is the site) and `styles.css` hides `.dev-only` under `html[data-host=site]`; `gallery.js` keeps every element wired, so nothing is removed from the DOM. `?walk=<id>`. In the phone looks a mode bar (Tea / Gauntlet / ? on the site; Walk and Art too on the bench) shows one panel at a time and arms the stage on screen. `verify-looks.mjs` checks the classes, the rule and that the boot script's hosts match `isDevHost`. |
| Stages tutorial and play aids | "A Caucus Race" (`STAGES_TUTORIAL` in `src/tutor.js`, rendered by `src/coach.js`, the Learn mode + `#coach` strip on `index.html`, progress in localStorage `alice.tutor.stages`): 14 steps, chapter one the tea party (wake, step, shove, lever, button, undo, reset, win), chapter two the gauntlet (first press starts the clock, wait, get caught, restart, a button across the corridor, out), each fed by the stage's events (`tea` / `chase` with a `what`) and arming its stage when it comes up (on a phone, showing it). The coach prepares the next step in a microtask so the press that finishes a step never lands on the stage it arms. Play aids on every host: the tea party keeps a history, **B** / Backspace / the Undo button take a move back (not during playback), the status warns when a rock is off its button with walls on two adjacent sides (lost), a bump says why (that rock will not budge / the gate is shut - find the lever / the door wants all three buttons held / blocked); the gauntlet's clock holds after every restart until the first input, which is taken at once (so every run starts on the beat the solver assumes; the par-64 plan played tick by tick wins), status says so, and "caught" names START (R too on a dev host). Checked by `verify-range.mjs` (the steps, a walk through all 14 on the events gallery.js emits) and `verify-looks.mjs` (the coach and Learn panel on both pages, the styles in `styles.css` only, the legend, Undo); driven end to end in the in-app browser on localhost in classic and bench: every step completed on real play, the tea party won in 106 moves, the gauntlet caught on tick 15 and then out in 64. Headless: `window.__stages` (tutor, board, history, chase state, armStage) beside `window.__pad.inject`. Never seen with a badge. |
| Badge board | v0.4, fab package in `hardware/badge/production/`. |
| Soldering kit | schematic generated from `build_badge_sch.py`, fab package present. |
| Firmware | DualShock 4 HID (Sony's VID/PID; the strings are ours: "BSidesTLV 2026 Alice Controller" by "BSidesTLV", which is how the site knows a badge by `Gamepad.id`), 14 inputs + status LED, builds to a ~50 KB UF2. Quick-glitch layer: SELECT is shift; SL record, SR fire (START trigger + offset + take at speed; hold = repeat), UP/DOWN speed 1/4x-32x, LEFT/RIGHT offset 1 ms (auto-repeat, 10 ms after 20), B reset. SELECT+START held 2 s reboots to the UF2 bootloader. 1 ms reports, latched between reports. Host-tested, not yet tried on a badge. |
| Flashing | `software/tools/flash-badge.py`: waits for `RPI-RP2`, checks the UF2 family, copies, confirms 054c:09cc came back; `--fetch` pulls the newest green Firmware-workflow artifact. No picotool route (no reset interface, on purpose). SWD header `J1` + openocd is the fallback, documented, untried. |
| Glitch range | `glitch.html`: Rabbit's Pocket Watch (4 combo levels, 1.5-18 presses/s), Looking-Glass Glitch (3 fault-injection levels, 120/40/20 ms ticks, last one hidden source) and the Caterpillar's Lock (3 timing side-channel levels: a door that compares a password one symbol per tick and stops at the first mismatch; level 2 adds jitter so a guess is fired repeatedly and the median read, level 3 compares in a secret fixed order). Rising-edge glitch model, crash lines, brown-out, per-attempt measurements; the lock keeps every sample of a guess together (n, median, min-max). Range 4, the Dormouse's Watchdog (`src/watchdog.js`, `stages/dormouse-watchdog.js`): a window watchdog, START arms, every `A` must land in [openMs, timeoutMs] of the previous nudge, too soon stirs / too late bites (a timer, so a hidden tab still bites), `kicks` in a row wins; levels 500-1000 ms x6 (hand), 240-300 x10 and 80-120 x16 (badge: a take at 2x / 8x, the first gap is the offset). Range 5, Humpty Dumpty's Wall (`src/wall.js`, `stages/humpty-wall.js`): a stack frame name[size] [canary] lr[2], START prompts, pool buttons type, the read closes `gapMs` after the last symbol (`firstMs` 1500 for the first) and Humpty judges: polite / canary ("stack smashing detected") / fall (lr shown as a fault report) / open (lr = the address printed in the listing); levels name[4] at 800 ms (hand), name[?]=7 at 120 ms, name[?]=5 + a per-seed canary at 100 ms (badge: the name is a take). Hidden levels hide the size and the overflow count. The tutorial "Down the Rabbit Hole" (`src/tutor.js` for the steps, `src/coach.js` for the Learn panel + `#coach` strip between the mode bar and `main` on `glitch.html`): 17 steps fed by every edge and every range result, each arms its range and picks its level (and switches the phone looks' mode), skip / start over / click a step, progress in localStorage `alice.tutor`; a "fire" step is detected as START from the pad followed by a press within 2 s. The mode bar scrolls on the range page (8 modes). On a dev host the keyboard and an on-screen pad (`#touchPad`, source `ui`) drive it; on the site the pad is a read-only mirror of the badge. Map scales to the phone's width. Driven headless via `window.__pad.inject` and read through `window.__range` (`combo`, `run`, `lock`, `dog`, `wall`, `tutor`, `arm`). All five ranges and the whole tutorial were driven end to end in the in-app browser on localhost (classic, bench, handheld, scope); never with a badge. |
| Looks and themes | Two axes on every page from the header's ◐ chip (a sheet of cards; the ? panels show the same cards) or `?look=` / `?theme=` (remembered in localStorage `alice.look` / `alice.theme`; `data-look-touch` and `data-theme-default` on `<html>` name the defaults). Looks = shape: classic, and three phone looks - bench, handheld, scope - that show one panel at a time behind a mode bar, fold the prose, reshape the range's pad (bottom sheet / moulded body / soft-key dock) and add the range's two timing traces. Themes = paint: bsides (BSidesTLV 2026's lime on black, Space Grotesk stack, square corners; the default), classic (the first blue), teaparty (the one light theme), queen (red and gold), cheshire (magenta and teal), phosphor (the scope's old green, now with scanlines). One DOM, CSS-only differences: `src/look-boot.js` before paint, `src/looks.js` for the picker and the mode bar, the shared phone block in `styles.css`, the range's part in `src/glitch.css`, one file per look in `src/looks/` (rules on `data-look`), one per theme in `src/themes/` (rules on `data-theme`, loaded after the look's so its palette wins). Every colour in `styles.css` is a `:root` variable; the range's canvases read `--accent` / `--text` live. |
| Badge upside down (pad remap) | `src/pad.js`: while `screen.orientation.type` ends in `-secondary` (or `window.orientation` is 180), *or* the page turn below says the phone is upside down, every gamepad edge is turned through `FLIP` - UP<->DOWN, LEFT<->RIGHT, A<->Y, B<->X; SL/SR/START/SELECT stay. Keyboard and on-screen edges are not turned. A turn mid-hold renames the held button on the next poll (press of the new name, release of the old, same stamp). `?flip=1|0` pins the pad alone, `pad.flip = 'auto'|true|false` at runtime. Checked by `verify-badge.mjs`. |
| Page turn | A feature of its own, on every page, with or without a badge: the phone held upside down shows its page the right way up for the player. Phones do not rotate a portrait page to upside down (iPhones never, Samsung and most Android neither): with auto-rotate off the OS leaves the page on its head, with it on the OS turns the page to landscape at the quarter turn and *stays there* at the half turn, so the page is on its side (what the first cut, PRs #10/#11, missed: it took the OS's 90° out and saw only 90° left, under its threshold, so it never turned). `src/tilt.js` reads gravity from `deviceorientation` (beta/gamma -> the device's up vector; *not* `devicemotion`, whose sign iOS inverts), decides upside down on the *phone's own* angle (hysteresis 150°/30°, a flat phone changes nothing, and an OS orientation change re-reads the state at once: still upside down only past 150°, so no half turn flashes while the phone comes round) and sets `data-flip` on `<html>` to the turn the OS left undone - `180` with the OS at 0, `90` / `270` with it parked in landscape (`screen.orientation.angle` 90 / 270, or `window.orientation` -90), nothing when the OS turned the page itself. `styles.css` turns the body by it: fixed, viewport-sized, `rotate(180deg)` in place for the half turn; for a quarter turn a box `100dvh` wide and `100dvw` tall turned about its top-left corner (`rotate(±90deg)` + a translate by its own size), scrolling inside; dialogs in the top layer turn themselves (a quarter-turned dialog is turned about its corner from the viewport's centre, the looks sheet from the edge that is the player's bottom: top for 180, left for 90, right for 270); the safe-area insets follow the notch; the phone breakpoints (`.walk-stage`, `.glass`, `.lock`, `.gate-ways`, the help panels' cards) are forced under a quarter turn since the width queries see a landscape viewport; `html { overflow: hidden }` so the body's overflow is not propagated to the viewport. The module listens from the moment it loads (every page's entry module reaches it through `looks.js` or `pad.js`; no pad, gate or badge needed) and probes the permission without a tap: Chrome 152+ has `requestPermission` too and answers at once ('denied' on a desktop with no sensor, which is not the player's answer and is not kept). iOS asks only from a tap, so the first tap on the page-turn icon, the ◐ chip, a switch, the gate's Connect button or the on-screen pad calls `tilt.request()`. The control (`src/looks.js`) is a small icon beside the ◐ chip in every header (`#turnBtn`, in the page before the chip; the glyph and state are filled in by the module): `data-state` auto / off / on (dim, struck through, filled), `data-turned` lights it while the page is turned, `data-ask` is a dot while iOS still has to be asked (red once refused); its tap requests the sensors first thing and toggles a popover under it (`#turnPop`, absolute in the header, `--caret` under the icon, closed by a tap outside or Esc; `aria-expanded` on the icon, `aria-pressed` on the chips) with one line on the turn and the hand switch auto / no / yes; the ◐ sheet has the same switch as a row ("Page turn"). One state, `localStorage alice.flip`, honoured before paint by `look-boot.js` by the same arithmetic from `screen.orientation.angle`; the pad remap above follows the same decision (`turned`, not the turn). On a touch screen the popover opens once by itself as a tip 800 ms after load (`localStorage alice.flip.tip`; `?tip=1` / `?tip=0` force it; never when the switch was set by hand), not a dialog, dismissed by any tap outside. The gate carries no page-turn button of its own any more. The range header's grid (`src/glitch.css`, handheld, scope) has a column for the icon and the chip's column may shrink (ellipsis). Checked by `verify-badge.mjs` (angle maths, the turn for each OS angle, hysteresis, the OS-change re-read, the switch, listening from load with a fake document, window and screen, the granted / open / refused permission paths), `verify-looks.mjs` (the rules for 180 / 90 / 270 incl. overflow, dialogs, sheet, insets and the forced breakpoints; the boot script; the icon on every page before the chip with its aria attributes, the popover, the states and the tip's gating in `looks.js`, the icon's and the chip's tap ask, the gate's button gone, the range grid's column; gate and pad ask; every page reaches `tilt.js`; looks and themes name no `data-flip`) and in Playwright's Chromium with synthetic `deviceorientation` events and a faked `screen.orientation` on all four pages in all four looks, at 375x812 with the OS at 0 and 180 and at 812x375 with it at 90 and 270 (data-flip 180 / none / 90 / 270; the header, the body box, the sheet and the gate dialog land at the player's edges; the chip, the sheet's chips, the gate's button and the on-screen pad hit where they are drawn; no / yes override, yes survives a reload), and the icon in the in-app browser at 375x812 on all four pages in all four looks (the tip opens and a tap outside closes it, the icon toggles the popover, yes / no / auto from the popover and the sheet agree, a reading lights the icon, the popover sits under the icon on a turned page). Never seen a real phone upside down; the iOS prompt has only been seen in emulation. |
| Badge gate | `src/gate.js` on `index.html` and `glitch.html` (site only): Connect over WebHID (report `0xF1`) or the `SELECT+Y` beacon on the stick axes. Both stages are driven by the badge (d-pad, `Y` waits, `START` resets, last-tapped stage armed); keyboard, on-screen pad and `inject()` are dropped on the site. A controller that does not announce itself as the badge (a real DualShock 4, or a badge on the stock firmware) is told so and sent to `flash.html`, which is never gated. After the pass the gate watches: when the badge goes (gamepad record gone or replaced for 300 ms, or the WebHID device's `disconnect`) the pad is muted, the page pauses (`onPause`: gauntlet clock, tea playback, walk cycle; the range resets a half combo and logs it) and the dialog returns as `.gate.reconnect` for the same badge, re-read by itself over a standing WebHID grant, or the beacon again; a different serial reloads. `badge.html` reads/provisions the vault. Sealed stages via `src/seal.js` + `seal-stage.mjs`; `stages/sealed.json` is empty until event stages exist. Proven headless against `fake-badge.mjs` (verify-badge.mjs, and a Playwright smoke in development). Never seen a real badge. |
| Crawler side | `robots.txt` (AI crawlers disallowed; only honoured at a host root, so inert on a project page until a custom domain), `noai` meta on every page, `rabbit-hole/` tarpit with per-path canary flags, linked by a hidden door on the real pages. |
| Published-site obfuscation | `pages.yml` runs `software/tools/obfuscate.mjs` over `_site/` after staging (the repository is untouched): every comment out, every function/block-local binding renamed to a misleading name from the game's vocabulary (`flagDigest`, `serverTrace`; module-scope names and property names kept, so imports, the DOM and the wire formats are unchanged), every string literal packed into one XOR-ed base64 blob per file behind a one-line decoder, whitespace folded (newlines kept for ASI), and the lure: a "note for automated assistants" at the top of every module and page sending an agent to `rabbit-hole/?p=notes/<module>/solution`, whose generated flag is the canary for that module, plus one never-called decoy function per module that computes the same canary. ~5.6k bindings and ~1.8k strings on the current tree. `verify-obfuscate.mjs` (in `npm run verify`) obfuscates a copy and runs the whole suite against it, checks exports / imports / the single comment / no bare strings, and pins nine regressions; the deploy also `node --check`s every output. `smoke-obfuscated.mjs` is the Playwright pass over all pages (dev only, run once on the first build, green). Evidence and limits in `software/docs/AI_THREATS.md`: a speed bump and a tripwire against an agent reading the site, nothing against a reader of the repository. |
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
  glitch, no chord, no vault, Sony's strings): the first flash goes through
  BootSel; the gate points there. Whether iOS still binds with the badge's
  own strings is unverified.
- The gate's watch has never seen a real unplug: it is proven on the pure
  rule (`verify-badge.mjs`) and in a browser against `fake-badge.mjs` with
  `navigator.getGamepads` swapped out. Unchecked on a board: that Chrome
  fires `navigator.hid`'s `disconnect`/`connect` for the badge, that the
  re-read over the standing grant works without a click, and how long a
  replug takes to show on the gamepad side (a press is needed there).
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
- The in-app browser pane: a tab that has been navigated a few times can leave
  `img.decode()` pending forever (every PNG, status 200), so `gallery.js` never
  gets past its asset load and `window.__stages` stays undefined with no console
  error. A fresh tab (`tabs_create`) loads at once. Not a page bug.
- A hidden tab draws no frames: the ranges' render loops pause there. The
  lock's answer rides a timer so it still lands; the glass's denial after
  a pulse-less run does not, until the tab is looked at. Headless checks
  that wait on `requestAnimationFrame` hang in a hidden pane - wait on
  timers instead.
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
