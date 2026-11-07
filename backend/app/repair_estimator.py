"""Детализация учебной сметы; нормативы производителя не используются."""
from math import isclose

from .data import DAMAGE_CATEGORIES, PARTS_CATALOG, REGIONS, DIAGNOSTIC_FEE, CONTINGENCY_RATE
from .engine import run_calculation

BASE_HOURLY_RATE = 2000


def calculate_detailed_repair(**request):
    """Принимает параметры run_calculation; сверяет компоненты с движком."""
    result = run_calculation(**request)
    regional_rate = REGIONS[result.region][0]
    hours = {key: DAMAGE_CATEGORIES[key]['labor_base'] / BASE_HOURLY_RATE
             for key in result.categories}
    variants = []
    for original, condition, markup, multiplier in zip(
        result.variants, ('new', 'new', 'used'), (1.35, 1, 1), (1.7, 1, 1)
    ):
        parts = []
        for name in result.required_parts:
            entry = PARTS_CATALOG[name]
            selected = condition if entry.get(condition) else 'new'
            parts.append({'name': name, 'condition': selected,
                          'new_price': entry['new'], 'used_price': entry.get('used'),
                          'base_price': entry[selected],
                          'cost': entry[selected] * result.scale * markup})
        consumables = [{'name': name, 'cost': price * result.scale}
                       for name, price in result.consumables]
        parts_cost = sum(p['cost'] for p in parts) + sum(c['cost'] for c in consumables)
        labor_cost = sum(hours.values()) * BASE_HOURLY_RATE * regional_rate * result.scale * multiplier
        diagnostic = DIAGNOSTIC_FEE * regional_rate
        contingency = CONTINGENCY_RATE * (parts_cost + labor_cost)
        total = parts_cost + labor_cost + diagnostic + contingency
        calculated = dict(parts_cost=parts_cost, labor_cost=labor_cost,
                          diagnostic=diagnostic, contingency=contingency, cost=total)
        for key, value in calculated.items():
            if not isclose(value, getattr(original, key), abs_tol=0.01, rel_tol=0):
                raise ValueError(f'Расхождение с engine.py: {original.key}.{key}')
        variants.append(dict(key=original.key, name=original.name, parts=parts,
                             consumables=consumables, parts_markup=markup,
                             labor_multiplier=multiplier, **calculated))
    return dict(categories=result.categories, scale=result.scale,
                region_coefficient=regional_rate, base_hourly_rate=BASE_HOURLY_RATE,
                hours_by_category=hours, total_hours=sum(hours.values()), variants=variants)
