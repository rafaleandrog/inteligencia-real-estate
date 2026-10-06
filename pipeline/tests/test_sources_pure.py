import json
import tempfile
import unittest
from pathlib import Path

from imob_pipeline.fetch import FixtureFetcher
from imob_pipeline.sources.geoportal_ra import GeoPortalError, fetch_ra_features, parse_page, query_url, to_polygons

from .helpers import RA_FIXTURE, ra_features

LAYER = "https://example.invalid/arcgis/rest/services/Publico/LIMITES/FeatureServer/1"
FIELDS = "objectid,ra_cira,ra_codigo,ra_nome,ra_path,ra_areakm2"


class GeoPortalSourceTests(unittest.TestCase):
    def test_query_url_has_the_same_parameters_as_code_gs(self):
        url = query_url(LAYER, out_fields=FIELDS, result_offset=0, result_record_count=1000)
        self.assertIn("outSR=4326", url)
        self.assertIn("geometryPrecision=6", url)
        self.assertIn("f=geojson", url)
        self.assertIn("returnTrueCurves=false", url)
        self.assertNotIn("maxAllowableOffset", url)
        self.assertIn("resultOffset=0", url)

    def test_parse_page_surfaces_errors(self):
        with self.assertRaises(GeoPortalError):
            parse_page({"error": {"message": "Invalid token"}})
        with self.assertRaises(GeoPortalError):
            parse_page({"type": "FeatureCollection"})
        features, exceeded = parse_page({"features": [], "exceededTransferLimit": True})
        self.assertEqual(features, [])
        self.assertTrue(exceeded)

    def test_pagination_follows_exceeded_transfer_limit(self):
        feats = ra_features()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            page1 = root / "p1.json"
            page2 = root / "p2.json"
            page1.write_text(json.dumps({"type": "FeatureCollection", "features": [feats[0]], "exceededTransferLimit": True}), "utf-8")
            page2.write_text(json.dumps({"type": "FeatureCollection", "features": [feats[1]]}), "utf-8")
            mapping = {
                query_url(LAYER, out_fields=FIELDS, result_offset=0, result_record_count=1): page1,
                query_url(LAYER, out_fields=FIELDS, result_offset=1, result_record_count=1): page2,
            }
            fetcher = FixtureFetcher(mapping)
            features, retrievals = fetch_ra_features(fetcher, LAYER, out_fields=FIELDS, page_size=1)
            self.assertEqual(len(features), 2)
            self.assertEqual(len(retrievals), 2)
            self.assertEqual(len(fetcher.calls), 2)

    def test_to_polygons_reads_attributes_and_bbox(self):
        polygons = to_polygons(ra_features())
        by_number = {p.ra_number: p for p in polygons}
        self.assertEqual(set(by_number), {11, 19})
        self.assertEqual(by_number[19].ra_name_source, "CANDANGOLÂNDIA")
        self.assertEqual(by_number[19].objectid, 74)
        self.assertLess(by_number[19].bbox[0], by_number[19].bbox[2])

    def test_to_polygons_rejects_missing_number(self):
        broken = json.loads(RA_FIXTURE.read_text("utf-8"))["features"]
        broken[0]["properties"]["ra_cira"] = None
        with self.assertRaises(GeoPortalError):
            to_polygons(broken)


if __name__ == "__main__":
    unittest.main()
