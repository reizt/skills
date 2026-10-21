#!/usr/bin/env python3
"""UI キャプチャに赤丸・角丸・黒塗りの注記を描く。

usage: mark.py IN.png OUT.png MODE:X1,Y1,X2,Y2 [MODE:X1,Y1,X2,Y2 ...] [--ref-width W] [--line N]

MODE は ellipse（矩形を内包する最小の楕円）/ rounded（角丸の矩形）/ black（黒塗り）。
座標は矩形の対角 2 点。指定した順に描くので、後の注記が上に重なる。
"""
import argparse
import math
import subprocess
import sys

MODES = ("ellipse", "rounded", "black")


def parse_shape(s):
    mode, _, coords = s.partition(":")
    if mode not in MODES:
        raise argparse.ArgumentTypeError(f"mode は {'/'.join(MODES)} のどれか: {s}")
    try:
        x1, y1, x2, y2 = (float(v) for v in coords.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError(f"座標は X1,Y1,X2,Y2 の 4 つの数値: {s}")
    return mode, min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)


def image_size(path):
    out = subprocess.run(["magick", "identify", "-format", "%w %h", path + "[0]"],
                         check=True, capture_output=True, text=True).stdout
    w, h = out.split()
    return int(w), int(h)


def draw_args(mode, x1, y1, x2, y2, line):
    if mode == "black":
        return ["-fill", "#000", "-stroke", "none", "-draw", f"rectangle {x1},{y1} {x2},{y2}"]
    # 線は矩形の外側に引き、囲んだ中身にかぶせない
    o = line / 2
    stroke = ["-fill", "none", "-stroke", "#f00", "-strokewidth", str(line)]
    if mode == "rounded":
        r = min(x2 - x1, y2 - y1) / 4 + o
        return stroke + ["-draw", f"roundrectangle {x1 - o},{y1 - o} {x2 + o},{y2 + o} {r},{r}"]
    # 矩形を内包する最小面積の楕円は、半幅・半高をそれぞれ √2 倍したもの
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    rx, ry = (x2 - x1) / 2 * math.sqrt(2) + o, (y2 - y1) / 2 * math.sqrt(2) + o
    return stroke + ["-draw", f"ellipse {cx},{cy} {rx},{ry} 0,360"]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("src")
    p.add_argument("dst")
    p.add_argument("shapes", nargs="+", type=parse_shape, metavar="MODE:X1,Y1,X2,Y2")
    p.add_argument("--ref-width", type=float, help="座標をこの横幅の縮小版で測った場合に指定する。元画像の座標に換算する")
    p.add_argument("--line", type=float, help="線の太さ（元画像の px）。既定は画像の短辺 / 200（最小 4）")
    a = p.parse_args()

    w, h = image_size(a.src)
    k = w / a.ref_width if a.ref_width else 1
    line = a.line or max(4, round(min(w, h) / 200))

    args = ["magick", a.src]
    for mode, *xy in a.shapes:
        args += draw_args(mode, *(round(v * k, 1) for v in xy), line)
    args.append(a.dst)
    subprocess.run(args, check=True)
    print(f"{a.dst} ({w}x{h}, line={line}, scale={k:g})")


if __name__ == "__main__":
    sys.exit(main())
