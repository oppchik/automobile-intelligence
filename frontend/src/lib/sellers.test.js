import test from "node:test";
import assert from "node:assert/strict";
import { buildPartOffers, buildSellers, buildSellersResponse, REGION_CENTERS, SELLERS } from "./engine.js";
import {
  ageText, deliveryText, formatDate, freshness, geolocationMessage, groupSellers, haversineKm, hasCoordinates,
  pickupText, pinLabel, resolveOrigin, sortGroups,
} from "./sellers.js";

const TODAY = "2026-11-13";
const REGIONS = Object.keys(REGION_CENTERS);

test("offline seller points sit at their stated distance from the city center", () => {
  for (const region of REGIONS) {
    const [lat, lon] = REGION_CENTERS[region];
    const points = buildSellers(region, TODAY);
    assert.deepEqual(points.map((p) => p.seller), SELLERS.map(([s]) => s));
    for (const p of points) {
      assert.ok(Math.abs(haversineKm({ lat, lon }, p) - p.distance_km) < 0.02, `${region} ${p.seller}`);
      assert.ok(p.distance_km >= 2 && p.distance_km <= 20);
    }
  }
});

test("offline price dates follow the update cadence and offers agree with sellers", () => {
  const points = buildSellers("Казань", TODAY);
  const offers = buildPartOffers(1, "Казань", TODAY);
  const bySeller = Object.fromEntries(points.map((p) => [p.seller, p]));
  for (const p of points) {
    assert.match(p.price_date, /^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${p.price_date}T00:00:00Z`)) / 86400000;
    assert.equal(days, p.price_age_days);
  }
  for (const o of offers) {
    const p = bySeller[o.seller];
    assert.deepEqual([o.distance_km, o.delivery, o.source, o.price_date], [p.distance_km, p.delivery, p.source, p.price_date]);
  }
  assert.equal(buildSellersResponse("Казань", TODAY).sellers.length, SELLERS.length);
});

test("freshness classes and date formatting", () => {
  assert.equal(freshness(0).level, "fresh");
  assert.equal(freshness(3).level, "fresh");
  assert.equal(freshness(4).level, "ok");
  assert.equal(freshness(7).level, "ok");
  assert.equal(freshness(8).level, "stale");
  for (const bad of [-1, NaN, undefined]) assert.equal(freshness(bad).level, "unknown");
  assert.equal(formatDate("2026-11-03"), "03.11.2026");
  assert.equal(formatDate("garbage"), "дата неизвестна");
  assert.equal(formatDate(undefined), "дата неизвестна");
});

test("age wording", () => {
  const words = [0, 1, 2, 5, 11, 21, 22].map(ageText);
  assert.deepEqual(words, ["сегодня", "вчера", "2 дня назад", "5 дней назад", "11 дней назад", "21 день назад", "22 дня назад"]);
  assert.equal(ageText(NaN), "");
});

test("receiving terms", () => {
  const free = { delivery: true, delivery_days_min: 1, delivery_days_max: 4, delivery_cost: 0 };
  assert.equal(deliveryText(free), "Доставка 1–4 дня, бесплатно");
  assert.match(deliveryText({ ...free, delivery_days_min: 2, delivery_days_max: 2, delivery_cost: 490 }), /^Доставка 2 дня, 490/);
  assert.equal(deliveryText({ delivery: false }), "Доставки нет");
  assert.equal(pickupText({ pickup: true, pickup_hours: "пн–сб 10:00–19:00" }), "Самовывоз: пн–сб 10:00–19:00");
});

function fixture() {
  const sellers = buildSellers("Екатеринбург", TODAY);
  const offers = buildPartOffers(1, "Екатеринбург", TODAY);
  return { sellers, offers };
}

test("grouping filters by query, condition, delivery and price age", () => {
  const { sellers, offers } = fixture();
  const all = groupSellers({ sellers, offers });
  assert.equal(all.length, sellers.length);

  const bumper = groupSellers({ sellers, offers, query: "  БАМПЕР " });
  assert.ok(bumper.length > 0);
  for (const g of bumper) assert.ok(g.offers.every((o) => o.name.toLowerCase().includes("бампер")));
  assert.equal(groupSellers({ sellers, offers, query: "нет такой детали" }).length, 0);

  const oem = offers[0].oem;
  assert.ok(groupSellers({ sellers, offers, query: oem.toLowerCase() }).length > 0);

  const used = groupSellers({ sellers, offers, condition: "used" });
  assert.ok(used.length > 0 && used.every((g) => g.seller.condition === "used"));

  const delivery = groupSellers({ sellers, offers, deliveryOnly: true });
  assert.ok(delivery.length > 0 && delivery.every((g) => g.seller.delivery));
  assert.ok(delivery.length < all.length);

  const aged = sellers.map((s, i) => ({ ...s, price_age_days: [0, 2, 5, 9, 1, 12][i] }));
  const fresh = groupSellers({ sellers: aged, offers, maxAge: 3 });
  assert.deepEqual(fresh.map((g) => g.seller.price_age_days).sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(groupSellers({ sellers: aged, offers, maxAge: 7 }).length, 4);
  assert.equal(groupSellers({ sellers: aged, offers, maxAge: 0 }).length, sellers.length);
});

test("grouping drops points without valid coordinates and sellers without offers", () => {
  const { sellers, offers } = fixture();
  const broken = [{ ...sellers[0], lat: NaN }, { ...sellers[1], lon: 500 }, ...sellers.slice(2)];
  assert.equal(groupSellers({ sellers: broken, offers }).length, sellers.length - 2);
  assert.equal(groupSellers({ sellers, offers: offers.filter((o) => o.seller !== sellers[0].seller) }).length, sellers.length - 1);
  assert.equal(hasCoordinates(null), false);
  assert.equal(hasCoordinates({ lat: 56, lon: 60 }), true);
});

test("sorting by price and by distance is stable and complete", () => {
  const { sellers, offers } = fixture();
  const groups = groupSellers({ sellers, offers, query: "бампер" });
  const byPrice = sortGroups(groups, "price");
  assert.deepEqual(byPrice.map((g) => g.bestPrice), byPrice.map((g) => g.bestPrice).sort((a, b) => a - b));
  const byDistance = sortGroups(groups, "distance");
  assert.deepEqual(byDistance.map((g) => g.distance), byDistance.map((g) => g.distance).sort((a, b) => a - b));
  assert.equal(byDistance.length, groups.length);
  assert.notEqual(byPrice, groups);
});

test("best price is the minimum of the matched offers", () => {
  const { sellers, offers } = fixture();
  for (const g of groupSellers({ sellers, offers, query: "капот" })) {
    assert.equal(g.bestPrice, Math.min(...g.offers.map((o) => o.price)));
  }
});

test("user position is used only when it is near the selected city", () => {
  const { sellers, offers } = fixture();
  const [lat, lon] = REGION_CENTERS["Екатеринбург"];
  const center = { lat, lon };
  assert.deepEqual(resolveOrigin(center, null), { origin: null, reason: null, distance: null });
  assert.equal(resolveOrigin(center, { lat: NaN, lon: 1 }).origin, null);
  const near = resolveOrigin(center, { lat: lat + 0.05, lon });
  assert.ok(near.origin && near.reason === null);
  const far = resolveOrigin(center, { lat: 59.437, lon: 24.7536 });
  assert.equal(far.origin, null);
  assert.equal(far.reason, "far");
  assert.ok(far.distance > 1000);
  const groups = groupSellers({ sellers, offers, origin: near.origin });
  for (const g of groups) assert.ok(Math.abs(g.distance - haversineKm(near.origin, g.seller)) < 0.06);
});

test("geolocation errors and pin labels", () => {
  assert.match(geolocationMessage({ code: 1 }), /запрещён/);
  assert.match(geolocationMessage({ code: 3 }), /слишком много времени/);
  assert.match(geolocationMessage({ code: 2 }), /Не удалось/);
  assert.match(geolocationMessage("unsupported"), /не поддерживает/);
  const group = { bestPrice: 8500, offers: [1, 2, 3] };
  assert.equal(pinLabel(group, false), "3");
  assert.match(pinLabel(group, true), /8\s?500/);
});
