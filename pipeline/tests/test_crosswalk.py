import unittest

from imob_pipeline.sources.geoportal_ra import to_polygons
from imob_pipeline.transforms.crosswalk import CrosswalkError, build_crosswalk, crosswalk_row, normalize_ra_code

from .helpers import ra_features


class CrosswalkTests(unittest.TestCase):
    def setUp(self):
        self.polygons = to_polygons(ra_features())

    def test_rows_from_real_geoportal_fixture(self):
        payload = build_crosswalk(self.polygons, roman_key_prefix="RA2026_", expected_count=2,
                                  source={"name": "x", "url": "https://x", "retrieved_at": "fixture"})
        rows = payload["rows"]
        self.assertEqual([r["ra_number"] for r in rows], [11, 19])
        cruzeiro, candango = rows
        self.assertEqual(cruzeiro["ra_geo_id"], "RA_11")
        self.assertEqual(cruzeiro["ra_geo_id_roman"], "RA2026_RA-XI")
        self.assertEqual(cruzeiro["ra_name"], "Cruzeiro")
        self.assertEqual(candango["ra_name"], "Candangolândia")
        self.assertEqual(candango["ra_slug"], "candangolandia")
        self.assertEqual(candango["ra_area_km2"], 6.6018644)
        self.assertEqual(candango["geoportal_objectid"], 74)
        self.assertEqual(len(candango["geometry_sha256"]), 64)
        self.assertEqual(payload["roman_key_prefix"], "RA2026_")

    def test_count_mismatch_fails_loudly(self):
        with self.assertRaises(CrosswalkError) as caught:
            build_crosswalk(self.polygons, roman_key_prefix="RA2026_", expected_count=37, source={})
        self.assertIn("esperava 37", str(caught.exception))

    def test_roman_code_must_match_number(self):
        bad = self.polygons[0]
        bad = bad.__class__(**{**bad.__dict__, "ra_code": "RA-XX"})
        with self.assertRaises(CrosswalkError) as caught:
            crosswalk_row(bad, roman_key_prefix="RA2026_")
        self.assertIn("RA-XX", str(caught.exception))
        self.assertIn(str(bad.ra_number), str(caught.exception))

    def test_duplicate_number_fails(self):
        dup = self.polygons[0].__class__(**{**self.polygons[1].__dict__, "ra_number": 19, "objectid": 99})
        with self.assertRaises(CrosswalkError):
            build_crosswalk([self.polygons[1], dup], roman_key_prefix="RA2026_", expected_count=2, source={})

    def test_normalize_ra_code_forms(self):
        self.assertEqual(normalize_ra_code("ra-xix"), "RA-XIX")
        self.assertEqual(normalize_ra_code("RA XIX"), "RA-XIX")
        self.assertEqual(normalize_ra_code("XIX"), "RA-XIX")
        self.assertEqual(normalize_ra_code(""), "")


if __name__ == "__main__":
    unittest.main()
