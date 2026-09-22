# Hardware

Three KiCad 9 projects. Each is self-contained: open the `.kicad_pro` in KiCad
and everything it needs is beside it.

| Directory | Project | What it is |
|---|---|---|
| `badge/` | `BSidesTLV26Badge` | The badge. No components — the schematic is empty by design and the board is artwork drawn in copper, mask and silkscreen. `graphics/` holds the source images the layers were made from. |
| `soldering-kit/` | `BSidesTLV26TinyBadge` | The soldering workshop kit: a TLC555 astable clocking a CD4017 decade counter that chases four LEDs. All through-hole — DIP sockets, axial resistors, a 3296W trimmer for the rate and a CR2032 holder — so a first-time solderer can build it. |
| `controller/` | `PhoneController` / "BSidesTLV2026 Alice Controller v0.4" | The RP2040 controller the online challenge is played on: D-pad, A/B/X/Y, Start/Select, reset and BootSel, USB-C, 16 MB external flash, SWD header. |

## Opening

KiCad 9. Nothing here needs a plugin to *view*; the production packages were
generated with [Fabrication Toolkit](https://github.com/bennymeg/Fabrication-Toolkit),
whose settings live in each project's `fabrication-toolkit-options.json`.

`controller/libs/lcsc/` vendors the symbol, footprint and 3D model for the USB-C
connector imported from LCSC. `fp-lib-table` and `sym-lib-table` point at it
with project-relative paths, so the project moves without breaking.

## Fabrication

Each project ships the package it was last ordered with:

```
<project>/production/
  bom.csv           designator -> footprint, quantity, value, LCSC part number
  positions.csv     pick-and-place
  designators.csv
  netlist.ipc       IPC-D-356 netlist, for bare-board electrical test
  <project>.zip     the gerbers as sent to the fab
```

`controller/gerbers/` additionally keeps the loose gerber set and job file, and
`controller/output/` the per-layer SVG plots.

To regenerate rather than reuse: open the board, run Fabrication Toolkit, and
the directory is rewritten.

## Generating the soldering-kit schematic

`soldering-kit/tools/` builds `BSidesTLV26TinyBadge.kicad_sch` from code rather
than by hand:

```
python3 soldering-kit/tools/build_badge_sch.py
```

| File | What |
|---|---|
| `build_badge_sch.py` | The circuit itself: CR2032 -> TLC555 astable -> CD4017 -> 4 LEDs, with the part choices argued in its docstring |
| `schbuild.py` | Places symbols, resolves absolute pin coordinates, draws wires |
| `symlib.py` | Pulls a symbol out of a `.kicad_sym` library, flattening `(extends ...)` so the embedded copy is self-contained |
| `ksexpr.py` | Dependency-free S-expression reader/writer that round-trips KiCad files |
| `verify_xf.py` | Regression check for the pin transform against a pre-change schematic passed as `argv[1]` |

These are software, not hardware: MIT, under the root `LICENSE`.

## Autorouting

`controller/freerouting.dsn` is the Specctra export used with
[Freerouting](https://github.com/freerouting/freerouting). It is an export, not
a source of truth — the `.kicad_pcb` is.

## What is deliberately not here

KiCad's own rolling archives (`*-backups/`, `production/backups/`), the
`fp-info-cache`, `*.kicad_prl` per-user state and editor lock files are all
ignored — git is the history now. See the root `.gitignore`.

## Licence

CERN-OHL-S-2.0, see [`LICENSE`](LICENSE). Vendored third-party libraries under
`controller/libs/` keep their upstream terms.
