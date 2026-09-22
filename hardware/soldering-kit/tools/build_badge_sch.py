#!/usr/bin/env python3
"""Generate BSidesTLV26TinyBadge.kicad_sch: CR2032 -> 555 astable -> CD4017 -> 4 LEDs.

All parts are through-hole. The 555 is the CMOS TLC555P rather than a bipolar
NE555 because the supply is a single CR2032 (3.0 V nominal, ~2.0 V end of life)
and the bipolar part needs 4.5 V minimum; TLC555 runs from 2 V and sinks/sources
enough for a CD4017 clock input at a few microamps of quiescent draw.

Topology
    BAT1 (+) ................................. VCC          BAT1 (-) .... GND
    U1 TLC555P astable:
        R1 10k   VCC        -> pin 7 (DIS)
        RV1 500k pin 7      -> pin 6 (THR)      (wiper strapped to pin 1 =
                                                 rheostat, so it is the
                                                 frequency control)
        C1 1uF   pin 2/6    -> GND
        pin 2 (TR) tied to pin 6 (THR)
        pin 4 (RESET) -> VCC, pin 5 (CV) -> C2 10n -> GND
        pin 3 (Q) -> U2 pin 14 (CLK)
        f = 1.44 / ((R1 + 2*RV1) * C1)  ->  ~1.4 Hz (pot max) to ~144 Hz (pot min)
    U2 CD4017 decade counter:
        pin 13 (CKEN, active low) -> GND, pin 16 -> VCC, pin 8 -> GND
        pin 10 (Q4) -> pin 15 (RESET)   so the sequence wraps after Q3:
                                        Q0,Q1,Q2,Q3,Q0,... = 4-step chase
        Q0..Q3 -> R2..R5 470R -> D1..D4 -> GND

Run:  python3 tools/build_badge_sch.py [-o out.kicad_sch]
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ksexpr import dumps  # noqa: E402
from schbuild import Sheet  # noqa: E402

FP_R = "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal"
FP_C = "Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm"
FP_LED = "LED_THT:LED_D4.0mm"
FP_POT = "Potentiometer_THT:Potentiometer_Bourns_3296W_Vertical"


def build() -> Sheet:
    sh = Sheet("BSidesTLV26TinyBadge/555-cd4017", paper="A4",
               project="BSidesTLV26TinyBadge")

    # ---------------------------------------------------------------- power in
    sh.place("cr2032-holder:BS-02-A1AJ010", "BAT1", 38.1, 114.3, rot=90,
             value="CR2032", footprint="Battery:CR2032",
             extra_props=[("MPN", "C5239862")],
             ref_off=(-11.43, -1.27), val_off=(-11.43, 1.27))
    bp, bm = sh.pin("BAT1", "1"), sh.pin("BAT1", "2")
    sh.wire(bp, (bp[0], 104.14))
    sh.power("VCC", bp[0], 104.14)
    sh.wire(bm, (bm[0], 125.73))
    sh.power("GND", bm[0], 125.73)
    # The holder's negative terminal is a passive pin, so ERC has nothing marking
    # GND as driven -> one PWR_FLAG on the return path.
    sh.wire((bm[0], 123.19), (31.75, 123.19))
    sh.place("power:PWR_FLAG", "#FLG01", 31.75, 123.19, rot=90)

    # supply decoupling next to the two ICs
    sh.place("Device:C", "C3", 50.8, 114.3, value="100n", footprint=FP_C,
             ref_off=(2.54, -1.27), val_off=(2.54, 1.27))
    c3a, c3b = sh.pin("C3", "1"), sh.pin("C3", "2")
    sh.wire(c3a, (c3a[0], 104.14))
    sh.power("VCC", c3a[0], 104.14)
    sh.wire(c3b, (c3b[0], 125.73))
    sh.power("GND", c3b[0], 125.73)

    # ------------------------------------------------------------ 555 astable
    sh.place("Timer:TLC555xP", "U1", 95.25, 116.84, value="TLC555P",
             footprint="Package_DIP:DIP-8_W7.62mm",
             ref_off=(-11.43, -17.78), val_off=(3.81, -17.78))
    tr = sh.pin("U1", "2")     # (82.55, 111.76)
    cv = sh.pin("U1", "5")     # (82.55, 116.84)
    rst = sh.pin("U1", "4")    # (82.55, 121.92)
    q = sh.pin("U1", "3")      # (107.95, 111.76)
    dis = sh.pin("U1", "7")    # (107.95, 116.84)
    thr = sh.pin("U1", "6")    # (107.95, 121.92)
    vcc8, gnd1 = sh.pin("U1", "8"), sh.pin("U1", "1")

    sh.wire(vcc8, (vcc8[0], 106.68 - 5.08))
    sh.power("VCC", vcc8[0], 101.6)
    sh.wire(gnd1, (gnd1[0], 132.08))
    sh.power("GND", gnd1[0], 132.08)

    # RESET (pin 4) held high
    sh.wire(rst, (77.47, rst[1]))
    sh.power("VCC", 77.47, rst[1], rot=90)          # stem points left

    # CONTROL VOLTAGE (pin 5) bypass
    sh.place("Device:C", "C2", 71.12, 120.65, value="10n", footprint=FP_C,
             ref_off=(-6.35, -1.27), val_off=(-6.35, 1.27))
    sh.wire(cv, sh.pin("C2", "1"))
    sh.wire(sh.pin("C2", "2"), (71.12, 129.54))
    sh.power("GND", 71.12, 129.54)

    # TRIGGER (pin 2) strapped to THRESHOLD (pin 6): out and around underneath
    sh.wire(tr, (64.77, tr[1]), (64.77, 143.51), (120.65, 143.51),
            (120.65, thr[1]), thr)

    # timing capacitor on the TR/THR node
    sh.place("Device:C", "C1", 113.03, 128.27, value="1u", footprint=FP_C,
             ref_off=(2.54, -1.27), val_off=(2.54, 1.27))
    sh.wire(sh.pin("C1", "1"), (113.03, thr[1]))
    sh.wire(sh.pin("C1", "2"), (113.03, 135.89))
    sh.power("GND", 113.03, 135.89)

    # charge resistor: VCC -> DISCHARGE (pin 7)
    sh.wire(dis, (133.35, dis[1]))
    sh.place("Device:R", "R1", 128.27, 109.22, value="10k", footprint=FP_R,
             ref_off=(3.81, -2.54), val_off=(3.81, 0))
    sh.wire(sh.pin("R1", "2"), (128.27, dis[1]))
    sh.wire(sh.pin("R1", "1"), (128.27, 101.6))
    sh.power("VCC", 128.27, 101.6)

    # frequency pot as a rheostat between DIS (pin 7) and THR (pin 6)
    sh.place("Device:R_Potentiometer", "RV1", 137.16, 116.84, rot=90,
             value="500k", footprint=FP_POT,
             ref_off=(0, -11.43), val_off=(0, -8.89))
    rv_dis, rv_thr, rv_w = sh.pin("RV1", "1"), sh.pin("RV1", "3"), sh.pin("RV1", "2")
    sh.wire(rv_w, (rv_w[0], 109.22), (rv_dis[0], 109.22), rv_dis)
    sh.wire(rv_thr, (143.51, rv_thr[1]), (143.51, thr[1]), (120.65, thr[1]))

    # ------------------------------------------------------- CD4017 counter
    sh.place("4xxx:4017", "U2", 167.64, 109.22, value="CD4017BE",
             footprint="Package_DIP:DIP-16_W7.62mm",
             ref_off=(-13.97, -31.75), val_off=(3.81, -31.75))
    clk = sh.pin("U2", "14")
    cken = sh.pin("U2", "13")
    u2rst = sh.pin("U2", "15")
    vdd, vss = sh.pin("U2", "16"), sh.pin("U2", "8")
    q4 = sh.pin("U2", "10")

    sh.wire(vdd, (vdd[0], 85.09))
    sh.power("VCC", vdd[0], 85.09)
    sh.wire(vss, (vss[0], 135.89))
    sh.power("GND", vss[0], 135.89)

    # 555 output clocks the counter
    sh.wire(q, (q[0], clk[1]), clk)

    # clock enable is active low -> tie low so every 555 edge counts
    sh.wire(cken, (149.86, cken[1]))
    sh.power("GND", 149.86, cken[1], rot=270)       # stem points left

    # Q4 -> RESET truncates the decade counter to a 4-state ring
    sh.wire(u2rst, (146.05, u2rst[1]), (146.05, 142.24), (185.42, 142.24),
            (185.42, q4[1]), q4)

    # Q5..Q9 and the carry-out are deliberately unused by the 4-step chase.
    sh.no_connect("U2", "1", "5", "6", "9", "11", "12")

    # ------------------------------------------------------------ LED outputs
    # Staircase fan-out: lower CD4017 pins turn down at a smaller x, so the four
    # branches never cross. Each row is  Qn -> Rn -> Dn(anode..cathode) -> GND.
    rows = [
        ("3", "R2", "D1", 198.12, 96.52),   # Q0
        ("2", "R3", "D2", 195.58, 106.68),  # Q1
        ("4", "R4", "D3", 193.04, 116.84),  # Q2
        ("7", "R5", "D4", 190.5, 127.0),    # Q3
    ]
    for qpin, rref, dref, xturn, yrow in rows:
        qxy = sh.pin("U2", qpin)
        sh.wire(qxy, (xturn, qxy[1]), (xturn, yrow))

        sh.place("Device:R", rref, xturn + 7.62, yrow, rot=90, value="470R",
                 footprint=FP_R, ref_off=(0, -3.302), val_off=(0, 3.302))
        sh.wire((xturn, yrow), sh.pin(rref, "1"))

        sh.place("Device:LED", dref, xturn + 19.05, yrow, rot=180,
                 value="LED", footprint=FP_LED,
                 ref_off=(1.5875, -7.62), val_off=(1.5875, -5.08))
        sh.wire(sh.pin(rref, "2"), sh.pin(dref, "2"))       # pin 2 = anode
        k = sh.pin(dref, "1")                               # pin 1 = cathode
        sh.wire(k, (k[0] + 3.81, yrow), (k[0] + 3.81, yrow + 5.08))
        sh.power("GND", k[0] + 3.81, yrow + 5.08)

    # ----------------------------------------------------------------- notes
    sh.text("BSidesTLV 2026 Tiny Badge - 555 / CD4017 LED chaser", 33.02, 60.96,
            size=2.0)
    sh.text("CR2032 (3.0V) supply: CMOS TLC555P used - a bipolar NE555 needs 4.5V min.",
            33.02, 66.04)
    sh.text("Blink rate f = 1.44 / ((R1 + 2*RV1) * C1)  =  1.4 Hz .. 144 Hz via RV1.",
            33.02, 69.85)
    sh.text("CD4017 Q4 -> RESET truncates the decade count to Q0..Q3 (4-LED chase).",
            33.02, 73.66)
    sh.text("All parts through-hole.", 33.02, 77.47)
    return sh


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", default=os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "BSidesTLV26TinyBadge.kicad_sch"))
    args = ap.parse_args()
    text = dumps(build().build()) + "\n"
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"wrote {args.out} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
