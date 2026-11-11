import test from "node:test";
import assert from "node:assert/strict";
import { failedResult, normalizeResult, severitySource, suggestedSeverity } from "./severity.js";

const ok = { status: "ok", message: "m", severity: "severe", confidence: 0.8, probabilities: { minor: 0.1, moderate: 0.1, severe: 0.8 }, needs_manual_review: false, tau: 0.55, photos: [], elapsed_ms: 5 };

test("confident result is suggested, uncertain one is not", () => {
  assert.equal(suggestedSeverity(normalizeResult(ok)), "severe");
  const low = normalizeResult({ ...ok, status: "low_confidence", confidence: 0.4, needs_manual_review: true });
  assert.equal(suggestedSeverity(low), null);
  assert.equal(low.severity, "severe");
  assert.equal(low.needs_manual_review, true);
});

test("failure statuses never carry a severity", () => {
  for (const status of ["unavailable", "timeout", "busy", "error", "rejected"]) {
    const r = normalizeResult({ ...ok, status });
    assert.equal(r.severity, null);
    assert.equal(r.probabilities, null);
    assert.equal(r.needs_manual_review, true);
    assert.equal(suggestedSeverity(r), null);
  }
});

test("malformed responses degrade to a manual-review error", () => {
  for (const bad of [null, undefined, "x", 42, {}, { status: "weird" }, { status: 5 }]) {
    const r = normalizeResult(bad);
    assert.equal(r.status, "error");
    assert.equal(r.severity, null);
    assert.ok(r.message);
  }
  const r = normalizeResult({ ...ok, severity: "catastrophic", confidence: "high", tau: "x", photos: "no" });
  assert.equal(r.severity, null);
  assert.equal(r.confidence, null);
  assert.equal(r.tau, null);
  assert.deepEqual(r.photos, []);
});

test("source of the chosen severity", () => {
  const r = normalizeResult(ok);
  assert.equal(severitySource(r, "severe"), "model");
  assert.equal(severitySource(r, "minor"), "manual");
  assert.equal(severitySource(r, null), "none");
  assert.equal(severitySource(failedResult("unavailable", "x"), "minor"), "manual");
});
