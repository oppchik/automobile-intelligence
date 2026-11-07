"""Скачивает исходный датасет с GitHub по закреплённому коммиту и распаковывает
только нужные папки (обучающая и тестовая выборки) в ml/data/raw/source."""
import csv
import hashlib
import io
import sys
import tarfile
import urllib.request

from avtointellekt.ml.scripts.common import DATASET_COMMIT, DATASET_REPO, IMG_EXT, MANIFEST, SOURCE_DIR, SOURCE_SUBDIRS


def verify() -> int:
    """Сверяет скачанные файлы с sha256 из ml/dataset/manifest.csv."""
    if not MANIFEST.exists():
        print("manifest not found, checksum verification skipped")
        return 0
    bad = 0
    with open(MANIFEST, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        p = SOURCE_DIR / r["relpath"]
        if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != r["sha256"]:
            bad += 1
    print(f"checksum verification: {len(rows) - bad}/{len(rows)} files match the manifest")
    return bad


def main() -> int:
    if SOURCE_DIR.exists() and any(p.suffix.lower() in IMG_EXT for p in SOURCE_DIR.rglob("*")):
        print(f"already present: {SOURCE_DIR}")
        return 1 if verify() else 0
    url = f"https://codeload.github.com/{DATASET_REPO}/tar.gz/{DATASET_COMMIT}"
    print(f"downloading {url}")
    with urllib.request.urlopen(url, timeout=120) as resp:
        payload = resp.read()
    print(f"downloaded {len(payload) / 1e6:.1f} MB")
    root_prefix = f"{DATASET_REPO.split('/')[1]}-{DATASET_COMMIT}/"
    wanted = tuple(root_prefix + s + "/" for s in SOURCE_SUBDIRS)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as tar:
        for member in tar:
            if not member.isfile() or not member.name.startswith(wanted):
                continue
            rel = member.name[len(root_prefix):]
            target = SOURCE_DIR / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(tar.extractfile(member).read())
            count += 1
    print(f"extracted {count} files to {SOURCE_DIR}")
    return 1 if verify() else 0


if __name__ == "__main__":
    sys.exit(main())
