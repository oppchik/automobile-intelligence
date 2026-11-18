import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAMAGE_CATEGORIES, PARTS_CATALOG, buildEstimate, buildPartOffers, runCalculation } from "./engine.js";

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

test("photo severity replaces the photo-count bonus", () => {
  const base = { ...data.scenarios[0].input, photo_count: 0 };
  const sev = (extra) => runCalculation({ ...base, ...extra }).severity;
  assert.ok(Math.abs(sev({ photo_severity: "moderate" }) - sev({ photo_severity: "minor" }) - 0.06) < 1e-9);
  assert.ok(Math.abs(sev({ photo_severity: "severe" }) - sev({ photo_severity: "minor" }) - 0.12) < 1e-9);
  assert.equal(sev({ photo_severity: "minor", photo_count: 6 }), sev({ photo_severity: "minor" }));
  assert.equal(sev({ photo_severity: null, photo_count: 3 }), sev({ photo_count: 3 }));
  assert.equal(sev({ photo_severity: "constructor", photo_count: 3 }), sev({ photo_count: 3 }));
  const costs = (extra) => runCalculation({ ...base, ...extra }).variants.map((v) => v.parts_cost + v.labor_cost);
  assert.deepEqual(costs({ photo_severity: "severe" }), costs({ photo_severity: "minor" }));
});

const SYNTHETIC_PART = "Синтетическая деталь без б/у цены";
const SYNTHETIC_PRICE = 10000;

function withSyntheticPart(only, run) {
  const original = DAMAGE_CATEGORIES.body.parts;
  PARTS_CATALOG[SYNTHETIC_PART] = { new: SYNTHETIC_PRICE };
  DAMAGE_CATEGORIES.body.parts = only ? [SYNTHETIC_PART] : [...original, SYNTHETIC_PART];
  try {
    return run();
  } finally {
    DAMAGE_CATEGORIES.body.parts = original;
    delete PARTS_CATALOG[SYNTHETIC_PART];
  }
}

const bodyRequest = () => ({ ...data.scenarios[0].input, damage_categories: ["body"], description: "", photo_count: 0 });
const lineOf = (variant) => variant.parts.find((p) => p.name === SYNTHETIC_PART);

test("a part without a used price falls back to the new price", () => {
  const estimate = withSyntheticPart(false, () => buildEstimate(runCalculation(bodyRequest())));
  const [dealer, independent, used] = estimate.variants;
  for (const variant of [independent, used]) {
    const line = lineOf(variant);
    assert.equal(line.condition, "new");
    assert.equal(line.base_price, SYNTHETIC_PRICE);
    assert.equal(line.used_price, null);
  }
  assert.ok(Math.abs(lineOf(used).cost - lineOf(independent).cost) < 1e-9);
  assert.ok(Math.abs(lineOf(dealer).cost - lineOf(independent).cost * 1.35) < 1e-9);
  assert.ok(used.parts.filter((p) => p.name !== SYNTHETIC_PART).every((p) => p.condition === "used"));
  for (const v of estimate.variants) {
    const a = v.amounts;
    assert.equal(a.parts + a.labor + a.diagnostic + a.contingency, a.total);
    assert.equal([...v.parts, ...v.consumables].reduce((s, l) => s + l.amount, 0), a.parts);
  }
  assert.equal(estimate.used_parts_applicable, true);
});

test("a repair with only parts without used prices makes the used variant equal to the independent one", () => {
  const estimate = withSyntheticPart(true, () => buildEstimate(runCalculation(bodyRequest())));
  const [, independent, used] = estimate.variants;
  assert.deepEqual(used.amounts, independent.amounts);
  assert.equal(lineOf(used).condition, "new");
  assert.equal(estimate.used_parts_applicable, false);
  assert.equal(estimate.cheapest, "independent");
});

test("offline offers skip used sellers for a part without a used price and the catalog is restored", () => {
  const offers = withSyntheticPart(false, () => buildPartOffers(1, "Екатеринбург", "2026-11-13"));
  const mine = offers.filter((o) => o.name === SYNTHETIC_PART);
  assert.ok(mine.length > 0 && mine.every((o) => o.condition === "new"));
  assert.ok(offers.some((o) => o.name !== SYNTHETIC_PART && o.condition === "used"));
  assert.equal(SYNTHETIC_PART in PARTS_CATALOG, false);
  assert.equal(DAMAGE_CATEGORIES.body.parts.includes(SYNTHETIC_PART), false);
});
