#!/usr/bin/env python3
"""Decode iPhone .heic (grid of HEVC tiles) to JPEG without libheif.
Usage: heic2jpg.py in.heic out.jpg   (needs ffmpeg + node sharp; see memory feedback_heic_decode_no_libheif)"""
import struct, sys, subprocess, tempfile, os, json

def boxes(b, off, end):
    while off + 8 <= end:
        size, typ = struct.unpack(">I4s", b[off:off+8]); hdr = 8
        if size == 1: size = struct.unpack(">Q", b[off+8:off+16])[0]; hdr = 16
        elif size == 0: size = end - off
        yield typ.decode("latin1"), off + hdr, off + size
        off += size

def full(b, o): return b[o], int.from_bytes(b[o+1:o+4], "big"), o + 4

def rd(b, o, n): return (int.from_bytes(b[o:o+n], "big") if n else 0), o + n

def parse(b):
    meta = next((s, e) for t, s, e in boxes(b, 0, len(b)) if t == "meta")
    _, _, mo = full(b, meta[0])
    M = {t: (s, e) for t, s, e in boxes(b, mo, meta[1])}
    # pitm
    v, _, o = full(b, M["pitm"][0]); pitm = rd(b, o, 2 if v == 0 else 4)[0]
    # iinf
    v, _, o = full(b, M["iinf"][0]); cnt, o = rd(b, o, 2 if v == 0 else 4)
    types = {}
    for t, s, e in boxes(b, o, M["iinf"][1]):
        iv, _, p = full(b, s)
        iid, p = rd(b, p, 2 if iv < 3 else 4); p += 2
        types[iid] = b[p:p+4].decode("latin1")
    # iloc
    v, _, o = full(b, M["iloc"][0])
    os_, ls = b[o] >> 4, b[o] & 15; bs, isz = b[o+1] >> 4, (b[o+1] & 15) if v in (1, 2) else 0; o += 2
    n, o = rd(b, o, 2 if v < 2 else 4)
    loc = {}
    for _ in range(n):
        iid, o = rd(b, o, 2 if v < 2 else 4)
        cm = 0
        if v in (1, 2): cm = b[o+1] & 15; o += 2
        o += 2  # data_reference_index
        base, o = rd(b, o, bs)
        ec, o = rd(b, o, 2); ext = []
        for _ in range(ec):
            if v in (1, 2) and isz: _, o = rd(b, o, isz)
            eo, o = rd(b, o, os_); el, o = rd(b, o, ls); ext.append((base + eo, el))
        loc[iid] = (cm, ext)
    idat = M.get("idat")
    def data(iid):
        cm, ext = loc[iid]
        src = b[idat[0]:idat[1]] if cm == 1 else b
        return b"".join(src[a:a+l] for a, l in ext)
    # iref dimg
    v, _, o = full(b, M["iref"][0]); dimg = {}
    for t, s, e in boxes(b, o, M["iref"][1]):
        fid, p = rd(b, s, 2 if v == 0 else 4); rc, p = rd(b, p, 2); refs = []
        for _ in range(rc): r, p = rd(b, p, 2 if v == 0 else 4); refs.append(r)
        if t == "dimg": dimg[fid] = refs
    # iprp: ipco + ipma
    ip = {t: (s, e) for t, s, e in boxes(b, M["iprp"][0], M["iprp"][1])}
    props = [(t, s, e) for t, s, e in boxes(b, ip["ipco"][0], ip["ipco"][1])]
    v, fl, o = full(b, ip["ipma"][0]); ec, o = rd(b, o, 4); assoc = {}
    for _ in range(ec):
        iid, o = rd(b, o, 2 if v < 1 else 4); k = b[o]; o += 1; lst = []
        for _ in range(k):
            if fl & 1: x, o = rd(b, o, 2); idx = x & 0x7fff
            else: x = b[o]; o += 1; idx = x & 0x7f
            lst.append(idx)
        assoc[iid] = lst
    def prop(iid, typ):
        for i in assoc.get(iid, []):
            t, s, e = props[i-1]
            if t == typ: return b[s:e]
    return pitm, types, data, dimg, prop

def annexb(hvcc, sample):
    out = bytearray(); nl = (hvcc[21] & 3) + 1; p = 23
    for _ in range(hvcc[22]):
        p += 1; nn = struct.unpack(">H", hvcc[p:p+2])[0]; p += 2
        for _ in range(nn):
            l = struct.unpack(">H", hvcc[p:p+2])[0]; p += 2; out += b"\0\0\0\1" + hvcc[p:p+l]; p += l
    q = 0
    while q < len(sample):
        l = int.from_bytes(sample[q:q+nl], "big"); q += nl; out += b"\0\0\0\1" + sample[q:q+l]; q += l
    return bytes(out)

def irot(prop, iid):
    r = prop(iid, "irot"); return (r[0] & 3) * 90 if r else 0

def main(src, dst):
    b = open(src, "rb").read()
    pitm, types, data, dimg, prop = parse(b)
    tmp = tempfile.mkdtemp()
    if types[pitm] == "grid":
        g = data(pitm); flags = g[1]; rows, cols = g[2] + 1, g[3] + 1; n = 4 if flags & 1 else 2
        W, H = int.from_bytes(g[4:4+n], "big"), int.from_bytes(g[4+n:4+2*n], "big"); tiles = dimg[pitm]
        assert rows * cols == len(tiles), (rows, cols, len(tiles))
    else:
        rows = cols = 1; tiles = [pitm]; W = H = None
    pngs = []
    for i, t in enumerate(tiles):
        hv = os.path.join(tmp, f"{i}.hevc"); png = os.path.join(tmp, f"{i}.png")
        open(hv, "wb").write(annexb(prop(t, "hvcC"), data(t)))
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "hevc", "-i", hv, "-frames:v", "1", png], check=True)
        pngs.append(png)
    spec = dict(pngs=pngs, cols=cols, W=W, H=H, rot=irot(prop, pitm), out=dst)
    js = os.path.join(tmp, "spec.json"); json.dump(spec, open(js, "w"))
    subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "stitch.cjs"), js], check=True)

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
