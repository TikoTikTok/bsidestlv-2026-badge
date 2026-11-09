---
mode: autonomous
message: "One badge is the controller, the key and the glitch tool - and anyone can build the next room"
audience: BSidesTLV 2026 attendees and the repository's visitors
aspect: 1920x1080
fps: 30
duration: 84
---

The promo is a monolithic composition (`index.html`): every scene a timed
`<section class="clip">` of captions over footage placed in a non-timed
`.cam` wrapper the camera transforms (`viewport-change`: one wrapper,
`translate(x, y) scale(S)` about `0 0`, the counter-translate `T = centre -
S * point`). Footage is the real pages, recorded by `record.mjs`; the
clicks the camera pushes toward come from the `.json` sidecars. One accent
(the conference's lime `#a3e635` on `#0b0e14`), Space Grotesk for the
words, JetBrains Mono for the metadata. No voice, no music.

## Frame 1 - Title (0-4.5s)

status: outline · src: index.html#s-title
rules: chromatic-glitch (the title's entrance stretch), spring-pop-entrance (the badge photo), ambient-glow-bloom
beat: Black with the site's olive wash. "BSIDESTLV 2026" small, "ALICE IN AI LAND" tears in with an RGB split and snaps sharp; the badge's art face rises at the right and breathes. Tagline: "a badge · a controller · a key · a glitching tool".

## Frame 2 - The badge (4.5-10s)

status: outline · src: index.html#s-badge
rules: multi-phase-camera (a slow push into the photo), waterfall-entry (the three facts)
beat: The front photo crossfades to the back (RP2040, flash, the button pads) while the camera pushes in. Three facts arrive one under the other: "RP2040 · 14 buttons · USB-C", "enumerates as a wired DualShock 4", "so an iPhone binds it".

## Frame 3 - The gate (10-16s)

status: outline · src: index.html#s-gate · footage/gate.mp4 0.5-6.5
rules: viewport-change (push 1.7x toward Connect at the hover, drift to the badge art), cursor-click-ripple (in the footage)
beat: The gate dialog. The camera follows the cursor to "Connect the badge", then to the drawn badge with SELECT + Y lit. Lower third: THE BADGE IS THE KEY - nothing on the site plays from a keyboard: Connect over WebHID, or SELECT + Y spells the vault on the stick axes.

## Frame 4 - The stages (16-31s)

status: outline · src: index.html#s-stages · footage/stages.mp4 three cuts
rules: viewport-change (toward the hovered cards, into the room while it is played, wide for the toast), nudge-curve (the caption swap)
beat: The explorer scrolls to Levels; cards for the stages and the community's rooms; a click opens The First Lesson. The room is played press by press to the door, the lesson line follows, a prize toasts. Then A Mad Tea Party and Solve: Alice walks the solver's 106 moves. Lower thirds: THE STAGES - one player for every level, the community's rooms, a room from a link · pars worked out on the device, 13 prizes · Solve runs the real solver in the browser (a checkout only).

## Frame 5 - The glitch range (31-46s)

status: outline · src: index.html#s-range · footage/range.mp4 five cuts
rules: viewport-change (each range's scene and trace), kinetic-beat-slam (the five names)
beat: Five cuts of three seconds: the Rabbit's tune pressed inside the window; START and a pulse on X that skips the check, the door opens; the Caterpillar's clock after each guess; six nudges inside the Dormouse's window; a name typed into Humpty's buffer until the wall opens. A numbered name slams in per cut. Kicker: THE GLITCH RANGE - fault injection and side channels for the badge's quick-glitch layer.

## Frame 6 - The badge in the phone (46-57s)

status: outline · src: index.html#s-phone · footage/phone.mp4 1.0-11.5 · assets/badge.svg
rules: control-target-sync (a press lights the key and moves Alice in the same beat), press-release-spring (the key cap), viewport-change (into the room)
beat: Split frame. Top: the phone (the handheld look) in a frame, the camera settling on the room while it is played; the current button as a glyph beside it. Bottom: the badge drawn from the board, the pressed key lit lime at each press from the sidecar. Lower third: PLUG THE BADGE INTO THE PHONE - the page reads it as a DualShock 4; the d-pad moves Alice, Y waits, B takes a move back.

## Frame 7 - The level maker (57-72s)

status: outline · src: index.html#s-maker · footage/maker.mp4 five cuts
rules: viewport-change (the picker, the brush and the cells, the verdict, the simulated badge, the dialogs)
beat: Open: "A new room". A wall, a rock and its button painted by hand. Check: the verdict. Run & debug: the room on the simulated badge, the solution played. "Open a pull request with your AI": the brief. The White Rabbit's welcome banner: three ways. Lower thirds: THE LEVEL MAKER - paint a room with the game's own tiles · Check runs the real solver · Run & debug on a simulated badge · your AI opens the pull request, or follows the White Rabbit with you.

## Frame 8 - Flash, looks and themes (72-79s)

status: outline · src: index.html#s-flash · footage/flash.mp4 1.5-5.5, footage/theme-*.png, footage/look-*.png, footage/flip.png
rules: viewport-change (into the plug animation), theme-crossfade-morph (the six themes under one anchor), grid-card-assemble (the looks)
beat: The flash page's badge: BootSel lit while the plug slides into the stalk, then SELECT + START held. Then the same room painted six ways in quick crossfades, and the three phone looks plus the page turned upside down fan in. Lower thirds: FLASH FROM THE BROWSER - WebUSB to the bootloader, nothing to install · six themes, four looks, the page turns with the phone.

## Frame 9 - Close (79-84s)

status: outline · src: index.html#s-close
rules: logo-assemble-lockup, ambient-glow-bloom
beat: The badge photo settles at the left; "ALICE IN AI LAND", the site's address, the repository, "MIT · CERN-OHL-S-2.0". Hold.
