"""Render a folder of frames as one contact sheet, on a checkerboard.

The fastest way to see whether a slice came out right.

    python3 tools/preview/contact.py assets/characters/queen out.png [scale]
    python3 tools/preview/contact.py assets/items out.png 2
"""
import os, sys, json, struct, zlib
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pnglib import read_png, write_png

DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']


def checker(buf, w, h):
    for i in range(w*h):
        if buf[i*4+3] == 0:
            on = (((i % w)//8) + ((i//w)//8)) % 2 == 0
            buf[i*4:i*4+4] = bytes((0x1b, 0x24, 0x36, 255) if on else (0x25, 0x2f, 0x44, 255))


def frames_in(folder):
    """A character folder lays out as 8 directions x 3 frames; anything else
    (items, tiles) is listed in its manifest order."""
    names = {f.lower()[:-4] for f in os.listdir(folder) if f.lower().endswith('.png')}
    if all(f'{d}{n}' in names for d in DIRS for n in (1, 2, 3)):
        grid = [[f'{d}{n}' for n in (1, 2, 3)] for d in DIRS]
        return grid, 3
    manifest = next((f for f in os.listdir(folder) if f.endswith('.json')), None)
    if manifest:
        data = json.load(open(os.path.join(folder, manifest)))
        entries = data.get('items') or data.get('tiles') or []
        flat = [e['name'] for e in entries]
    else:
        flat = sorted(names)
    cols = 8
    return [flat[i:i+cols] for i in range(0, len(flat), cols)], cols


def find(folder, stem):
    for cand in (stem, stem.upper(), stem.capitalize()):
        p = os.path.join(folder, cand + '.png')
        if os.path.exists(p):
            return p
    raise SystemExit(f'missing frame: {stem}.png in {folder}')


def main(folder, out, scale=3):
    grid, cols = frames_in(folder)
    first = read_png(find(folder, grid[0][0]))
    fw, fh = first[0], first[1]
    W, H = fw*scale*cols, fh*scale*len(grid)
    buf = bytearray(W*H*4)

    for ry, row in enumerate(grid):
        for cx, stem in enumerate(row):
            w, h, bpp, px = read_png(find(folder, stem))
            for y in range(h):
                for x in range(w):
                    o = (y*w+x)*bpp
                    if px[o+3] <= 12: continue
                    for sy in range(scale):
                        for sx in range(scale):
                            t = (((ry*fh+y)*scale+sy)*W + (cx*fw+x)*scale+sx)*4
                            buf[t:t+4] = bytes((px[o], px[o+1], px[o+2], 255))
    checker(buf, W, H)
    write_png(out, W, H, buf)
    print(f'{out}: {W}x{H}, {sum(len(r) for r in grid)} frames')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 3)
