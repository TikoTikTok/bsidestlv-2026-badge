# Controller firmware

Firmware for the BSidesTLV 2026 badge - the "BSidesTLV2026 Alice Controller" v0.4, a USB HID game
controller built on the RP2040. It also builds and runs unchanged on a stock
Raspberry Pi Pico (RP2040 / RP2350), which is the easiest way to try it without
a badge.

The board it targets is [`hardware/badge/`](../../hardware/badge); this
directory is only the firmware. It enumerates as a **wired DualShock 4**, so
phones, PCs and emulators recognize it with no driver or app - including
iPhones. The button layout mimics a Game Boy Color: a 4-way D-pad plus `A`,
`B`, `X`, `Y`, shoulder buttons (`SR`/`SL`), and `START` / `SELECT`.

### Why DualShock 4 and not a generic gamepad

A plain HID gamepad descriptor works on Android, Windows, macOS and Linux, but
is **invisible on iOS/iPadOS**: Apple's GameController framework only attaches
to controllers it recognizes by USB VID/PID (MFi, Xbox Wireless, DualShock 4 /
DualSense, Switch Pro). A generic gamepad enumerates and is then ignored - no
app can see it. Presenting the DualShock 4's identity and input report makes an
iPhone bind a real controller profile, and every other host understands it too.

## Wiring

All buttons are **active-low**: wire each button between its GPIO and `GND`.
The firmware enables the RP2040's internal pull-ups, so external pull-up
resistors are optional (the description below assumes you already have them).

| Function        | GPIO  |
| --------------- | ----- |
| D-pad DOWN      | 0     |
| D-pad RIGHT     | 1     |
| D-pad UP        | 2     |
| D-pad LEFT      | 3     |
| B               | 4     |
| A               | 5     |
| X               | 20    |
| Y               | 21    |
| SR (R shoulder) | 22    |
| SL (L shoulder) | 25    |
| START           | 23    |
| SELECT          | 24    |
| Status LED      | 8     |

The status LED (GPIO8, active-high through a current-limiting resistor):

- **Blinks @ 250 ms** — USB not mounted (waiting for host).
- **Blinks @ 1 s** — USB suspended.
- **Blinks @ 100 ms** — quick glitch is recording a take.
- **Solid** — quick glitch is replaying one.
- **Solid while pressed** — mounted and running; lights up whenever any button
  is held, as live input feedback.

## Quick glitch

The badge doubles as a fault-injection trainer for the glitch range on the
challenge site (`glitch.html`): the levels there need an input to land inside
a window a hand cannot hit, so the firmware carries a record / replay layer
that speaks the vocabulary of real glitching gear — **trigger**, **offset**,
**width**, **repeat**.

`SELECT` is the shift key. While it is held nothing you press reaches the host,
and each other button is a command:

| Chord | Does |
| ----- | ---- |
| `SELECT` + `SL` | Start recording a take. Press again to stop. Leading and trailing silence are trimmed; the take always ends with everything released. |
| `SELECT` + `SR` | **Fire**: tap `START` (the trigger the host measures from), wait `offset`, replay the take at `speed`. Keep the chord held and it fires again every ~600 ms after the replay ends — a repeat, for sweeping. |
| `SELECT` + `UP` / `DOWN` | Playback speed ×2 / ÷2: 1/4×, 1/2×, 1×, 2×, 4×, 8×, 16×, 32×. Scales the whole take, gaps and hold times alike, so an 80 ms tap at 8× is a 10 ms pulse. |
| `SELECT` + `LEFT` / `RIGHT` | Offset −/+ 1 ms. Hold to auto-repeat; after twenty steps the step becomes 10 ms. Floors at 0, caps at 10 s. |
| `SELECT` + `B` | Forget the take, offset 0, speed 1×. |
| `SELECT` + `Y`, held | The **beacon**: spell the vault (serial, stage key) on the stick axes for browsers without WebHID - see [The vault](#the-vault). |
| `SELECT` + `START`, held 2 s | Reboot into the UF2 bootloader to take a new firmware - see [Flashing](#flashing). |

A plain `SELECT` press with no command still reaches the host, as a 40 ms tap
when you let go, so the button keeps working as Share / Select in anything
else. Recording passes everything through, so you record against the live
game. Up to 127 button changes fit in a take; it stops itself when full.

A worked example, level 3 of the range (40 lines at 20 ms, target line 23):

1. `SELECT`+`SL`, tap `X` once, `SELECT`+`SL`. The take is one press.
2. `SELECT`+`UP` ×2 → 4×. A ~150 ms human tap becomes a ~40 ms pulse, two lines wide.
3. Hold `SELECT`+`RIGHT` until the site's offset readout says ~460 ms.
4. `SELECT`+`SR`. The site starts the guard's routine on `START` and reports
   which line the pulse landed on, and how far from the target. Nudge the
   offset, fire again — or hold the chord and tap `RIGHT` between fires to
   sweep.

Timing: the engine runs in the main loop, several hundred times a millisecond,
and every button that was down at any instant since the previous report is
latched into the next one, so a replayed pulse shorter than one report still
shows up. Reports go out every **1 ms** (the real controller's endpoint asks
for 5 ms; `DS4_REPORT_INTERVAL_MS` in `ds4.h` sets both the descriptor and the
loop), so the offset resolution the host actually sees is 1 ms — provided the
host reads that fast. Browsers sample gamepads at ~16 ms; the range is tuned
for that, see `software/docs/GAME_DESIGN.md`.

The layer is plain C with no SDK dependency, `src/glitch.c`, and has a host
test that scripts a fake clock through record, fire, repeat and the 32-bit
wrap (the same make builds the vault's test, below):

```bash
make -C software/controller/test
```

On a real badge, two bench tools show what the host receives. The **Bench**
panel on `glitch.html` prints every edge the browser sees, timed from the last
START, at the browser's ~16 ms sampling. For the real numbers, on Linux:

```bash
sudo python3 software/tools/hid-trace.py     # raw reports, 1 ms rate, µs stamps
```

A fire with offset 460 ms and a 40 ms take at 1x should print START down at
0, START up at ~30, X down at ~460, X up at ~500, and the counter-gap stat
should stay at 0.

## The vault

The badge is the key to the challenge site: `src/vault.{h,c}` keeps a 32-byte
**stage key** and a 15-byte label in the last 4 KB sector of the flash, written
once at the booth. The site's event stages are sealed under keys derived from
it (`src/seal.js` on the site), so a page opens them only with a badge plugged
in. The design, its limits and the server tier beyond it:
[`software/docs/BADGE_GATE.md`](../docs/BADGE_GATE.md).

Two ways out of the badge, both read by the site's `src/vault.js`:

- **HID feature report `0xF1`.** One of the vendor reports the DualShock 4
  descriptor already declares (63 bytes), so the descriptor stays byte-identical
  to the real controller's and iOS keeps binding. `GET` answers `ALICE`, a
  version, state bits, the RP2040 serial, the key and the label; a real
  DualShock 4 answers zeros. `SET` on the same ID stores a key or erases.
  Chrome's WebHID reaches it from `badge.html`.
- **The beacon.** While `SELECT` + `Y` is held the stick axes (centred
  otherwise - the board has no sticks) carry the same payload: left X is a
  clock flipping every 50 ms symbol, the other three axes a nibble each as
  one of 16 levels, 31 symbols a frame, a 250 ms gap, CRC-32. Any browser
  with a Gamepad API decodes it - that is the phone route.

Writes are gated by presence: a blank badge takes its first key as it is; a
badge that has one accepts a new key or an erase only while `SELECT` is
physically held, so a page cannot wipe a badge that was merely plugged in.
The sector write is deferred out of the control transfer (an erase is tens of
milliseconds with interrupts off); the page reads back after it. The record
survives reflashing - no image reaches the last sector.

`test/test_vault.c` runs the record, the reports, the write policy and the
beacon on the host, decoding the beacon the way a browser samples a gamepad
(60 Hz from any phase, 30 Hz, 250 Hz) and pinning the first symbols so the
site's model of the badge (`software/tools/fake-badge.mjs`) is proven to
encode the same bytes.

## HID mapping

The device sends DualShock 4 input report `0x01` (64 bytes) every 1 ms:

| Physical button | DualShock 4 control |
| --------------- | ------------------- |
| D-pad           | Hat switch (8 directions) |
| A               | Cross               |
| B               | Circle              |
| X               | Square              |
| Y               | Triangle            |
| SR (R shoulder) | R1                  |
| SL (L shoulder) | L1                  |
| START           | Options             |
| SELECT          | Share               |

There are no analog sticks or triggers on the board, so both sticks report
centered (`0x80`) and both triggers report released - except while the vault's
beacon is running, which puts its symbols on the four stick bytes. Opposing
D-pad directions cancel out (e.g. pressing UP and DOWN together reports
centered) so no impossible diagonal is ever sent.

The report is streamed continuously rather than only on change: the real
controller does the same, and the report counter in `buttons2` has to keep
advancing for drivers that watch it for a stalled device. Feature reports the
host probes during attach (IMU calibration `0x02`, MAC `0x12`, version `0xA3`)
are answered with well-formed placeholder data - see
`tud_hid_get_report_cb()` in `src/usb_descriptors.c`. Feature report `0xF1`
is the vault, above.

## Building

Prerequisites: `cmake` (>= 3.13), the `arm-none-eabi` GCC toolchain, and a
checkout of the [pico-sdk](https://github.com/raspberrypi/pico-sdk) with its
submodules (TinyUSB) initialized.

`CMakeLists.txt` falls back to `../pico-sdk` relative to this directory, which
inside this repository would be `software/pico-sdk` and is almost certainly not
where your SDK lives. Point at it explicitly:

```bash
# from software/controller/
mkdir build && cd build
cmake -DPICO_SDK_PATH=/path/to/pico-sdk ..
make -j
```

`PICO_SDK_PATH` works as an environment variable too, if you already export it.

The first configure fetches `picotool` from git and builds it, so it needs
network access. If you have one already built, reuse it and skip that:

```bash
cmake -DPICO_SDK_PATH=/path/to/pico-sdk -Dpicotool_DIR=/path/to/picotool ..
```

To target a different board (e.g. a Pico 2 / RP2350), pass the board at
configure time:

```bash
cmake -DPICO_BOARD=pico2 -DPICO_SDK_PATH=/path/to/pico-sdk ..
```

The build produces `build/controller.uf2`, about 45KB.

## Flashing

The RP2040's ROM bootloader takes firmware over USB; there is nothing to
install on the host. Get the badge into the bootloader, any of:

- hold **BootSel** (silkscreened on the badge; `BOOTSEL` on a Pico) while
  plugging in USB-C;
- already plugged in: hold **BootSel**, tap **Reset**;
- running this firmware: hold **SELECT + START** for two seconds. The LED
  goes dark and the board drops off the host.

It mounts as a small drive called `RPI-RP2`. Copy `controller.uf2` onto it; the
board reboots and re-enumerates as a "Wireless Controller" by "Sony Interactive
Entertainment" - see the VID/PID note below. The tool does the waiting, the
copy, and the check that the controller came back:

```bash
python3 software/tools/flash-badge.py                 # build/controller.uf2
python3 software/tools/flash-badge.py --fetch         # the newest green CI build, via gh
python3 software/tools/flash-badge.py --status        # what is plugged in right now
```

`--fetch` is the no-toolchain route: the Firmware workflow builds
`controller.uf2` on every push under `software/controller/` and keeps it as a
run artifact for 90 days. Windows, macOS and Linux, standard library only.

**From a browser**, with nothing installed at all: `flash.html` on the site
(the Pages deploy builds the image it offers from the same commit) claims the
bootloader's PICOBOOT interface over WebUSB and does what `picotool load`
does - erase, program, read back, reboot. Chrome, Edge or another Chromium
browser on Windows, macOS, Linux, ChromeOS and Android; Linux needs
picotool's udev rule, which the page quotes. The client is `src/picoboot.js`
and `src/uf2.js`, tested without a board by `software/tools/verify-flash.mjs`.

`picotool reboot` cannot do this: the firmware has no reset interface, and
adding one would change the shape of the device iOS keys on. The chord is the
software route.

**SWD**, when the bootloader is out of reach (a firmware that hangs before USB
comes up, a board that will not enumerate): `J1` is the three-pin SWD header
- `SWCLK`, `SWDIO` (net `SWD` on the schematic) and `GND`; read the order off
the silkscreen. With a Raspberry Pi Debug Probe or any CMSIS-DAP probe:

```bash
openocd -f interface/cmsis-dap.cfg -f target/rp2040.cfg -c "adapter speed 5000" \
        -c "program build/controller.elf verify reset exit"
```

After flashing, plug it into a phone (via USB-OTG / USB-C). It should appear as
a connected gamepad, ready for the challenge at the repository root, for
emulators, or any app that supports HID controllers.

### Building on Windows

```powershell
powershell -ExecutionPolicy Bypass -File software\tools\setup-pico-toolchain.ps1   # once: CMake, Ninja, Arm GCC, pico-sdk 2.3.1, prebuilt picotool
powershell -ExecutionPolicy Bypass -File software\tools\build-firmware.ps1         # -> build\controller.uf2
```

The build script also finds what the Raspberry Pi Pico VS Code extension puts
under `%USERPROFILE%\.pico-sdk`, so either route works. The host test needs a
native C compiler, which neither route installs; CI runs it on every push.

## Notes

- Reports Sony's VID `0x054C` / PID `0x09CC` (DualShock 4 CUH-ZCT2U). That is
  what buys iOS support; it is also not a VID/PID this project owns, so do not
  ship hardware with it.
- **Hardware:** the USB-C receptacle needs a 5.1k Rd pulldown on **both** CC1
  and CC2. CC1 has one (R15 on the controller board); CC2 was left floating,
  which means a USB-C iPhone will not turn on VBUS in one of the two cable
  orientations. `hw/usb/PhoneControllerUSB.kicad_sch` now carries `R1` (5.1k,
  CC2 to GND) - the matching `.kicad_pcb` still needs "Update PCB from
  Schematic" plus placement and routing of that one 0805.
- The RP2040 USB enumeration errata fix (RP2040-E5) is enabled in
  `CMakeLists.txt`; it reserves GPIO15 internally on RP2040 boards.
