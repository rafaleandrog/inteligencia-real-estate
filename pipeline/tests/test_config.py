import tomllib
import unittest

from imob_pipeline.config import ConfigError, load_config, parse_config

from .helpers import FIXTURE_CONFIG, PROD_CONFIG


class ConfigTests(unittest.TestCase):
    def test_production_and_fixture_configs_load(self):
        prod = load_config(PROD_CONFIG)
        fix = load_config(FIXTURE_CONFIG)
        self.assertEqual(prod.ra.expected_count, 37)
        self.assertEqual(fix.ra.expected_count, 2)
        self.assertEqual(prod.ra.roman_key_prefix, "RA2026_")
        self.assertEqual(prod.households.breaks["households_delta_per_km2"], [100, 350, 750, 1000, 2000])
        self.assertEqual(len(prod.jobs.breaks["jobs_total"]), 9)
        self.assertEqual(prod.centrality.breaks["betweenness_percentile"], [50, 75, 90, 97])
        self.assertEqual(len(prod.sha256), 64)

    def test_missing_key_names_the_key(self):
        raw = tomllib.loads(PROD_CONFIG.read_text("utf-8"))
        del raw["households_grid"]["base_url_2010"]
        with self.assertRaises(ConfigError) as caught:
            parse_config(raw, path=PROD_CONFIG, sha256="0" * 64)
        self.assertIn("households_grid.base_url_2010", str(caught.exception))

    def test_missing_section_names_the_section(self):
        raw = tomllib.loads(PROD_CONFIG.read_text("utf-8"))
        del raw["jobs_hex"]
        with self.assertRaises(ConfigError) as caught:
            parse_config(raw, path=PROD_CONFIG, sha256="0" * 64)
        self.assertIn("[jobs_hex]", str(caught.exception))

    def test_breaks_must_be_strictly_increasing(self):
        raw = tomllib.loads(PROD_CONFIG.read_text("utf-8"))
        raw["households_grid"]["breaks"]["households_delta_per_km2"] = [100, 100, 750]
        with self.assertRaises(ConfigError) as caught:
            parse_config(raw, path=PROD_CONFIG, sha256="0" * 64)
        self.assertIn("crescente", str(caught.exception))

    def test_bbox_must_be_ordered(self):
        raw = tomllib.loads(PROD_CONFIG.read_text("utf-8"))
        raw["project"]["bbox"] = [-47.3, -16.06, -48.3, -15.48]
        with self.assertRaises(ConfigError):
            parse_config(raw, path=PROD_CONFIG, sha256="0" * 64)


if __name__ == "__main__":
    unittest.main()
