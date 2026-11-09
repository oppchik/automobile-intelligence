/*
 * Локальный расчётный движок — офлайн-копия app/engine.py и app/data.py
 * с бэкенда. Используется как запасной вариант, когда FastAPI недоступен
 * (см. lib/api.js). Формулы обязаны совпадать с бэкендом 1:1.
 */

export const BRANDS = {
  Hyundai: { Solaris: 1500000, Creta: 2200000 },
  Kia: { Rio: 1550000, Sportage: 3000000 },
  Lada: { Vesta: 1350000, Granta: 900000 },
  Volkswagen: { Polo: 1650000, Tiguan: 3400000 },
  Toyota: { Camry: 3600000, Corolla: 2300000, RAV4: 3800000 },
  Skoda: { Octavia: 2400000, Rapid: 1500000 },
  Renault: { Logan: 1100000, Duster: 1900000 },
  BMW: { "3 Series": 4600000 },
  Haval: { Jolion: 2100000 },
};

export const REGIONS = {
  "Москва и МО": [1.30, 1.06],
  "Санкт-Петербург": [1.15, 1.03],
  "Екатеринбург": [1.00, 0.98],
  "Новосибирск": [0.95, 0.96],
  "Казань": [0.95, 0.97],
  "Краснодар": [0.92, 0.97],
};

export const CONDITIONS = { excellent: 1.08, good: 1.00, average: 0.88, tired: 0.74 };
export const CONDITION_LABELS = { excellent: "Отличное", good: "Хорошее", average: "Среднее", tired: "Требовало вложений" };

export const DAMAGE_CATEGORIES = {
  body: { label: "Кузов и оптика спереди", laborBase: 36000, severity: 0.18, parts: ["Бампер передний", "Крыло переднее левое", "Капот", "Кронштейн бампера"], keywords: ["бампер", "крыл", "двер", "капот", "кузов", "вмятин"] },
  optics: { label: "Фары и оптика", laborBase: 9000, severity: 0.10, parts: ["Фара левая", "Решётка радиатора"], keywords: ["фара", "фонар", "оптик", "решётк", "решетк"] },
  electronics: { label: "Датчики и электроника", laborBase: 14500, severity: 0.08, parts: ["Датчик парковки"], consumables: [["Жгут проводки (ремонт/замена)", 12200]], keywords: ["датчик", "ошибк", "парков", "электр", "проводк"] },
  suspension: { label: "Подвеска и геометрия", laborBase: 27000, severity: 0.16, parts: ["Рычаг подвески", "Стойка стабилизатора", "Радиатор охлаждения"], keywords: ["подвес", "колес", "рычаг", "стойк", "радиатор"] },
  engine: { label: "Двигатель", laborBase: 78000, severity: 0.28, parts: [], consumables: [["Комплект прокладок", 9800]], keywords: ["двигател", "масло", "дым", "перегрев", "мотор"] },
  paint: { label: "Окраска и ЛКП", laborBase: 31000, severity: 0.12, parts: [], consumables: [["ЛКМ и расходники", 16500]], keywords: ["царап", "окрас", "лак", "скол", "потёрт", "потерт"] },
  frame: { label: "Силовой каркас / рама", laborBase: 95000, severity: 0.35, parts: ["Лонжерон передний (ремонт)"], keywords: ["лонжерон", "рам", "геометри", "утопил", "сгорел", "пожар", "airbag", "подушк"], hidden: true },
};

export const PARTS_CATALOG = {
  "Бампер передний": { new: 18500, used: 8500 },
  "Кронштейн бампера": { new: 2600, used: 900 },
  "Капот": { new: 31000, used: 14000 },
  "Фара левая": { new: 24000, used: 11000 },
  "Решётка радиатора": { new: 6800, used: 2500 },
  "Крыло переднее левое": { new: 14500, used: 6500 },
  "Радиатор охлаждения": { new: 16500, used: 7000 },
  "Усилитель бампера": { new: 11000, used: 4500 },
  "Лонжерон передний (ремонт)": { new: 38000, used: 19000 },
  "Рычаг подвески": { new: 18900, used: 9000 },
  "Стойка стабилизатора": { new: 5400, used: 2200 },
  "Датчик парковки": { new: 9800, used: 4300 },
};

export const SELLERS = [
  ["ЕвроАвто", "new"], ["Bibinet", "new"], ["CTOgram", "used"],
  ["Авторазбор «Восток»", "used"], ["Дром Запчасти", "new"], ["Разборка 24", "used"],
];

const DIAGNOSTIC_FEE = 4500;
const CONTINGENCY_RATE = 0.12;
const CURRENT_YEAR = 2026;
const MAX_SEVERITY = 0.75;

function hashStr(s) {
  let x = 0;
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return x;
}

export function fmt(n) {
  return (Math.round(n / 1000) * 1000).toLocaleString("ru-RU") + " ₽";
}

export function fmtRub(n) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

export function fmtHours(n) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ч";
}

export function detectCategories(description, checked) {
  const text = (description || "").toLowerCase();
  const found = new Set(checked || []);
  for (const [key, cat] of Object.entries(DAMAGE_CATEGORIES)) {
    if (cat.hidden) found.delete(key);
    if ((cat.keywords || []).some((kw) => text.includes(kw))) found.add(key);
  }
  if (found.size === 0) found.add("body");
  return [...found].sort();
}

export function estimateMarketValue(basePrice, year, mileage, region, condition) {
  const age = Math.max(0, CURRENT_YEAR - year);
  const ageFactor = Math.max(0.25, Math.pow(0.9, age));
  const mileageFactor = 1 - Math.min(0.3, Math.max(-0.1, (mileage - age * 15000) / 400000));
  const regionMarket = REGIONS[region][1];
  const conditionFactor = CONDITIONS[condition];
  return basePrice * ageFactor * mileageFactor * regionMarket * conditionFactor;
}

export function runCalculation({ brand, model, year, mileage, region, condition = "good", description = "", damage_categories = [], photo_count = 0 }) {
  const basePrice = BRANDS[brand][model];
  const scale = Math.min(2.2, Math.max(0.6, basePrice / 1500000));
  const regionLabor = REGIONS[region][0];

  const categories = detectCategories(description, damage_categories);

  const requiredParts = new Set();
  const consumables = [];
  let severity = 0;
  let laborBaseTotal = 0;
  for (const key of categories) {
    const cat = DAMAGE_CATEGORIES[key];
    laborBaseTotal += cat.laborBase;
    severity += cat.severity;
    (cat.parts || []).forEach((p) => requiredParts.add(p));
    (cat.consumables || []).forEach((c) => consumables.push(c));
  }
  severity = Math.min(MAX_SEVERITY, severity + Math.min(0.12, photo_count * 0.035));

  const consumablesTotal = consumables.reduce((a, [, price]) => a + price, 0) * scale;
  const partsList = [...requiredParts].sort();

  const partsCost = (conditionKey, markup) =>
    partsList.reduce((total, name) => {
      const entry = PARTS_CATALOG[name];
      const price = entry[conditionKey] || entry.new;
      return total + price * scale * markup;
    }, 0);

  const makeVariant = (key, name, conditionKey, partsMarkup, laborMultiplier, eta) => {
    const parts = partsCost(conditionKey, partsMarkup) + consumablesTotal;
    const labor = laborBaseTotal * regionLabor * scale * laborMultiplier;
    const diagnostic = DIAGNOSTIC_FEE * regionLabor;
    const contingency = (parts + labor) * CONTINGENCY_RATE;
    return { key, name, partsCost: parts, laborCost: labor, diagnostic, contingency, eta, cost: parts + labor + diagnostic + contingency };
  };

  const variants = [
    makeVariant("dealer", "Официальный дилер", "new", 1.35, 1.7, "3–7 дней"),
    makeVariant("independent", "Независимый сервис", "new", 1.0, 1.0, "3–5 дней"),
    makeVariant("used", "Б/у запчасти", "used", 1.0, 1.0, "4–8 дней"),
  ];

  const goodValue = estimateMarketValue(basePrice, year, mileage, region, condition);
  const afterValue = goodValue * 0.97;
  const independentCost = variants[1].cost;
  const asIsValue = Math.max(goodValue * 0.35, afterValue - independentCost * 1.18 - afterValue * severity * 0.18);

  return {
    brand, model, year, mileage, region, condition,
    categories, category_labels: categories.map((k) => DAMAGE_CATEGORIES[k].label),
    required_parts: partsList, consumables, severity,
    good_value: goodValue, after_value: afterValue, as_is_value: asIsValue,
    variants, scale,
  };
}

export function computeScenarios(result, variantIndex, years) {
  const variant = result.variants[variantIndex];
  const cost = variant.cost;
  const scenario1 = result.as_is_value;
  const scenario2 = result.after_value - cost;
  const upkeep = 0.06 * result.good_value + 70000;
  const scenario3 = result.after_value * Math.pow(0.88, years) - cost - upkeep * years;

  const delta = scenario2 - scenario1;
  const repairRatio = result.after_value ? cost / result.after_value : 1;

  let decision = "inspect", decisionLabel = "Нужна очная диагностика";
  if (delta > result.after_value * 0.06 && repairRatio < 0.28) {
    decision = "repair"; decisionLabel = "Выгоднее чинить";
  } else if (delta < -result.after_value * 0.03 || repairRatio > 0.38) {
    decision = "sell"; decisionLabel = "Выгоднее продать как есть";
  }

  return { cost, scenario1, scenario2, scenario3, upkeep_per_year: upkeep, decision, decision_label: decisionLabel, delta, repair_ratio: repairRatio };
}

export function buildPartOffers(scale, region) {
  const offers = [];
  for (const [name, entry] of Object.entries(PARTS_CATALOG)) {
    for (const [seller, conditionKey] of SELLERS) {
      const base = entry[conditionKey];
      if (!base) continue;
      const h = hashStr(name + seller);
      offers.push({
        name, oem: `OEM ${10000 + (hashStr(name) % 89999)}`, condition: conditionKey, seller,
        city: region, distance_km: 3 + (h % 38), delivery: h % 2 === 0,
        price: Math.round(base * scale * (0.9 + (h % 25) / 100)), key: `${name}|${seller}`,
      });
    }
  }
  return offers;
}

export const BASE_HOURLY_RATE = 2000;

const roundHalfUp = (x) => Math.floor(x + 0.5);

function roundToSum(values, target) {
  const floors = values.map((v) => Math.floor(v));
  const extra = target - floors.reduce((a, b) => a + b, 0);
  const order = values.map((_, i) => i).sort((i, j) => (floors[i] - values[i]) - (floors[j] - values[j]));
  order.slice(0, Math.max(0, extra)).forEach((i) => { floors[i] += 1; });
  return floors;
}

const ESTIMATE_SPECS = [["new", 1.35, 1.7], ["new", 1, 1], ["used", 1, 1]];

export function buildEstimate(result) {
  const regionalRate = REGIONS[result.region][0];
  const hours = {};
  for (const key of result.categories) hours[key] = DAMAGE_CATEGORIES[key].laborBase / BASE_HOURLY_RATE;
  const totalHours = Object.values(hours).reduce((a, b) => a + b, 0);

  const variants = result.variants.map((original, index) => {
    const [condition, markup, multiplier] = ESTIMATE_SPECS[index];
    const parts = result.required_parts.map((name) => {
      const entry = PARTS_CATALOG[name];
      const selected = entry[condition] ? condition : "new";
      return {
        name, condition: selected, new_price: entry.new, used_price: entry.used ?? null,
        base_price: entry[selected], cost: entry[selected] * result.scale * markup,
      };
    });
    const consumables = result.consumables.map(([name, price]) => ({ name, base_price: price, cost: price * result.scale }));
    const partsCost = parts.reduce((a, p) => a + p.cost, 0) + consumables.reduce((a, c) => a + c.cost, 0);
    const hourlyRate = BASE_HOURLY_RATE * regionalRate * result.scale * multiplier;
    const laborLines = result.categories.map((key) => ({
      key, label: DAMAGE_CATEGORIES[key].label, hours: hours[key], rate: hourlyRate, cost: hours[key] * hourlyRate,
    }));
    const laborCost = totalHours * BASE_HOURLY_RATE * regionalRate * result.scale * multiplier;
    const diagnostic = DIAGNOSTIC_FEE * regionalRate;
    const contingency = CONTINGENCY_RATE * (partsCost + laborCost);
    const cost = partsCost + laborCost + diagnostic + contingency;

    const total = roundHalfUp(cost);
    const [partsAmount, laborAmount, diagnosticAmount, contingencyAmount] =
      roundToSum([partsCost, laborCost, diagnostic, contingency], total);
    const itemAmounts = roundToSum([...parts, ...consumables].map((l) => l.cost), partsAmount);
    [...parts, ...consumables].forEach((line, i) => { line.amount = itemAmounts[i]; });
    const laborAmounts = roundToSum(laborLines.map((l) => l.cost), laborAmount);
    laborLines.forEach((line, i) => { line.amount = laborAmounts[i]; });

    return {
      key: original.key, name: original.name, eta: original.eta,
      parts, consumables, labor_lines: laborLines,
      parts_markup: markup, labor_multiplier: multiplier, hourly_rate: hourlyRate,
      amounts: { parts: partsAmount, labor: laborAmount, diagnostic: diagnosticAmount, contingency: contingencyAmount, total },
      parts_cost: partsCost, labor_cost: laborCost, diagnostic, contingency, cost,
    };
  });

  const dealerTotal = variants[0].amounts.total;
  for (const v of variants) {
    const saving = dealerTotal - v.amounts.total;
    v.savings_vs_dealer = saving;
    v.savings_percent = dealerTotal ? Math.floor((saving / dealerTotal) * 1000 + 0.5) / 10 : 0;
  }

  const cheapest = variants.reduce((best, v) => (v.cost < best.cost ? v : best), variants[0]);
  return {
    categories: result.categories, scale: result.scale, region: result.region,
    region_coefficient: regionalRate, base_hourly_rate: BASE_HOURLY_RATE,
    diagnostic_base: DIAGNOSTIC_FEE, contingency_rate: CONTINGENCY_RATE,
    hours_by_category: hours, total_hours: totalHours, cheapest: cheapest.key,
    used_parts_applicable: result.required_parts.length > 0, variants,
  };
}
