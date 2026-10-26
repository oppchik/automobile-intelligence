/*
 * Тонкий клиент к бэкенду FastAPI. Если бэкенд недоступен (например, сайт
 * открыт как чистый статический билд без API рядом), все функции тихо
 * откатываются на локальный расчётный движок (engine.js) — приложение
 * продолжает работать в офлайн-демо режиме, что и требует ТЗ по скорости
 * и доступности на любом устройстве.
 */
import * as local from "./engine.js";
import { getSessionId } from "./session.js";

const BASE = import.meta.env.VITE_API_URL || "/api";
let backendOk = true;

async function call(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
  return res.json();
}

export function isBackendAvailable() {
  return backendOk;
}

export async function fetchCatalog() {
  try {
    const data = await call("/catalog");
    backendOk = true;
    return { ...data, online: true };
  } catch {
    backendOk = false;
    return {
      brands: local.BRANDS,
      regions: Object.keys(local.REGIONS),
      conditions: Object.entries(local.CONDITION_LABELS).map(([value, label]) => ({ value, label })),
      damage_categories: Object.entries(local.DAMAGE_CATEGORIES)
        .filter(([, v]) => !v.hidden)
        .map(([value, v]) => ({ value, label: v.label })),
      online: false,
    };
  }
}

export async function calculate(payload) {
  try {
    const data = await call("/calculate", { method: "POST", body: JSON.stringify(payload) });
    backendOk = true;
    return { ...data, online: true };
  } catch {
    backendOk = false;
    return { ...local.runCalculation(payload), online: false };
  }
}

export async function fetchScenarios(calculation, variantIndex, years) {
  try {
    const data = await call("/scenarios", {
      method: "POST",
      body: JSON.stringify({ calculation, variant_index: variantIndex, years }),
    });
    backendOk = true;
    return data;
  } catch {
    backendOk = false;
    return local.computeScenarios(calculation, variantIndex, years);
  }
}

export async function fetchParts(region, scale) {
  try {
    const data = await call(`/parts?region=${encodeURIComponent(region)}&scale=${scale}`);
    backendOk = true;
    return data;
  } catch {
    backendOk = false;
    return local.buildPartOffers(scale, region);
  }
}

export async function fetchHistory() {
  const sessionId = getSessionId();
  try {
    const data = await call(`/history?session_id=${sessionId}`);
    backendOk = true;
    return data;
  } catch {
    backendOk = false;
    return null;
  }
}

export async function saveHistory(entry) {
  const sessionId = getSessionId();
  try {
    await call("/history", { method: "POST", body: JSON.stringify({ session_id: sessionId, ...entry }) });
    backendOk = true;
    return true;
  } catch {
    backendOk = false;
    return false;
  }
}

export async function clearHistory() {
  const sessionId = getSessionId();
  try {
    await call(`/history?session_id=${sessionId}`, { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}

export async function toggleWatch(partKey) {
  const sessionId = getSessionId();
  try {
    const data = await call("/watchlist/toggle", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, part_key: partKey }),
    });
    return data.watching;
  } catch {
    return null;
  }
}
