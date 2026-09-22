"""Minimal S-expression reader/writer for KiCad files (no deps).

Parsing keeps enough type information to round-trip: quoted strings stay quoted,
bare tokens stay bare, numbers keep their original text so 39.37 never becomes
39.370000000000005.
"""
from __future__ import annotations

from typing import Iterator, List, Union


class Sym(str):
    """A bare token (unquoted atom), e.g. `yes`, `no`, `xy`, `0`, `39.37`."""
    __slots__ = ()


class Node(list):
    """An S-expression list. `node[0]` is the tag (a Sym)."""

    __slots__ = ()

    @property
    def tag(self) -> str:
        return str(self[0]) if self and isinstance(self[0], str) else ""

    def kids(self) -> Iterator["Node"]:
        for c in self:
            if isinstance(c, Node):
                yield c

    def find_all(self, tag: str) -> List["Node"]:
        return [c for c in self.kids() if c.tag == tag]

    def first(self, tag: str):
        for c in self.kids():
            if c.tag == tag:
                return c
        return None

    def value(self, tag: str):
        """Second element of the first child with `tag`, or None."""
        n = self.first(tag)
        return n[1] if n is not None and len(n) > 1 else None

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Node {self.tag} n={len(self)}>"


def _tokenize(text: str) -> Iterator[Union[str, Sym]]:
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n":
            i += 1
        elif c in "()":
            yield Sym(c)
            i += 1
        elif c == '"':
            i += 1
            buf = []
            while i < n:
                c = text[i]
                if c == "\\":
                    nxt = text[i + 1]
                    buf.append({"n": "\n", "t": "\t", "r": "\r"}.get(nxt, nxt))
                    i += 2
                elif c == '"':
                    i += 1
                    break
                else:
                    buf.append(c)
                    i += 1
            yield "".join(buf)  # plain str == quoted string
        else:
            j = i
            while j < n and text[j] not in ' \t\r\n()"':
                j += 1
            yield Sym(text[i:j])
            i = j


def parse(text: str) -> Node:
    stack: List[Node] = []
    root = None
    for tok in _tokenize(text):
        if isinstance(tok, Sym) and tok == "(":
            node = Node()
            if stack:
                stack[-1].append(node)
            else:
                root = node
            stack.append(node)
        elif isinstance(tok, Sym) and tok == ")":
            stack.pop()
        else:
            if stack:
                stack[-1].append(tok)
    if root is None:
        raise ValueError("no s-expression found")
    return root


def parse_file(path: str) -> Node:
    with open(path, encoding="utf-8") as fh:
        return parse(fh.read())


_ESC = str.maketrans({'"': '\\"', "\\": "\\\\", "\n": "\\n", "\t": "\\t", "\r": "\\r"})


def atom_str(a) -> str:
    if isinstance(a, Sym):
        return str(a)
    if isinstance(a, bool):
        return "yes" if a else "no"
    if isinstance(a, (int, float)):
        return repr(a)
    return '"' + str(a).translate(_ESC) + '"'


# Tags whose children are dumped on one line (matches eeschema's own style
# closely enough that KiCad's next save produces a small diff).
_INLINE = {"xy", "at", "size", "font", "pts_row"}


def dumps(node: Node, indent: int = 0, inline: bool = False) -> str:
    pad = "\t" * indent
    head = atom_str(node[0]) if node else ""
    rest = node[1:]
    if inline or node.tag in _INLINE or not any(isinstance(r, Node) for r in rest):
        body = " ".join(atom_str(r) if not isinstance(r, Node) else dumps(r, 0, True)
                        for r in rest)
        return f"{pad}({head}{' ' + body if body else ''})"
    # Leading scalars ride on the head line, the way eeschema writes
    # `(symbol "Device:R"` and `(property "Value" "1K"`.
    lead = []
    while rest and not isinstance(rest[0], Node):
        lead.append(atom_str(rest.pop(0)))
    lines = [f"{pad}({head}" + ("".join(" " + s for s in lead))]
    scalars = []
    for r in rest:
        if isinstance(r, Node):
            if scalars:
                lines.append("\t" * (indent + 1) + " ".join(scalars))
                scalars = []
            lines.append(dumps(r, indent + 1))
        else:
            scalars.append(atom_str(r))
    if scalars:
        lines.append("\t" * (indent + 1) + " ".join(scalars))
    lines.append(pad + ")")
    return "\n".join(lines)


def dump_file(node: Node, path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(dumps(node) + "\n")


def N(tag: str, *args) -> Node:
    """Build a Node. Bare tokens must be wrapped in Sym(); str stays quoted."""
    out = Node([Sym(tag)])
    out.extend(args)
    return out
