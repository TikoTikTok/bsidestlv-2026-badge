"""Pull a symbol out of a .kicad_sym library, flattened for schematic embedding.

Schematic files carry their own copy of every symbol under `lib_symbols`, keyed by
`"Lib:Name"`, and that copy must be self-contained: KiCad resolves `(extends ...)`
inheritance at save time, so a derived part like `Timer:TLC555xP` has to be written
out with its parent's graphics/pins inlined. `load()` does that resolution.
"""
from __future__ import annotations

import os
from typing import Dict, Optional

from ksexpr import N, Node, Sym, parse_file

SEARCH_DIRS = [
    "/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols",
    os.path.expanduser("~/Documents/KiCad/9.0/symbols"),
    "/usr/share/kicad/symbols",
]

_cache: Dict[str, Node] = {}


def _lib_path(lib: str, extra_dirs=()) -> str:
    for d in list(extra_dirs) + SEARCH_DIRS:
        p = os.path.join(d, lib + ".kicad_sym")
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"symbol library {lib!r} not found")


def _lib(lib: str, extra_dirs=()) -> Node:
    if lib not in _cache:
        _cache[lib] = parse_file(_lib_path(lib, extra_dirs))
    return _cache[lib]


def _raw(lib: str, name: str, extra_dirs=()) -> Node:
    for s in _lib(lib, extra_dirs).find_all("symbol"):
        if len(s) > 1 and str(s[1]) == name:
            return s
    raise KeyError(f"{lib}:{name} not in library")


def load(lib_id: str, extra_dirs=(), value: Optional[str] = None,
         footprint: Optional[str] = None) -> Node:
    """Return a `(symbol "Lib:Name" ...)` node ready to drop into `lib_symbols`.

    `extends` is resolved: body items (graphics sub-symbols, pin_numbers,
    pin_names) come from the ancestor, properties from the descendant where it
    overrides them. Sub-symbol names are rewritten to the child's name, which is
    what KiCad expects (`TLC555xP_0_1`, not `NE555P_0_1`).
    """
    lib, name = lib_id.split(":", 1)
    sym = _raw(lib, name, extra_dirs)

    chain = [sym]
    while (parent := chain[-1].value("extends")) is not None:
        chain.append(_raw(lib, str(parent), extra_dirs))
    base = chain[-1]  # root ancestor: source of graphics + pins

    out = N("symbol", name if ":" in lib_id else name)
    out[1] = lib_id  # quoted "Lib:Name"

    # Body flags from the root, unless the child restates them.
    for tag in ("power", "pin_numbers", "pin_names", "exclude_from_sim",
                "in_bom", "on_board"):
        node = None
        for s in chain:  # most-derived wins
            if s.first(tag) is not None:
                node = s.first(tag)
                break
        if node is None:
            node = base.first(tag)
        if node is not None:
            out.append(node)

    # Properties: most-derived definition of each name wins.
    seen = set()
    props = []
    for s in chain:
        for p in s.find_all("property"):
            key = str(p[1])
            if key not in seen:
                seen.add(key)
                props.append(p)
    order = {k: i for i, k in enumerate(
        ["Reference", "Value", "Footprint", "Datasheet", "Description"])}
    props.sort(key=lambda p: order.get(str(p[1]), 99))
    for p in props:
        p = Node(p)
        if value is not None and str(p[1]) == "Value":
            p[2] = value
        if footprint is not None and str(p[1]) == "Footprint":
            p[2] = footprint
        out.append(p)

    # Graphics + pins, renamed from the ancestor's prefix to this symbol's.
    root_name = str(base[1])
    for sub in base.find_all("symbol"):
        sub = Node(sub)
        sub[1] = str(sub[1]).replace(root_name, name, 1)
        out.append(sub)

    out.append(N("embedded_fonts", Sym("no")))
    return out


def prop(sym: Node, name: str) -> Optional[str]:
    """Value of a `(property "<name>" "<value>" ...)` child, or None."""
    for p in sym.find_all("property"):
        if len(p) > 2 and str(p[1]) == name:
            return str(p[2])
    return None


def pins(lib_id: str, extra_dirs=()):
    """{number: (name, x, y, rot)} in symbol-local mm coordinates."""
    sym = load(lib_id, extra_dirs)
    out = {}
    for sub in sym.find_all("symbol"):
        for p in sub.find_all("pin"):
            at = p.first("at")
            out[str(p.value("number"))] = (
                str(p.value("name")), float(at[1]), float(at[2]), float(at[3]))
    return out


if __name__ == "__main__":
    import sys
    from ksexpr import dumps
    if len(sys.argv) > 2 and sys.argv[2] == "--pins":
        for num, info in sorted(pins(sys.argv[1]), key=lambda kv: kv[0]):
            print(num, info)
    else:
        print(dumps(load(sys.argv[1])))
