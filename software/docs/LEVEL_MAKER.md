# The level maker

How a room for *Alice in AI Land* is made, checked and sent in. This is the
document the landing page (`maker.html` on the published site) points an
assistant or a person at; everything it needs is here.

## In one minute

```
gh repo fork bsidestlv/bsidestlv-2026-badge --clone   # your own fork first: a merged room is live on ITS page
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

The first visit is guided, and there is a choice of guides: the Learn panel
offers the **guided builds** (`MAKER_TUTORIALS` in `src/tutor.js`, drawn by
`src/coach.js` as the coach line and the panel's checklist) as cards; pick
one and its steps watch what you do and tick themselves off. The panel sits
where the room is, whatever the window: in the classic look it is **beside
the board** - a column at the right of a wide window, sticky under the
header and scrolling on its own, the current step first; on a narrow window
(a small browser, the in-app browser pane of an assistant) a **drawer** over
the right edge that the coach line's *learn* and the panel's × open and
close, the coach line itself sticking under the header so the step is always
in view - and *unpin* in the panel's heading puts it back in the page, last
(`alice.learn`, `html[data-learn]`; the rules are `styles.css`'s and the
wiring `src/coach.js`'s, the same on the stages and the range pages). In the phone
looks the maker has a **mode bar** like the other pages - Learn, Studio,
Play, Send, Chat and ? (the landing) - one panel on screen at a time, the
tutorial following a step to its panel, Run & debug and *Back to the editor*
switching modes rather than scrolling; the page reopens on the mode it was
left in (`alice.maker.mode`). On the published site the mode bar is not
there (it is the studio's, `dev-only`): the landing is one page. **Follow the White Rabbit** (12 steps) is the
first room from nothing - a blank, a name, a wall, a rock and its button,
the lint green, Check, Run & debug, a step, the door, a blurb, sent in - and
the build an assistant on the bridge coaches (*Building with an AI, step by
step*, below). **Painting the Roses** (16 steps) is the tour of
the studio - chapter one draws (a brush, a wall, a rock, its button, the
lint green, a bigger tool, an overlay, Surprise me), chapter two proves and
plays (Check, Run & debug, a step, the solution), chapter three ships (the
shelf, a lesson, the export, an assistant). The others each lead to one
finished room: **A Room with a Gate** (13 steps: from a blank room, Alice, a
wall across with the line tool, a gate in it, the lever on her side, a rock
and its button and the door behind, Check saying the gate is load-bearing,
played to the door, sent in), **The Clock and the Cast** (11: the corridor
turned timed, the tick, a hazard and a two-point route, Check, Run & debug,
a wait, getting caught, START, out, sent in) and **A Room that Teaches** (9:
a name, a blurb, a lesson of at least three steps, Check, the door, the
shelf, sent in). Skip any step; start over from the panel; progress is kept
per build (`localStorage alice.tutor.maker` for the tour,
`alice.tutor.maker.<id>` for the rest), the choice under
`alice.maker.tutorial`, and `?tutorial=gate` (or `roses`, `clock`, `teach`)
in the address opens on that one. An assistant can read and steer the
build over the bridge (the `tutorial` op, `maker_tutorial`). `?` lists
every key.

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
  and opens the **Share** dialog, which makes a link that carries the
  whole room (`?level=`; the next section): what goes in, how the link
  reads, where it opens, the room's JSON to edit, the length and a warning
  when a chat would cut it. *Import* reads a pasted module back.
- **The assistant** is the chat the bridge carries (next section): what you
  type goes to whoever is connected, what they say comes back here, and
  everything they do to the room is listed as it happens. The header's chip
  says who is on the bridge.

The room is kept in the browser (`localStorage` `alice.maker.level`, the
shelf under `alice.maker.shelf`, the overlays and zoom under
`alice.maker.prefs`), so a reload keeps it. Headless, the page is driven
through `window.__maker` (`level`, `setLevel`, `lint`, `check`, `play`,
`solution`, `game`, `module`, `share({ format, play, where, parts })` (the
link), `tool` / `setTool`, `brush` / `setBrush`, `symmetry` / `setSymmetry`,
`overlays` / `setOverlay`, `undo` / `redo`, `surprise`, `shelf` /
`shelfSave`, `loadById`, `ops`, `bridge`, `tutor` / `tutorials` /
`pickTutorial` / `tutorial`, `chat`) and
`window.__pad.inject`.

## A room in a link

There is no server, so the only way to hand a room to someone is to put
the whole room in the address: `?level=<token>` is that link, and nothing
is uploaded. The **Share** dialog (*Share a link* under *Send it in*, or
`window.__maker.share`, or the bridge's `share` op) writes one and lets you
choose, the first two choices being the ones that matter:

- **Where it opens.** *Play it* (the default) is the page that plays the
  level: `index.html?level=` for a room, where it appears as a card of its
  own under *Shared with you* in **Levels**, opened and played with the badge
  like any level, blurb and lesson with it, its par worked out like the
  others' (`?level=` wins over `?room=`; a malformed link is reported in the
  status and the page goes on); `glitch.html?level=` for a glitch level, the last tab of
  its range, *· yours*. *Edit it* is `maker.html?level=`: on a checkout the
  studio loads it (with `&play=1`, *straight into Run & debug*, it starts
  playing it at once); on the published site it is the landing, which paints
  the room in its hero (Alice walks its solution when the solver finds one
  within 50,000 states, else the room is painted still) with a **Play it**
  button under it. `sharePage(level, where)` in `src/level.js` is the rule:
  `play` resolves to `stages` or `range` by the level, `studio` is the
  maker, and a room sent to the range or a glitch level to the stages is
  refused with the page that does play it. Either play page, handed the
  other's token, says so in its status with a link to the right one.
  The stages page makes the same two links itself: **Share** on any level
  it plays (a shipped stage too, never a sealed one) offers *Play it*
  (`index.html?level=`) and *Carry it on in the level maker*
  (`maker.html?level=`), so a room can go round - played, edited, played
  again - without a server.
- **At which address.** *This checkout* (the default) is the page's own
  address - `localhost`, so only whoever runs the checkout can open the
  link; the status line says so. *The published site* is
  `https://<owner>.github.io/<repo>/`: the fork's page when the maker is
  served from one, else the official site, or whatever you type in the box
  (remembered, like the choice). Anyone opens that one, and the badge plays
  the room there. The guide's link steps ask for it when the bridge knows
  the fork's page (`repoFacts`).
- **How the link reads.** *Compact* is base64url of the room's JSON: short,
  safe in any chat, and the spelling every link made so far is, so old
  links keep working. *Readable JSON* is the JSON itself, percent-encoded
  by the URL: longer, but a person or an assistant can read it in the
  address bar and write one by hand. `decodeShare` (`src/level.js`) takes
  either, or a whole link pasted in (`https://…?level=…`, `?level=…`,
  `level=…`), and refuses what is not a room with a message that says why.
- **What goes in.** The map, the clock and the cast always travel; the
  **lesson**, the **blurb** and the **dressing** can be left out (`parts` in
  `shareUrl`). The JSON box shows exactly what the link carries; edit it and
  the link follows the edit until one of the parts is toggled again.
- **How long it is.** `shareUrl(base, level, { format, play, parts })`
  builds the link, `shareInfo(url)` says how long it is. A room is a few hundred characters; a lesson of
  twelve long steps gets a link past 2,000, where some chats and QR codes
  cut it (the dialog warns), and past 8,000 it may not paste at all. The
  compact spelling, or fewer parts, makes it shorter.

A link can carry a glitch level too (see *Glitch levels*): *play it* is
`glitch.html?level=`, a tab of its range; the lesson, blurb and dressing
boxes are greyed, a glitch level having none. The stages page refuses its
token with a line that links to the range page, the landing's button points
there, and **Levels** lists only the index's rooms - an entry whose `kind` is
a range is the range page's; `index.html?room=` naming one says so, with the
link, and naming no level at all says that too.

To carry on a level that already exists, the studio's **Open…** (beside
New) opens the picker: a new room or a new level of any range, a copy of a
shipped stage, one of the community's levels, one from the shelf, or a
share link pasted in. The welcome banner offers the same under its three
ways (*Open an existing level…*), `?open=1` opens it, and so does the first
visit of a device, when nothing is kept yet.

Over the bridge, `{"op":"share","args":{"where":"play","at":"site","format":"json","parts":{"lesson":false}}}`
answers `{ url, token, chars, format, where, at, page, warnings }` with
`where` resolved (`stages` here); `where` defaults to `play`, `at` to
`here`, and `site` names a published site of your own. The MCP tool is
`maker_share`, with the same arguments.

## Building with an AI, step by step

The published landing's *Try it now with your favourite AI* hands an
assistant the invitation (`aiPrompt` in `src/invite.js`). It says, in this
order: **fork first** (`gh repo fork <owner>/<repo> --clone`, then switch the
fork's site on - `gh workflow enable pages.yml`, `gh api -X POST
repos/<login>/<repo>/pages -f build_type=workflow` - so the room the two of
you build lands on the person's own GitHub Pages site); read `AGENTS.md`,
the short map; `npm run maker -- --no-open` and then **the page in the
assistant's own browser first** - the pane the person sees beside its chat
(Claude Code's built-in browser, Cursor's and VS Code's Simple Browser, any
browser tool) - and in the person's default browser only when the assistant
has none (`npm run maker` without `--no-open`, or `maker_open {"browser":
true}` over MCP; `maker_open` by itself starts the server and names the
page, it opens no browser); connect to the bridge and say hello; then follow
the **White Rabbit's guide**. The point of the pane: the whole walk then
happens on a page the person is looking at, and the assistant adds a line.

The guide is `src/guide.js`: how an assistant builds a first room *with* a
person, written down as data so that any assistant, however small, can
follow it line by line. The moment one says hello on the bridge, the page
pops the **welcome banner** (`#guideDialog`, the cards are `GUIDE_MODES`)
and the person picks one of three ways:

- 🐇 **Follow the White Rabbit** - step by step. The person holds the brush,
  the assistant coaches. It rides on the page's own guided build *Follow the
  White Rabbit* (`rabbit` in `MAKER_TUTORIALS`, 12 steps: a blank, a name, a
  wall, a rock, its button, the lint green, Check, Run & debug, a step, the
  door, a blurb, sent in), so the coach line and the checklist on the page
  show the same steps the assistant narrates; the assistant reads the
  page's progress from the bridge, and every step has a *help* plan for
  "do it for me" (the wall, the rock and the button are worked out from the
  room on the board). Two closing steps of the bridge's own follow: the
  person's page, and the finish.
- 🧪 **Drink Me** - the fast lane. Four questions (a name, a size, a flavour -
  a quiet garden, a locked gate, a chase, or the dice - a dressing), then the
  assistant generates, names, Checks and pictures the room, says what came
  out, and asks: keep it, roll again, harder, easier. Then the solution
  played, a line for the card, the link, and where the room should live.
- 🍰 **Eat Me** - the one-bite starter: a name, one of three starters, a
  dressing, the solution played, the link, the page.

Each step tells the assistant what to **SAY** (in its chat and on the page's,
`maker_say`), what to **ASK** (one question, two to four options, worded for
the platform: Claude Code's AskUserQuestion with *Other* for the person's
own words, a numbered list everywhere else; the person may always answer in
their own words), what to **DO** on the board (the bridge's ops with
concrete arguments), what **HELP** is, and when it is **DONE**. The
assistant passes every answer back and the guide decides: the next step,
the same step with the knobs turned, help, or the why. The answers are
matched by number, label, value or a word of the label; "why", "help",
"skip" and "done"-shaped answers mean what they say whatever the step's
options; a size may be "11x8". The last steps put the room on the person's
page: the pull request brief (`maker_pr_brief`), a branch `community/<id>`,
one commit, a pull request on **their fork** (`gh pr create --repo
<login>/<repo>`), merged when they say so; the Pages workflow deploys in
about two minutes and the room is live at
`https://<login>.github.io/<repo>/index.html?room=<id>`; a second pull
request offers it to the game's own repository. The bridge reads the fork,
the upstream and the login from the checkout's remotes (`repoFacts`), so
the commands come pre-filled.

The doors, for the assistant:

```
GET  /__maker/guide                   where things stand + the current step as plain instructions
GET  /__maker/guide?wait=120000       waits for the pick on the banner, then the first step
POST /__maker/guide {"mode": "fast"}  pick a way for the person (the page follows)
POST /__maker/guide {"answer": "Harder", "at": 4}      their answer (at: the step it answers)
POST /__maker/guide {"answer": "...", "run": true}      ...and have the bridge run the step's ops
POST /__maker/guide {"run": true}                        run the current step's plan (generate, patch, check...)
POST /__maker/guide {"help": true, "run": true}          "do it for me": the help plan, run
POST /__maker/guide {"next": true} | {"back": true} | {"restart": true} | {"step": 6} | {"vars": {...}} | {"show": true}
GET  /__maker/guide?mode=basic&step=1&platform=codex    a preview of any step, nothing changes
GET  /__maker/platforms               what each assistant platform has
```

**Both sides stay in step, and the page carries the whole step.** Every
step of the guide is shown on the page too (op `ask`): a card in the
assistant panel's chat with the step's line, its *why*, the board in a line
(the room's name and size, the lint, the last Check), what the assistant
does on the step (the plan's ops; on the publish step the repository work,
folded under *what the assistant does now*), the question and its options as
buttons, and **Do it for me** when the step has a help plan and no option is
that already. So a person watching the page in the assistant's own browser
pane follows the walk there with all the explanation, and the assistant's
chat is a line a step. The person may press a button there instead of
answering the assistant, and the bridge applies it at once (`POST
/__maker/guide { answer, at, from: 'page' }`, with the next step's work done
before its question when it comes first, as Drink Me's painting does; `{
help: true, run: true, at, from: 'page' }` for Do it for me), tells the
assistant in the inbox (kind `answer`), and the next card replaces this
one; an answer that keeps the step (a why, a "not yet", the help) leaves the
card's buttons live, and the card says *working…* while the bridge works. A
page that (re)attaches while a way is picked takes it up from the bridge's
hello (the Rabbit's build under the coach, the banner kept shut, "carrying
on with…" in the chat) and gets the current card again, so a reload
mid-walk neither asks again nor loses the walk. An
assistant whose own question comes back late is told `moved` with what was
chosen, and an assistant that picks a way after the person pressed a card on
the banner is told `already picked on the page`; its instructions say to go
on from there and never ask twice. On the Rabbit, a step the person finishes
by hand brings the next card up as well.

Over MCP it is one tool, `maker_guide`, with the same knobs; the server's
instructions send a new assistant straight to it. The inbox
(`maker_read_chat`, `GET /__maker/inbox`) carries, between the person's
lines, the pick (kind `guide`) and every step of the Rabbit's build the
person finishes (kind `tutorial`: `✓ A rock (4 of 12)`), so an assistant
long-polling it is woken by the page. The person can close the banner and
bring it back by typing `guide` in the page's chat, with `?guide=1`, or
through the assistant (`maker_guide {"show": true}`).

What each assistant has (`PLATFORMS` in `src/guide.js`; the files are in
the repository, never published). The page opens in the assistant's own
browser first, in the person's default browser only when it has none:

| Assistant | Onto the bridge | Asking with options | Its own browser |
|---|---|---|---|
| Claude Code | `.mcp.json` at the root; the `maker_*` tools are there when the clone is opened | AskUserQuestion, 2-4 options, *Other* for their own words | the built-in browser pane (`preview_start { url }` / `navigate`); Claude in Chrome when asked for Chrome |
| Codex (OpenAI) | `.codex/config.toml` (`[mcp_servers.alice-maker]`), or `codex mcp add` | a numbered list, one question a message | its own browser when the app offers one, else the person's |
| Cursor | `.cursor/mcp.json` (enable once when asked) | a numbered list | the built-in browser tab, else the Simple Browser |
| GitHub Copilot (VS Code agent mode, Copilot CLI) | `.vscode/mcp.json`; the CLI's `/mcp add` | its question tool when offered, else a numbered list | VS Code's Simple Browser; the CLI has none |
| Gemini CLI, Jules, Antigravity (Google) | `.gemini/settings.json` | a numbered list | Antigravity's own browser; the others have none |
| Hermes Agent | `mcp_servers` in its `config.yaml`, or curl | a numbered list; the chat can live on the page | its browser tool when configured |
| Grok (xAI) | the HTTP bridge from a shell tool; else the person relays | a numbered list | none: the person opens the page |
| ChatGPT and other web chats without a shell | cannot reach the bridge: the person relays, or uses Codex | a numbered list | none: the person opens the page |
| Anything with a shell | curl: `/hello`, `/guide`, `/rpc`, `/inbox` | a numbered list | its browser tool, else the person's |

`verify-maker.mjs` checks the guide: every step of the three ways is well
formed and names ops the page has, every placeholder resolves, the plans
paint sensible cells on a room, the answers do what they say, the bridge
serves it (the pick, the wait, the answers, the Rabbit following the
page's build, the preview, Do it for me from the page), the MCP tool (and
that `maker_open` / `maker_status` name the page and open no browser), the
banner's markup and wiring, the card, the invitation, the five
configuration files and `AGENTS.md`.

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
  when nothing is listening and names the page for the assistant to open in
  its own browser pane; `{ browser: true }` opens it in the person's default
  browser instead, for an assistant with no pane; a maker already serving the
  port is taken up, never doubled), `maker_get`, `maker_set_level`,
  `maker_paint`, `maker_check`, `maker_play`, `maker_moves`, `maker_press`,
  `maker_reset`, `maker_stop`, `maker_say`, `maker_read_chat`,
  `maker_snapshot` (a picture of the board or the run, as an image),
  `maker_load`, `maker_generate`, `maker_module`, `maker_pr_brief` (the
  brief that ships the room as a pull request, see *Sending a room in*),
  `maker_tool`, `maker_share` (a link that carries the room),
  `maker_tutorial` (which guided build the person is on and its step; pick
  one, skip a step, start over), `maker_patch` (set some fields of the room:
  name, dressing, blurb, lesson, the clock), `maker_guide` (the White
  Rabbit's guide, above). No dependencies: JSON-RPC over stdio. The server
  looks for the bridge at `MAKER_URL` (default `http://localhost:8080`);
  when something else holds that port (a proxy such as Burp, another site)
  it says so rather than taking the answer for the bridge, and `maker_open`
  starts the maker on the next port (the default + 10, or the `port` given)
  and talks to it from then on.
- **HTTP.** Anything that can `curl`:

  ```
  curl -X POST localhost:8080/__maker/hello -d '{"name":"my assistant"}'          # the page shows who is here
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"get"}'                        # the room, the lint, the last check, the game
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"set","args":{"level":{...}}}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"check"}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"play"}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"moves","args":{"moves":["E","E","S"]}}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"say","args":{"text":"try the gate on the left"}}'
  curl -X POST localhost:8080/__maker/rpc -d '{"op":"patch","args":{"name":"The Pantry","theme":"court"}}'
  curl "localhost:8080/__maker/inbox?since=0&wait=20000"                           # what you typed in the chat, long-polled
  curl localhost:8080/__maker/level                                                # the room as the page last reported it
  curl "localhost:8080/__maker/guide?wait=120000"                                  # the White Rabbit's guide: wait for the pick, then the first step
  curl -X POST localhost:8080/__maker/guide -d '{"answer":"Harder","run":true}'    # their answer, and the step's work done by the bridge
  ```

  The ops are `get`, `set`, `patch` (`{ name?, theme?, blurb?, lesson?,
  tickMs?, hazards?, short? }`: set those fields, keep the rest; the
  studio's tutorial hears them as if typed), `paint`, `check`, `play`,
  `stop`, `reset`, `press`, `moves`, `say`, `snapshot`, `module`, `pr`
  (`{ author? }` -> `{ id, file, source, indexLine, branch, brief }`, the
  pull request's brief), `load`, `generate`, `tool`, `share`, `tutorial`,
  `guide` (`{ show?, mode?, close? }`: the welcome banner, or a pick made
  for the person), `ask` (the guide's question as a card of buttons; the
  bridge sends it, nobody else needs to) - the same table (`ops` in
  `src/maker.js`) the MCP tools call. `get` reports the guided
  build the person is on as `tutorial: { id, title, step, at, of }`;
  `tutorial` with `{ id?, skip?, restart? }` picks one, skips that many
  steps or starts it over, and answers the same summary, so an assistant
  can walk a person through a build or follow one itself. An
  rpc waits for the page's answer (30 s by default, `timeoutMs`); with no
  page open it is 503, an error the page raised is 422, an op the page
  does not know is 400.

The mirror the page posts after every change carries the room, its lint,
the last Check, the game and the guided build the person is on
(`tutorial`), which is how the bridge's Rabbit follows the page.

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
   `{ "id": "<id>", "name": "<name>", "author": "<you>", "kind": "tea" | "chase" }`
   (a glitch level, below: `"kind"` is its range, `"watch" | "glass" | "lock" | "dog" | "wall"`).
3. `npm run stage -- stages/community/<id>.js` prints the verdict CI will
   reach. `npm run verify` runs everything the deploy runs, including
   `verify-maker.mjs`, which checks every listed room and that nothing in
   the folder is unlisted.
4. Open a pull request. Say in a sentence what the room is about and
   roughly how hard; the checks prove it solves, a maintainer plays it.

Or hand all four steps to an assistant: **Open a pull request with your
AI**, the fourth button of the export panel beside Copy, Download and the
link, opens the prompt dialog in its PR mode with the brief for this room
(`prPrompt` in `src/invite.js`): the module verbatim, the index line, the
branch `community/<id>` from `main`, `npm run stage` then `npm run verify`,
one commit *Community room: <name>*, a push to the repository or to a fork,
`gh pr create` against `<owner>/<repo>` or the compare URL, the body (the
room in a sentence, the par and the difficulty word when the room has been
Checked, the lesson's step count if it has one, "the checks prove it
solves") and the rules below. Copy puts it on the clipboard; *Open in
Claude* / *Open in ChatGPT* carry it in the address, or, when the brief is
too long for one, a short note saying it is on the clipboard (the status
says to press Copy first). An assistant already on the bridge gets the
same brief in its inbox (`maker_read_chat`) the moment the button is
pressed, and can ask for it any time with `maker_pr_brief` (op `pr`). The
button waits until the room is well formed.

On a fork - the invitation says to fork first - the same pull request
against the fork's own `main`, merged by its owner, puts the room on the
fork's site at the next deploy: `https://<login>.github.io/<repo>/index.html?room=<id>`
(Pages on "GitHub Actions", the workflow enabled once). That is the page
the White Rabbit's guide ends on; the pull request against the game's own
repository offers the room to the site.

What gets a room merged: it solves, the gate (if any) is load-bearing, the
par is honest (a 400-move untimed room is a chore, a timed room with a par
over about 120 ticks is unplayable by hand), and the name is its own.
Rooms are MIT like everything else under the site.

## How the community's rooms reach the site

`stages/community/` is published with the rest of the site, and
`verify-maker.mjs` gates the deploy on every listed room, so a merged room
is live at the next deploy, in two places: the maker's *Load* menu and
*Start from…* list it beside the shipped stages, and the stages page
(`index.html`) plays it. There, **Levels** (the explorer under the player;
a mode of its own on a phone) lists every room in the index as a card, in
the index's order, under *The community's rooms* - the room drawn small,
its kind, size and author, its par once the page has worked it out, and
what the player has won in it - and a card opens it in the one player
(`?room=<id>` opens straight on one), played with the badge by the rules of
whichever stage it is like - `src/room.js`, one player for both rules, with
the room's blurb beside it and its lesson under it; a win in par, a win
without undo and a lesson followed to its end are prizes (`src/progress.js`).
The stages' tutorial, *A Caucus Race*, ends there: its third chapter opens a
room and follows its lesson to the door. A community room can be sealed like any other (`npm run seal`,
`stages/community/sealed.json` is that folder's manifest) if an event
wants it hidden until the day.

Suggested handling of pull requests:

- One room per pull request, one commit (the module and the index line).
- The CI run is the review of the mechanics. A maintainer plays it once on
  a checkout before merging and says what the par felt like.
- A room that changes `src/` or the shipped stages is not a room pull
  request; ask for it to be split.
- Keep the index sorted by id, so two pull requests seldom conflict on it.

## Glitch levels

The studio's second category. The glitch range (`glitch.html`) is five
games - the Rabbit's Pocket Watch, the Looking-Glass Glitch, the
Caterpillar's Lock, the Dormouse's Watchdog and Humpty Dumpty's Wall - and
each is a list of levels, a level being a handful of numbers (the shipped
ones are `stages/rabbit-watch.js`, `looking-glass.js`, `caterpillar-lock.js`,
`dormouse-watchdog.js`, `humpty-wall.js`; the rules are `src/range.js`,
`src/lock.js`, `src/watchdog.js`, `src/wall.js`). A community level for one
of them is a module like a room's, exporting one object that names its
range instead of carrying a map:

```js
// Range level: "Which side?" - for The Caterpillar's Lock (range 'lock')
export const WHICH_SIDE = {
  name: 'Which side?',
  range: 'lock',            // watch | glass | lock | dog | wall
  id: 'which-side',         // the slug of the name: the file's, the index line's, the seed of the password
  short: 'Side',            // a word for the tab
  blurb: 'Three of the four directions: 64 passwords …',
  pool: ['UP', 'DOWN', 'LEFT', 'RIGHT'],
  length: 3, tickMs: 250, jitterTicks: 0, order: 'prefix',
  hand: true,               // the design intent, which the checker measures
};
```

The fields per range (`RANGE_FIELDS` in `src/rangecheck.js` holds each
one's type, range and default; the shipped modules' comments say more):

| range | fields |
|---|---|
| `watch` | `pool` (the buttons the tune is made of), `length` (presses in the tune), `windowMs` (from the first press to the last), `hand` |
| `glass` | `lineMs` (one tick, one line), `pulseMaxLines` (a wider pulse browns the guard out), `listing` (the guard's routine: exactly one `!` target line, `*` crash lines, `goto label`, `delay(n)`, `ret`; the good ending calls `alice_jump`, the honest one `alice_bounce`), `hidden` (fade the listing) |
| `lock` | `pool`, `length`, `tickMs` (one comparison), `jitterTicks` (noise on the answer, sigma in ticks), `order` (`prefix` first to last, `secret` an order of his own), `hand` |
| `dog` | `button` (the nudge), `kicks` (good nudges in a row to win), `openMs`, `timeoutMs` (the window, measured from the last nudge), `hand` |
| `wall` | `pool`, `size` (the buffer), `canary`, `address` (two symbols, `open_wall`'s), `gapMs` (the per-symbol timeout), `hidden` (`name[?]`), `listing` (must show `name[size]` or `name[?]` and `open_wall: @ …`), `hand` |

Pools, buttons and addresses are the badge's eight face and direction
buttons (`UP DOWN LEFT RIGHT A B X Y`). `hand` says whether the level is
meant for a hand or for a take recorded on the badge and replayed faster
(the glass has no `hand`: a tick of 80 ms or more is a hand level). `short`
and `blurb` are optional. `rows` is accepted - a map of its own, in the
range's legend (`# . A` plus `G T` for the glass, `m D` for the lock, `H`
for the wall) - but the range page draws the range's own map either way.

**How they are checked.** `rangeCheck()` in `src/rangecheck.js` is what
`verify-range.mjs` runs on every shipped level and what the studio's Check,
`npm run stage` and `verify-maker.mjs` run on yours, so the verdict is the
same everywhere: the budgets (a hand sustains 4-6 accurate presses a second
and lands a timed press within about ±40 ms; the browser samples the badge
every ~16 ms, so a press needs 34 ms to be seen at all), a perfect replay
that must win and a slow one that must lose, a hand simulated on the level
(the glass over ±40 ms of landing, the dog over 400 attempts with ±40 ms a
press), the reference attacker on a lock (40 passwords; with the badge's
repeat and the median when there is jitter) and on a wall (8 frames) with
what it cost in takes and in presses, and the rules exercised on the level
(START resets, a wrong press is named, the door answers when it should and
not before, too soon stirs and too late bites, the overflow lands where the
frame says). A level that lies about its `hand` is refused - a hand level
with a badge-only window, a badge level a hand could do, a hand lock the
attacker needs more than 150 presses for - and so is one the attacker
cannot clear, or whose jitter does nothing. The verdict is hand or
badge-only, the attacker's cost in takes (the par of a lock or a wall) and
every note the checker made; `rangeLint()` first says what is malformed
(types and ranges, a listing with no check or a goto to nowhere, a window
that never opens, an address outside the pool).

**The studio.** *What are you making* at the top of the panel: a room, or a
glitch level - then the range, and a form with that range's fields (pools
as checkboxes, the glass listing in a box under its syntax legend, Humpty's
listing written from the frame and following it while untouched). Beside
the form the range's map is drawn (glyphs on tiles; the watch and the dog
have none) with what the rules make of the numbers: the tune and its tempo,
the glass's check and ideal offset, the lock's password space and the
seed's password, the dog's window and the take to record, the wall's frame
and canary. The lint sits under it and warns when the name's id is a
shipped level's. *Start from…* lists the shipped levels of the range as
copies to edit (the Load menu has them too, as `<range>:<id>`, or the id
alone when one range has it); the shelf and the room kept between visits
take glitch levels beside rooms, and a switch of category keeps what it
leaves. There is no Run & debug for a glitch level - the five players are
`glitch.html`'s - so **Try it on the range** opens
`glitch.html?level=<the level as the share link carries it>`, where it is
the last tab of its range, "· yours", selected and armed. The export
writes the module with `range:` and the index line with `kind: <range>`.
An assistant on the bridge uses `set`, `get`, `check`, `module` and `load`
for a glitch level as for a room (`maker_set_level` takes the fields above;
`maker_load` names the range ids); `paint`, `play`, `moves` and `generate`
are rooms' and say so.

**How they reach the site.** Listed in `stages/community/index.json` with
`"kind": "<range>"`, a level is loaded by `glitch.html` through
`src/seal.js` as the shipped ranges are - after the gate, like them - and
added as the last tab of its range, "· community". `verify-maker.mjs` gates
the deploy on it as on a room: it lints and checks it, it must agree with
its kind, and it may not take a shipped level's id, since the range page
and its tutorial find a level by it. `stages/community/which-side.js` is
the demo: a lock of three symbols from the four directions at 250 ms a
comparison and no jitter, 64 passwords, a hand level the attacker opens in
seven takes.

**Left out on purpose.**

- A player in the studio. The five players are `src/glitch.js`'s, built
  around that page's pad, timing traces, scenes and the badge's fire; a
  second copy would drift from the first. The range page is one click
  away and plays the level exactly as the badge will.
- Hidden levels beyond the flag. `hidden` fades the glass listing or hides
  the wall's size on the range page; the studio shows its author
  everything, and CI prints the password and the canary.
- Sealing a community glitch level. `stages/community/sealed.json` could
  list one and `loadStage` would open it with the badge's key, but event
  levels do not live in the community folder: seal a shipped range, not
  these.
- A map of its own on the range page. Accepted in the data and drawn in
  the studio; the range page keeps drawing the range's map, which its
  scenes are built around.
- Recording the take. The studio says what to record and at what speed;
  recording is the badge's.

## Files

```
maker.html                      the page: the landing (site) and the studio (checkout)
src/maker.js                    the page's module: hero, invitation, the studio, checker, bench, export, the assistant panel and the bridge's ops, the coach
src/invite.js                   the two prompts, pure: aiPrompt (the invitation: fork first, the studio, the bridge, the guide) and prPrompt (the brief that ships one room as a pull request), prParts, prShort, pagesUrl / roomUrl
src/guide.js                    the White Rabbit's guide, pure: GUIDE_MODES (the banner's three ways), the steps of each (say / ask / do / help / done), the plans worked out against the room, applyAnswer, guideText (a step as instructions a small model follows), PLATFORMS
AGENTS.md                       the short map for an assistant that reads AGENTS.md first (Codex, Cursor, Copilot, Gemini, Hermes): fork first, the studio, the guide, the rules
.mcp.json .codex/config.toml .cursor/mcp.json .gemini/settings.json .vscode/mcp.json   the bridge's MCP server registered for each assistant; never published
src/maker.css                   its styles, on top of styles.css
src/level.js                    a level as data: lint, check, toModule / fromModule, share links; the tools (line, rect, region, mirror), the transforms, analyse / difficulty, STARTERS, generate / generateSolvable; a level with a range goes to rangecheck.js
src/rangecheck.js               a glitch range level as data: the fields per range (RANGE_FIELDS), rangeLint, rangeCheck (what verify-range runs on the shipped levels), the maps, the budgets, rangeBlank
src/scene.js                    the art: assets, dressings, drawRoom - shared with the stages page
src/check-worker.js             check() and generateSolvable() off the page's thread
src/bridge.js                   the page's end of the bridge: the event stream, the replies, the mirror, the chat
src/tutor.js                    MAKER_TUTORIALS, the studio's guided builds - Painting the Roses, Follow the White Rabbit (the one the guide rides on), A Room with a Gate, The Clock and the Cast, A Room that Teaches (with the other two pages' tutorials); src/coach.js draws the chosen one; LESSON_EVENTS + lessonSteps, a room's lesson as tutorial steps
src/room.js                     the stages page's player for a community room: either rules, the badge, the lesson under it
stages/community/               the community's levels and index.json; the-first-lesson.js and tick-tock.js are the demo rooms, one lesson each, which-side.js the demo lock level
src/glitch.js                   the range page: plays the listed glitch levels as tabs of their range, and ?level= as yours
software/tools/maker.mjs        npm run maker: serves the checkout, opens the page
software/tools/maker-server.mjs the server: static files + the bridge under /__maker/ (loopback only), incl. the guide's state and doors (/guide, /platforms) and repoFacts (the fork from the remotes)
software/tools/maker-mcp.mjs    the bridge as MCP tools over stdio; .mcp.json at the root registers it
software/tools/check-stage.mjs  npm run stage -- <file>: the verdict on a module, a room's or a glitch level's
software/tools/verify-maker.mjs part of npm run verify: level.js and the studio's logic (the shipped ranges' levels through it too), the tutorial, the bridge and the MCP server, the page's two faces, the community index
```
