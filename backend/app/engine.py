"""Чистая расчётная логика: без побочных эффектов, без обращения к БД.

Формулы демонстрационные (см. README), но сама модель — многофакторная:
регион, состояние до поломки, независимые категории повреждений с весами
тяжести, три варианта ремонта и трёхвариантное решение (чинить / продавать /
нужна доп. проверка).
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from .data import (
    BRANDS, REGIONS, CONDITIONS, DAMAGE_CATEGORIES, PARTS_CATALOG,
    SELLERS, SELLER_PROFILES, REGION_CENTERS, DIAGNOSTIC_FEE, CONTINGENCY_RATE,
)

CURRENT_YEAR = 2026
MAX_SEVERITY = 0.75
PHOTO_SEVERITY_BONUS = {"minor": 0.0, "moderate": 0.06, "severe": 0.12}


def _hash(s: str) -> int:
    return int(hashlib.sha1(s.encode("utf-8")).hexdigest(), 16)


def detect_categories(description: str, checked: list[str] | None) -> list[str]:
    """Автоопределение категорий по тексту + то, что явно отметил пользователь."""
    text = (description or "").lower()
    found: set[str] = set(checked or [])
    for key, cat in DAMAGE_CATEGORIES.items():
        if cat.get("hidden") and key in found:
            # скрытые категории нельзя отметить вручную — только по тексту
            found.discard(key)
        for kw in cat.get("keywords", []):
            if kw in text:
                found.add(key)
    if not found:
        found.add("body")
    return sorted(found)


@dataclass
class Variant:
    key: str
    name: str
    parts_cost: float
    labor_cost: float
    diagnostic: float
    contingency: float
    eta: str

    @property
    def cost(self) -> float:
        return self.parts_cost + self.labor_cost + self.diagnostic + self.contingency


@dataclass
class CalculationResult:
    brand: str
    model: str
    year: int
    mileage: int
    region: str
    condition: str
    categories: list[str]
    required_parts: list[str]
    consumables: list[tuple[str, float]]
    severity: float
    good_value: float
    after_value: float
    as_is_value: float
    variants: list[Variant]
    scale: float


def estimate_market_value(base_price: float, year: int, mileage: int, region: str, condition: str) -> float:
    age = max(0, CURRENT_YEAR - year)
    age_factor = max(0.25, 0.9 ** age)
    mileage_factor = 1 - min(0.3, max(-0.1, (mileage - age * 15000) / 400000))
    region_market = REGIONS[region][1]
    condition_factor = CONDITIONS[condition]
    return base_price * age_factor * mileage_factor * region_market * condition_factor


def run_calculation(
    *, brand: str, model: str, year: int, mileage: int, region: str,
    condition: str, description: str, damage_categories: list[str] | None, photo_count: int,
    photo_severity: str | None = None,
) -> CalculationResult:
    base_price = BRANDS[brand][model]
    scale = min(2.2, max(0.6, base_price / 1_500_000))
    region_labor, _ = REGIONS[region]

    categories = detect_categories(description, damage_categories)

    required_parts: set[str] = set()
    consumables: list[tuple[str, float]] = []
    severity = 0.0
    labor_base_total = 0.0
    for key in categories:
        cat = DAMAGE_CATEGORIES[key]
        labor_base_total += cat["labor_base"]
        severity += cat["severity"]
        required_parts.update(cat.get("parts", []))
        consumables.extend(cat.get("consumables", []))
    photo_bonus = PHOTO_SEVERITY_BONUS.get(photo_severity, min(0.12, photo_count * 0.035))
    severity = min(MAX_SEVERITY, severity + photo_bonus)

    consumables_total = sum(price for _, price in consumables) * scale
    parts_list = sorted(required_parts)

    def parts_cost(condition_key: str, markup: float) -> float:
        total = 0.0
        for name in parts_list:
            entry = PARTS_CATALOG[name]
            price = entry.get(condition_key) or entry["new"]
            total += price * scale * markup
        return total

    def make_variant(key: str, name: str, condition_key: str, parts_markup: float, labor_multiplier: float, eta: str) -> Variant:
        parts_total = parts_cost(condition_key, parts_markup) + consumables_total
        labor_total = labor_base_total * region_labor * scale * labor_multiplier
        diagnostic = DIAGNOSTIC_FEE * region_labor
        contingency = (parts_total + labor_total) * CONTINGENCY_RATE
        return Variant(key, name, parts_total, labor_total, diagnostic, contingency, eta)

    variants = [
        make_variant("dealer", "Официальный дилер", "new", 1.35, 1.7, "3–7 дней"),
        make_variant("independent", "Независимый сервис", "new", 1.0, 1.0, "3–5 дней"),
        make_variant("used", "Б/у запчасти", "used", 1.0, 1.0, "4–8 дней"),
    ]

    good_value = estimate_market_value(base_price, year, mileage, region, condition)
    after_value = good_value * 0.97
    independent_cost = variants[1].cost
    as_is_value = max(
        good_value * 0.35,
        after_value - independent_cost * 1.18 - after_value * severity * 0.18,
    )

    return CalculationResult(
        brand=brand, model=model, year=year, mileage=mileage, region=region, condition=condition,
        categories=categories, required_parts=parts_list, consumables=consumables, severity=severity,
        good_value=good_value, after_value=after_value, as_is_value=as_is_value,
        variants=variants, scale=scale,
    )


@dataclass
class Scenarios:
    cost: float
    scenario1: float  # продажа как есть
    scenario2: float  # ремонт -> продажа
    scenario3: float  # ремонт -> эксплуатация
    upkeep_per_year: float
    decision: str      # "repair" | "sell" | "inspect"
    decision_label: str
    delta: float
    repair_ratio: float


def compute_scenarios(result: CalculationResult, variant_index: int, years: int) -> Scenarios:
    variant = result.variants[variant_index]
    cost = variant.cost
    scenario1 = result.as_is_value
    scenario2 = result.after_value - cost
    upkeep = 0.06 * result.good_value + 70000
    scenario3 = result.after_value * (0.88 ** years) - cost - upkeep * years

    delta = scenario2 - scenario1
    repair_ratio = cost / result.after_value if result.after_value else 1.0

    if delta > result.after_value * 0.06 and repair_ratio < 0.28:
        decision, label = "repair", "Выгоднее чинить"
    elif delta < -result.after_value * 0.03 or repair_ratio > 0.38:
        decision, label = "sell", "Выгоднее продать как есть"
    else:
        decision, label = "inspect", "Нужна очная диагностика"

    return Scenarios(
        cost=cost, scenario1=scenario1, scenario2=scenario2, scenario3=scenario3,
        upkeep_per_year=upkeep, decision=decision, decision_label=label,
        delta=delta, repair_ratio=repair_ratio,
    )


def _round5(value: float) -> float:
    return math.floor(value * 1e5 + 0.5) / 1e5


def _destination(lat: float, lon: float, distance_km: float, bearing_deg: float) -> tuple[float, float]:
    angular = distance_km / 6371.0088
    bearing = math.radians(bearing_deg)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(angular) + math.cos(lat1) * math.sin(angular) * math.cos(bearing))
    lon2 = lon1 + math.atan2(math.sin(bearing) * math.sin(angular) * math.cos(lat1),
                             math.cos(angular) - math.sin(lat1) * math.sin(lat2))
    return _round5(math.degrees(lat2)), _round5(math.degrees(lon2))


def build_sellers(region: str, today: date | None = None) -> list[dict]:
    today = today or datetime.now(timezone.utc).date()
    center_lat, center_lon = REGION_CENTERS[region]
    points = []
    for seller, condition_key in SELLERS:
        profile = SELLER_PROFILES[seller]
        distance = 2 + _hash(f"{seller}|{region}") % 19
        bearing = _hash(f"bearing|{seller}|{region}") % 360
        lat, lon = _destination(center_lat, center_lon, distance, bearing)
        age = _hash(f"age|{seller}|{region}") % (profile["max_price_age"] + 1)
        delivery = profile["delivery"]
        points.append({
            "id": f"{seller}|{region}",
            "seller": seller,
            "kind": profile["kind"],
            "condition": condition_key,
            "city": region,
            "lat": lat,
            "lon": lon,
            "distance_km": distance,
            "pickup": True,
            "pickup_hours": profile["pickup_hours"],
            "delivery": delivery is not None,
            "delivery_days_min": delivery[0] if delivery else None,
            "delivery_days_max": delivery[1] if delivery else None,
            "delivery_cost": delivery[2] if delivery else None,
            "source": profile["source"],
            "price_date": (today - timedelta(days=age)).isoformat(),
            "price_age_days": age,
        })
    return points


def build_part_offers(scale: float, region: str, today: date | None = None) -> list[dict]:
    sellers = {p["seller"]: p for p in build_sellers(region, today)}
    offers = []
    for name, entry in PARTS_CATALOG.items():
        for seller, condition_key in SELLERS:
            base = entry.get(condition_key)
            if not base:
                continue
            h = _hash(name + seller)
            point = sellers[seller]
            offers.append({
                "name": name,
                "oem": f"OEM {10000 + (_hash(name) % 89999)}",
                "condition": condition_key,
                "seller": seller,
                "city": region,
                "distance_km": point["distance_km"],
                "delivery": point["delivery"],
                "source": point["source"],
                "price_date": point["price_date"],
                "price": round(base * scale * (0.9 + (h % 25) / 100)),
                "key": f"{name}|{seller}",
            })
    return offers
