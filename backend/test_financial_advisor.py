
import unittest

from app.financial_advisor import compare_scenarios


class TestFinancialAdvisor(unittest.TestCase):

    def test_repair_and_sell(self):
        result = compare_scenarios(
            as_is_value=700000,
            after_repair_value=900000,
            repair_cost=90000,
            years=3,
            annual_costs={"fuel": 65000},
            goal="cash_now",
        )

        self.assertEqual(
            result["recommendation"],
            "repair_sell"
        )

        self.assertEqual(
            result["scenarios"]["repair_sell"]["value_rub"],
            801000
        )

    def test_repair_budget_limit(self):
        result = compare_scenarios(
            as_is_value=700000,
            after_repair_value=900000,
            repair_cost=90000,
            years=3,
            annual_costs={},
            goal="cash_now",
            repair_budget=50000,
        )

        self.assertEqual(
            result["recommendation"],
            "sell_as_is"
        )

    def test_missing_transport_cost(self):
        result = compare_scenarios(
            as_is_value=700000,
            after_repair_value=900000,
            repair_cost=90000,
            years=3,
            annual_costs={"fuel": 65000},
            goal="keep_using",
        )

        self.assertEqual(
            result["recommendation"],
            "needs_data"
        )

    def test_reject_negative_repair_cost(self):
        with self.assertRaises(ValueError):
            compare_scenarios(
                as_is_value=700000,
                after_repair_value=900000,
                repair_cost=-1000,
                years=3,
                annual_costs={},
            )


BASE = dict(
    as_is_value=700000,
    after_repair_value=900000,
    repair_cost=90000,
    years=3,
    annual_costs={"fuel": 65000},
    alternative_transport_per_year=120000,
    goal="keep_using",
)


class TestAdvisorBreakdown(unittest.TestCase):

    def test_items_sum_to_scenario_value(self):
        result = compare_scenarios(**BASE)

        for key, block in result["breakdown"].items():
            total = sum(item["value_rub"] for item in block["items"])
            self.assertAlmostEqual(
                total, result["scenarios"][key]["value_rub"], delta=0.05
            )

    def test_keep_items_without_transport_are_incomplete(self):
        result = compare_scenarios(
            **{**BASE, "alternative_transport_per_year": None}
        )

        block = result["breakdown"]["repair_keep"]

        self.assertFalse(block["complete"])
        self.assertNotIn("transport", [i["key"] for i in block["items"]])
        self.assertIsNone(result["scenarios"]["repair_keep"]["value_rub"])

    def test_timeline_starts_and_ends_at_scenario_values(self):
        result = compare_scenarios(**BASE)
        timeline = result["timeline"]

        self.assertEqual([p["year"] for p in timeline], [0, 1, 2, 3])
        self.assertEqual(
            timeline[0]["repair_keep"],
            result["scenarios"]["repair_sell"]["value_rub"],
        )
        self.assertEqual(
            timeline[-1]["repair_keep"],
            result["scenarios"]["repair_keep"]["value_rub"],
        )

    def test_timeline_keep_is_empty_without_transport(self):
        result = compare_scenarios(
            **{**BASE, "alternative_transport_per_year": None}
        )

        self.assertTrue(all(p["repair_keep"] is None for p in result["timeline"]))

    def test_comparison_explains_the_choice(self):
        result = compare_scenarios(**BASE)
        comparison = result["comparison"]

        self.assertEqual(comparison["best"], "repair_sell")
        self.assertEqual(comparison["second"], "sell_as_is")
        self.assertEqual(comparison["difference_rub"], 108000)
        self.assertEqual(comparison["threshold_rub"], 27000)

    def test_comparison_is_empty_when_data_is_missing(self):
        result = compare_scenarios(
            **{**BASE, "alternative_transport_per_year": None}
        )

        self.assertEqual(result["recommendation"], "needs_data")
        self.assertIsNone(result["comparison"])

    def test_changed_conditions_change_result(self):
        short = compare_scenarios(**{**BASE, "years": 1})
        long = compare_scenarios(**{**BASE, "years": 8})

        self.assertEqual(len(short["timeline"]), 2)
        self.assertEqual(len(long["timeline"]), 9)
        self.assertNotEqual(
            short["scenarios"]["repair_keep"]["value_rub"],
            long["scenarios"]["repair_keep"]["value_rub"],
        )

    def test_api_returns_breakdown_and_validates(self):
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        payload = {
            "as_is_value": 700000, "after_repair_value": 900000,
            "repair_cost": 90000, "years": 3,
            "annual_costs": {"upkeep": 65000},
            "alternative_transport_per_year": 120000,
            "goal": "keep_using",
        }

        ok = client.post("/api/financial-advice", json=payload)
        self.assertEqual(ok.status_code, 200)
        self.assertIn("breakdown", ok.json())
        self.assertIn("timeline", ok.json())

        bad = client.post("/api/financial-advice", json={**payload, "years": 11})
        self.assertEqual(bad.status_code, 422)


if __name__ == "__main__":
    unittest.main()
