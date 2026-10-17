#!/usr/bin/env python3
"""Gera os ícones PNG do PWA (sem dependências: só zlib/struct).

Uso: python tools/gen_icons.py   -> icons/icon-192.png, icon-512.png, apple-touch-icon.png

Desenho: carinha de gato laranja sobre fundo roxo escuro, em tela cheia, com tudo dentro
da "zona segura" central (80%), para funcionar também como ícone maskable do Android.
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

BG = (42, 38, 64)            # --panel
CAT = (255, 159, 107)        # --accent
EAR_INNER = (255, 205, 175)
EYE = (42, 26, 16)
NOSE = (214, 84, 112)


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_tri(x, y, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    p = (x, y)
    d1, d2, d3 = sign(p, a, b), sign(p, b, c), sign(p, c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def color_at(x, y):
    """Cor do ponto (x, y) em coordenadas normalizadas 0..1."""
    # olhos e nariz por cima da cabeça
    if in_circle(x, y, 0.415, 0.545, 0.034) or in_circle(x, y, 0.585, 0.545, 0.034):
        return EYE
    if in_tri(x, y, (0.465, 0.61), (0.535, 0.61), (0.5, 0.65)):
        return NOSE
    # parte interna das orelhas
    if in_tri(x, y, (0.285, 0.26), (0.275, 0.42), (0.42, 0.35)) or in_tri(x, y, (0.715, 0.26), (0.725, 0.42), (0.58, 0.35)):
        return EAR_INNER
    # orelhas e cabeça
    if in_tri(x, y, (0.25, 0.17), (0.23, 0.47), (0.47, 0.33)) or in_tri(x, y, (0.75, 0.17), (0.77, 0.47), (0.53, 0.33)):
        return CAT
    if in_circle(x, y, 0.5, 0.57, 0.265):
        return CAT
    return BG


def render(size, ss=3):
    rows = []
    for py in range(size):
        row = bytearray([0])                       # filtro PNG "None"
        for px in range(size):
            r = g = b = 0
            for sy in range(ss):
                for sx in range(ss):
                    c = color_at((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size)
                    r += c[0]; g += c[1]; b += c[2]
            n = ss * ss
            row += bytes((r // n, g // n, b // n))
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)       # 8 bits, RGB
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        (OUT / name).write_bytes(png(size, render(size)))
        print("gerado", OUT / name)
