"""Slice the tile sheets into 48x48 assets under assets/tiles/.

Two sheets, one manifest:

  references/tiles-reference.png   floors, walls, doors, buttons, levers
  references/assets-reference2.png a much wider set - floors, banner walls, hedges,
                        pillars and rose balustrades

Two fit policies, because these are two kinds of art:

  tile    floors and walls fill the whole 48x48 cell - they are the grid, and a
          gap around them would read as a seam
  prop    doors, buttons and levers keep their aspect and sit on the bottom of
          the cell, scaled by ONE shared factor so a button stays smaller than
          a door

Resampling averages the source footprint with premultiplied alpha, so the faint
coloured halo on these sheets (alpha 1-4) contributes essentially nothing and
no keying or clean-up pass touches the colours.

    python3 tools/slice-tile-sheet.py
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pnglib import read_png, write_png, key_black

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', 'site', 'assets', 'tiles')
TARGET = 48
MIN_AREA = 40 * 40

# Rows are found from the pixels, except where sprites in neighbouring rows
# nearly touch - the second sheet's walls do, so those bands are given.
SHEETS = [
    {
        'file': 'tiles-reference.png',
        'rows': [
            ('floor',  'tile', ['floor_checker', 'floor_cobble', 'floor_grass_flowers',
                                'floor_grass_patch', 'floor_marble', 'floor_carpet_red']),
            ('wall',   'tile', ['wall_stone_banners', 'wall_stone_blue', 'wall_stone_corner',
                                'hedge_rail', 'hedge_rail_corner', 'wall_gold_banner',
                                'wall_gold_corner']),
            ('door',   'prop', ['door_wood_closed', 'door_wood_open',
                                'door_heart_closed', 'door_heart_open']),
            ('button', 'prop', ['button_heart_up', 'button_heart_down', 'button_mushroom_up',
                                'button_mushroom_down', 'lever_up', 'lever_down']),
        ],
    },
    {
        'file': 'assets-reference2.png',
        'bands': [(20, 168), (178, 324), (336, 523), (528, 679), (687, 855), (869, 1027)],
        'rows': [
            ('floor',  'tile', ['floor_checker_blue', 'floor_diamond_blue', 'floor_checker_framed',
                                'floor_cobble_moss', 'floor_cobble_cracked', 'floor_grass_roses',
                                'floor_dirt_patch', 'floor_dirt_cross', 'floor_grass_clover']),
            ('floor',  'tile', ['floor_marble_heart', 'floor_carpet_heart', 'floor_marble_plain',
                                'floor_marble_cracked', 'floor_marble_veined', 'trim_blue_corner',
                                'trim_blue_corner_heart', 'trim_blue_straight', 'trim_blue_elbow']),
            ('wall',   'tile', ['wall_blue', 'wall_blue_banner_white', 'wall_blue_banner_red',
                                'wall_blue_corner', 'wall_post_banner_white', 'wall_post_banner_red',
                                'wall_blue_pillar', 'wall_blue_post_banner', 'wall_blue_corner_out']),
            ('hedge',  'tile', ['hedge_daisies', 'hedge_roses', 'hedge_post_left',
                                'hedge_post_right', 'hedge_wide', 'pillar_rose', 'pillar_plain',
                                'pillar_heart', 'pillar_blue', 'pillar_rose_short',
                                'pillar_blue_short']),
            ('wall',   'tile', ['wall_gold_banner_red', 'wall_gold_banner_heart',
                                'wall_gold_banner_tall', 'wall_gold_corner_in',
                                'wall_gold_medallion', 'wall_gold_banner_plain', 'wall_gold_heart',
                                'wall_gold_pennant', 'wall_gold_corner_banner']),
            ('rail',   'tile', ['rail_roses_long', 'rail_roses_dense', 'rail_roses_slope',
                                'rail_roses_post', 'rail_roses_block', 'rail_roses_corner',
                                'rail_roses_end']),
        ],
    },
]


def spans(flags, min_len=6):
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None: start = i
        elif not f and start is not None:
            out.append((start, i-1)); start = None
    if start is not None: out.append((start, len(flags)-1))
    return [s for s in out if s[1]-s[0] >= min_len]


def resample(rgba_at, box, dw, dh):
    """Area-average the source box into a dw x dh buffer, premultiplied."""
    x0, x1, y0, y1 = box
    sw, sh = x1-x0+1, y1-y0+1
    buf = bytearray(dw*dh*4)
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
                    r, g, b, a = rgba_at(sx, sy)
                    f = a/255.0
                    ar += r*f; ag += g*f; ab += b*f; aa += f
                    n += 1
            if not n or aa <= 0: continue
            o = (dy*dw+dx)*4
            buf[o]   = min(255, round(ar/aa))
            buf[o+1] = min(255, round(ag/aa))
            buf[o+2] = min(255, round(ab/aa))
            buf[o+3] = min(255, round(aa/n*255))
    return buf


def collect(sheet):
    """Every named sprite in a sheet, with its tight bounds."""
    path = os.path.join(HERE, '..', 'references', sheet['file'])
    w, h, bpp, px = read_png(path)
    if bpp == 3:
        px = key_black(w, h, bpp, px); bpp = 4
    alpha = lambda x, y: px[(y*w+x)*bpp+3]
    rgba = lambda x, y: px[(y*w+x)*bpp:(y*w+x)*bpp+4]

    bands = sheet.get('bands')
    if not bands:
        bands = [r for r in spans([any(alpha(x, y) > 12 for x in range(0, w, 2))
                                   for y in range(h)]) if r[1]-r[0] >= 40]
    if len(bands) != len(sheet['rows']):
        sys.exit(f"{sheet['file']}: found {len(bands)} rows, but {len(sheet['rows'])} are named")

    found = []
    for (ry0, ry1), (category, fit, names) in zip(bands, sheet['rows']):
        boxes = []
        for cx0, cx1 in spans([any(alpha(x, y) > 12 for y in range(ry0, ry1+1, 2)) for x in range(w)]):
            x0, x1, y0, y1 = cx1, cx0, ry1, ry0
            for y in range(ry0, ry1+1):
                for x in range(cx0, cx1+1):
                    if alpha(x, y) > 12:
                        x0 = min(x0, x); x1 = max(x1, x)
                        y0 = min(y0, y); y1 = max(y1, y)
            if (x1-x0+1) * (y1-y0+1) >= MIN_AREA:
                boxes.append((x0, x1, y0, y1))
        if len(boxes) != len(names):
            sys.exit(f"{sheet['file']} row {category}: found {len(boxes)} sprites, {len(names)} named")
        for name, box in zip(names, boxes):
            found.append({'name': name, 'category': category, 'fit': fit,
                          'box': box, 'rgba': rgba})
    return found


def main():
    found = []
    for sheet in SHEETS:
        got = collect(sheet)
        print(f"{sheet['file']}: {len(got)} sprites")
        found += got

    seen = {}
    for f in found:
        if f['name'] in seen:
            sys.exit(f"duplicate tile name: {f['name']}")
        seen[f['name']] = True

    props = [f for f in found if f['fit'] == 'prop']
    tallest = max(f['box'][3]-f['box'][2]+1 for f in props)
    widest = max(f['box'][1]-f['box'][0]+1 for f in props)
    prop_scale = min((TARGET - 1) / tallest, TARGET / widest)

    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for f in found:
        x0, x1, y0, y1 = f['box']
        sw, sh = x1-x0+1, y1-y0+1
        if f['fit'] == 'tile':
            dw = dh = TARGET
            ox = oy = 0
        else:
            dw, dh = max(1, round(sw*prop_scale)), max(1, round(sh*prop_scale))
            ox, oy = round(TARGET/2 - dw/2), TARGET - 1 - dh

        cell = bytearray(TARGET*TARGET*4)
        art = resample(f['rgba'], f['box'], dw, dh)
        for y in range(dh):
            for x in range(dw):
                tx, ty = ox+x, oy+y
                if 0 <= tx < TARGET and 0 <= ty < TARGET:
                    o, s = (ty*TARGET+tx)*4, (y*dw+x)*4
                    cell[o:o+4] = art[s:s+4]

        write_png(os.path.join(OUT, f"{f['name']}.png"), TARGET, TARGET, cell)
        manifest.append({'name': f['name'], 'category': f['category'],
                         'fit': f['fit'], 'file': f"{f['name']}.png"})

    json.dump({'size': TARGET, 'sources': [s['file'] for s in SHEETS], 'tiles': manifest},
              open(os.path.join(OUT, 'tiles.json'), 'w'), indent=2)
    print(f'prop scale {prop_scale:.3f}; wrote {len(manifest)} tiles to assets/tiles/')


if __name__ == '__main__':
    main()
