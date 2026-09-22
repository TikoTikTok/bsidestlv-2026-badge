"""Split references/alice-reference3.png into one PNG per direction per frame.

Straight crops: every pixel is copied from the source exactly as it is. No
recolouring, no quantising, no background keying - the only operations are
"take this rectangle" and, for the mirrored directions, "flip it".

The sheet is a grid of trios (stand, walk 1, walk 2):
    top-left      = N          top-middle   = NW  (mirrored -> NE)
    top-right     = W   (mirrored -> E)
    middle-centre = S          middle-right = SW  (mirrored -> SE)
"""
import os, struct, zlib
from collections import deque

SRC = os.path.join(os.path.dirname(__file__), '..', 'references', 'alice-reference3.png')
OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets', 'characters', 'alice')
PAD = 6            # pixels of source background kept around each figure


def read_png(path):
    d = open(path, 'rb').read()
    pos, idat, w, h, ct = 8, b'', None, None, None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ, data = d[pos+4:pos+8], d[pos+8:pos+8+ln]
        if typ == b'IHDR': w, h, _, ct = struct.unpack('>IIBB', data[:10])
        elif typ == b'IDAT': idat += data
        pos += 12 + ln
    raw = zlib.decompress(idat)
    bpp = {0: 1, 2: 3, 6: 4}[ct]
    stride = w * bpp
    out, prev, i = bytearray(), bytearray(stride), 0
    for _ in range(h):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i+stride]); i += stride
        for x in range(stride):
            a = line[x-bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x-bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a+b)//2) & 255
            elif f == 4:
                pa, pb, pc = abs(b-c), abs(a-c), abs(a+b-2*c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line; prev = line
    return w, h, bpp, bytes(out)


def write_png(path, w, h, rgba):
    raw = bytearray()
    for y in range(h):
        raw.append(0); raw += rgba[y*w*4:(y+1)*w*4]
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b''))


w, h, bpp, px = read_png(SRC)
at = lambda x, y: (px[(y*w+x)*bpp], px[(y*w+x)*bpp+1], px[(y*w+x)*bpp+2])
lum = lambda c: (c[0]*299 + c[1]*587 + c[2]*114)//1000

# --- locate the figures (only to decide WHERE to cut) -----------------------
def is_core(c):
    r, g, b = c
    if b > 110 and b > r + 40: return True            # dress blue
    if r > 200 and g > 150 and b < 170: return True   # hair, skin
    if lum(c) > 190: return True                      # apron white, stockings
    return False

core = bytearray(w*h)
for y in range(h):
    for x in range(w):
        if is_core(at(x, y)): core[y*w+x] = 1

labels, boxes, cur = [0]*(w*h), [], 0
for y in range(h):
    for x in range(w):
        i = y*w+x
        if not core[i] or labels[i]: continue
        cur += 1; q = deque([(x, y)]); labels[i] = cur
        mnx = mxx = x; mny = mxy = y; n = 0
        while q:
            cx, cy = q.popleft(); n += 1
            mnx, mxx = min(mnx, cx), max(mxx, cx)
            mny, mxy = min(mny, cy), max(mxy, cy)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = cx+dx, cy+dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny*w+nx
                        if core[j] and not labels[j]:
                            labels[j] = cur; q.append((nx, ny))
        boxes.append([mnx, mxx, mny, mxy, n])

boxes = [b for b in boxes if b[4] > 400]
def near(a, b, pad=14):
    return not (a[1]+pad < b[0]-pad or b[1]+pad < a[0]-pad
                or a[3]+pad < b[2]-pad or b[3]+pad < a[2]-pad)
changed = True
while changed:
    changed = False
    for i in range(len(boxes)):
        for j in range(i+1, len(boxes)):
            if near(boxes[i], boxes[j]):
                a, b = boxes[i], boxes[j]
                boxes[i] = [min(a[0], b[0]), max(a[1], b[1]),
                            min(a[2], b[2]), max(a[3], b[3]), a[4]+b[4]]
                del boxes[j]; changed = True; break
        if changed: break
boxes.sort(key=lambda b: (b[2]//150, b[0]))
assert len(boxes) == 24, f'expected 24 figures in the sheet, found {len(boxes)}'

# the dark outline sits just outside the colour mask, so grow every box a little
boxes = [[b[0]-3, b[1]+3, b[2]-3, b[3]+3] for b in boxes]

TRIOS = {'N': boxes[0:3], 'NW': boxes[3:6], 'W': boxes[6:9],
         'S': boxes[12:15], 'SW': boxes[15:18]}
FRAMES = ['stand', 'walk1', 'walk2']
DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
MIRROR = {'E': 'W', 'NE': 'NW', 'SE': 'SW'}

# one window size for every frame, so the animation does not jitter
CW = max(b[1]-b[0]+1 for t in TRIOS.values() for b in t) + PAD*2
CH = max(b[3]-b[2]+1 for t in TRIOS.values() for b in t) + PAD*2


def crop(box, trio, flip=False):
    """Copy a CW x CH window straight out of the source image."""
    cx = (box[0] + box[1]) // 2
    base = max(b[3] for b in trio)                  # trio shares one baseline
    x0 = cx - CW//2
    y0 = base + PAD - CH + 1
    buf = bytearray(CW*CH*4)
    for ty in range(CH):
        sy = y0 + ty
        for tx in range(CW):
            sx = x0 + tx
            if not (0 <= sx < w and 0 <= sy < h): continue
            c = at(sx, sy)
            dx = CW-1-tx if flip else tx
            o = (ty*CW + dx)*4
            buf[o], buf[o+1], buf[o+2], buf[o+3] = c[0], c[1], c[2], 255
    return buf


os.makedirs(OUT, exist_ok=True)
manifest, cells = {}, {}
SHEET_W, SHEET_H = CW*len(FRAMES), CH*len(DIRS)
sheet = bytearray(SHEET_W*SHEET_H*4)

for j, d in enumerate(DIRS):
    src = MIRROR.get(d, d)
    for i, box in enumerate(TRIOS[src]):
        buf = crop(box, TRIOS[src], flip=(src != d))
        name = f'alice_{d}_{FRAMES[i]}.png'
        write_png(os.path.join(OUT, name), CW, CH, buf)
        manifest.setdefault(d, []).append(name)
        for y in range(CH):
            t = ((j*CH + y)*SHEET_W + i*CW)*4
            sheet[t:t + CW*4] = buf[y*CW*4:(y+1)*CW*4]
        cells.setdefault(d, []).append({'x': i*CW, 'y': j*CH, 'w': CW, 'h': CH})

write_png(os.path.join(OUT, 'alice_walk_sheet.png'), SHEET_W, SHEET_H, sheet)

import json
json.dump({
    'name': 'alice',
    'source': 'alice-reference3.png',
    'frameWidth': CW, 'frameHeight': CH,
    'frames': FRAMES,
    'sheet': 'alice_walk_sheet.png',
    'note': ('Straight crops - pixels are byte-for-byte from the source. E, NE and SE '
             'are horizontal flips of W, NW and SW, already baked into the files.'),
    'directions': {d: {'files': manifest[d], 'cells': cells[d],
                       'mirrored': d in MIRROR} for d in DIRS},
}, open(os.path.join(OUT, 'alice.json'), 'w'), indent=2)

print(f'window {CW}x{CH}; wrote {len(DIRS)*len(FRAMES)} frames + sheet {SHEET_W}x{SHEET_H}')
