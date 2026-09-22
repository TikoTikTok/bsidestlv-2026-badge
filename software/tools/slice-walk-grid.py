"""Slice a walk sheet laid out as a grid into 48x48 frames.

Two layouts are supported:
  wide  (default) 8 columns x 3 rows - one column per direction, one row per frame
  pairs           6 columns x 4 rows - two directions per row, three frames each

Some sheets are pose sheets rather than grids - the facing drifts across a row.
For those, drop a map in tools/sheet-maps/<name>.json naming the cells to use
per direction, which directions are mirrors of others, and which are aliases.

Cells are found from the alpha channel rather than assumed, so uneven margins
do not matter.

Each figure is scaled by ONE shared factor (so nobody grows or shrinks between
directions), centred on its cell and aligned to its column's baseline, so a
lifted foot still reads as lifted. Downsampling averages over the source
footprint with premultiplied alpha - the same soft result as resizing in an
image editor, and no dark fringe around the edges.

    python3 tools/slice-walk-grid.py references/white-rabbit-reference.png rabbit
    python3 tools/slice-walk-grid.py references/cheshire-reference.png cheshire --layout pairs
"""
import os, sys, struct, zlib
from pnglib import read_png, write_png, key_black

TARGET = 48          # output frame is TARGET x TARGET
BOTTOM_PAD = 1       # empty pixels under the feet
DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']   # left to right


def spans(flags, min_len=8):
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None: start = i
        elif not f and start is not None:
            out.append((start, i-1)); start = None
    if start is not None: out.append((start, len(flags)-1))
    return [s for s in out if s[1]-s[0] >= min_len]


def main(src, name, layout='wide'):
    import json
    map_path = os.path.join(os.path.dirname(__file__), 'sheet-maps', f'{name}.json')
    sheet_map = json.load(open(map_path)) if os.path.exists(map_path) else None
    if sheet_map:
        print(f'using hand-picked cell map {os.path.relpath(map_path)}')

    w, h, bpp, px = read_png(src)
    if bpp == 3:
        print('no alpha channel - keying the black background')
        px = key_black(w, h, bpp, px); bpp = 4
    elif bpp != 4:
        sys.exit(f'{src}: expected RGB or RGBA, got {bpp} channels')
    alpha = lambda x, y: px[(y*w+x)*bpp+3]
    rgba = lambda x, y: px[(y*w+x)*bpp:(y*w+x)*bpp+4]

    cols = spans([any(alpha(x, y) > 12 for y in range(0, h, 2)) for x in range(w)])
    rows = spans([any(alpha(x, y) > 12 for x in range(0, w, 2)) for y in range(h)])

    # cell -> (direction, frame). 'wide' reads across, 'pairs' reads two
    # directions per row.
    if layout == 'wide':
        want = (8, 3)
        slot = lambda ci, ri: (DIRECTIONS[ci], ri)
    else:
        want = (6, 4)
        slot = lambda ci, ri: (DIRECTIONS[ri*2 + ci//3], ci % 3)
    if (len(cols), len(rows)) != want:
        sys.exit(f'found {len(cols)} columns x {len(rows)} rows, expected '
                 f'{want[0]}x{want[1]} for layout \'{layout}\'')
    print(f'{layout} layout: {len(cols)} columns x {len(rows)} rows '
          f'-> {len(DIRECTIONS)} directions x 3 frames')

    # tight bounds of the figure inside every cell
    boxes = {}
    for ci, (cx0, cx1) in enumerate(cols):
        for ri, (ry0, ry1) in enumerate(rows):
            x0, x1, y0, y1 = cx1, cx0, ry1, ry0
            for y in range(ry0, ry1+1):
                for x in range(cx0, cx1+1):
                    if alpha(x, y) > 12:
                        x0 = min(x0, x); x1 = max(x1, x)
                        y0 = min(y0, y); y1 = max(y1, y)
            if x1 < x0: sys.exit(f'empty cell at column {ci+1}, row {ri+1}')
            boxes[(ci, ri)] = (x0, x1, y0, y1)

    # one scale for the whole sheet: the tallest figure fits the frame
    tallest = max(b[3]-b[2]+1 for b in boxes.values())
    widest = max(b[1]-b[0]+1 for b in boxes.values())
    scale = min((TARGET - BOTTOM_PAD) / tallest, TARGET / widest)
    print(f'source figures up to {widest}x{tallest}px -> scale {scale:.3f}')

    out_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'characters', name)
    os.makedirs(out_dir, exist_ok=True)

    # group the cells by the direction they belong to
    groups, mirrored = {}, {}
    if sheet_map:
        for d, cells_for_dir in sheet_map.get('cells', {}).items():
            groups[d] = {f: (c-1, r-1) for f, (r, c) in enumerate(cells_for_dir)}
        for dst, src in sheet_map.get('mirror', {}).items():
            groups[dst] = dict(groups[src]); mirrored[dst] = True
    else:
        for ci in range(len(cols)):
            for ri in range(len(rows)):
                d, f = slot(ci, ri)
                groups.setdefault(d, {})[f] = (ci, ri)

    for d, frames in groups.items():
        # baselines are measured inside each cell, never in sheet coordinates
        foot = {f: boxes[cell][3] - rows[cell[1]][0] for f, cell in frames.items()}
        baseline = max(foot.values())
        for fi, cell in sorted(frames.items()):
            ci, ri = cell
            cx0, cx1 = cols[ci]
            cell_mid = (cx0 + cx1) / 2
            x0, x1, y0, y1 = boxes[cell]
            sw, sh = x1-x0+1, y1-y0+1
            dw, dh = max(1, round(sw*scale)), max(1, round(sh*scale))
            # keep the figure's offset within its cell, and its column's baseline
            ox = round(TARGET/2 + (( (x0+x1)/2 - cell_mid) * scale) - dw/2)
            oy = TARGET - BOTTOM_PAD - dh - round((baseline - foot[fi]) * scale)

            flip = mirrored.get(d, False)
            buf = bytearray(TARGET*TARGET*4)
            for dy in range(dh):
                sy0 = y0 + dy*sh/dh
                sy1 = y0 + (dy+1)*sh/dh
                for dx in range(dw):
                    sx0 = x0 + dx*sw/dw
                    sx1 = x0 + (dx+1)*sw/dw
                    ar = ag = ab = aa = 0.0
                    n = 0
                    for sy in range(int(sy0), max(int(sy0)+1, int(-(-sy1//1)))):
                        if sy > y1: break
                        for sx in range(int(sx0), max(int(sx0)+1, int(-(-sx1//1)))):
                            if sx > x1: break
                            r, g, b, a = rgba(sx, sy)
                            f = a/255.0
                            ar += r*f; ag += g*f; ab += b*f; aa += f
                            n += 1
                    if not n: continue
                    tx, ty = (TARGET-1-(ox+dx)) if flip else ox+dx, oy+dy
                    if not (0 <= tx < TARGET and 0 <= ty < TARGET): continue
                    o = (ty*TARGET+tx)*4
                    if aa <= 0:
                        continue                       # fully transparent footprint
                    buf[o]   = min(255, round(ar/aa))  # un-premultiply
                    buf[o+1] = min(255, round(ag/aa))
                    buf[o+2] = min(255, round(ab/aa))
                    buf[o+3] = min(255, round(aa/n*255))
            write_png(os.path.join(out_dir, f'{d}{fi+1}.png'), TARGET, TARGET, buf)

    # aliases are baked as copies, so everything downstream sees a full set
    for dst, src in (sheet_map.get('alias', {}) if sheet_map else {}).items():
        for f in (1, 2, 3):
            data = open(os.path.join(out_dir, f'{src}{f}.png'), 'rb').read()
            open(os.path.join(out_dir, f'{dst}{f}.png'), 'wb').write(data)
        print(f'  {dst} aliased to {src}')
    written = len(groups) * 3 + len(sheet_map.get('alias', {}) if sheet_map else {}) * 3
    print(f'wrote {written} frames to assets/characters/{name}/')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    layout = 'pairs' if '--layout' in sys.argv and sys.argv[sys.argv.index('--layout')+1] == 'pairs' else 'wide'
    if '--layout' in sys.argv:
        args = [a for a in args if a != sys.argv[sys.argv.index('--layout')+1]]
    main(args[0], args[1], layout)
