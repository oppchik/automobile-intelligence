import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCalculation, buildEstimate } from "./engine.js";

const data = JSON.parse(readFileSync(new URL("../../../backend/test_data.json", import.meta.url), "utf8"));

test("offline estimate totals match report values", () => {
  for (const { input, expected } of data.scenarios) {
    const estimate = buildEstimate(runCalculation(input));
    assert.deepEqual(estimate.variants.map((v) => v.key), ["dealer", "independent", "used"]);
    for (const v of estimate.variants) assert.ok(Math.abs(v.cost - expected[v.key]) < 0.01);
  }
});

test("rounded lines add up to rounded totals", () => {
  for (const { input } of data.scenarios) {
    for (const v of buildEstimate(runCalculation(input)).variants) {
      const a = v.amounts;
      assert.equal(a.parts + a.labor + a.diagnostic + a.contingency, a.total);
      assert.equal([...v.parts, ...v.consumables].reduce((s, l) => s + l.amount, 0), a.parts);
      assert.equal(v.labor_lines.reduce((s, l) => s + l.amount, 0), a.labor);
    }
  }
});

test("labor equals hours times regional hourly rate", () => {
  for (const { input } of data.scenarios) {
    const e = buildEstimate(runCalculation(input));
    for (const v of e.variants) {
      const rate = e.base_hourly_rate * e.region_coefficient * e.scale * v.labor_multiplier;
      assert.ok(Math.abs(v.hourly_rate - rate) < 1e-9);
      assert.ok(Math.abs(v.labor_lines.reduce((s, l) => s + l.hours * rate, 0) - v.labor_cost) < 1e-6);
    }
  }
});

test("used parts are flagged as not applicable without replaceable parts", () => {
  const engineCase = data.scenarios[2];
  const e = buildEstimate(runCalculation(engineCase.input));
  assert.equal(e.used_parts_applicable, false);
  assert.equal(e.cheapest, "independent");
  assert.equal(buildEstimate(runCalculation(data.scenarios[0].input)).used_parts_applicable, true);
});
