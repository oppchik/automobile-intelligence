
"""Финансовый советчик проекта Авто-Интеллект."""

from typing import Mapping


def compare_scenarios(
    *,
    as_is_value: float,
    after_repair_value: float,
    repair_cost: float,
    years: int,
    annual_costs: Mapping[str, float],
    alternative_transport_per_year: float | None = None,
    sale_fee_rate: float = 0.01,
    depreciation_rate: float = 0.12,
    discount_rate: float = 0.08,
    goal: str = "cash_now",
    repair_budget: float | None = None,
    risk: str = "normal",
) -> dict:

    if not 1 <= years <= 10:
        raise ValueError("Срок эксплуатации: от 1 до 10 лет")

    if goal not in ("cash_now", "keep_using"):
        raise ValueError("Неизвестная цель пользователя")

    margins = {
        "low": 0.05,
        "normal": 0.03,
        "high": 0.01,
    }

    if risk not in margins:
        raise ValueError("Риск: low, normal или high")

    values = [as_is_value, after_repair_value, repair_cost]
    values.extend(annual_costs.values())

    if alternative_transport_per_year is not None:
        values.append(alternative_transport_per_year)

    if repair_budget is not None:
        values.append(repair_budget)

    if any(value < 0 for value in values):
        raise ValueError("Денежные показатели не могут быть отрицательными")

    if not 0 <= sale_fee_rate < 1:
        raise ValueError("Некорректные расходы на продажу")

    if not 0 <= depreciation_rate < 1 or discount_rate < 0:
        raise ValueError("Некорректные коэффициенты")

    annual_total = sum(annual_costs.values())

    repair_affordable = (
        repair_budget is None or repair_cost <= repair_budget
    )

    # Сценарий 1. Продажа автомобиля без ремонта
    sell_now = as_is_value * (1 - sale_fee_rate)

    # Сценарий 2. Ремонт автомобиля и последующая продажа
    repair_and_sell = (
        after_repair_value * (1 - sale_fee_rate) - repair_cost
    )

    # Сценарий 3. Ремонт и дальнейшая эксплуатация
    future_value = (
        after_repair_value * (1 - depreciation_rate) ** years
    )

    annuity_factor = sum(
        1 / (1 + discount_rate) ** year
        for year in range(1, years + 1)
    )

    ownership_cost_pv = annual_total * annuity_factor

    keep_base = (
        -repair_cost
        - ownership_cost_pv
        + future_value * (1 - sale_fee_rate)
        / (1 + discount_rate) ** years
    )

    keep_value = None

    if alternative_transport_per_year is not None:
        avoided_transport_cost = (
            alternative_transport_per_year * annuity_factor
        )
        keep_value = keep_base + avoided_transport_cost

    scenarios = {
        "sell_as_is": {
            "label": "Продать как есть",
            "value_rub": round(sell_now, 2),
            "available": True,
        },
        "repair_sell": {
            "label": "Отремонтировать и продать",
            "value_rub": round(repair_and_sell, 2),
            "available": repair_affordable,
        },
        "repair_keep": {
            "label": "Отремонтировать и эксплуатировать",
            "value_rub": (
                round(keep_value, 2)
                if keep_value is not None else None
            ),
            "available": (
                repair_affordable and keep_value is not None
            ),
        },
    }

    if goal == "keep_using" and repair_affordable and keep_value is None:
        recommendation = "needs_data"
        reason = (
            "Укажите расходы на альтернативный транспорт, "
            "чтобы оценить финансовую пользу эксплуатации."
        )
    else:
        choices = ["sell_as_is"]

        if repair_affordable:
            choices.append("repair_sell")

            if goal == "keep_using" and keep_value is not None:
                choices.append("repair_keep")

        ranking = sorted(
            choices,
            key=lambda key: scenarios[key]["value_rub"],
            reverse=True,
        )

        best = ranking[0]
        second = ranking[1] if len(ranking) > 1 else None

        difference = (
            scenarios[best]["value_rub"]
            - scenarios[second]["value_rub"]
            if second else 0
        )

        min_difference = (
            max(as_is_value, after_repair_value) * margins[risk]
        )

        if second and difference < min_difference:
            recommendation = "inspect"
            reason = (
                "Разница между лучшими сценариями невелика. "
                "Нужно уточнить рыночную цену и смету ремонта."
            )
        else:
            recommendation = best
            reason = (
                f"Рекомендуемый вариант: {scenarios[best]['label']}."
            )

    return {
        "scenarios": scenarios,
        "recommendation": recommendation,
        "reason": reason,
        "annual_ownership_cost_rub": round(annual_total, 2),
        "ownership_cost_for_period_rub": round(
            annual_total * years, 2
        ),
        "ownership_present_value_rub": round(
            ownership_cost_pv, 2
        ),
        "expected_resale_after_years_rub": round(
            future_value, 2
        ),
        "repair_cost_rub": round(repair_cost, 2),
        "repair_affordable": repair_affordable,
        "years": years,
        "note": (
            "Оценки модельные. Износ учитывается через "
            "остаточную стоимость автомобиля и не включается "
            "повторно в ежегодные расходы."
        ),
    }
