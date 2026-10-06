#!/usr/bin/env python3
"""Trace the badge's button edges straight off the USB HID reports.

The browser samples gamepads every ~16 ms, which is too coarse to check that
the quick-glitch layer really lands a pulse where the offset says. This reads
the raw DualShock 4 input reports from /dev/hidraw at the report rate (1 ms)
and prints every change with a microsecond timestamp, relative to the last
START press - the trigger - so a fire shows up as:

    START v      0.000 ms
    START ^     30.012 ms
    X     v    460.008 ms      <- the offset
    X     ^    500.011 ms      <- + the pulse width

Linux only (macOS has no hidraw). Run as root or give yourself access:

    sudo python3 software/tools/hid-trace.py            # picks the badge
    sudo python3 software/tools/hid-trace.py /dev/hidraw3

Standard library only, like everything else in tools/.
"""

import glob
import os
import struct
import sys
import time

VID, PID = 0x054C, 0x09CC          # what the firmware reports, see ds4.h

# DualShock 4 report 0x01: byte 5 = hat + face, byte 6 = shoulders / start / select
HAT = {0: ('UP',), 1: ('UP', 'RIGHT'), 2: ('RIGHT',), 3: ('DOWN', 'RIGHT'), 4: ('DOWN',),
       5: ('DOWN', 'LEFT'), 6: ('LEFT',), 7: ('UP', 'LEFT')}
FACE = {0x10: 'X', 0x20: 'A', 0x40: 'B', 0x80: 'Y'}          # square, cross, circle, triangle
MISC = {0x01: 'SL', 0x02: 'SR', 0x10: 'SELECT', 0x20: 'START'}


def find_badge():
    for dev in sorted(glob.glob('/sys/class/hidraw/hidraw*')):
        try:
            uevent = open(os.path.join(dev, 'device', 'uevent')).read()
        except OSError:
            continue
        for line in uevent.splitlines():
            if line.startswith('HID_ID='):
                _, vid, pid = line.split('=')[1].split(':')
                if int(vid, 16) == VID and int(pid, 16) == PID:
                    return '/dev/' + os.path.basename(dev)
    return None


def decode(report):
    if len(report) < 8 or report[0] != 0x01:
        return None
    b0, b1 = report[5], report[6]
    held = set(HAT.get(b0 & 0x0F, ()))
    held |= {name for bit, name in FACE.items() if b0 & bit}
    held |= {name for bit, name in MISC.items() if b1 & bit}
    counter = report[7] >> 2
    return held, counter


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else find_badge()
    if not path:
        sys.exit('no badge found (VID 054c PID 09cc); pass /dev/hidrawN explicitly')
    print(f'reading {path} - press START on the badge to zero the clock, Ctrl-C to stop')

    fd = os.open(path, os.O_RDONLY)
    held, counter = set(), None
    t_start = None
    reports = 0
    last_stats = time.monotonic()
    gaps = 0

    try:
        while True:
            report = os.read(fd, 64)
            now = time.monotonic_ns()
            decoded = decode(report)
            if not decoded:
                continue
            new, c = decoded
            reports += 1
            if counter is not None and c != (counter + 1) & 0x3F:
                gaps += 1
            counter = c

            for name in sorted(new - held) + sorted(held - new):
                down = name in new
                if name == 'START' and down:
                    t_start = now
                rel = (now - t_start) / 1e6 if t_start is not None else float('nan')
                print(f'{name:<6} {"v" if down else "^"} {rel:12.3f} ms')
            held = new

            if now / 1e9 - last_stats >= 5:
                print(f'  [{reports / 5:.0f} reports/s, {gaps} counter gaps]')
                reports, gaps, last_stats = 0, 0, now / 1e9
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
