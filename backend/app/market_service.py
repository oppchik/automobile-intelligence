"""Объяснимая предварительная оценка на основе локального пула объявлений.

Объявления отражают запрашиваемые цены, не цены сделок. Расчёт «как есть»
использует стоимость ремонта и оценку тяжести повреждений, не обученную ML-модель.
"""
import json
from pathlib import Path
from .market_algorithms import estimate_from_listings

DATASET = Path(__file__).resolve().parents[1] / 'datasets' / 'example_clean.json'


def load_listings(path=DATASET):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(data, list):
        raise ValueError('Dataset must be a JSON list')
    return data


def estimate_market(records, *, brand, model, year, mileage, region, repair_cost, severity):
    if not 0 <= severity <= 1:
        raise ValueError('Severity must be between 0 and 1')
    if repair_cost < 0:
        raise ValueError('Repair cost must be non-negative')
    base = estimate_from_listings(records, brand=brand, model=model, year=year,
                                  mileage=mileage, region=region)
    if base['estimate'] is None:
        return {
            'status': 'insufficient_data', 'count': base['count'],
            'candidate_count': base['candidate_count'], 'after_repair': None,
            'as_is': None, 'explanation': 'Недостаточно аналогов: требуется минимум 3 объявления одного региона, марки и модели с близким годом и пробегом.',
            'method': 'median_mad', 'data_source': 'local_demo_listings',
        }
    # Объявления описывают автомобили после ремонта / без указанных повреждений.
    # Медиана устойчива к единичным дорогим объявлениям. Диапазон — min/max аналогов.
    # Дисконт «как есть»: прямые затраты на ремонт плюс резерв на риски повреждений.
    # Не утверждаем, что это реальные цены сделок.
    repair_discount = round(repair_cost * 1.15)
    risk_discount = round(float(base['estimate']) * severity * 0.10)
    discount = repair_discount + risk_discount
    after = {'estimate': round(base['estimate']), 'minimum': round(base['minimum']),
             'maximum': round(base['maximum'])}
    as_is = {key: max(0, value - discount) for key, value in after.items()}
    confidence = {'ok': 'достаточная', 'preliminary': 'предварительная', 'indicative': 'ориентировочная'}[base['status']]
    explanation = (
        f'Количество сопоставимых объявлений: {base["count"]}. Оценка после ремонта — медиана '
        f'запрашиваемых цен; диапазон — минимум и максимум выборки. Оценка «как есть» '
        f'уменьшена на ремонт с резервом 15% ({repair_discount:,} ₽) и риск повреждений '
        f'({risk_discount:,} ₽). Надёжность: {confidence}. Это учебные объявления, не сделки.'
    )
    return {
        'status': base['status'], 'count': base['count'],
        'candidate_count': base['candidate_count'], 'after_repair': after,
        'as_is': as_is, 'repair_discount': repair_discount,
        'risk_discount': risk_discount, 'explanation': explanation,
        'method': 'median_mad', 'data_source': 'local_demo_listings',
    }
