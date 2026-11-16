import { fmtRub } from "./engine.js";

export const FRESH_DAYS = 3;
export const STALE_DAYS = 7;
export const MAX_USER_DISTANCE_KM = 100;

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function hasCoordinates(point) {
  return Boolean(point) && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

export function freshness(age) {
  if (!Number.isFinite(age) || age < 0) return { level: "unknown", label: "Дата неизвестна" };
  if (age <= FRESH_DAYS) return { level: "fresh", label: "Свежая цена" };
  if (age <= STALE_DAYS) return { level: "ok", label: "Актуальна" };
  return { level: "stale", label: "Могла устареть" };
}

export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "дата неизвестна";
}

export function plural(n, [one, few, many]) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

const dayWord = (n) => plural(n, ["день", "дня", "дней"]);

export function ageText(age) {
  if (!Number.isFinite(age) || age < 0) return "";
  if (age === 0) return "сегодня";
  if (age === 1) return "вчера";
  return `${age} ${dayWord(age)} назад`;
}

export function deliveryText(point) {
  if (!point.delivery) return "Доставки нет";
  const { delivery_days_min: min, delivery_days_max: max, delivery_cost: cost } = point;
  const days = min === max ? `${min} ${dayWord(min)}` : `${min}–${max} ${dayWord(max)}`;
  return `Доставка ${days}, ${cost === 0 ? "бесплатно" : fmtRub(cost)}`;
}

export function pickupText(point) {
  return point.pickup ? `Самовывоз: ${point.pickup_hours}` : "Самовывоза нет";
}

function matches(offer, query, condition) {
  if (condition && offer.condition !== condition) return false;
  if (!query) return true;
  return offer.name.toLowerCase().includes(query) || offer.oem.toLowerCase().includes(query);
}

export function groupSellers({ sellers, offers, query = "", condition = "", deliveryOnly = false, maxAge = 0, origin = null }) {
  const q = query.toLowerCase().trim();
  const bySeller = new Map();
  for (const offer of offers) {
    if (!bySeller.has(offer.seller)) bySeller.set(offer.seller, []);
    bySeller.get(offer.seller).push(offer);
  }
  const groups = [];
  for (const seller of sellers) {
    if (!hasCoordinates(seller)) continue;
    if (condition && seller.condition !== condition) continue;
    if (deliveryOnly && !seller.delivery) continue;
    if (maxAge > 0 && !(seller.price_age_days <= maxAge)) continue;
    const found = (bySeller.get(seller.seller) || []).filter((o) => matches(o, q, condition));
    if (found.length === 0) continue;
    const sorted = [...found].sort((a, b) => a.price - b.price);
    const distance = origin ? Math.round(haversineKm(origin, seller) * 10) / 10 : seller.distance_km;
    groups.push({ seller, offers: sorted, bestPrice: sorted[0].price, distance });
  }
  return groups;
}

export function sortGroups(groups, sort) {
  const byPrice = (a, b) => a.bestPrice - b.bestPrice || a.distance - b.distance;
  const byDistance = (a, b) => a.distance - b.distance || a.bestPrice - b.bestPrice;
  return [...groups].sort((a, b) => (sort === "distance" ? byDistance(a, b) : byPrice(a, b))
    || a.seller.seller.localeCompare(b.seller.seller, "ru"));
}

export function resolveOrigin(center, position) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lon)) {
    return { origin: null, reason: null, distance: null };
  }
  const distance = haversineKm(center, position);
  if (distance > MAX_USER_DISTANCE_KM) return { origin: null, reason: "far", distance: Math.round(distance) };
  return { origin: position, reason: null, distance };
}

export function geolocationMessage(error) {
  if (error === "unsupported") return "Браузер не поддерживает определение местоположения";
  if (error && error.code === 1) return "Доступ к местоположению запрещён — расстояние считаем от центра города";
  if (error && error.code === 3) return "Определение местоположения заняло слишком много времени";
  return "Не удалось определить местоположение — расстояние считаем от центра города";
}

export function pinLabel(group, hasQuery) {
  return hasQuery ? fmtRub(group.bestPrice) : String(group.offers.length);
}
