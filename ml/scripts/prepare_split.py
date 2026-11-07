"""Чистка датасета и разделение на train / val / test.

1. Читает исходные фото и классы из папок.
2. Убирает точные дубликаты (sha256).
3. Находит почти-дубликаты (dHash, расстояние Хэмминга <= HAMMING_THRESHOLD)
   и объединяет их в группы, чтобы копии одного снимка не попадали в разные выборки.
4. Тестовые снимки, дублирующие обучающие, исключает из теста.
5. Делит исходную обучающую выборку на train и val (стратифицированно, по группам).
Результат: dataset/manifest.csv и dataset/split_summary.json.
"""
import csv
import hashlib
import json
from collections import Counter, defaultdict

import numpy as np
from PIL import Image
from sklearn.model_selection import StratifiedGroupKFold

from avtointellekt.ml.scripts.common import (CLASS_ALIASES, CLASSES, IMG_EXT, MANIFEST, SEED, SOURCE_DIR,
                    SPLIT_SUMMARY, SOURCE_SUBDIRS)

HAMMING_THRESHOLD = 4
VAL_FOLDS = 7  # одна фолда из семи ~ 14% обучающих данных идёт в val


def dhash(img: Image.Image) -> int:
    g = img.convert("L").resize((9, 8), Image.LANCZOS)
    a = np.asarray(g, dtype=np.int16)
    bits = (a[:, 1:] > a[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def load_records():
    recs = []
    for sub in SOURCE_SUBDIRS:
        origin = "train_src" if sub.endswith("training") else "test_src"
        for p in sorted((SOURCE_DIR / sub).rglob("*")):
            if not p.is_file() or p.suffix.lower() not in IMG_EXT:
                continue
            label = CLASS_ALIASES.get(p.parent.name)
            if label is None:
                continue
            data = p.read_bytes()
            with Image.open(p) as im:
                im.load()
                w, h = im.size
                dh = dhash(im)
            recs.append({
                "relpath": p.relative_to(SOURCE_DIR).as_posix(),
                "label": label, "origin": origin,
                "sha256": hashlib.sha256(data).hexdigest(),
                "width": w, "height": h, "dhash": f"{dh:016x}", "_dh": dh,
            })
    return recs


class UF:
    def __init__(self, n): self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b): self.p[self.find(a)] = self.find(b)


def main():
    recs = load_records()
    summary = {"raw_files": len(recs), "raw_by_origin": dict(Counter(r["origin"] for r in recs)),
               "excluded": []}

    # 1. точные дубликаты: оставляем первую копию, приоритет у train_src
    recs.sort(key=lambda r: (r["origin"] != "train_src", r["relpath"]))
    seen, unique = {}, []
    for r in recs:
        if r["sha256"] in seen:
            summary["excluded"].append({"relpath": r["relpath"], "reason": "exact_duplicate_of",
                                        "of": seen[r["sha256"]]})
            continue
        seen[r["sha256"]] = r["relpath"]
        unique.append(r)

    # 2. почти-дубликаты -> группы
    uf = UF(len(unique))
    for i in range(len(unique)):
        for j in range(i + 1, len(unique)):
            if hamming(unique[i]["_dh"], unique[j]["_dh"]) <= HAMMING_THRESHOLD:
                uf.union(i, j)
    for i, r in enumerate(unique):
        r["group"] = uf.find(i)
    members = defaultdict(list)
    for r in unique:
        members[r["group"]].append(r)

    # 3. тест, пересекающийся по группе с обучающими, исключаем из теста
    kept = []
    for r in unique:
        if r["origin"] == "test_src" and any(m["origin"] == "train_src" for m in members[r["group"]]):
            summary["excluded"].append({"relpath": r["relpath"], "reason": "near_duplicate_of_train"})
            continue
        kept.append(r)

    conflicts = sum(1 for g in members.values() if len({m["label"] for m in g}) > 1)
    summary["near_duplicate_groups_with_size_gt1"] = sum(1 for g in members.values() if len(g) > 1)
    summary["near_duplicate_groups_with_conflicting_labels"] = conflicts

    # 4. train/val по группам, стратифицированно
    train_src = [r for r in kept if r["origin"] == "train_src"]
    y = np.array([CLASSES.index(r["label"]) for r in train_src])
    groups = np.array([r["group"] for r in train_src])
    sgkf = StratifiedGroupKFold(n_splits=VAL_FOLDS, shuffle=True, random_state=SEED)
    _, val_idx = next(sgkf.split(np.zeros(len(y)), y, groups))
    val_set = set(val_idx.tolist())
    for i, r in enumerate(train_src):
        r["split"] = "val" if i in val_set else "train"
    for r in kept:
        if r["origin"] == "test_src":
            r["split"] = "test"

    kept.sort(key=lambda r: (r["split"], r["label"], r["relpath"]))
    with open(MANIFEST, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["relpath", "label", "split", "sha256", "width", "height", "dhash", "group_id"])
        for r in kept:
            w.writerow([r["relpath"], r["label"], r["split"], r["sha256"], r["width"], r["height"],
                        r["dhash"], r["group"]])

    summary["final_total"] = len(kept)
    summary["counts"] = {s: {c: sum(1 for r in kept if r["split"] == s and r["label"] == c) for c in CLASSES}
                         for s in ("train", "val", "test")}
    summary["totals"] = {s: sum(v.values()) for s, v in summary["counts"].items()}
    summary["params"] = {"seed": SEED, "hamming_threshold": HAMMING_THRESHOLD, "val_folds": VAL_FOLDS}
    leak = {(r["group"]) for r in kept if r["split"] == "train"} & {r["group"] for r in kept if r["split"] in ("val", "test")}
    summary["train_vs_val_test_group_leak"] = len(leak)
    SPLIT_SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({k: v for k, v in summary.items() if k != "excluded"}, ensure_ascii=False, indent=2))
    print("excluded:", Counter(e["reason"] for e in summary["excluded"]))


if __name__ == "__main__":
    main()
