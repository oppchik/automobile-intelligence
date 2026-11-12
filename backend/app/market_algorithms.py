"""Нормализация учебных объявлений и оценка по сопоставимым предложениям."""
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from math import isfinite
from statistics import median

CURRENT_YEAR = 2026


def _text(value):
    if not isinstance(value, str):
        raise ValueError('Expected text')
    result = ' '.join(unicodedata.normalize('NFKC', value).casefold().split())
    if not result:
        raise ValueError('Empty text')
    return result


def parse_price(value):
    """Цена в рублях: число или строка вида 850 000 ₽; без конвертации валют."""
    if isinstance(value, bool):
        raise ValueError('Invalid price')
    if isinstance(value, str):
        value = unicodedata.normalize('NFKC', value).strip().casefold()
        value = re.sub(r'\s*(?:₽|руб\.?|рублей|rub)\s*$', '', value)
        if not re.fullmatch(r'(?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d{1,2})?', value):
            raise ValueError('Invalid ruble price')
        value = value.replace(' ', '').replace(',', '.')
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount <= 0 or amount != amount.to_integral_value():
            raise ValueError('Expected a positive whole ruble price')
        return int(amount)
    except (InvalidOperation, TypeError) as exc:
        raise ValueError('Invalid price') from exc


def _integer(value):
    if isinstance(value, bool):
        raise ValueError('Invalid integer')
    number = float(value)
    if not isfinite(number) or not number.is_integer():
        raise ValueError('Invalid integer')
    return int(number)


def normalize_listing(record):
    """Некорректные записи возвращаются как None; неизвестные поля сохраняются."""
    try:
        result = dict(record)
        for field in ('brand', 'model', 'region', 'source'):
            result[field] = _text(record[field])
        source_id = record['source_id']
        if source_id is None or isinstance(source_id, bool):
            return None
        result['source_id'] = str(source_id).strip()
        if not result['source_id']:
            return None
        result['year'], result['mileage'] = _integer(record['year']), _integer(record['mileage'])
        if not 2005 <= result['year'] <= CURRENT_YEAR or result['mileage'] < 0:
            return None
        result['price'] = parse_price(record['price'])
        if 'condition' in record:
            result['condition'] = _text(record['condition'])
        return result
    except (KeyError, TypeError, ValueError, OverflowError):
        return None


def select_comparables(records, *, brand, model, year, mileage, region=None,
                       year_tolerance=2, mileage_tolerance=60000):
    brand, model = _text(brand), _text(model)
    year, mileage = _integer(year), _integer(mileage)
    year_tolerance, mileage_tolerance = _integer(year_tolerance), _integer(mileage_tolerance)
    if not 2005 <= year <= CURRENT_YEAR or min(mileage, year_tolerance, mileage_tolerance) < 0:
        raise ValueError('Invalid comparison parameters')
    region = _text(region) if region is not None else None
    found, seen = [], set()
    for record in records:
        item = normalize_listing(record)
        if item is None:
            continue
        if item['brand'] != brand or item['model'] != model:
            continue
        if abs(item['year'] - year) > year_tolerance or abs(item['mileage'] - mileage) > mileage_tolerance:
            continue
        if region is not None and item['region'] != region:
            continue
        identity = (item['source'], item['source_id'])
        if identity not in seen:
            seen.add(identity)
            found.append(item)
    return found


def estimate_from_listings(records, **vehicle):
    """Оценка по медиане сопоставимых объявлений.

    MAD — медиана абсолютных отклонений от медианы. Фильтр применяется
    от семи аналогов. При MAD=0 сохраняется вся выборка.
    """
    matches = select_comparables(records, **vehicle)
    candidate_count = len(matches)
    mad = None
    if candidate_count >= 7:
        center = median(item['price'] for item in matches)
        mad = median(abs(item['price'] - center) for item in matches)
        if mad > 0:
            matches = [
                item for item in matches
                if 0.67448975 * abs(item['price'] - center) / mad <= 3.5
            ]

    prices = [item['price'] for item in matches]
    count = len(prices)
    result = dict(status='insufficient_data', count=count,
                  candidate_count=candidate_count, mad=mad,
                  method='median_mad', estimate=None, minimum=None, maximum=None,
                  comparables=matches)
    if count < 3:
        return result

    if count >= 7:
        status = 'ok'
    elif candidate_count >= 5:
        status = 'preliminary'
    else:
        status = 'indicative'
    result.update(status=status, estimate=median(prices),
                  minimum=min(prices), maximum=max(prices))
    return result
