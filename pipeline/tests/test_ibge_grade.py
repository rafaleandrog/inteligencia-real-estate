import json
import unittest

from imob_pipeline.fetch import FixtureFetcher
from imob_pipeline.sources.ibge_grade import GradeError, discover, load_edition, parse_listing, quadrant_urls, records_from_geojson

from .helpers import FIXTURES

COLUMNS = {"cell_id": "ID_UNICO", "parent_1km": "nome_1KM", "pop": "POP", "dom_ocu": "DOM_OCU"}
BASE_2010 = "https://geoftp.ibge.gov.br/recortes_para_fins_estatisticos/grade_estatistica/censo_2010/"


class GradeSourceTests(unittest.TestCase):
    def test_parse_listing_dedupes_and_sorts(self):
        html = (FIXTURES / "grade_listing.html").read_text("utf-8")
        self.assertEqual(parse_listing(html), ["grade_id45.zip", "grade_id46.zip"])

    def test_quadrant_urls(self):
        self.assertEqual(quadrant_urls(BASE_2010, ["grade_id45", "grade_id46.zip"]),
                         [BASE_2010 + "grade_id45.zip", BASE_2010 + "grade_id46.zip"])

    def test_missing_columns_name_what_was_found(self):
        payload = {"features": [{"properties": {"ID": "x", "POP": 1}, "geometry": None}]}
        with self.assertRaises(GradeError) as caught:
            records_from_geojson(payload, COLUMNS, "teste")
        self.assertIn("ID_UNICO", str(caught.exception))
        self.assertIn("encontradas", str(caught.exception))

    def test_suppressed_values_become_none_and_flag(self):
        payload = json.loads((FIXTURES / "grade_2010.json").read_text("utf-8"))
        records, suppressed = records_from_geojson(payload, COLUMNS, "2010")
        by_id = {r.cell_id: r for r in records}
        self.assertEqual(suppressed, ["200ME57001N92000"])
        self.assertIsNone(by_id["200ME57001N92000"].dom_ocu)
        self.assertIsNone(by_id["200ME57001N92000"].pop)
        self.assertEqual(by_id["200ME57000N92000"].dom_ocu, 40)
        self.assertEqual(by_id["1KME581N931"].parent_1km, "1KME581N931")

    def test_load_edition_requires_pinned_quadrants(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        with self.assertRaises(GradeError) as caught:
            load_edition(fetcher, base_url=BASE_2010, quadrant_ids=[], columns=COLUMNS, label="Grade 2010")
        self.assertIn("discover grade", str(caught.exception))
        records, suppressed, retrievals = load_edition(fetcher, base_url=BASE_2010, quadrant_ids=["grade_fixture"], columns=COLUMNS, label="Grade 2010")
        self.assertEqual(len(records), 8)
        self.assertEqual(len(retrievals), 1)

    def test_discover_lists_zip_names(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        self.assertEqual(discover(fetcher, BASE_2010), ["grade_id45.zip", "grade_id46.zip"])


if __name__ == "__main__":
    unittest.main()
