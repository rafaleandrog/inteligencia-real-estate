import unittest

from imob_pipeline.fetch import FixtureFetcher
from imob_pipeline.sources.aop import AopError, FixtureHexGeometry, load_landuse, parse_landuse, resolve_landuse_url
from imob_pipeline.sources.geoportal_ra import to_polygons
from imob_pipeline.transforms.assign_ra import RaIndex
from imob_pipeline.transforms.jobs import build_jobs, class_or_absent

from .helpers import FIXTURES, ra_features

COLUMNS = {"hex": "id_hex", "jobs_total": "T001", "jobs_low": "T002", "jobs_mid": "T003", "jobs_high": "T004",
           "pop": "P001", "income_avg": "R001", "income_decile": "R003"}
META_URL = "https://www.ipea.gov.br/acessooportunidades/dados/metadata.csv"
BREAKS = {"jobs_total": [75, 125, 250, 500, 1000, 1500, 2000, 2500, 5000], "jobs_low": [25, 50, 100, 200, 400, 600, 800, 1000, 2000]}


class AopTests(unittest.TestCase):
    def test_resolve_from_metadata(self):
        meta = (FIXTURES / "aop_metadata.txt").read_text("utf-8")
        url = resolve_landuse_url(meta, city="bra", year=2019, base_url="https://x/dados/")
        self.assertEqual(url, "https://x/dados/aop_landuse_bra_2019.txt")
        with self.assertRaises(AopError) as caught:
            resolve_landuse_url(meta, city="bra", year=2030, base_url="https://x/dados/")
        self.assertIn("Linhas disponíveis", str(caught.exception))

    def test_parse_landuse_filters_city_and_year_and_names_missing_columns(self):
        text = (FIXTURES / "aop_landuse_bra_2019.txt").read_text("utf-8")
        records = parse_landuse(text, city="bra", year=2019, columns=COLUMNS)
        self.assertEqual(len(records), 5)   # linha de São Paulo fora
        first = {r.h3_index: r for r in records}["89a8c0a1b03ffff"]
        self.assertEqual((first.jobs_total, first.jobs_low, first.pop_total, first.income_decile), (1200, 400, 820, 7))
        with self.assertRaises(AopError) as caught:
            parse_landuse(text, city="bra", year=2019, columns={**COLUMNS, "jobs_total": "T999"})
        self.assertIn("T999", str(caught.exception))

    def test_load_landuse_through_fixture_fetcher(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        records, retrievals = load_landuse(fetcher, metadata_url=META_URL, city="bra", year=2017, columns=COLUMNS)
        self.assertEqual(len(records), 3)
        self.assertEqual(len(retrievals), 2)

    def test_class_or_absent(self):
        self.assertIsNone(class_or_absent(0, BREAKS["jobs_total"], zero_is_absent=True))
        self.assertEqual(class_or_absent(0, BREAKS["jobs_total"], zero_is_absent=False), 0)
        self.assertEqual(class_or_absent(75, BREAKS["jobs_total"], zero_is_absent=True), 1)
        self.assertEqual(class_or_absent(5400, BREAKS["jobs_total"], zero_is_absent=True), 9)
        self.assertIsNone(class_or_absent(None, BREAKS["jobs_total"], zero_is_absent=True))

    def test_build_jobs_detail_overview_and_counts(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        main, _ = load_landuse(fetcher, metadata_url=META_URL, city="bra", year=2019, columns=COLUMNS)
        prev, _ = load_landuse(fetcher, metadata_url=META_URL, city="bra", year=2017, columns=COLUMNS)
        geometry = FixtureHexGeometry.from_file(FIXTURES / "hex_geometries.json")
        index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        result = build_jobs(main, prev, geometry=geometry, overview_resolution=8, detail_min_jobs=1, breaks=BREAKS, assign_ra=index.assign)
        detail = {f["id"]: f["properties"] for f in result.detail}
        self.assertEqual(sorted(detail), ["89a8c0a1b03ffff", "89a8c0a1b07ffff", "89a8c0a1b0fffff", "89a8c0a1b13ffff"])
        self.assertEqual(result.counts["omitted_zero_jobs"], 1)
        self.assertEqual(result.counts["published"], 4)
        big = detail["89a8c0a1b0fffff"]
        self.assertEqual(big["class_jobs_total"], 9)
        self.assertEqual(big["ra_geo_id"], "RA_11")
        self.assertEqual(big["jobs_total_2017"], 5000)
        far = detail["89a8c0a1b13ffff"]
        self.assertIsNone(far["ra_geo_id"])
        self.assertIn("hex_missing_2017", far["quality_flags"])
        self.assertIsNone(far["jobs_total_2017"])
        self.assertIsNone(far["class_jobs_mid"] if "class_jobs_mid" in far else None)
        overview = {f["id"]: f["properties"] for f in result.overview}
        parent = overview["88a8c0a1b1fffff"]
        self.assertEqual(parent["hexes"], 3)
        self.assertEqual(parent["jobs_total"], 1260)
        self.assertEqual(parent["pop_total"], 2180)
        self.assertIsNone(parent["jobs_total_2017"])   # um filho sem 2017 → soma estrita nula
        self.assertNotIn("partial_children", parent["quality_flags"])
        self.assertEqual(parent["ra_geo_id"], "RA_19")
        self.assertEqual(parent["class_jobs_total"], 5)


if __name__ == "__main__":
    unittest.main()
