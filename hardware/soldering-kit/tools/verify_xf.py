"""Regression check for Sheet.xf against the ORIGINAL badge schematic.

The original file's wire endpoints are ground truth: KiCad wrote them, and every
one of them lands exactly on a symbol pin. Run this before trusting a generated
schematic. Pass the pre-change schematic (kept as
BSidesTLV26TinyBadge.kicad_sch.pre555) as argv[1].
"""
from __future__ import annotations

import sys

import symlib
from ksexpr import parse_file
from schbuild import Sheet

EXPECT = {  # ref: {pin: (x, y)} read off the original file's wiring
    "R2": {"1": (86.36, 58.42), "2": (93.98, 58.42)},
    "D1": {"2": (96.52, 46.99), "1": (104.14, 46.99)},
    "D4": {"2": (121.92, 39.37), "1": (129.54, 39.37)},
    "BAT1": {"1": (73.66, 52.07), "2": (73.66, 64.77)},
}


def main(path: str) -> int:
    root = parse_file(path)
    bad = 0
    for sym in root.find_all("symbol"):
        lib_id = sym.value("lib_id")
        if lib_id is None:
            continue
        ref = None
        for p in sym.find_all("property"):
            if str(p[1]) == "Reference":
                ref = str(p[2])
        if ref not in EXPECT:
            continue
        at = sym.first("at")
        ox, oy, rot = float(at[1]), float(at[2]), float(at[3])
        mir = sym.value("mirror")
        mir = str(mir) if mir is not None else None
        pins = symlib.pins(str(lib_id))
        for pn, want in EXPECT[ref].items():
            lx, ly = pins[pn][1], pins[pn][2]
            got = Sheet.xf(lx, ly, ox, oy, rot, mir)
            ok = abs(got[0] - want[0]) < 1e-6 and abs(got[1] - want[1]) < 1e-6
            print(f"{'ok  ' if ok else 'FAIL'} {ref}.{pn} got={got} want={want}")
            bad += not ok
    print("FAILURES:", bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
