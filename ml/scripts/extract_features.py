"""Извлекает эмбеддинги изображений предобученной EfficientNet-B0 (ImageNet).

Для каждого снимка считаются два вида: оригинал и горизонтальное отражение.
Результат кэшируется кусками (ml/data/cache), скрипт можно запускать повторно:
уже посчитанные куски пропускаются. --max-seconds ограничивает время одного запуска.
"""
import argparse
import csv
import hashlib
import time
import urllib.request

import numpy as np
import torch
from efficientnet_pytorch import EfficientNet
from PIL import Image

from avtointellekt.ml.scripts.common import (BACKBONE_NAME, BACKBONE_SHA_PREFIX, BACKBONE_URL, CACHE_DIR, MANIFEST,
                    SOURCE_DIR)

CHUNK = 32
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def ensure_weights():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / "efficientnet-b0-355c32eb.pth"
    if not path.exists():
        print("downloading backbone weights ...")
        urllib.request.urlretrieve(BACKBONE_URL, path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if not digest.startswith(BACKBONE_SHA_PREFIX):
        raise RuntimeError(f"backbone checksum mismatch: {digest[:8]} != {BACKBONE_SHA_PREFIX}")
    return path


def load_model():
    model = EfficientNet.from_name(BACKBONE_NAME)
    state = torch.load(ensure_weights(), map_location="cpu")
    model.load_state_dict(state)
    return model.eval()


def preprocess(path):
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        scale = 256 / min(w, h)
        im = im.resize((max(256, round(w * scale)), max(256, round(h * scale))), Image.BICUBIC)
        w, h = im.size
        left, top = (w - 224) // 2, (h - 224) // 2
        im = im.crop((left, top, left + 224, top + 224))
    a = (np.asarray(im, dtype=np.float32) / 255.0 - MEAN) / STD
    return a.transpose(2, 0, 1)


@torch.no_grad()
def embed(model, batch):
    x = torch.from_numpy(np.stack(batch))
    out = []
    for view in (x, torch.flip(x, dims=[3])):
        f = model.extract_features(view)
        out.append(model._avg_pooling(f).flatten(1).numpy())
    return np.stack(out, axis=1)  # (B, 2, 1280)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-seconds", type=float, default=240)
    args = ap.parse_args()
    torch.set_num_threads(1)
    started = time.time()
    with open(MANIFEST, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    model = load_model()
    n_chunks = (len(rows) + CHUNK - 1) // CHUNK
    done = 0
    for c in range(n_chunks):
        out = CACHE_DIR / f"feat_{BACKBONE_NAME}_{c:04d}.npy"
        if out.exists():
            done += 1
            continue
        if time.time() - started > args.max_seconds:
            break
        part = rows[c * CHUNK:(c + 1) * CHUNK]
        arr = embed(model, [preprocess(SOURCE_DIR / r["relpath"]) for r in part])
        np.save(out, arr)
        done += 1
        print(f"chunk {c + 1}/{n_chunks} saved  ({time.time() - started:.0f}s)", flush=True)
    print(f"progress: {done}/{n_chunks} chunks")


if __name__ == "__main__":
    main()
