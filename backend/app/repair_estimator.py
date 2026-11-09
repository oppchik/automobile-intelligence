"""Детализация учебной сметы; нормативы производителя не используются."""
from math import floor, isclose

from .data import DAMAGE_CATEGORIES, PARTS_CATALOG, REGIONS, DIAGNOSTIC_FEE, CONTINGENCY_RATE
from .engine import run_calculation

BASE_HOURLY_RATE = 2000


def _round(value):
    return floor(value + 0.5)


def _round_to_sum(values, target):
    floors = [floor(v) for v in values]
    extra = target - sum(floors)
    order = sorted(range(len(values)), key=lambda i: floors[i] - values[i])
    for i in order[:max(0, extra)]:
        floors[i] += 1
    return floors


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
        consumables = [{'name': name, 'base_price': price, 'cost': price * result.scale}
                       for name, price in result.consumables]
        parts_cost = sum(p['cost'] for p in parts) + sum(c['cost'] for c in consumables)
        hourly_rate = BASE_HOURLY_RATE * regional_rate * result.scale * multiplier
        labor_lines = [{'key': key, 'label': DAMAGE_CATEGORIES[key]['label'],
                        'hours': hours[key], 'rate': hourly_rate,
                        'cost': hours[key] * hourly_rate}
                       for key in result.categories]
        labor_cost = sum(hours.values()) * BASE_HOURLY_RATE * regional_rate * result.scale * multiplier
        diagnostic = DIAGNOSTIC_FEE * regional_rate
        contingency = CONTINGENCY_RATE * (parts_cost + labor_cost)
        total = parts_cost + labor_cost + diagnostic + contingency
        calculated = dict(parts_cost=parts_cost, labor_cost=labor_cost,
                          diagnostic=diagnostic, contingency=contingency, cost=total)
        for key, value in calculated.items():
            if not isclose(value, getattr(original, key), abs_tol=0.01, rel_tol=0):
                raise ValueError(f'Расхождение с engine.py: {original.key}.{key}')
        total_amount = _round(total)
        parts_amount, labor_amount, diagnostic_amount, contingency_amount = _round_to_sum(
            [parts_cost, labor_cost, diagnostic, contingency], total_amount)
        item_amounts = _round_to_sum([p['cost'] for p in parts] + [c['cost'] for c in consumables],
                                     parts_amount)
        for line, amount in zip(parts + consumables, item_amounts):
            line['amount'] = amount
        for line, amount in zip(labor_lines, _round_to_sum([l['cost'] for l in labor_lines], labor_amount)):
            line['amount'] = amount
        variants.append(dict(key=original.key, name=original.name, eta=original.eta,
                             parts=parts, consumables=consumables, labor_lines=labor_lines,
                             parts_markup=markup, labor_multiplier=multiplier,
                             hourly_rate=hourly_rate,
                             amounts=dict(parts=parts_amount, labor=labor_amount,
                                          diagnostic=diagnostic_amount,
                                          contingency=contingency_amount, total=total_amount),
                             **calculated))
    dealer_total = variants[0]['amounts']['total']
    for variant in variants:
        saving = dealer_total - variant['amounts']['total']
        variant['savings_vs_dealer'] = saving
        variant['savings_percent'] = floor(saving / dealer_total * 1000 + 0.5) / 10 if dealer_total else 0.0
    return dict(categories=result.categories, scale=result.scale, region=result.region,
                region_coefficient=regional_rate, base_hourly_rate=BASE_HOURLY_RATE,
                diagnostic_base=DIAGNOSTIC_FEE, contingency_rate=CONTINGENCY_RATE,
                hours_by_category=hours, total_hours=sum(hours.values()),
                cheapest=min(variants, key=lambda v: v['cost'])['key'],
                used_parts_applicable=bool(result.required_parts), variants=variants)
