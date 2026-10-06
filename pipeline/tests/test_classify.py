import unittest

from imob_pipeline.transforms.classify import assign_class, class_count, percentile, percentile_ranks


class ClassifyTests(unittest.TestCase):
    BREAKS = [100, 350, 750, 1000, 2000]

    def test_assign_class_ties_go_up(self):
        self.assertEqual(assign_class(0, self.BREAKS), 0)
        self.assertEqual(assign_class(-5, self.BREAKS), 0)
        self.assertEqual(assign_class(99.9, self.BREAKS), 0)
        self.assertEqual(assign_class(100, self.BREAKS), 1)
        self.assertEqual(assign_class(350, self.BREAKS), 2)
        self.assertEqual(assign_class(1999.99, self.BREAKS), 4)
        self.assertEqual(assign_class(2000, self.BREAKS), 5)
        self.assertEqual(class_count(self.BREAKS), 6)

    def test_absence_is_none_never_zero(self):
        self.assertIsNone(assign_class(None, self.BREAKS))
        self.assertIsNone(assign_class(float("nan"), self.BREAKS))
        self.assertIsNone(assign_class(float("inf"), self.BREAKS))
        self.assertIsNone(assign_class("abc", self.BREAKS))

    def test_percentile_matches_comparables_js(self):
        # Mesma interpolação linear de src/map/comparables.js: pos = p/100 × (n−1)
        self.assertEqual(percentile([1, 2, 3, 4], 25), 1.75)
        self.assertEqual(percentile([1, 2, 3, 4], 50), 2.5)
        self.assertEqual(percentile([1, 2, 3, 4], 100), 4)
        self.assertEqual(percentile([1, 2, 3, 4], 0), 1)
        self.assertEqual(percentile([7], 50), 7)
        self.assertIsNone(percentile([], 50))
        self.assertEqual(percentile([1, 2, 3, 4], 250), 4)

    def test_percentile_ranks(self):
        self.assertEqual(percentile_ranks([10, 20, 30]), [0.0, 50.0, 100.0])
        self.assertEqual(percentile_ranks([5]), [100.0])
        ranks = percentile_ranks([0, 0, 0, 1])
        self.assertEqual(ranks[3], 100.0)
        self.assertAlmostEqual(ranks[0], 100 * (0 + 1) / 3)  # média do bloco de zeros
        self.assertEqual(percentile_ranks([]), [])


if __name__ == "__main__":
    unittest.main()
