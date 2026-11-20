import unittest
from app.market_service import estimate_market, load_listings
from app.market_algorithms import normalize_listing


class MarketTests(unittest.TestCase):
    def setUp(self):
        self.records = load_listings()
        self.vehicle = dict(brand='Kia', model='Rio', year=2018, mileage=85000,
                            region='Екатеринбург', repair_cost=100000, severity=0.2)

    def test_demo_estimate_and_ranges(self):
        result = estimate_market(self.records, **self.vehicle)
        self.assertEqual(result['status'], 'indicative')
        self.assertEqual(result['count'], 3)
        self.assertEqual(result['after_repair'], dict(estimate=850000, minimum=800000, maximum=900000))
        self.assertEqual(result['as_is'], dict(estimate=718000, minimum=668000, maximum=768000))

    def test_insufficient_data(self):
        result = estimate_market(self.records, **{**self.vehicle, 'brand': 'Toyota'})
        self.assertEqual(result['status'], 'insufficient_data')
        self.assertIsNone(result['as_is'])

    def test_invalid_values(self):
        with self.assertRaises(ValueError):
            estimate_market(self.records, **{**self.vehicle, 'repair_cost': -1})
        with self.assertRaises(ValueError):
            estimate_market(self.records, **{**self.vehicle, 'severity': 1.5})

    def test_bad_listing_rejected(self):
        self.assertIsNone(normalize_listing({**self.records[0], 'price': '-100'}))

    def test_deduplicate(self):
        result = estimate_market(self.records + [self.records[0]], **self.vehicle)
        self.assertEqual(result['count'], 3)


if __name__ == '__main__':
    unittest.main()
