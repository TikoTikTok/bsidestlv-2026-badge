# Contributing

## Layout

```
index.html, styles.css, src/, stages/, assets/   the published site - MIT
images/                                          README renders, not published
hardware/                                        KiCad 9 projects - CERN-OHL-S-2.0
software/                                        tools, firmware, sources - MIT
```

Anything you add lands under one of those and inherits its licence. If it is
genuinely both (a tool that reads board files, say), say so in its header.

## Hardware

- KiCad 9. Commit the `.kicad_sch`, `.kicad_pcb`, `.kicad_pro` and whatever the
  project needs to open — nothing else.
- Do **not** commit `*.kicad_prl`, `fp-info-cache`, `*-backups/`,
  `production/backups/` or lock files. They are ignored; if git offers them,
  something is wrong with the path, not the rule.
- Regenerate `production/` with Fabrication Toolkit and commit the whole
  directory in one go, so BOM, positions and gerbers always agree.
- Run DRC and ERC before opening a pull request. A board that does not pass is
  a draft.

## Software

```
./serve.sh              # http://localhost:8080, serves the repo root
npm run verify          # both stages still solvable
npm run validate        # legacy sprite/frame integrity
```

The site is the repo root: `index.html`, `styles.css`, `src/`, `stages/` and
`assets/`. Those five paths are what the Pages workflow stages and publishes, so
keep every path inside them relative — an absolute `/assets/...` works locally
and breaks under `/<repo>/` on Pages. Anything the page does not load belongs in
`software/` or, for README artwork, `images/` — neither is staged. Adding a
sixth *published* path means updating `.github/workflows/pages.yml` too.

No dependencies — Node with ES modules and Python 3 standard library only.
Keep it that way; `package.json` has no `dependencies` block on purpose.

Assets are cut from the sheets in `software/references/` by the tools in
`software/tools/`, which write into `assets/` at the root. Run them from the
repo root, where `package.json` lives. If you change a slice, re-run its tool
and commit the regenerated PNGs with it — never hand-edit an output.

## Firmware

```
cd software/controller
mkdir build && cd build
cmake -DPICO_SDK_PATH=/path/to/pico-sdk ..
make -j
```

`build/` is ignored. The USB descriptors deliberately report Sony's VID/PID so
iOS binds a controller profile — do not "fix" that without reading the note at
the end of `software/controller/README.md`, and do not ship hardware with it.

## Commits

Describe the change, not the file list. One concern per commit; a board revision
and a game change do not belong together.
