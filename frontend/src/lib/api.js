/*
 * Тонкий клиент к бэкенду FastAPI. Если бэкенд недоступен (например, сайт
 * открыт как чистый статический билд без API рядом), все функции тихо
 * откатываются на локальный расчётный движок (engine.js) — приложение
 * продолжает работать в офлайн-демо режиме, что и требует ТЗ по скорости
 * и доступности на любом устройстве.
 */
import * as local from "./engine.js";
import * as advisor from "./advisor.js";
import { clearToken, getSessionId, getToken, setToken } from "./session.js";
import { failedResult, normalizeResult } from "./severity.js";

const BASE = import.meta.env.VITE_API_URL || "/api";
let backendOk = true;

async function call(path, options) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event("ai-auth-expired"));
    }
    let detail = null;
    try {
      detail = (await res.json()).detail;
    } catch {
      detail = null;
    }
    const error = new Error(`API ${path} -> ${res.status}`);
    error.status = res.status;
    error.detail = typeof detail === "string" ? detail : null;
    throw error;
  }
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

export async function fetchEstimate(payload, calculation) {
  try {
    const data = await call("/estimate", { method: "POST", body: JSON.stringify(payload) });
    backendOk = true;
    return data;
  } catch {
    backendOk = false;
    return local.buildEstimate(calculation);
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


export async function fetchParts(region, scale, filters = {}) {
  const params = new URLSearchParams({
    region,
    scale: String(scale),
    sort_by: filters.sort_by === "distance"
        ? "distance_km"
        : (filters.sort_by || "price"),
  });

  const query = String(filters.query || "").trim();

  if (query) params.set("query", query);
  if (filters.condition) params.set("condition", filters.condition);

  if (filters.max_price !== "" && filters.max_price != null) {
    params.set("max_price", String(filters.max_price));
  }

  if (filters.max_distance_km !== "" && filters.max_distance_km != null) {
    params.set("max_distance_km", String(filters.max_distance_km));
  }

  try {
    const data = await call(`/parts?${params.toString()}`);
    backendOk = true;
    return data;
  } catch {
    backendOk = false;

    let offers = local.buildPartOffers(scale, region);

    const q = query.toLocaleLowerCase("ru-RU");
    const isVin = /^[A-HJ-NPR-Z0-9]{17}$/i.test(query);

    // Локальный движок пока не содержит VIN-справочник.
    if (isVin) return [];

    if (q) {
      const normalizedOEM = query
          .replace(/[\s-]+/g, "")
          .toUpperCase();

      offers = offers.filter((offer) =>
          offer.name.toLocaleLowerCase("ru-RU").includes(q) ||
          String(offer.oem || "")
              .replace(/[\s-]+/g, "")
              .toUpperCase() === normalizedOEM
      );
    }

    if (filters.condition) {
      offers = offers.filter(
          (offer) => offer.condition === filters.condition
      );
    }

    if (filters.max_price !== "" && filters.max_price != null) {
      offers = offers.filter(
          (offer) => offer.price <= Number(filters.max_price)
      );
    }

    if (filters.max_distance_km !== "" && filters.max_distance_km != null) {
      offers = offers.filter(
          (offer) => offer.distance_km <= Number(filters.max_distance_km)
      );
    }

    offers.sort((a, b) =>
        filters.sort_by === "distance"
            ? a.distance_km - b.distance_km
            : a.price - b.price
    );

    return offers;
  }
}

export async function fetchSellers(region) {
  try {
    const data = await call(`/sellers?region=${encodeURIComponent(region)}`);
    backendOk = true;
    return { ...data, online: true };
  } catch {
    backendOk = false;
    return { ...local.buildSellersResponse(region), online: false };
  }
}

export async function fetchAdvice(payload) {
  try {
    const data = await call("/financial-advice", { method: "POST", body: JSON.stringify(payload) });
    backendOk = true;
    return { ...data, online: true };
  } catch (e) {
    if (e.status === 422) throw new Error(e.detail || "Проверьте введённые условия");
    backendOk = false;
    return { ...advisor.compareScenarios(payload), online: false };
  }
}

export async function fetchHistory() {
  const sessionId = getSessionId();
  try {
    const data = await call(`/history?session_id=${sessionId}&limit=50`);
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
    const saved = await call("/history", { method: "POST", body: JSON.stringify({ session_id: sessionId, ...entry }) });
    backendOk = true;
    return saved;
  } catch {
    backendOk = false;
    return null;
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

export async function deleteHistoryItem(id) {
  const sessionId = getSessionId();
  try {
    await call(`/history/${id}?session_id=${sessionId}`, { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}

export async function authenticate(mode, form) {
  try {
    const data = await call(`/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify({ ...form, session_id: getSessionId() }),
    });
    setToken(data.token);
    return { user: data.user, claimed: data.claimed };
  } catch (e) {
    if (e.status === 422 && !e.detail) return { error: "Проверьте email и пароль: пароль не короче 8 символов" };
    if (e.status) return { error: e.detail || "Не удалось выполнить запрос" };
    return { error: "Сервер недоступен: войти можно только при подключении к серверу" };
  }
}

export async function fetchMe() {
  if (!getToken()) return null;
  try {
    return await call("/auth/me");
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await call("/auth/logout", { method: "POST" });
  } catch {
    return false;
  } finally {
    clearToken();
  }
  return true;
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

const CLASSIFY_TIMEOUT_MS = 30000;

export async function classifyPhotos(files, signal) {
  const body = new FormData();
  files.forEach((f) => body.append("photos", f, f.name));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort());
  try {
    const res = await fetch(`${BASE}/vision/severity`, { method: "POST", body, signal: controller.signal });
    if (res.status === 413) {
      return failedResult("rejected", "Фото слишком большие для загрузки — выберите тяжесть вручную");
    }
    if (!res.ok) throw new Error(`API /vision/severity -> ${res.status}`);
    return normalizeResult(await res.json());
  } catch {
    if (signal && signal.aborted) return null;
    if (controller.signal.aborted) {
      return failedResult("timeout", "Распознавание заняло слишком много времени — выберите тяжесть вручную");
    }
    return failedResult("unavailable", "Сервис распознавания недоступен — выберите тяжесть вручную");
  } finally {
    clearTimeout(timer);
  }
}
