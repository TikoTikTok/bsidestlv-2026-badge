# Alice in AI Land — game design

A puzzle game where the answer is a *program*.

Five stages. The first two are played by hand. Stage 3 is a wall: the board is
hidden before you could read it and the move budget exceeds human input
bandwidth. From there the only way through is to drive the game with a script.
The game does not hide that — it hands you the protocol in stage 2 and dares
you to use it.

---

## 1. Premise

Alice falls into AI Land. Every character is a machine that wants something
from her, and the only currency is moves:

| character | role in play |
|---|---|
| **Alice** | the player's avatar |
| **White Rabbit** | the clock — he paces a fixed route and gates open/close as he passes |
| **Mad Hatter** | rewrites rules: reading his books changes what a button does |
| **Red Queen** | the deadline — she looks at the board on a schedule and removes what offends her |
| **Cheshire Cat** | hides state; after he fades, the board is only visible through the protocol |

---

## 2. Controls

Eight-way movement, because the sprite sheets are eight-way. On a d-pad,
diagonals are two directions held together.

| input | verb |
|---|---|
| D-pad / arrows | step (and push what is in front) |
| **A** | interact — pick up, place, read, unlock |
| **B** | dash — two tiles, does not push |
| **X** | mark / recall — drop a Cheshire mark, press again to swap places with it |
| **Y** | tick-step — advance the world one tick without moving (a wait primitive) |

`Y` matters more than it looks. Puzzles are timing puzzles; a script needs a
no-op that still advances the world, and a human needs a way to stall.

---

## 3. The tick model

Everything is deterministic and discrete. This is what makes the game
scriptable, replayable and verifiable.

- The sim runs at **60 ticks/second**.
- Each tick consumes exactly **one input bitmask**. No input = empty mask.
- Movement has a **cooldown** in ticks, per stage. A move is accepted only when
  the cooldown has expired, so mashing gains nothing.
- Same seed + same input trace = same outcome, byte for byte.

| stage | move cooldown | effective move rate |
|---|---|---|
| 1 | 8 ticks | 7.5 moves/s |
| 2 | 6 ticks | 10 moves/s |
| 3 | 3 ticks | 20 moves/s |
| 4 | 2 ticks | 30 moves/s |
| 5 | 2 ticks | 30 moves/s |

A human sustains roughly **4–6 accurate directional inputs per second** and
reacts to new information in **~250 ms**. Those two numbers are the design
budget: stages 1–2 sit under them, stages 3–5 sit far above.

---

## 4. The Looking Glass protocol

**The server is the game.** It owns the seed, runs the sim, and is the only
authority on state. The browser is just one client rendering what it is told.
A player's script is a client with exactly the same rights. There is no
privileged path, so there is nothing to cheat around — and nothing to
reverse-engineer either. The challenge is the puzzle, not the plumbing.

```
ws://localhost:7777/looking-glass
```

Server → client, once per tick:

```json
{ "tick": 412, "stage": 3, "seed": "b5f1…", "deadline_ms": 14,
  "board": { "w": 9, "h": 9, "tiles": "…", "entities": [ … ] },
  "alice": { "x": 4, "y": 6, "cooldown": 0, "carrying": null },
  "timer": { "remaining_ticks": 58 }, "status": "running" }
```

Client → server:

```json
{ "tick": 412, "buttons": ["up", "left", "a"] }
```

Rules:

- An input is bound to the tick it names. Late inputs are dropped, not queued —
  otherwise a slow script would drift and blame the game.
- One input per tick, maximum. Spam is not a strategy.
- `deadline_ms` says how long is left in the current tick, so a script can
  decide whether to answer now or skip.

In-fiction, this is the Hatter's book. Stage 2 ends by handing it over.

---

## 5. Where the wall is, and why it is fair

Stage 3 is the point of the game, so it has to be *obviously* impossible rather
than merely annoying. It fails a human on two independent axes at once:

1. **You cannot see it.** The board is revealed for 0.5 s, then Cheshire fades
   it. After that the only way to read the board is the protocol.
2. **You cannot type it.** The optimal solution is ~26 moves and the window is
   72 ticks (1.2 s). That is ~20 moves/second, sustained, with zero mistakes.

And it cannot be beaten by memorising: **the board is reseeded on every
attempt**. A recorded input trace is worth nothing on the next run.

What it demands of a script is modest and honest: read the state, run a
breadth-first search over a few thousand positions, emit moves on the clock.
Any language, any library. Every stage is validated by a **reference solver**
that must finish in **under 60 % of the tick budget** — if the reference cannot
do it comfortably, the stage is retuned, not shipped.

---

## 6. The five stages

### Stage 1 — Down the Rabbit Hole
*No clock. Teaches the verbs.*

- 12×8 room. Push three rocks onto three card plates, take `key_heart`, open
  the heart door.
- The Rabbit paces a corridor and opens a gate as he passes it — the first hint
  that the world moves on its own schedule.
- **Win:** reach the door. **Manual:** trivially.

### Stage 2 — A Mad Tea Party
*90-second clock. Teaches that rules are data.*

- Place four teacups on saucers of matching suits. The teapot pours along a
  channel; pour order matters, so the puzzle has a dependency graph.
- Mushrooms resize Alice: small fits through gaps but cannot push; large pushes
  but blocks doors.
- Four books on pedestals. Reading each with **A** prints a line of the Looking
  Glass spec and rebinds one button. The fourth book is the protocol itself.
- **Win:** four cups placed, then enter the 4-button code the books spell out.
- **Manual:** yes — this is the last stage that is.

### Stage 3 — The Card Soldiers' Drill
*The wall. 1.2 s, board hidden, reseeded every attempt.*

- 9×9, randomised. Four suit cards, four matching plates, walls between.
- Cheshire fades the board after 0.5 s. From then on, state comes only over the
  protocol.
- Optimal ≈ 26 moves, budget 72 ticks at 3-tick cooldown = 36 moves. Room for a
  slightly suboptimal plan, none for a slow one.
- Failure resets instantly with a fresh seed.
- **Manual:** blocked twice over — cannot see it, cannot type it.
- **Script:** read board → BFS over cards×positions → emit.

### Stage 4 — The Queen's Croquet
*Four boards, one Alice. 2 s.*

- Four 7×7 quadrants. **One input drives all four boards at once.** Alice exists
  in each; a move that helps quadrant 1 may ruin quadrant 3.
- **X** cycles an input mask so a quadrant can be frozen out for a few ticks —
  the release valve that makes it solvable, and the thing a naive solver misses.
- Needs search over the *product* state space, not four searches. ~40 moves in
  120 ticks.
- **Manual:** no. **Script:** BFS/IDA* over the joint state, mask included.

### Stage 5 — The Trial
*Adversarial. Replan or lose.*

- The Queen edits the board every 12 ticks, and what she edits is a function of
  **your last four inputs** plus the seed. A precomputed plan is invalid the
  moment it starts executing.
- Five rounds, each with a new target. Between rounds the geometry rotates.
- Finale: the door wants an 8-button sequence derived from the board state by a
  rule printed in the last book — a checksum over card suits and plate
  positions. You must *compute* it from live state, not path to it.
- Budget: ~150 ms of thinking per round, i.e. a replanning loop, not a plan.
- **Win:** the flag, `HMAC(seed ‖ trace_hash ‖ server_secret)`.

---

## 7. Assets → mechanics

Everything below already exists in `assets/`.

| asset | mechanic |
|---|---|
| `rock_*` | pushable blocks; `rock_pile` is immovable wall |
| `mushroom_red_*` / `mushroom_blue_*` | grow / shrink Alice |
| `book_*` | rule rewrites; `book_open` is the protocol spec |
| `teapot_*` | pour source, fills a channel |
| `teacup_*` | must reach the matching suit saucer |
| `potion_*` | timed effects: speed, phase, freeze (stage 4–5 only) |
| `key_*` | opens the lock of its suit |
| `card_*` | pressure plates and the Queen's guards |
| walk cycles | Alice, and the four characters as scheduled hazards |

Tiles (`assets/tiles/`) cover the rest:

| asset | mechanic |
|---|---|
| `floor_*` | ground; `floor_carpet_red` marks the Queen's kill zone in stage 5 |
| `wall_*`, `hedge_*` | impassable; `hedge_rail` blocks Alice but not sight |
| `door_*_closed` / `_open` | suit-locked exits, one sprite per state |
| `button_*_up` / `_down` | pressure plates, one sprite per state |
| `lever_up` / `lever_down` | toggles that stay where you put them |

Still missing: nothing blocking. A one-tile pit or hole would be useful for the
push-into-the-gap puzzles, but a dark floor tile stands in for now.

---

## 8. Anti-cheat and the flag

- The server simulates; the client only renders. `win()` does not exist on the
  client because winning is a server-side judgement.
- Every session gets a fresh seed. Stage 3+ reseeds per attempt.
- The flag is an HMAC over the seed and a hash of the accepted input trace, so a
  flag proves a specific run actually happened.
- The server replays the trace before issuing it. A trace that does not reach
  the goal, or that beats the physical minimum tick count, is rejected.
- **Practice mode** (`?practice=1`) runs at quarter speed with a fixed seed and
  issues no flag — for learning the mechanics without grinding.

---

## 9. Build order

1. **Sim core** — deterministic, headless, no rendering. Tiles, entities, push
   resolution, cooldowns, win conditions. Unit-tested by replaying traces.
2. **Server + protocol** — sessions, seeds, WS, HMAC. The browser talks to it
   like any other client from day one.
3. **Browser client** — render with the existing assets, keyboard + gamepad.
4. **Stages 1–2** — the human-playable half, including the books that teach the
   protocol.
5. **Reference solvers** — one per stage 3–5. These are the acceptance test:
   no stage ships until its solver clears it in under 60 % of budget.
6. **Stages 3–5** — content, then tune the budgets against the solvers.
7. **Practice mode, leaderboard** — rank by total ticks, which rewards better
   solvers rather than faster typing.

## 10. The glitch range (built)

The badge is a controller, and it is also the closest thing to glitching gear a
player will hold at the conference. `glitch.html` is a training ground for
using it that way, built on the tick model above: two rooms with levels that
start inside the human budget and end well outside it.

**The firmware side.** The badge carries a record / replay layer with the
vocabulary of a real glitcher: `SELECT+SL` records a *take* with microsecond
timestamps; `SELECT+SR` *fires* — a `START` tap as the trigger the host can
see, a wait of *offset* (1 ms steps), then the take at *speed* (1/4× to 32×,
which is also the pulse *width*); hold the chord to *repeat*. Reports go out
every 1 ms.

**The host side.** Browsers sample gamepads at ~16 ms, so that is the floor
under everything: a replayed press needs ≥ 34 ms per press to be seen, and a
landing carries ± 8 ms of jitter however good the badge is. Every level is
tuned to that floor, and `tools/verify-range.mjs` refuses one that is not.

| room | level | budget | by hand |
|---|---|---|---|
| The Rabbit's Pocket Watch | 4 presses / 2000 ms | 1.5 /s | yes |
| | 6 / 1000 ms | 5 /s | just |
| | 8 / 500 ms | 14 /s | no — record at 4 /s, replay at 4× |
| | 12 / 600 ms | 18 /s | no |
| The Looking-Glass Glitch | 120 ms / tick, target visible | ±60 ms | always |
| | 40 ms / tick, crash line 2 ticks before | ±20 ms | about half |
| | 20 ms / tick, source hidden | ±10 ms | a quarter — and no idea where |

The glitch model is deliberately the real one: a pulse does its damage at its
*rising edge*, so skipping the check means starting the pulse inside a window
one tick wide; every line the pulse covers is corrupted, some lines crash the
target, and a pulse wider than it survives browns it out. Each miss is a
measurement — which line, how many lines and milliseconds off — and the hidden
level only says whether the guard had decided yet, which is enough to bisect
with the badge's repeat.

The win is the treasure: the routine falls through `door_open(TREASURE)` and
`alice_jump(TREASURE)` and Alice hops the wall, which is the one thing the
boulder-pushing rules never let her do.

## 11. Open questions

- **Gamepad vs script parity** — a gamepad player on stages 1–2 and a script on
  3–5 is the intended arc. Worth checking that stage 2 is still fun on a pad.
  The range's `src/pad.js` is the gamepad layer the stages will need.
- **Replay as a third path** — the badge's quick glitch sits between a hand
  and a script: a recorded take can clear a fixed-seed stage but not a reseeded
  one. Stage 3's reseeding already defeats it; stage 2 should be checked.
- **Latency floor** — the WS round trip has to fit inside a 16 ms tick. If
  players run scripts on the same machine this is fine; over a network it is
  not. Ship it as a local server.
- **Difficulty of stage 4's mask** — the input mask may be one idea too many.
  It exists to make the joint search tractable; if the solver copes without it,
  cut it.
- **How much to spoon-feed** — stage 2 handing over the full protocol may be too
  generous for a CTF audience. The alternative is to document only the endpoint
  and let them read the frames.
