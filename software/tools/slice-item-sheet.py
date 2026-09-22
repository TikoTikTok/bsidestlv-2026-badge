"""Slice references/assets-reference.png into one PNG per item.

Rows and the items inside each row are found from the pixels, so the last row
holding eight items instead of six needs no special case.

Every item is scaled by ONE shared factor, so a key stays small next to a
boulder - relative size is part of the art. Items are centred and sit on the
bottom of a 48x48 frame, the same size as the character frames, so a sprite and
an item can be placed on the same grid without any per-asset fiddling.

    python3 tools/slice-item-sheet.py
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pnglib import read_png, write_png, key_black

SRC = os.path.join(os.path.dirname(__file__), '..', 'references', 'assets-reference.png')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'items')
TARGET = 48
BOTTOM_PAD = 1

# row by row, left to right
NAMES = [
    ('scenery', ['rock_small', 'rock_pair', 'rock_pile', 'rock_daisies', 'rock_bluebells', 'rock_mossy']),
    ('scenery', ['mushroom_red_small', 'mushroom_red', 'mushroom_red_trio',
                 'mushroom_blue', 'mushroom_blue_trio', 'mushroom_mixed']),
    ('book',    ['book_heart', 'book_spade', 'book_club', 'book_diamond', 'book_open', 'book_stack']),
    ('teapot',  ['teapot_heart_blue', 'teapot_diamond', 'teapot_club',
                 'teapot_heart_red', 'teapot_striped', 'teapot_bow']),
    ('teacup',  ['teacup_heart_blue', 'teacup_diamond', 'teacup_club',
                 'teacup_heart_red', 'teacup_striped', 'teacup_stack']),
    ('potion',  ['potion_red', 'potion_blue', 'potion_yellow',
                 'potion_heart', 'potion_star', 'potion_purple']),
    ('token',   ['key_heart', 'key_club', 'key_diamond', 'key_spade',
                 'card_hearts', 'card_clubs', 'card_diamonds', 'card_spades']),
]


def spans(flags, min_len=6):
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None: start = i
        elif not f and start is not None:
            out.append((start, i-1)); start = None
    if start is not None: out.append((start, len(flags)-1))
    return [s for s in out if s[1]-s[0] >= min_len]


def main():
    w, h, bpp, px = read_png(SRC)
    if bpp == 3:
        px = key_black(w, h, bpp, px); bpp = 4
    alpha = lambda x, y: px[(y*w+x)*bpp+3]
    rgba = lambda x, y: px[(y*w+x)*bpp:(y*w+x)*bpp+4]

    rows = spans([any(alpha(x, y) > 12 for x in range(0, w, 2)) for y in range(h)])
    if len(rows) != len(NAMES):
        sys.exit(f'found {len(rows)} rows, but {len(NAMES)} rows are named')

    # tight bounds for every item, row by row
    items = []
    for ri, (ry0, ry1) in enumerate(rows):
        cols = spans([any(alpha(x, y) > 12 for y in range(ry0, ry1+1, 2)) for x in range(w)])
        category, names = NAMES[ri]
        if len(cols) != len(names):
            sys.exit(f'row {ri+1}: found {len(cols)} items, but {len(names)} are named')
        for ci, (cx0, cx1) in enumerate(cols):
            x0, x1, y0, y1 = cx1, cx0, ry1, ry0
            for y in range(ry0, ry1+1):
                for x in range(cx0, cx1+1):
                    if alpha(x, y) > 12:
                        x0 = min(x0, x); x1 = max(x1, x)
                        y0 = min(y0, y); y1 = max(y1, y)
            items.append({'name': names[ci], 'category': category, 'box': (x0, x1, y0, y1)})

    # one scale for the whole sheet keeps a key small and a boulder big
    tallest = max(i['box'][3]-i['box'][2]+1 for i in items)
    widest = max(i['box'][1]-i['box'][0]+1 for i in items)
    scale = min((TARGET - BOTTOM_PAD) / tallest, TARGET / widest)
    print(f'{len(items)} items, largest {widest}x{tallest}px -> scale {scale:.3f}')

    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for item in items:
        x0, x1, y0, y1 = item['box']
        sw, sh = x1-x0+1, y1-y0+1
        dw, dh = max(1, round(sw*scale)), max(1, round(sh*scale))
        ox = round(TARGET/2 - dw/2)
        oy = TARGET - BOTTOM_PAD - dh

        buf = bytearray(TARGET*TARGET*4)
        for dy in range(dh):
            sy0, sy1 = y0 + dy*sh/dh, y0 + (dy+1)*sh/dh
            for dx in range(dw):
                sx0, sx1 = x0 + dx*sw/dw, x0 + (dx+1)*sw/dw
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
                if not n or aa <= 0: continue
                tx, ty = ox+dx, oy+dy
                if not (0 <= tx < TARGET and 0 <= ty < TARGET): continue
                o = (ty*TARGET+tx)*4
                buf[o]   = min(255, round(ar/aa))
                buf[o+1] = min(255, round(ag/aa))
                buf[o+2] = min(255, round(ab/aa))
                buf[o+3] = min(255, round(aa/n*255))

        write_png(os.path.join(OUT, f"{item['name']}.png"), TARGET, TARGET, buf)
        manifest.append({'name': item['name'], 'category': item['category'],
                         'file': f"{item['name']}.png",
                         'width': round(sw*scale), 'height': round(sh*scale)})

    json.dump({'size': TARGET, 'source': 'assets-reference.png', 'items': manifest},
              open(os.path.join(OUT, 'items.json'), 'w'), indent=2)
    print(f'wrote {len(manifest)} items to assets/items/')


if __name__ == '__main__':
    main()
