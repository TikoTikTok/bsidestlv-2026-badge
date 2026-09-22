"""Schematic assembly helpers: place symbols, get absolute pin coords, draw wires.

The pin transform is the part worth stating explicitly, since getting it wrong
silently produces a schematic whose wires *look* attached but net out wrong:

    library point (lx, ly)
      -> mirror ('y' negates lx, 'x' negates ly)
      -> flip to screen coords (lx, -ly)          [library Y is up, sheet Y is down]
      -> rotate by the placement angle with
             [ cos t   sin t ]
             [-sin t   cos t ]
      -> translate by the symbol origin

Verified against the pre-existing BSidesTLV26TinyBadge schematic (R/LED at 90 deg
and 180 deg, `mirror y` parts, and the 90 deg battery holder all reproduce the
exact wire endpoints KiCad had written).
"""
from __future__ import annotations

import hashlib
import math
from typing import Dict, List, Optional, Tuple

import symlib
from ksexpr import N, Node, Sym


def _uuid(seed: str) -> str:
    """Deterministic UUID so re-running the generator yields a stable diff."""
    h = hashlib.sha1(seed.encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-4{h[13:16]}-8{h[17:20]}-{h[20:32]}"


def num(v: float) -> Sym:
    """Format a coordinate the way eeschema does (no trailing .0 noise)."""
    r = round(v, 4)
    if abs(r - round(r)) < 1e-9:
        return Sym(str(int(round(r))))
    return Sym(f"{r:g}")


def _hide() -> Node:
    return N("hide", Sym("yes"))


def _effects(size=1.27, justify: Optional[str] = None, hide: bool = False) -> Node:
    eff = N("effects", N("font", N("size", num(size), num(size))))
    if justify:
        eff.append(N("justify", Sym(justify)))
    if hide:
        eff.append(_hide())
    return eff


def _prop(name: str, value: str, x: float, y: float, rot: float = 0,
          hide: bool = False, justify: Optional[str] = None) -> Node:
    """A property field. `x`/`y` are absolute sheet coordinates, but the angle is
    applied *on top of* the symbol's own rotation by eeschema, so a field on a
    90-degree-rotated part needs 270 here to render horizontally."""
    return N("property", name, value,
             N("at", num(x), num(y), num(rot % 360)),
             _effects(justify=justify, hide=hide))


class Sheet:
    """Accumulates symbols/wires/junctions and emits a whole .kicad_sch."""

    def __init__(self, uuid_seed: str, paper: str = "A4",
                 project: str = "", extra_sym_dirs=()):
        self.paper = paper
        self.project = project
        self.uuid = _uuid(uuid_seed)
        self.extra_dirs = tuple(extra_sym_dirs)
        self.lib_syms: Dict[str, Node] = {}
        self.symbols: List[Node] = []
        self.texts: List[Node] = []
        self.nocons: List[Node] = []
        self._segs: List[Tuple[Tuple[float, float], Tuple[float, float]]] = []
        self._pins: Dict[str, Dict[str, Tuple[float, float]]] = {}
        self._pwr_n = 0

    # ---------------- geometry ----------------

    @staticmethod
    def xf(lx: float, ly: float, ox: float, oy: float, rot: float,
           mirror: Optional[str]) -> Tuple[float, float]:
        if mirror == "y":
            lx = -lx
        elif mirror == "x":
            ly = -ly
        px, py = lx, -ly
        t = math.radians(rot)
        c, s = math.cos(t), math.sin(t)
        return (ox + px * c + py * s, oy - px * s + py * c)

    def pin(self, ref: str, number: str) -> Tuple[float, float]:
        return self._pins[ref][str(number)]

    # ---------------- placement ----------------

    def place(self, lib_id: str, ref: str, x: float, y: float, rot: float = 0,
              mirror: Optional[str] = None, value: Optional[str] = None,
              footprint: Optional[str] = None, extra_props=(),
              ref_off: Tuple[float, float] = (0, 0),
              val_off: Optional[Tuple[float, float]] = None,
              hide_value: bool = False, unit: int = 1) -> str:
        if lib_id not in self.lib_syms:
            self.lib_syms[lib_id] = symlib.load(lib_id, self.extra_dirs)

        lib_pins = symlib.pins(lib_id, self.extra_dirs)
        self._pins[ref] = {
            n: self.xf(px, py, x, y, rot, mirror)
            for n, (_, px, py, _r) in lib_pins.items()
        }

        base = symlib.load(lib_id, self.extra_dirs)
        is_power = base.first("power") is not None

        sym = N("symbol", N("lib_id", lib_id), N("at", num(x), num(y), num(rot)))
        if mirror:
            sym.append(N("mirror", Sym(mirror)))
        sym.extend([
            N("unit", Sym(str(unit))),
            N("exclude_from_sim", Sym("no")),
            N("in_bom", Sym("no" if is_power else "yes")),
            N("on_board", Sym("yes")),
            N("dnp", Sym("no")),
            N("fields_autoplaced", Sym("yes")),
            N("uuid", _uuid(f"{self.uuid}:sym:{ref}")),
        ])

        # eeschema renders a field at (symbol angle + field angle). These are the
        # field angles that come back out upright and horizontal; measured by
        # rendering a 4x4 matrix of symbol/field angles to SVG and checking the
        # glyph bounding boxes.
        trot = {0: 0, 90: 270, 180: 0, 270: 90}[int(rot) % 360]
        rx, ry = x + ref_off[0], y + ref_off[1]
        vx, vy = (x + val_off[0], y + val_off[1]) if val_off else (rx, ry + 2.54)
        sym.append(_prop("Reference", ref, rx, ry, trot, hide=is_power))
        lib_val = symlib.prop(base, "Value") or ""
        sym.append(_prop("Value", value if value is not None else lib_val,
                         vx, vy, trot, hide=hide_value or is_power))
        sym.append(_prop("Footprint",
                         footprint if footprint is not None
                         else (symlib.prop(base, "Footprint") or ""),
                         x, y, trot, hide=True))
        sym.append(_prop("Datasheet", symlib.prop(base, "Datasheet") or "~",
                         x, y, trot, hide=True))
        sym.append(_prop("Description", symlib.prop(base, "Description") or "",
                         x, y, trot, hide=True))
        for pname, pval in extra_props:
            sym.append(_prop(pname, pval, x, y, trot, hide=True))

        for n in lib_pins:
            sym.append(N("pin", str(n), N("uuid", _uuid(f"{self.uuid}:{ref}:p{n}"))))

        sym.append(N("instances",
                     N("project", self.project,
                       N("path", f"/{self.uuid}",
                         N("reference", ref), N("unit", Sym(str(unit)))))))
        self.symbols.append(sym)
        return ref

    def power(self, kind: str, x: float, y: float, rot: float = 0) -> str:
        """Place a power:VCC / power:GND flag. Its pin sits exactly on (x, y)."""
        self._pwr_n += 1
        ref = f"#PWR{self._pwr_n:02d}"
        self.place(f"power:{kind}", ref, x, y, rot, value=kind,
                   ref_off=(0, -3.81 if kind == "VCC" else 3.81))
        return ref

    # ---------------- connectivity ----------------

    def wire(self, *pts: Tuple[float, float]) -> None:
        """Record a polyline of axis-aligned segments.

        Segments are stored, not emitted: `build()` first splits every segment at
        any point where another segment ends or a pin sits mid-span. KiCad's
        connectivity engine does NOT walk through the interior of a wire — a
        T-tap on an unsplit segment silently drops the far half of that wire from
        the net, which is exactly the kind of error that only shows up in the
        netlist. See `_resolve()`.
        """
        for a, b in zip(pts, pts[1:]):
            if abs(a[0] - b[0]) > 1e-6 and abs(a[1] - b[1]) > 1e-6:
                raise ValueError(f"segment {a}-{b} is not orthogonal")
            if abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6:
                continue
            self._segs.append((a, b))

    def junction(self, x: float, y: float) -> None:
        """Deprecated no-op: `build()` places junctions where they are needed."""

    # -- wire graph resolution -------------------------------------------------

    @staticmethod
    def _key(p: Tuple[float, float]) -> Tuple[float, float]:
        return (round(p[0], 3), round(p[1], 3))

    def _resolve(self):
        """Split segments at interior connection points; return (segs, junctions)."""
        pin_pts = {self._key(p) for pins in self._pins.values() for p in pins.values()}
        pts = set(pin_pts)
        for a, b in self._segs:
            pts.add(self._key(a))
            pts.add(self._key(b))

        segs = []
        for a, b in self._segs:
            ka, kb = self._key(a), self._key(b)
            vertical = abs(ka[0] - kb[0]) < 1e-9
            axis = 1 if vertical else 0
            lo, hi = sorted((ka[axis], kb[axis]))
            on = [p for p in pts
                  if abs(p[1 - axis] - ka[1 - axis]) < 1e-9 and lo <= p[axis] <= hi]
            on.sort(key=lambda p: p[axis])
            for p, q in zip(on, on[1:]):
                segs.append((p, q))

        deg: Dict[Tuple[float, float], int] = {}
        for a, b in segs:
            deg[a] = deg.get(a, 0) + 1
            deg[b] = deg.get(b, 0) + 1
        # KiCad draws a junction where 3+ wire ends meet, and where a wire runs
        # through a pin rather than terminating on it.
        junc = sorted(p for p, d in deg.items()
                      if d >= 3 or (d >= 2 and p in pin_pts))
        return segs, junc

    def no_connect(self, ref: str, *numbers: str) -> None:
        """Mark pins deliberately unused, so ERC stays quiet about them."""
        for n in numbers:
            x, y = self.pin(ref, str(n))
            self.nocons.append(N("no_connect", N("at", num(x), num(y)),
                                 N("uuid", _uuid(f"{self.uuid}:nc:{ref}.{n}"))))

    def text(self, s: str, x: float, y: float, size: float = 1.27) -> None:
        self.texts.append(N("text", s, N("at", num(x), num(y), Sym("0")),
                            N("effects", N("font", N("size", num(size), num(size))),
                              N("justify", Sym("left"), Sym("bottom"))),
                            N("uuid", _uuid(f"{self.uuid}:t:{x},{y}"))))

    # ---------------- output ----------------

    def build(self) -> Node:
        root = N("kicad_sch",
                 N("version", Sym("20250114")),
                 N("generator", "eeschema"),
                 N("generator_version", "9.0"),
                 N("uuid", self.uuid),
                 N("paper", self.paper))
        libs = N("lib_symbols")
        for lib_id in sorted(self.lib_syms):
            libs.append(self.lib_syms[lib_id])
        root.append(libs)

        segs, junc = self._resolve()
        for x, y in junc:
            root.append(N("junction", N("at", num(x), num(y)),
                          N("diameter", Sym("0")),
                          N("color", Sym("0"), Sym("0"), Sym("0"), Sym("0")),
                          N("uuid", _uuid(f"{self.uuid}:j:{x},{y}"))))
        for (x1, y1), (x2, y2) in segs:
            root.append(N("wire",
                          N("pts", N("xy", num(x1), num(y1)),
                            N("xy", num(x2), num(y2))),
                          N("stroke", N("width", Sym("0")),
                            N("type", Sym("default"))),
                          N("uuid", _uuid(f"{self.uuid}:w:{x1},{y1},{x2},{y2}"))))
        root.extend(self.nocons)
        root.extend(self.texts)
        root.extend(self.symbols)
        root.append(N("sheet_instances", N("path", "/", N("page", "1"))))
        root.append(N("embedded_fonts", Sym("no")))
        return root
