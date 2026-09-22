"""Put named frames side by side, big.

For settling which way a sprite faces - the question that got the queen's
mapping wrong three times.

    python3 tools/preview/compare.py site/assets/characters/queen out.png w1,e1,sw1,se1 [scale]
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pnglib import read_png, write_png


def find(folder, stem):
    for cand in (stem, stem.upper(), stem.capitalize()):
        p = os.path.join(folder, cand + '.png')
        if os.path.exists(p):
            return p
    raise SystemExit(f'missing frame: {stem}.png in {folder}')


def main(folder, out, names, scale=6):
    imgs = [read_png(find(folder, n)) for n in names]
    fw, fh = imgs[0][0], imgs[0][1]
    W, H = fw*scale*len(imgs), fh*scale
    buf = bytearray(W*H*4)
    for k, (w, h, bpp, px) in enumerate(imgs):
        for y in range(h):
            for x in range(w):
                o = (y*w+x)*bpp
                for sy in range(scale):
                    for sx in range(scale):
                        tx, ty = (k*fw+x)*scale+sx, y*scale+sy
                        t = (ty*W+tx)*4
                        if px[o+3] > 12:
                            buf[t:t+4] = bytes((px[o], px[o+1], px[o+2], 255))
                        else:
                            on = ((tx//10) + (ty//10)) % 2 == 0
                            buf[t:t+4] = bytes((0x1b, 0x24, 0x36, 255) if on else (0x25, 0x2f, 0x44, 255))
    write_png(out, W, H, buf)
    print(f'{out}: {" | ".join(names)}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3].split(','),
         int(sys.argv[4]) if len(sys.argv) > 4 else 6)
