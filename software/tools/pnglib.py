"""Minimal PNG read/write plus black-background keying.

No dependencies on purpose: these tools have to run on a bare checkout.
"""
import struct, zlib

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
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[ct]
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


def key_black(w, h, bpp, px):
    """Sheets without an alpha channel sit on pure black.

    Flood filled from the border through PURE black only, so the background
    goes and the character's own dark outline - which is near-black but not
    black - stays. Nothing inside the figure can be reached, so no holes.
    """
    from collections import deque
    is_black = lambda x, y: sum(px[(y*w+x)*bpp:(y*w+x)*bpp+3]) <= 12
    seen = bytearray(w*h)
    q = deque()
    for x in range(w):
        for y in (0, h-1):
            if is_black(x, y) and not seen[y*w+x]: seen[y*w+x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w-1):
            if is_black(x, y) and not seen[y*w+x]: seen[y*w+x] = 1; q.append((x, y))
    while q:
        cx, cy = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx+dx, cy+dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny*w+nx] and is_black(nx, ny):
                seen[ny*w+nx] = 1; q.append((nx, ny))
    out = bytearray(w*h*4)
    for i in range(w*h):
        o = i*bpp
        out[i*4:i*4+3] = px[o:o+3]
        out[i*4+3] = 0 if seen[i] else 255
    return out


