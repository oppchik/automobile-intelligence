"""Поиск в переданном каталоге без сетевых запросов и угадывания VIN."""
import re
import unicodedata
from math import isfinite


def _text(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value)).casefold().split())


def _oem(value):
    return re.sub(r'[\s-]+', '', _text(value))


def _number(value):
    if isinstance(value, bool):
        raise ValueError('Expected a finite nonnegative number')
    number = float(value)
    if not isfinite(number) or number < 0:
        raise ValueError('Expected a finite nonnegative number')
    return number


def search_parts(offers, query='', *, condition=None, region=None,
                 max_price=None, max_distance_km=None, sort_by='price', vin_index=None):
    """Название ищется по фрагменту, OEM точно, VIN только через vin_index.

    Условные OEM в учебном каталоге не подтверждают реальную совместимость.
    Порядок равных результатов стабилен; входные записи не изменяются.
    """
    if sort_by not in ('price', 'distance_km'):
        raise ValueError('sort_by must be price or distance_km')
    if condition not in (None, 'new', 'used'):
        raise ValueError('condition must be new or used')
    limits = [None if v is None else _number(v) for v in (max_price, max_distance_km)]
    q = _text(query)
    is_vin = bool(re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}', q.upper()))
    compatible = None
    if is_vin:
        compatible = {_oem(v) for v in (vin_index or {}).get(q.upper(), [])}
        if not compatible:
            return []
    found, seen = [], set()
    for offer in offers:
        try:
            price = _number(offer['price'])
            distance = _number(offer['distance_km'])
            name, oem = _text(offer['name']), _oem(offer.get('oem', ''))
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
        if compatible is not None:
            if oem not in compatible:
                continue
        elif q and q not in name and _oem(q) != oem:
            continue
        if condition is not None and offer.get('condition') != condition:
            continue
        if region is not None and _text(offer.get('city', '')) != _text(region):
            continue
        if limits[0] is not None and price > limits[0]:
            continue
        if limits[1] is not None and distance > limits[1]:
            continue
        identity = (str(offer.get('source', '')), str(offer.get('key') or
                    (name, oem, offer.get('seller'), offer.get('condition'), offer.get('city'))))
        if identity in seen:
            continue
        seen.add(identity)
        found.append((price if sort_by == 'price' else distance, dict(offer)))
    return [offer for _, offer in sorted(found, key=lambda item: item[0])]
