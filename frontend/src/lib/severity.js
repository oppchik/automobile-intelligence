export const SEVERITY_OPTIONS = [
  { value: "minor", label: "Лёгкая" },
  { value: "moderate", label: "Средняя" },
  { value: "severe", label: "Тяжёлая" },
];

export const SEVERITY_NAMES = { minor: "лёгкая", moderate: "средняя", severe: "тяжёлая" };

const KNOWN_STATUSES = ["ok", "low_confidence", "unavailable", "timeout", "busy", "error", "rejected"];

export function failedResult(status, message) {
  return {
    status, message, severity: null, confidence: null, probabilities: null,
    needs_manual_review: true, tau: null, photos: [], elapsed_ms: 0,
  };
}

export function normalizeResult(data) {
  if (!data || typeof data !== "object" || !KNOWN_STATUSES.includes(data.status)) {
    return failedResult("error", "Получен некорректный ответ сервиса распознавания — выберите тяжесть вручную");
  }
  const usable = data.status === "ok" || data.status === "low_confidence";
  const known = Object.hasOwn(SEVERITY_NAMES, data.severity);
  return {
    ...failedResult(data.status, String(data.message || "")),
    severity: usable && known ? data.severity : null,
    confidence: usable && known && Number.isFinite(data.confidence) ? data.confidence : null,
    probabilities: usable && data.probabilities && typeof data.probabilities === "object" ? data.probabilities : null,
    needs_manual_review: data.status !== "ok",
    tau: Number.isFinite(data.tau) ? data.tau : null,
    photos: Array.isArray(data.photos) ? data.photos : [],
    elapsed_ms: Number.isFinite(data.elapsed_ms) ? data.elapsed_ms : 0,
  };
}

export function suggestedSeverity(result) {
  return result && result.status === "ok" ? result.severity : null;
}

export function severitySource(result, value) {
  if (!value) return "none";
  return suggestedSeverity(result) === value ? "model" : "manual";
}

export function percent(x) {
  return `${Math.round(x * 100)}%`;
}
