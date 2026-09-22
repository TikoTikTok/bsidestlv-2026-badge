# BSidesTLV 2026 Badge

Everything for the BSidesTLV 2026 badge: three KiCad boards, the RP2040
firmware that runs on it, and the online puzzle challenge — *Alice in AI Land* —
that the badge is used to play.

```
hardware/          KiCad projects (CERN-OHL-S-2.0)
  badge/             "BSidesTLV2026 Alice Controller" - RP2040 handheld, 14 buttons, USB-C
  usb-board/         USB-C receptacle breakout with the CC pulldowns
  soldering-kit/     555 + CD4017 LED chaser, the soldering workshop kit
software/          the online challenge and the badge firmware (MIT)
  site/              the static site published to GitHub Pages
  controller/        RP2040 firmware - enumerates as a DualShock 4
```

## The challenge

*Alice in AI Land* is a boulder-pushing puzzle game whose answer is a **program**.
Five stages. The first two are played by hand on the badge. Stage 3 is a
wall: the board is hidden before a human could read it and the move budget
exceeds human input bandwidth, so the only way through is to drive the game with
a script. The game hands you the protocol in stage 2 and dares you to use it.

The simulation is deterministic — 60 ticks/second, one input bitmask per tick,
same seed plus same input trace gives the same outcome byte for byte — which is
what makes it scriptable, replayable and verifiable.

It is a static site — no server, no build step, every path relative. Published
to GitHub Pages from `software/site/` by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml); set
Settings -> Pages -> Source to "GitHub Actions" once and it deploys itself.

```
cd software
./serve.sh          # http://localhost:8080, the same files Pages serves
npm run verify      # proves both stages are solvable
```

ES modules need `http://`, not `file://`. That is the only reason a local
server exists.

- [`software/README.md`](software/README.md) — asset set, slicing tools, how every sprite was cut
- [`software/docs/GAME_DESIGN.md`](software/docs/GAME_DESIGN.md) — stages, tick model, protocol

## The hardware

| Board | What | Key parts |
|---|---|---|
| [`hardware/badge/`](hardware/badge) | "BSidesTLV2026 Alice Controller v0.4" — the badge itself, and the controller the challenge is played on. D-pad, A/B/X/Y, Start/Select, reset and BootSel, all on one side. | RP2040, W25Q128JVS, AMS1117-3.3, USB-C |
| [`hardware/usb-board/`](hardware/usb-board) | USB-C receptacle breakout that carries the 5.1k CC pulldowns, panelized with mouse bites. | DX07VN24WA2C1568, Molex 52559-0652 |
| [`hardware/soldering-kit/`](hardware/soldering-kit) | Through-hole LED chaser for the soldering workshop. Beginner-friendly: DIP, axial, CR2032. | TLC555P, CD4017BE, 4x LED, 500k trimmer |

Each project carries its own `production/` directory with the fabrication
package: BOM, positions, designators and IPC netlist.

See [`hardware/README.md`](hardware/README.md) for opening, plotting and
re-fabricating the boards.

## The firmware

[`software/controller/`](software/controller) is the RP2040 firmware. It
presents the badge to a host as a **wired DualShock 4**, which is what makes it
work on an iPhone — iOS only binds controllers it recognizes by USB VID/PID, so
a generic HID gamepad enumerates and is then ignored. Every other host
understands the same report.

```
cd software/controller
mkdir build && cd build
cmake -DPICO_SDK_PATH=/path/to/pico-sdk ..
make -j                              # -> build/controller.uf2
```

Hold `BootSel` while plugging in USB-C, then copy `controller.uf2` onto the
`RPI-RP2` drive that appears. It also builds and runs on a stock Raspberry Pi
Pico, which is the easiest way to try the firmware without a badge.

Full pin map, HID report layout and the 3D-printable enclosure:
[`software/controller/README.md`](software/controller/README.md).

## Licences

- **Software** — MIT, see [`LICENSE`](LICENSE). Covers `software/` and the
  Python/Node tooling under `hardware/soldering-kit/tools/`.
- **Hardware** — CERN-OHL-S-2.0, see [`hardware/LICENSE`](hardware/LICENSE).
  Covers both KiCad projects and every gerber, plot and production package
  under `hardware/`.

Third-party symbols and footprints vendored under
`hardware/badge/libs/lcsc/` keep their own upstream terms.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).
