"""Простые «ручные» признаки для бейзлайна: гистограммы каналов HSV и статистика
градиентов по сетке 4x4. Нужны только для сравнения с признаками нейросети."""
import csv

import numpy as np
from PIL import Image

from avtointellekt.ml.scripts.common import CACHE_DIR, MANIFEST, SOURCE_DIR


def features(path):
    with Image.open(path) as im:
        im = im.convert("RGB").resize((128, 128), Image.BILINEAR)
        hsv = np.asarray(im.convert("HSV"), dtype=np.float32)
        gray = np.asarray(im.convert("L"), dtype=np.float32)
    f = []
    for ch in range(3):
        hist, _ = np.histogram(hsv[..., ch], bins=16, range=(0, 255))
        f.extend(hist / hist.sum())
    gy, gx = np.gradient(gray)
    mag = np.hypot(gx, gy)
    for i in range(4):
        for j in range(4):
            cell = mag[i * 32:(i + 1) * 32, j * 32:(j + 1) * 32]
            f.extend([cell.mean(), cell.std()])
    f.extend([gray.mean(), gray.std(), mag.mean(), mag.std()])
    return np.array(f, dtype=np.float32)


def main():
    with open(MANIFEST, encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    arr = np.stack([features(SOURCE_DIR / r["relpath"]) for r in rows])
    np.save(CACHE_DIR / "handcrafted.npy", arr)
    print("handcrafted features:", arr.shape)


if __name__ == "__main__":
    main()
