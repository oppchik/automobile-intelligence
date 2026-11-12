import copy
import unittest
from app.data import BRANDS, REGIONS, PARTS_CATALOG
from app.repair_estimator import calculate_detailed_repair
from app.parts_algorithms import search_parts
from app.market_algorithms import parse_price, normalize_listing, select_comparables, estimate_from_listings
from test_auint_engine import load_data


class DataAndEstimateTests(unittest.TestCase):
    def test_catalog_compatibility(self):
        d=load_data()
        self.assertEqual(d['brands'],BRANDS)
        self.assertEqual(d['parts'],PARTS_CATALOG)
        self.assertEqual(d['regions'],{k:dict(labor=v[0],market=v[1]) for k,v in REGIONS.items()})
        self.assertEqual((len(d['offers']),len(d['listings'])),(4,9))

    def test_detailed_estimates_match_report(self):
        for case in load_data()['scenarios']:
            with self.subTest(model=case['input']['model']):
                d=calculate_detailed_repair(**case['input'])
                for v in d['variants']:
                    self.assertAlmostEqual(v['cost'],case['expected'][v['key']],places=2)
                    self.assertAlmostEqual(v['parts_cost'],sum(p['cost'] for p in v['parts'])+sum(c['cost'] for c in v['consumables']))
                    self.assertAlmostEqual(v['cost'],sum(v[k] for k in ('parts_cost','labor_cost','diagnostic','contingency')))

    def test_hours_and_granta_components(self):
        d=calculate_detailed_repair(**load_data()['scenarios'][0]['input'])
        self.assertEqual(d['hours_by_category'],{'body':18})
        v=d['variants'][1]
        for key,value in [('parts_cost',39960),('labor_cost',21600),('diagnostic',4500),('contingency',7387.2)]:
            self.assertAlmostEqual(v[key],value,places=2)


class PartsTests(unittest.TestCase):
    def setUp(self):
        self.offers=load_data()['offers']

    def test_name_and_price_order(self):
        self.assertEqual([p['price'] for p in search_parts(self.offers,'  БАМПЕР  ')],[8500,18500])

    def test_oem_and_combined_filters(self):
        found=search_parts(self.offers,'test 100',condition='used',region='Екатеринбург',max_price=9000,max_distance_km=20)
        self.assertEqual([p['key'] for p in found],['test-2'])
        self.assertEqual(search_parts(self.offers,'TEST-100',max_distance_km=0),[])
        self.assertEqual(search_parts(self.offers,'TEST-10'),[])

    def test_vin_requires_index(self):
        vin='XTA219010N0000001'
        self.assertEqual(len(vin),17)
        self.assertEqual(search_parts(self.offers,vin),[])
        self.assertEqual(len(search_parts(self.offers,vin,vin_index={vin:['TEST-100']})),2)

    def test_deduplication_and_input_preservation(self):
        source=copy.deepcopy(self.offers)
        found=search_parts(self.offers+self.offers,sort_by='distance_km')
        self.assertEqual(len(found),4)
        self.assertEqual([p['distance_km'] for p in found],[5,10,15,20])
        found[0]['price']=1
        self.assertEqual(self.offers,source)

    def test_invalid_offers_and_filters(self):
        self.assertEqual(search_parts([dict(self.offers[0],price=float('nan'))]),[])
        self.assertEqual(search_parts([dict(self.offers[0],distance_km=-1)]),[])
        for kwargs in [dict(sort_by='unknown'),dict(max_price=-1),dict(condition='broken')]:
            with self.subTest(kwargs=kwargs),self.assertRaises(ValueError):
                search_parts(self.offers,**kwargs)


class MarketTests(unittest.TestCase):
    def setUp(self):
        self.listings=load_data()['listings']
        self.vehicle=dict(brand='Lada',model='Granta',year=2022,mileage=60000,region='Екатеринбург')

    def test_ruble_formats(self):
        for value in [850000,'850 000 ₽','850\u00a0000 руб.','850000,00 RUB']:
            self.assertEqual(parse_price(value),850000)

    def test_reject_invalid_prices(self):
        for value in ['1 2 3','850000 USD','от 850000','850000,50',-1,0,True,float('inf'),float('nan')]:
            with self.subTest(value=value),self.assertRaises(ValueError):
                parse_price(value)

    def test_normalization_and_invalid_records(self):
        item=dict(self.listings[0],brand=' LADA ',price='850 000 ₽')
        self.assertEqual(normalize_listing(item)['brand'],'lada')
        for changes in [dict(year=2027),dict(year=2020.5),dict(mileage=-1),dict(price='нет'),dict(source_id=None),dict(brand=None)]:
            self.assertIsNone(normalize_listing(dict(item,**changes)))

    def test_comparables_and_deduplication(self):
        selected=select_comparables(self.listings+self.listings,**self.vehicle)
        self.assertEqual(len(selected),3)
        extra=dict(self.listings[0],source_id='extra',year=2015)
        self.assertEqual(len(select_comparables(self.listings+[extra],**self.vehicle)),3)

    def test_report_market_example(self):
        result=estimate_from_listings(self.listings,**self.vehicle)
        self.assertEqual(result['status'], 'indicative')
        self.assertIsNone(result['mad'])
        self.assertEqual((result['estimate'],result['minimum'],result['maximum'],result['count']),(850000,810000,890000,3))

    def test_insufficient_data(self):
        result=estimate_from_listings(self.listings[:2],**self.vehicle)
        self.assertEqual(result['status'],'insufficient_data')
        self.assertIsNone(result['estimate'])

    def test_mad_thresholds(self):
        prices = [810000, 820000, 830000, 840000, 850000, 860000, 870000]
        cases = [
            (4, 'indicative', 825000, None),
            (5, 'preliminary', 830000, None),
            (6, 'preliminary', 835000, None),
            (7, 'ok', 840000, 20000),
        ]
        for count, status, estimate, mad in cases:
            with self.subTest(count=count):
                records = [
                    dict(self.listings[0], source_id=str(i), price=price)
                    for i, price in enumerate(prices[:count])
                ]
                result = estimate_from_listings(records, **self.vehicle)
                self.assertEqual(result['status'], status)
                self.assertEqual(result['count'], count)
                self.assertEqual(result['estimate'], estimate)
                self.assertEqual(result['mad'], mad)

    def test_mad_removes_extreme_outlier(self):
        prices = [810000, 820000, 830000, 840000, 850000, 860000, 870000, 9000000]
        records = [
            dict(self.listings[0], source_id=str(i), price=price)
            for i, price in enumerate(prices)
        ]
        result = estimate_from_listings(records, **self.vehicle)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['count'], 7)
        self.assertEqual(result['candidate_count'], 8)
        self.assertEqual(result['estimate'], 840000)

    def test_recheck_count_after_outlier_filter(self):
        prices = [810000, 820000, 830000, 840000, 850000, 860000, 9000000]
        records = [
            dict(self.listings[0], source_id=str(i), price=price)
            for i, price in enumerate(prices)
        ]
        result = estimate_from_listings(records, **self.vehicle)
        self.assertEqual(result['status'], 'preliminary')
        self.assertEqual(result['count'], 6)
        self.assertEqual(result['candidate_count'], 7)
        self.assertEqual(result['estimate'], 835000)

    def test_zero_mad_and_generator(self):
        records=[dict(self.listings[0],source_id=str(i)) for i in range(7)]
        result=estimate_from_listings(iter(records),**self.vehicle)
        self.assertEqual(result['estimate'],850000)
        self.assertEqual(result['candidate_count'], 7)
        self.assertEqual(result['count'], 7)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['mad'], 0)


if __name__=='__main__':
    unittest.main()
