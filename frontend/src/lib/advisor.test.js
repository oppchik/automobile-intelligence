import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdvicePayload,
  compareScenarios,
  niceTicks,
  snapshotAdvisor,
  stackSegments,
} from "./advisor.js";

const CASES = [
  {
    input: {
      as_is_value: 700000, after_repair_value: 900000, repair_cost: 90000, years: 3,
      annual_costs: { fuel: 65000 }, alternative_transport_per_year: 120000, goal: "keep_using",
    },
    recommendation: "repair_sell",
    values: { sell_as_is: 693000, repair_sell: 801000, repair_keep: 533748.56 },
    available: { sell_as_is: true, repair_sell: true, repair_keep: true },
    comparison: { best: "repair_sell", second: "sell_as_is", difference_rub: 108000, threshold_rub: 27000 },
    ownershipPv: 167511.3,
    resale: 613324.8,
  },
  {
    input: {
      as_is_value: 450403, after_repair_value: 620000, repair_cost: 73447, years: 7,
      annual_costs: { upkeep: 97000 }, alternative_transport_per_year: 250000, goal: "keep_using", risk: "low",
    },
    recommendation: "repair_keep",
    values: { sell_as_is: 445898.97, repair_sell: 540353, repair_keep: 869493.31 },
    available: { sell_as_is: true, repair_sell: true, repair_keep: true },
    comparison: { best: "repair_keep", second: "repair_sell", difference_rub: 329140.31, threshold_rub: 31000 },
    ownershipPv: 505017.9,
    resale: 253378.87,
  },
  {
    input: {
      as_is_value: 700000, after_repair_value: 900000, repair_cost: 90000, years: 3,
      annual_costs: {}, goal: "cash_now", repair_budget: 50000,
    },
    recommendation: "sell_as_is",
    values: { sell_as_is: 693000, repair_sell: 801000, repair_keep: null },
    available: { sell_as_is: true, repair_sell: false, repair_keep: false },
    comparison: { best: "sell_as_is", second: null, difference_rub: 0, threshold_rub: 27000 },
    ownershipPv: 0,
    resale: 613324.8,
  },
];

const near = (a, b) => Math.abs(a - b) <= 0.011;

test("the offline advisor reproduces the server reference values", () => {
  for (const c of CASES) {
    const r = compareScenarios(c.input);
    assert.equal(r.recommendation, c.recommendation);
    for (const key of Object.keys(c.values)) {
      if (c.values[key] === null) assert.equal(r.scenarios[key].value_rub, null);
      else assert.ok(near(r.scenarios[key].value_rub, c.values[key]), `${key}: ${r.scenarios[key].value_rub}`);
      assert.equal(r.scenarios[key].available, c.available[key]);
    }
    assert.equal(r.comparison.best, c.comparison.best);
    assert.equal(r.comparison.second, c.comparison.second);
    assert.ok(near(r.comparison.difference_rub, c.comparison.difference_rub));
    assert.ok(near(r.comparison.threshold_rub, c.comparison.threshold_rub));
    assert.ok(near(r.ownership_present_value_rub, c.ownershipPv));
    assert.ok(near(r.expected_resale_after_years_rub, c.resale));
  }
});

test("breakdown items add up to the scenario values", () => {
  for (const c of CASES) {
    const r = compareScenarios(c.input);
    for (const [key, block] of Object.entries(r.breakdown)) {
      const value = r.scenarios[key].value_rub;
      if (value === null) continue;
      const total = block.items.reduce((a, b) => a + b.value_rub, 0);
      assert.ok(Math.abs(total - value) <= 0.05, `${key}: ${total} vs ${value}`);
    }
  }
});

test("the timeline spans every year and ends at the scenario value", () => {
  const r = compareScenarios(CASES[1].input);
  assert.deepEqual(r.timeline.map((p) => p.year), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(r.timeline[0].repair_keep, r.scenarios.repair_sell.value_rub);
  assert.equal(r.timeline[7].repair_keep, r.scenarios.repair_keep.value_rub);
});

test("without transport costs the keep scenario is empty and needs data", () => {
  const r = compareScenarios({ ...CASES[0].input, alternative_transport_per_year: null });
  assert.equal(r.recommendation, "needs_data");
  assert.equal(r.comparison, null);
  assert.equal(r.breakdown.repair_keep.complete, false);
  assert.ok(r.timeline.every((p) => p.repair_keep === null));
});

test("a small gap between scenarios asks for inspection", () => {
  const r = compareScenarios({
    as_is_value: 700000, after_repair_value: 800000, repair_cost: 90000, years: 3,
    annual_costs: {}, goal: "cash_now",
  });
  assert.equal(r.recommendation, "inspect");
});

test("invalid conditions are rejected", () => {
  const base = CASES[0].input;
  assert.throws(() => compareScenarios({ ...base, years: 11 }));
  assert.throws(() => compareScenarios({ ...base, years: 0 }));
  assert.throws(() => compareScenarios({ ...base, repair_cost: -1 }));
  assert.throws(() => compareScenarios({ ...base, goal: "other" }));
  assert.throws(() => compareScenarios({ ...base, risk: "other" }));
});

test("conditions are turned into a request and bad input is reported", () => {
  const result = { as_is_value: 450403.4, after_value: 620000.2 };
  const scenarios = { cost: 73447.6, upkeep_per_year: 97000.4 };
  const conditions = { years: 4, goal: "keep_using", risk: "normal", repairBudget: "", transport: "150000", annualCost: "" };
  const { payload } = buildAdvicePayload(result, scenarios, conditions);
  assert.deepEqual(payload, {
    as_is_value: 450403, after_repair_value: 620000, repair_cost: 73448, years: 4,
    annual_costs: { upkeep: 97000 }, alternative_transport_per_year: 150000,
    goal: "keep_using", repair_budget: null, risk: "normal",
  });
  assert.ok(buildAdvicePayload(result, scenarios, { ...conditions, transport: "-5" }).error);
  assert.ok(buildAdvicePayload(result, scenarios, { ...conditions, repairBudget: "abc" }).error);
});

test("the history snapshot keeps the conditions and the three values", () => {
  const payload = {
    years: 3, goal: "cash_now", risk: "low", repair_budget: null,
    alternative_transport_per_year: null, annual_costs: { upkeep: 90000 },
  };
  const advice = compareScenarios({ as_is_value: 700000, after_repair_value: 900000, repair_cost: 90000, years: 3, annual_costs: { upkeep: 90000 } });
  const snap = snapshotAdvisor(payload, advice);
  assert.equal(snap.annual_cost, 90000);
  assert.equal(snap.recommendation, advice.recommendation);
  assert.deepEqual(Object.keys(snap.values), ["sell_as_is", "repair_sell", "repair_keep"]);
  assert.equal(snap.values.repair_keep, null);
});

test("chart helpers: ticks cover the range and segments stack by sign", () => {
  const ticks = niceTicks(-120000, 810000, 4);
  assert.ok(ticks[0] <= -120000 && ticks[ticks.length - 1] >= 810000);
  assert.ok(ticks.includes(0));
  const segs = stackSegments([
    { key: "a", value_rub: 100 }, { key: "b", value_rub: -30 }, { key: "c", value_rub: 50 }, { key: "d", value_rub: -20 },
  ]);
  assert.deepEqual(segs.map((s) => [s.from, s.to]), [[0, 100], [0, -30], [100, 150], [-30, -50]]);
});
