# Alice in AI Land - a map for the assistant that just landed here

You are in a clone of the BSidesTLV 2026 badge repository: a boulder-pushing
puzzle game served as static files from this root, two circuit boards under
`hardware/`, and the badge's firmware under `software/controller/`. The full
map, with the state of every piece, is `CLAUDE.md`; this file is the short
version for whoever reads `AGENTS.md` first (Codex, Cursor, Copilot, Gemini,
Jules, Hermes and friends).

## If you were sent here to build a level with someone

That is the usual reason to be here. The person watches a page while you
work; you talk to them, they decide, you drive the tools. The whole flow is
written down for you, step by step, and works for a small model as well as a
large one:

1. **Fork first** if this clone is not already the person's fork (`git remote -v`:
   `origin` should be theirs). The room you build lands on *their* GitHub
   page: `gh repo fork <owner>/<repo> --clone`, then switch the fork's site on
   (`gh workflow enable pages.yml`; `gh api -X POST repos/<login>/<repo>/pages
   -f build_type=workflow`). The invitation on the published page says the
   same.
2. **Start the studio**: `npm run maker` (Node 20 or newer, no packages). It
   serves this checkout on http://localhost:8080, opens `maker.html` in their
   browser, and mounts your bridge at http://localhost:8080/__maker/
   (loopback only).
3. **Connect and say hello.** MCP: the server `alice-maker`
   (`node software/tools/maker-mcp.mjs`) is registered for Claude Code
   (`.mcp.json`), Cursor (`.cursor/mcp.json`), Codex (`.codex/config.toml`),
   Gemini CLI (`.gemini/settings.json`) and VS Code Copilot
   (`.vscode/mcp.json`); Hermes takes the same under `mcp_servers` in its
   config. Anything with a shell uses curl: `POST /__maker/hello`,
   `GET /__maker/guide`, `POST /__maker/rpc`, `GET /__maker/inbox`.
4. **Follow the White Rabbit's guide.** Your hello pops a welcome banner on
   their screen with three ways - *Follow the White Rabbit* (step by step,
   they hold the brush), *Drink Me* (four questions, you paint), *Eat Me* (a
   one-bite starter). `maker_guide {"waitMs": 120000}` (or
   `GET /__maker/guide?wait=120000`) returns the first step the moment they
   pick. Every step says what to SAY, what to ASK (one question, a few
   options - use your option buttons if you have them, else a numbered
   list), what to DO on the board and when it is DONE. Pass every answer
   back (`maker_guide {"answer": "..."}`); `{"run": true}` lets the bridge
   do the step's work; `{"help": true, "run": true}` is for "do it for me".
   When unsure, call `maker_guide` with no arguments and do what its text
   says.
5. **Put it on their page.** The guide's last steps hand you the pull
   request brief (`maker_pr_brief`) and the commands: a branch
   `community/<id>`, one commit, a pull request on their fork, merged when
   they say so; the Pages workflow deploys in about two minutes and the room
   is live at `https://<login>.github.io/<repo>/index.html?room=<id>`. A
   second pull request offers it to the game's own repository.

The long form of all of this: `software/docs/LEVEL_MAKER.md` ("Building with
an AI, step by step" and "The bridge"). The playbook itself is
`src/guide.js`; the page's end is `src/maker.js`; the bridge is
`software/tools/maker-server.mjs`.

## Rules that matter, in short

- Never commit to `main`; branch, and land through a pull request.
- A room pull request is one room, one commit (`stages/community/<id>.js` plus
  one line in `stages/community/index.json`), nothing under `src/` touched.
- `npm run stage -- stages/community/<id>.js` says what CI will say;
  `npm run verify` runs everything the deploy runs. Both green before a push.
- No npm dependencies, ever. Node ESM and Python 3 stdlib only.
- The published site plays from the badge; `localhost` is the development
  path. Do not add a bypass for the site.
- The firmware's Sony VID/PID is deliberate. Do not "fix" it.
- Generated assets come from the slicers in `software/tools/`; never hand-edit
  an output.

## Commands

```
npm run maker                               # serve the checkout, open the studio, mount the bridge
npm run stage -- stages/community/<id>.js   # the verdict on one level
npm run verify                              # the whole suite, the CI gate
node software/tools/maker-mcp.mjs           # the bridge as MCP tools over stdio
```
