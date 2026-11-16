import math
import unittest
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app import main as app_main
from app.data import PARTS_CATALOG, REGION_CENTERS, REGIONS, SELLER_PROFILES, SELLERS
from app.engine import _hash, build_part_offers, build_sellers
from app.parts_algorithms import search_parts

TODAY = date(2026, 11, 13)


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


class SellerPointTests(unittest.TestCase):
    def test_one_point_per_seller_with_matching_condition(self):
        for region in REGIONS:
            with self.subTest(region=region):
                points = build_sellers(region, TODAY)
                self.assertEqual([p["seller"] for p in points], [s for s, _ in SELLERS])
                self.assertEqual(len({p["id"] for p in points}), len(points))
                self.assertEqual([p["condition"] for p in points], [c for _, c in SELLERS])
                self.assertTrue(all(p["city"] == region for p in points))

    def test_coordinates_match_distance_from_city_center(self):
        for region, (lat0, lon0) in REGION_CENTERS.items():
            for p in build_sellers(region, TODAY):
                with self.subTest(region=region, seller=p["seller"]):
                    self.assertAlmostEqual(haversine(lat0, lon0, p["lat"], p["lon"]), p["distance_km"], delta=0.02)
                    self.assertTrue(2 <= p["distance_km"] <= 20)
                    self.assertTrue(-90 < p["lat"] < 90 and -180 < p["lon"] < 180)

    def test_price_date_follows_the_seller_update_cadence(self):
        for region in REGIONS:
            for p in build_sellers(region, TODAY):
                with self.subTest(region=region, seller=p["seller"]):
                    age = p["price_age_days"]
                    self.assertTrue(0 <= age <= SELLER_PROFILES[p["seller"]]["max_price_age"])
                    self.assertEqual(p["price_date"], (TODAY - timedelta(days=age)).isoformat())
                    self.assertEqual(p["source"], SELLER_PROFILES[p["seller"]]["source"])

    def test_delivery_terms_are_consistent(self):
        for p in build_sellers("Казань", TODAY):
            with self.subTest(seller=p["seller"]):
                self.assertTrue(p["pickup"])
                self.assertTrue(p["pickup_hours"])
                if p["delivery"]:
                    self.assertLessEqual(p["delivery_days_min"], p["delivery_days_max"])
                    self.assertGreaterEqual(p["delivery_cost"], 0)
                else:
                    self.assertIsNone(p["delivery_days_min"])
                    self.assertIsNone(p["delivery_days_max"])
                    self.assertIsNone(p["delivery_cost"])

    def test_points_are_deterministic_and_differ_between_cities(self):
        self.assertEqual(build_sellers("Москва и МО", TODAY), build_sellers("Москва и МО", TODAY))
        a = {p["seller"]: (p["lat"], p["lon"]) for p in build_sellers("Москва и МО", TODAY)}
        b = {p["seller"]: (p["lat"], p["lon"]) for p in build_sellers("Краснодар", TODAY)}
        self.assertTrue(all(a[s] != b[s] for s in a))

    def test_stale_and_fresh_prices_both_occur(self):
        ages = [p["price_age_days"] for region in REGIONS for p in build_sellers(region, TODAY)]
        self.assertTrue(any(a <= 3 for a in ages))
        self.assertTrue(any(a > 7 for a in ages))

    def test_default_date_is_today(self):
        newest = max(p["price_date"] for p in build_sellers("Екатеринбург"))
        self.assertLessEqual(date.fromisoformat(newest), date.today() + timedelta(days=1))


class OfferConsistencyTests(unittest.TestCase):
    def setUp(self):
        self.region = "Екатеринбург"
        self.points = {p["seller"]: p for p in build_sellers(self.region, TODAY)}
        self.offers = build_part_offers(1.0, self.region, TODAY)

    def test_offers_carry_seller_level_attributes(self):
        for o in self.offers:
            p = self.points[o["seller"]]
            self.assertEqual(o["distance_km"], p["distance_km"])
            self.assertEqual(o["delivery"], p["delivery"])
            self.assertEqual(o["source"], p["source"])
            self.assertEqual(o["price_date"], p["price_date"])
            self.assertEqual(o["condition"], p["condition"])

    def test_one_seller_has_one_location_for_all_parts(self):
        for seller in self.points:
            self.assertEqual(len({o["distance_km"] for o in self.offers if o["seller"] == seller}), 1)

    def test_price_formula_is_unchanged(self):
        for scale in (0.6, 1.0, 2.2):
            for o in build_part_offers(scale, self.region, TODAY):
                name, seller = o["key"].split("|")
                base = PARTS_CATALOG[name][o["condition"]]
                self.assertEqual(o["price"], round(base * scale * (0.9 + (_hash(name + seller) % 25) / 100)))

    def test_every_seller_has_offers_matching_its_condition(self):
        for seller, point in self.points.items():
            mine = [o for o in self.offers if o["seller"] == seller]
            self.assertTrue(mine)
            self.assertTrue(all(o["condition"] == point["condition"] for o in mine))

    def test_search_parts_works_on_enriched_offers(self):
        found = search_parts(self.offers, "бампер", sort_by="distance_km")
        self.assertTrue(found)
        distances = [o["distance_km"] for o in found]
        self.assertEqual(distances, sorted(distances))
        near = search_parts(self.offers, "бампер", max_distance_km=8)
        self.assertTrue(all(o["distance_km"] <= 8 for o in near))
        used = search_parts(self.offers, "", condition="used")
        self.assertTrue(used and all(o["condition"] == "used" for o in used))
        self.assertEqual(len(search_parts(self.offers + self.offers, "")), len(self.offers))


class SellerApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_main.app)

    def test_sellers_endpoint(self):
        r = self.client.get("/api/sellers", params={"region": "Новосибирск"})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        lat, lon = REGION_CENTERS["Новосибирск"]
        self.assertEqual(body["center"], {"lat": lat, "lon": lon})
        self.assertEqual(len(body["sellers"]), len(SELLERS))
        for s in body["sellers"]:
            self.assertAlmostEqual(haversine(lat, lon, s["lat"], s["lon"]), s["distance_km"], delta=0.02)
            self.assertRegex(s["price_date"], r"^\d{4}-\d{2}-\d{2}$")

    def test_unknown_region_is_rejected(self):
        self.assertEqual(self.client.get("/api/sellers", params={"region": "Марс"}).status_code, 400)
        self.assertEqual(self.client.get("/api/sellers").status_code, 422)

    def test_parts_and_sellers_agree(self):
        region = "Казань"
        sellers = {s["seller"]: s for s in self.client.get("/api/sellers", params={"region": region}).json()["sellers"]}
        offers = self.client.get("/api/parts", params={"region": region, "scale": 1}).json()
        self.assertTrue(offers)
        for o in offers:
            s = sellers[o["seller"]]
            self.assertEqual((o["distance_km"], o["delivery"], o["source"], o["price_date"]),
                             (s["distance_km"], s["delivery"], s["source"], s["price_date"]))


if __name__ == "__main__":
    unittest.main()
