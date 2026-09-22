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
- **Solid while pressed** — mounted and running; lights up whenever any button
  is held, as live input feedback.

## HID mapping

The device sends DualShock 4 input report `0x01` (64 bytes) every 5 ms:

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
centered (`0x80`) and both triggers report released. Opposing D-pad directions
cancel out (e.g. pressing UP and DOWN together reports centered) so no
impossible diagonal is ever sent.

The report is streamed continuously rather than only on change: the real
controller does the same, and the report counter in `buttons2` has to keep
advancing for drivers that watch it for a stalled device. Feature reports the
host probes during attach (IMU calibration `0x02`, MAC `0x12`, version `0xA3`)
are answered with well-formed placeholder data - see
`tud_hid_get_report_cb()` in `src/usb_descriptors.c`.

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

The build produces `build/controller.uf2`, about 41KB.

## Flashing

1. Hold the **BOOTSEL** button while plugging the Pico into USB; it mounts as a
   mass-storage drive (`RPI-RP2`).
2. Copy `controller.uf2` onto it. The board reboots and re-enumerates as a
   "Wireless Controller" by "Sony Interactive Entertainment" - see the VID/PID
   note below.

On the badge, BOOTSEL is the button silkscreened `BootSel`; hold it while
plugging in USB-C.

After flashing, plug it into a phone (via USB-OTG / USB-C). It should appear as
a connected gamepad, ready for the challenge at the repository root, for
emulators, or any app that supports HID controllers.

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
