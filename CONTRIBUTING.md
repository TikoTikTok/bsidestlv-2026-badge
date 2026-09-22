# Contributing

## Layout

```
hardware/    KiCad 9 projects - CERN-OHL-S-2.0
software/    the Alice in AI Land challenge - MIT
```

Anything you add lands in one of the two and inherits that licence. If it is
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
cd software
./serve.sh              # http://localhost:8080, serves site/
npm run verify          # both stages still solvable
npm run validate        # legacy sprite/frame integrity
```

`site/` is what GitHub Pages publishes. Keep every path inside it relative — an
absolute `/assets/...` works locally and breaks under `/<repo>/` on Pages. Keep
anything the page does not load out of `site/`, so the deploy stays the site.

No dependencies — Node with ES modules and Python 3 standard library only.
Keep it that way; `package.json` has no `dependencies` block on purpose.

Assets are cut from the sheets in `software/references/` by the tools in
`software/tools/`, which write into `software/site/assets/`. If you change a slice, re-run its tool and commit the
regenerated PNGs with it — never hand-edit an output.

## Commits

Describe the change, not the file list. One concern per commit; a board revision
and a game change do not belong together.
