import unittest
from fastapi.testclient import TestClient
from app.data import REGIONS
from app.main import app
from app.repair_estimator import calculate_detailed_repair, BASE_HOURLY_RATE
from test_auint_engine import load_data


def scenarios():
    return load_data()['scenarios']


class EstimateBreakdownTests(unittest.TestCase):
    def test_amounts_add_up_to_total(self):
        for case in scenarios():
            with self.subTest(model=case['input']['model']):
                for v in calculate_detailed_repair(**case['input'])['variants']:
                    a = v['amounts']
                    self.assertEqual(a['parts'] + a['labor'] + a['diagnostic'] + a['contingency'], a['total'])
                    self.assertEqual(sum(p['amount'] for p in v['parts']) + sum(c['amount'] for c in v['consumables']), a['parts'])
                    self.assertEqual(sum(l['amount'] for l in v['labor_lines']), a['labor'])
                    self.assertEqual(a['total'], int(v['cost'] + 0.5))

    def test_labor_is_hours_times_regional_rate(self):
        for case in scenarios():
            with self.subTest(model=case['input']['model']):
                d = calculate_detailed_repair(**case['input'])
                for v in d['variants']:
                    rate = BASE_HOURLY_RATE * d['region_coefficient'] * d['scale'] * v['labor_multiplier']
                    self.assertAlmostEqual(v['hourly_rate'], rate)
                    for line in v['labor_lines']:
                        self.assertAlmostEqual(line['cost'], line['hours'] * rate)
                    self.assertAlmostEqual(sum(l['cost'] for l in v['labor_lines']), v['labor_cost'], places=6)
                    self.assertAlmostEqual(sum(l['hours'] for l in v['labor_lines']), d['total_hours'])

    def test_variant_order_and_savings(self):
        for case in scenarios():
            d = calculate_detailed_repair(**case['input'])
            dealer, independent, used = d['variants']
            self.assertEqual([v['key'] for v in d['variants']], ['dealer', 'independent', 'used'])
            self.assertGreater(dealer['cost'], independent['cost'])
            self.assertGreaterEqual(independent['cost'], used['cost'])
            self.assertEqual(dealer['savings_vs_dealer'], 0)
            self.assertEqual(used['savings_vs_dealer'], dealer['amounts']['total'] - used['amounts']['total'])
            self.assertEqual(dealer['hourly_rate'] / independent['hourly_rate'], 1.7)

    def test_regional_coefficient_changes_labor_only(self):
        base = dict(scenarios()[0]['input'])
        low = calculate_detailed_repair(**dict(base, region='Краснодар'))
        high = calculate_detailed_repair(**dict(base, region='Москва и МО'))
        self.assertEqual(low['region_coefficient'], REGIONS['Краснодар'][0])
        self.assertEqual(high['region_coefficient'], REGIONS['Москва и МО'][0])
        for a, b in zip(low['variants'], high['variants']):
            self.assertAlmostEqual(b['labor_cost'] / a['labor_cost'], REGIONS['Москва и МО'][0] / REGIONS['Краснодар'][0])
            self.assertAlmostEqual(b['parts_cost'], a['parts_cost'])

    def test_used_parts_not_applicable_without_parts(self):
        engine_case = scenarios()[2]
        d = calculate_detailed_repair(**engine_case['input'])
        self.assertEqual(d['categories'], ['engine'])
        self.assertFalse(d['used_parts_applicable'])
        self.assertEqual(d['variants'][1]['amounts'], d['variants'][2]['amounts'])
        self.assertEqual(d['cheapest'], 'independent')
        self.assertTrue(calculate_detailed_repair(**scenarios()[0]['input'])['used_parts_applicable'])

    def test_used_variant_uses_used_prices(self):
        d = calculate_detailed_repair(**scenarios()[0]['input'])
        for part in d['variants'][2]['parts']:
            self.assertEqual(part['condition'], 'used')
            self.assertEqual(part['base_price'], part['used_price'])
        for part in d['variants'][1]['parts']:
            self.assertEqual(part['base_price'], part['new_price'])


class EstimateApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_estimate_matches_calculate(self):
        for case in scenarios():
            with self.subTest(model=case['input']['model']):
                est = self.client.post('/api/estimate', json=case['input'])
                calc = self.client.post('/api/calculate', json=case['input'])
                self.assertEqual(est.status_code, 200)
                for e, c in zip(est.json()['variants'], calc.json()['variants']):
                    self.assertEqual(e['key'], c['key'])
                    self.assertAlmostEqual(e['cost'], c['cost'], places=2)
                    self.assertAlmostEqual(e['cost'], case['expected'][e['key']], places=2)

    def test_validation_errors(self):
        base = scenarios()[0]['input']
        for change in (dict(region='Марс'), dict(brand='Foo'), dict(condition='broken')):
            with self.subTest(change=change):
                self.assertEqual(self.client.post('/api/estimate', json=dict(base, **change)).status_code, 400)
        self.assertEqual(self.client.post('/api/estimate', json=dict(base, year=1990)).status_code, 422)


if __name__ == '__main__':
    unittest.main()
