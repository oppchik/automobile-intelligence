
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


if __name__ == "__main__":
    unittest.main()
