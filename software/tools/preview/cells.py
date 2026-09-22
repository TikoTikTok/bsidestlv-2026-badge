"""Lay a reference sheet out cell by cell, in sheet order.

This is the tool for writing tools/sheet-maps/<name>.json: it shows the grid the
way the map file indexes it, [row, col] 1-based, so you can read off which cell
belongs to which direction instead of guessing.

    python3 tools/preview/cells.py queen-reference.png out.png [scale]
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pnglib import read_png, write_png, key_black


def spans(flags, min_len=8):
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None: start = i
        elif not f and start is not None:
            out.append((start, i-1)); start = None
    if start is not None: out.append((start, len(flags)-1))
    return [s for s in out if s[1]-s[0] >= min_len]


def main(src, out, scale=0.75):
    w, h, bpp, px = read_png(src)
    if bpp == 3:
        px = key_black(w, h, bpp, px); bpp = 4
    alpha = lambda x, y: px[(y*w+x)*bpp+3]

    rows = spans([any(alpha(x, y) > 12 for x in range(0, w, 3)) for y in range(h)])
    cols = spans([any(alpha(x, y) > 12 for y in range(0, h, 3)) for x in range(w)])
    cw = max(c[1]-c[0]+1 for c in cols)
    ch = max(r[1]-r[0]+1 for r in rows)
    ow, oh = int(cw*scale), int(ch*scale)
    W, H = ow*len(cols), oh*len(rows)
    buf = bytearray(W*H*4)

    for ry, (y0, y1) in enumerate(rows):
        for cx, (x0, x1) in enumerate(cols):
            for oy in range(oh):
                sy = y0 + int(oy/scale)
                if sy > y1: break
                for ox in range(ow):
                    sx = x0 + int(ox/scale)
                    if sx > x1: break
                    o = (sy*w+sx)*bpp
                    t = ((ry*oh+oy)*W + cx*ow+ox)*4
                    if alpha(sx, sy) > 12:
                        buf[t:t+4] = bytes((px[o], px[o+1], px[o+2], 255))
                    else:
                        on = (((cx*ow+ox)//10) + ((ry*oh+oy)//10)) % 2 == 0
                        buf[t:t+4] = bytes((0x1b, 0x24, 0x36, 255) if on else (0x25, 0x2f, 0x44, 255))
    write_png(out, W, H, buf)
    print(f'{out}: {len(cols)} columns x {len(rows)} rows, cells indexed [row, col] from 1')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 0.75)
