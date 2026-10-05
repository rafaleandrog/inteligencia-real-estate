import tempfile
import unittest
from pathlib import Path

from imob_pipeline.outputs.geojson import dumps_canonical, feature_collection, make_feature, write_feature_collection, write_json


def square(x, y, size=0.001):
    return {"type": "Polygon", "coordinates": [[[x, y], [x, y + size], [x + size, y + size], [x + size, y], [x, y]]]}


class GeoJsonOutputTests(unittest.TestCase):
    def test_deterministic_bytes_and_sorted_ids(self):
        features = [
            make_feature("b", square(-47.9123456, -15.81), {"v": 2}),
            make_feature("a", square(-47.9, -15.8), {"v": 1}),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            first = write_feature_collection(Path(tmp) / "x.json", features, decimals=5)
            second = write_feature_collection(Path(tmp) / "y.json", list(reversed(features)), decimals=5)
            self.assertEqual(first["sha256"], second["sha256"])
            self.assertEqual(first["features"], 2)
            text = (Path(tmp) / "x.json").read_text("utf-8")
            self.assertLess(text.index('"id":"a"'), text.index('"id":"b"'))
            self.assertIn("-47.91235", text)
            self.assertNotIn("-47.9123456", text)
            self.assertEqual(first["bbox"], [-47.91235, -15.81, -47.899, -15.799])

    def test_nan_is_refused(self):
        with self.assertRaises(ValueError):
            dumps_canonical({"x": float("nan")})

    def test_write_json_pretty(self):
        with tempfile.TemporaryDirectory() as tmp:
            info = write_json(Path(tmp) / "m.json", {"b": 1, "a": [1, 2]})
            text = (Path(tmp) / "m.json").read_text("utf-8")
            self.assertTrue(text.startswith('{\n  "a": [\n'))
            self.assertTrue(text.endswith("}\n"))
            self.assertEqual(info["bytes"], len(text.encode("utf-8")))


if __name__ == "__main__":
    unittest.main()
