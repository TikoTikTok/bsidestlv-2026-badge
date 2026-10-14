# The badge is the key — gating the game, and keeping crawlers busy

Two asks shaped this: *only the board should be able to play*, and *a model or
a crawler that scrapes the site and tries to solve it should either work for
nothing or be kept out*. This document is the threat model, what was built,
exactly what it does and does not stop, and the next tier when the first one
is not enough.

## 1. What a static site can and cannot promise

The challenge is plain files on GitHub Pages and the repository is public.
That fixes what any client-side gate can be:

- Anything the page *decides* — "no keyboard", "badge first" — is JavaScript
  running in the visitor's browser. A visitor can edit it. A crawler never
  runs it. So a gate of that kind is a **policy**, not a wall: it makes the
  published site play from the badge and nothing else, which is what players
  see, and it costs a cheat thirty seconds.
- The one thing that cannot be edited around is a **secret the site does not
  have**. If a stage is ciphertext and the key lives on the badge, a crawler
  or a model holds the map only if someone with a badge handed it over.
- Nothing short of a **server** can stop a badge holder from scripting the
  game, and the design does not want to: stage 3 onward is *meant* to be
  scripted (`GAME_DESIGN.md` §5). The threat is the non-holder: the internet,
  the model that reads the repo, the contestant without a badge.

So the design is in tiers, each honest about its reach.

## 2. Tier 1 — built: the vault, the gate and sealed stages

### The vault (firmware)

`software/controller/src/vault.{h,c}` keeps a 32-byte **stage key** and a
15-byte label in the last 4 KB sector of the flash. The firmware image is
~50 KB at the start of the flash, so a reflash never touches the sector: a
provisioned badge stays provisioned.

Two ways out, both read by `src/vault.js`:

| channel | where | how |
|---|---|---|
| HID feature report `0xF1` | Chrome / Edge on a computer, via WebHID | The DualShock 4 descriptor already declares `0xF1` as a 63-byte vendor report, so the badge's descriptor is byte-identical to a real controller's and iOS keeps binding it. One `receiveFeatureReport(0xF1)` returns `ALICE`, a version, state bits, the RP2040 serial, the key and the label. A real DualShock 4 answers with zeros, which is how a controller is told from a badge. |
| the beacon | every browser with a Gamepad API — phones, Firefox, Safari | Hold `SELECT + Y` and the badge spells the same payload on the four stick axes (this board has no sticks). Left X is a clock that flips every 50 ms symbol; left Y, right X, right Y carry a nibble each as one of 16 levels spaced 16/255 apart, so whatever float a browser normalises the byte to, the level is unambiguous. 31 symbols, a 250 ms gap, repeat: about 1.8 s per frame, CRC-32 at the end. |

Writes go through `SET 0xF1`. A blank badge takes its first key without
ceremony; a badge that already has one accepts a new key or an erase only
while `SELECT` is **physically held**, so a page cannot wipe a badge that was
merely plugged in. The write is deferred out of the control transfer (a
sector erase is tens of ms with interrupts off) and the page reads back
after it. All of this is pure C with a host test, `test/test_vault.c`, that
also decodes the beacon the way a browser samples a gamepad (60 Hz, any
phase, 30 Hz, 250 Hz) and pins the first symbols so the JavaScript encoder
in `fake-badge.mjs` is proven to agree with the C.

### The gate and the input policy (page)

`src/gate.js` raises a dialog on the published site before anything plays:
*Connect* (WebHID) or *hold SELECT + Y* (the beacon, with a progress bar).
Passing yields the page's `badge` — serial, label, key. `src/pad.js` now
carries a policy: every edge has a source (`pad`, `key`, `ui`) and the Pad is
built with the sources it may pass. On the site that is `{pad}`: the keyboard
is never attached, the on-screen pad is not offered, `inject()` returns
false. Both stages on `index.html` are now driven by the badge (d-pad, `Y`
waits a tick, `START` resets; the stage last tapped is the one armed), which
closes the "wire pad.js into the stages" loose end.

On a dev host (`localhost`) there is no gate and every source works, because
that is where the pages are developed and driven headless; `?gate=1` brings
the dialog up there to try it. On the site the gate is unconditional.

`badge.html` is the booth: read a badge, generate the event key once, write
it to each badge, erase, and a beacon test. It is also a diagnostics page
for the first board: *does the badge answer 0xF1, does the beacon decode on
a phone's browser.*

### Sealed stages

`src/seal.js`: a stage object is encrypted with AES-256-GCM under a key
derived per stage with HKDF-SHA256 from the badge key (`info =
alice-in-ai-land/stage/<id>`, random salt and IV, the id as associated
data). `software/tools/seal-stage.mjs` seals a plain stage module into
`stages/sealed/<id>.json` and maintains `stages/sealed.json`, the list of
ids the page loads sealed; `--open` proves a blob still opens; `--new-key`
makes the event key. The page's `loadStage(id, badge.key)` takes the sealed
copy when the manifest lists it, else the plain module — so sealing a stage
is one command and no page edit.

The deploy (`pages.yml`) opens every sealed blob with the key from the
repository secret `ALICE_STAGE_KEY` before publishing, so a blob sealed under
a stale key never reaches the site. `npm run verify` now includes
`verify-badge.mjs`: the vault's wire formats against the firmware model,
provisioning policy, beacon decoding at four sampling rates, seal/unseal
round trip and refusals, and the input policy.

### What tier 1 stops, and what it does not

| threat | outcome |
|---|---|
| a crawler or a model reads the site | sees the two public rooms (already in git history, nothing to protect), ciphertext for sealed stages, `noai` meta tags, and the rabbit hole |
| a contestant without a badge opens the site | the gate; no keyboard; a sealed stage will not open |
| a contestant with a badge, in a browser | plays, as intended |
| a contestant with a badge, scripting | can: the key is readable by design, and scripting is the game from stage 3 on |
| a badge holder posts the key | every sealed stage is open to whoever has the link. This is the limit of static distribution and the reason for tier 2 |
| a real DualShock 4 | passes as a gamepad, fails the gate (no `ALICE` in 0xF1, no beacon) |
| the key in the badge | readable by anyone holding the badge over USB or SWD — that is the design; it is a *possession* token, not a per-person secret |

Also honest: a visitor running the public repository on their own machine
is on a dev host and gets no gate. They still get no sealed stage.

## 3. Crawlers, models and the rabbit hole

The asked-for "obfuscate from AI" has a short answer: **obfuscation does not
work against a model and encryption does**. Minified or scrambled JavaScript
is read by a model as easily as by a person; the repository is public anyway.
What a model cannot do is decrypt. So the stages worth protecting are
sealed (above), and the plaintext of event stages is kept outside the
repository — only ciphertext is committed.

Around that, three cheap measures, each with its reach stated:

- **`robots.txt`** disallows the known AI crawlers (GPTBot, ClaudeBot, CCBot,
  Google-Extended, Bytespider, PerplexityBot and the rest) entirely and lists
  `/rabbit-hole/` as disallowed for everyone — which the ill-mannered read
  as an invitation. Caveat written in the file itself: robots.txt is only
  honoured at a host's root; on a project page (`<user>.github.io/<repo>/`)
  no crawler reads it. It becomes real with a custom domain. Well-behaved
  crawlers obey it; the one that matters, a contestant's own agent, does not.
- **`<meta name="robots" content="noai, noimageai">`** on every page: a
  signal some training crawlers honour, costs nothing.
- **The rabbit hole** (`rabbit-hole/`): a door that only things following
  every link find — a hidden link on the real pages, the robots line. Every
  path under it is a new chapter of a walkthrough for stages that do not
  exist: a plausible map, a solution, a flag, and five links deeper, all
  generated in the visitor's own JavaScript from the path, with a few
  seconds' fade-in per chapter. A browsing agent can follow it for as long
  as it is willing to. The flags are **canaries**: each is a function of its
  path, so a decoy that turns up at the scoreboard says which page it was
  read from. No real flag has ever been on this site. A crawler that does
  not run JavaScript sees six static doors and the same page behind each —
  which is fine, since without JavaScript it saw nothing of the game either.

Not done, on purpose: decoys in the real pages' source. CTF players read
source as a matter of course and a fake flag in a comment costs humans the
same time it costs a model.

## 4. Tier 2 — the server, for when a leaked key must not matter

`GAME_DESIGN.md` §4 and §8 already describe it: the Looking Glass server
owns the seed, runs the simulation, and issues the flag as an HMAC over the
seed and the accepted input trace. The badge work above slots in without
changing the protocol:

- **Per-badge identity.** The vault already reports the RP2040's unique
  serial. Tier 2 provisions each badge with its own key (`HMAC(K_event,
  serial)`), so the booth needs no database and the server derives the same
  key from the serial. A session begins with a challenge the badge answers
  — the beacon and `0xF1` are both reusable as the channel; a challenge needs
  host → badge, which WebHID gives directly and a phone gets by the page
  showing a short code the player enters on the d-pad.
- **Revocation and rate.** A badge whose key is posted is revoked by serial;
  a badge that plays from forty IPs is rate-limited. Static files cannot do
  either, which is the whole point of the tier.
- **The map never leaves the server** on stage 3 and up (the board is hidden
  by design), so there is nothing to seal and nothing to leak.
- **The flag is issued, not computed**, so the page can be read end to end
  and still prove nothing.

Cost: a small service (Node, WebSocket, no dependencies is still possible)
and a place to run it for the event. That is the only way "only the board"
becomes a guarantee rather than a policy, and the only way a leaked key
does not open the game for everyone until the event is over.

## 5. Tier 3 — if cloning a badge must be hard

The RP2040 has no secure boot and its flash is readable over the BootSel
USB route, so a key on it is a possession token: anyone holding a badge can
copy it to a Pico and have a second badge. Making that hard means a part
that holds a key and will only *use* it: an ATECC608 (I²C, ~$1) on a v0.5
board, keys generated in the part, ECDSA challenge-response over `0xF1`. It
is a hardware revision, so it is listed here and not planned; tier 2's
revocation makes a cloned badge a nuisance rather than a break.

## 6. Running the event with tier 1

1. `node software/tools/seal-stage.mjs --new-key` once. Keep it with the
   organisers' secrets; set it as the repository secret `ALICE_STAGE_KEY`.
2. Event stages are written as plain modules **outside the repository**;
   `ALICE_STAGE_KEY=… npm run seal path/to/stage.js` commits only the
   ciphertext and the manifest. `npm run verify` and the deploy check them.
3. Flash badges (`flash.html` or `flash-badge.py`), then on `badge.html`
   paste the key and a label, *Write* — a blank badge needs no chord. Try the
   beacon on a phone once per batch.
4. Players: plug in, press a button, *Connect* or hold `SELECT + Y`. On the
   site nothing else plays.

## 7. Open points to check on a real board

- `0xF1` over WebHID on Windows: the DS4 descriptor's `0xF1` is a 63-byte
  feature report; Chrome pads to the report's size. Linux needs a udev rule
  for `054c:09cc` (Steam's is enough). macOS asks nothing.
- The beacon on iOS Safari: the DS4 standard mapping there exposes
  `axes[0..3]`; the decoder tolerates ±5/255 per level and any sampling
  rate from 30 Hz up. Untested on a phone until a badge is flashed.
- The sector write with interrupts off: ~45 ms typical, during which the
  1 ms report stalls. Hosts tolerate it; the page waits 600 ms before the
  read-back. If a host drops the device, lengthen the settle or move the
  write to a moment the host is idle.
- `PICO_FLASH_SIZE_BYTES` is the build board's (2 MB, `pico`). The badge's
  W25Q128 is 16 MB; the sector at 2 MB − 4 KB exists on both, so one image
  serves both. A build for a board header with a *smaller* flash would need
  the offset revisited.
