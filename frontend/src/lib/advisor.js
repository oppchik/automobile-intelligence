export const ADVISOR_LABELS = {
  sell_as_is: "Продать как есть",
  repair_sell: "Отремонтировать и продать",
  repair_keep: "Отремонтировать и эксплуатировать",
};

export const RECOMMENDATION_LABELS = {
  ...ADVISOR_LABELS,
  inspect: "Нужно уточнить данные",
  needs_data: "Нужны дополнительные данные",
};

export const ADVISOR_ASSUMPTIONS = {
  sale_fee_rate: 0.01,
  depreciation_rate: 0.12,
  discount_rate: 0.08,
};

const MARGINS = { low: 0.05, normal: 0.03, high: 0.01 };

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function compareScenarios(input) {
  const {
    as_is_value: asIs,
    after_repair_value: afterRepair,
    repair_cost: repairCost,
    years,
    annual_costs: annualCosts = {},
    alternative_transport_per_year: transport = null,
    sale_fee_rate: fee = ADVISOR_ASSUMPTIONS.sale_fee_rate,
    depreciation_rate: depreciation = ADVISOR_ASSUMPTIONS.depreciation_rate,
    discount_rate: discount = ADVISOR_ASSUMPTIONS.discount_rate,
    goal = "cash_now",
    repair_budget: budget = null,
    risk = "normal",
  } = input;

  if (!(years >= 1 && years <= 10)) throw new Error("Срок эксплуатации: от 1 до 10 лет");
  if (goal !== "cash_now" && goal !== "keep_using") throw new Error("Неизвестная цель пользователя");
  if (!(risk in MARGINS)) throw new Error("Риск: low, normal или high");

  const values = [asIs, afterRepair, repairCost, ...Object.values(annualCosts)];
  if (transport !== null) values.push(transport);
  if (budget !== null) values.push(budget);
  if (values.some((v) => v < 0)) throw new Error("Денежные показатели не могут быть отрицательными");
  if (!(fee >= 0 && fee < 1)) throw new Error("Некорректные расходы на продажу");
  if (!(depreciation >= 0 && depreciation < 1) || discount < 0) throw new Error("Некорректные коэффициенты");

  const annualTotal = Object.values(annualCosts).reduce((a, b) => a + b, 0);
  const affordable = budget === null || repairCost <= budget;

  const annuity = (n) => {
    let sum = 0;
    for (let y = 1; y <= n; y += 1) sum += 1 / (1 + discount) ** y;
    return sum;
  };
  const costsPv = (n) => annualTotal * annuity(n);
  const transportPv = (n) => (transport === null ? 0 : transport * annuity(n));
  const resalePv = (n) => (afterRepair * (1 - depreciation) ** n * (1 - fee)) / (1 + discount) ** n;

  const sellNow = asIs * (1 - fee);
  const repairAndSell = afterRepair * (1 - fee) - repairCost;
  const futureValue = afterRepair * (1 - depreciation) ** years;
  const ownershipPv = costsPv(years);
  const keepBase = -repairCost - ownershipPv + resalePv(years);
  const keepValue = transport === null ? null : keepBase + transportPv(years);

  const scenarios = {
    sell_as_is: { label: ADVISOR_LABELS.sell_as_is, value_rub: round2(sellNow), available: true },
    repair_sell: { label: ADVISOR_LABELS.repair_sell, value_rub: round2(repairAndSell), available: affordable },
    repair_keep: {
      label: ADVISOR_LABELS.repair_keep,
      value_rub: keepValue === null ? null : round2(keepValue),
      available: affordable && keepValue !== null,
    },
  };

  let recommendation;
  let reason;
  let comparison = null;

  if (goal === "keep_using" && affordable && keepValue === null) {
    recommendation = "needs_data";
    reason = "Укажите расходы на альтернативный транспорт, чтобы оценить финансовую пользу эксплуатации.";
  } else {
    const choices = ["sell_as_is"];
    if (affordable) {
      choices.push("repair_sell");
      if (goal === "keep_using" && keepValue !== null) choices.push("repair_keep");
    }
    const ranking = [...choices].sort((a, b) => scenarios[b].value_rub - scenarios[a].value_rub);
    const best = ranking[0];
    const second = ranking.length > 1 ? ranking[1] : null;
    const difference = second ? scenarios[best].value_rub - scenarios[second].value_rub : 0;
    const minDifference = Math.max(asIs, afterRepair) * MARGINS[risk];
    comparison = {
      best,
      second,
      difference_rub: round2(difference),
      threshold_rub: round2(minDifference),
    };
    if (second && difference < minDifference) {
      recommendation = "inspect";
      reason = "Разница между лучшими сценариями невелика. Нужно уточнить рыночную цену и смету ремонта.";
    } else {
      recommendation = best;
      reason = `Рекомендуемый вариант: ${scenarios[best].label}.`;
    }
  }

  const keepItems = [
    { key: "repair", label: "Ремонт", value_rub: round2(-repairCost) },
    { key: "ownership", label: "Расходы на владение", value_rub: round2(-ownershipPv) },
    { key: "resale", label: "Продажа через заданный срок", value_rub: round2(resalePv(years)) },
  ];
  if (transport !== null) {
    keepItems.push({ key: "transport", label: "Сэкономленный транспорт", value_rub: round2(transportPv(years)) });
  }

  const breakdown = {
    sell_as_is: {
      formula: "Цена как есть минус расходы на продажу",
      complete: true,
      items: [
        { key: "price", label: "Цена как есть", value_rub: round2(asIs) },
        { key: "fee", label: "Расходы на продажу", value_rub: round2(-asIs * fee) },
      ],
    },
    repair_sell: {
      formula: "Цена после ремонта минус расходы на продажу минус ремонт",
      complete: true,
      items: [
        { key: "price", label: "Цена после ремонта", value_rub: round2(afterRepair) },
        { key: "fee", label: "Расходы на продажу", value_rub: round2(-afterRepair * fee) },
        { key: "repair", label: "Ремонт", value_rub: round2(-repairCost) },
      ],
    },
    repair_keep: {
      formula:
        "Минус ремонт, минус расходы на владение, плюс продажа через заданный срок и сэкономленный транспорт, всё приведено к сегодняшним деньгам",
      complete: transport !== null,
      items: keepItems,
    },
  };

  const timeline = [];
  for (let year = 0; year <= years; year += 1) {
    timeline.push({
      year,
      sell_as_is: round2(sellNow),
      repair_sell: round2(repairAndSell),
      repair_keep: transport === null ? null : round2(-repairCost - costsPv(year) + transportPv(year) + resalePv(year)),
    });
  }

  return {
    scenarios,
    recommendation,
    reason,
    annual_ownership_cost_rub: round2(annualTotal),
    ownership_cost_for_period_rub: round2(annualTotal * years),
    ownership_present_value_rub: round2(ownershipPv),
    expected_resale_after_years_rub: round2(futureValue),
    repair_cost_rub: round2(repairCost),
    repair_affordable: affordable,
    years,
    comparison,
    breakdown,
    timeline,
    note: "Оценки модельные. Износ учитывается через остаточную стоимость автомобиля и не включается повторно в ежегодные расходы.",
  };
}

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export function buildAdvicePayload(result, scenarios, conditions) {
  const annual = toNumber(conditions.annualCost);
  const budget = toNumber(conditions.repairBudget);
  const transport = toNumber(conditions.transport);
  const fields = { annual, budget, transport };
  const invalid = Object.values(fields).some((v) => Number.isNaN(v) || (v !== null && v < 0));
  if (invalid) return { error: "Суммы должны быть неотрицательными числами" };
  return {
    payload: {
      as_is_value: Math.round(result.as_is_value),
      after_repair_value: Math.round(result.after_value),
      repair_cost: Math.round(scenarios.cost),
      years: conditions.years,
      annual_costs: { upkeep: annual === null ? Math.round(scenarios.upkeep_per_year) : annual },
      alternative_transport_per_year: transport,
      goal: conditions.goal,
      repair_budget: budget,
      risk: conditions.risk,
    },
  };
}

export function snapshotAdvisor(payload, advice) {
  return {
    years: payload.years,
    goal: payload.goal,
    risk: payload.risk,
    repair_budget: payload.repair_budget,
    alternative_transport_per_year: payload.alternative_transport_per_year,
    annual_cost: payload.annual_costs.upkeep,
    recommendation: advice.recommendation,
    values: Object.fromEntries(Object.entries(advice.scenarios).map(([k, v]) => [k, v.value_rub])),
  };
}

export function niceTicks(min, max, count = 4) {
  if (min === max) return [min];
  const span = max - min;
  const rough = span / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough);
  const start = Math.floor(min / step) * step;
  const ticks = [];
  let t = start;
  for (let i = 0; i < 50; i += 1) {
    ticks.push(Math.round(t * 1e6) / 1e6);
    if (t >= max) break;
    t += step;
  }
  return ticks;
}

export function stackSegments(items) {
  let positive = 0;
  let negative = 0;
  return items.map((item) => {
    if (item.value_rub >= 0) {
      const seg = { ...item, from: positive, to: positive + item.value_rub };
      positive = seg.to;
      return seg;
    }
    const seg = { ...item, from: negative, to: negative + item.value_rub };
    negative = seg.to;
    return seg;
  });
}
