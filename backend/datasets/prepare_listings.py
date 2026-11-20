"""Prepare a local CSV/JSON pool of vehicle listings for market_algorithms.

Usage: python backend/datasets/prepare_listings.py input.csv output.json
Required CSV columns: source,source_id,brand,model,year,mileage,region,price.
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.market_algorithms import normalize_listing


def prepare(source):
    path = Path(source)
    if path.suffix.lower() == '.csv':
        with path.open(encoding='utf-8-sig', newline='') as file:
            rows = list(csv.DictReader(file))
    elif path.suffix.lower() == '.json':
        rows = json.loads(path.read_text(encoding='utf-8'))
    else:
        raise ValueError('Supported input: .csv or .json')
    if not isinstance(rows, list):
        raise ValueError('Input must contain a list of listings')
    output, seen = [], set()
    for row in rows:
        item = normalize_listing(row)
        if item is None:
            continue
        key = (item['source'], item['source_id'])
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output, len(rows)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare_listings.py INPUT.csv|json OUTPUT.json')
    result, total = prepare(sys.argv[1])
    Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Valid unique listings: {len(result)} / {total}')
