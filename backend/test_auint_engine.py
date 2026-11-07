"""Независимые контрольные ответы из отчётов AuInt."""
import json
from pathlib import Path
import unittest
from app.engine import run_calculation, detect_categories, MAX_SEVERITY


def load_data():
    return json.loads(Path(__file__).with_name('test_data.json').read_text(encoding='utf-8'))


class EngineTests(unittest.TestCase):
    def test_report_totals(self):
        for case in load_data()['scenarios']:
            with self.subTest(model=case['input']['model']):
                result=run_calculation(**case['input'])
                self.assertEqual({v.key for v in result.variants}, {'dealer','independent','used'})
                for v in result.variants:
                    self.assertAlmostEqual(v.cost, case['expected'][v.key], places=2)

    def test_manual_and_text_modes(self):
        for case in load_data()['scenarios']:
            with self.subTest(model=case['input']['model']):
                manual=run_calculation(**case['input'])
                request=dict(case['input'],damage_categories=[],description=case['automatic_description'])
                auto=run_calculation(**request)
                self.assertEqual(manual.categories,auto.categories)
                self.assertEqual([v.cost for v in manual.variants],[v.cost for v in auto.variants])

    def test_frame_requires_text(self):
        self.assertNotIn('frame',detect_categories('', ['frame']))
        self.assertIn('frame',detect_categories('Повреждён лонжерон', []))

    def test_damage_categories_do_not_duplicate_parts(self):
        request=dict(load_data()['scenarios'][0]['input'],damage_categories=['body','body','optics'])
        result=run_calculation(**request)
        self.assertEqual(len(result.required_parts),len(set(result.required_parts)))
        self.assertEqual(result.categories,['body','optics'])

    def test_severity_limit(self):
        request=dict(load_data()['scenarios'][0]['input'],description='лонжерон двигатель подвеска фара',photo_count=100)
        self.assertEqual(run_calculation(**request).severity,MAX_SEVERITY)


if __name__=='__main__':
    unittest.main()
