import json
import tempfile
import unittest
from pathlib import Path

from imob_pipeline.outputs.geojson import make_feature, write_feature_collection, write_json
from imob_pipeline.outputs.manifest import content_hash, dataset_entry, file_entry, merge_dataset, read_manifest, upsert_manifest


def square(x, y, size=0.001):
    return {"type": "Polygon", "coordinates": [[[x, y], [x, y + size], [x + size, y + size], [x + size, y], [x, y]]]}


def make_entry(public_dir: Path, *, version: str, generated_at: str, value: int) -> dict:
    write_feature_collection(public_dir / "d" / "f.json", [make_feature("a", square(-47.9, -15.8), {"v": value})], decimals=5)
    files = [file_entry(public_dir, "d/f.json", role="overview", budget_bytes=10_000)]
    return dataset_entry(
        dataset_id="d", title_pt="t", version=version, generated_at=generated_at, files=files,
        sources=[{"name": "s", "url": "https://s", "retrieved_at": "x", "license": "l", "attribution_pt": "a"}],
        years=[2022], crs="EPSG:4326", bbox=None, method_pt="m", ra_assignment_method=None, class_breaks=None,
        counts={"published": 1}, quality_flags=[], notes_pt="",
    )


class ManifestTests(unittest.TestCase):
    def test_file_entry_counts_features_and_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_feature_collection(root / "a.json", [make_feature("1", square(0, 0), {})], decimals=5)
            write_json(root / "b.json", {"rows": [{}, {}, {}]})
            fa = file_entry(root, "a.json", role="overview", budget_bytes=100_000)
            fb = file_entry(root, "b.json", role="data", budget_bytes=100_000)
            self.assertEqual(fa["features"], 1)
            self.assertEqual(fb["features"], 3)
            self.assertEqual(len(fa["sha256"]), 64)
            self.assertEqual(fa["bytes"], (root / "a.json").stat().st_size)
        with self.assertRaises(ValueError):
            file_entry(root, "a.json", role="bogus", budget_bytes=1)

    def test_content_hash_is_order_independent(self):
        a = {"path": "x", "sha256": "1" * 64}
        b = {"path": "y", "sha256": "2" * 64}
        self.assertEqual(content_hash([a, b]), content_hash([b, a]))
        self.assertNotEqual(content_hash([a]), content_hash([b]))

    def test_unchanged_dataset_keeps_version_and_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = make_entry(root, version="2026-10-01", generated_at="2026-10-01T00:00:00Z", value=1)
            manifest = upsert_manifest(root, first, generated_at="2026-10-01T00:00:00Z", pipeline_commit="c1", config_sha256="0" * 64, attribution_pt="a")
            self.assertEqual(manifest["generated_at"], "2026-10-01T00:00:00Z")
            same = make_entry(root, version="2026-11-01", generated_at="2026-11-01T00:00:00Z", value=1)
            manifest = upsert_manifest(root, same, generated_at="2026-11-01T00:00:00Z", pipeline_commit="c2", config_sha256="0" * 64, attribution_pt="a")
            self.assertEqual(manifest["datasets"][0]["version"], "2026-10-01")
            self.assertEqual(manifest["generated_at"], "2026-10-01T00:00:00Z")
            changed = make_entry(root, version="2026-12-01", generated_at="2026-12-01T00:00:00Z", value=2)
            manifest = upsert_manifest(root, changed, generated_at="2026-12-01T00:00:00Z", pipeline_commit="c3", config_sha256="0" * 64, attribution_pt="a")
            self.assertEqual(manifest["datasets"][0]["version"], "2026-12-01")
            self.assertEqual(manifest["generated_at"], "2026-12-01T00:00:00Z")
            self.assertEqual(read_manifest(root)["pipeline_commit"], "c3")

    def test_merge_dataset_direct(self):
        prev = {"content_hash": "h", "version": "v1", "generated_at": "g1"}
        new = {"content_hash": "h", "version": "v2", "generated_at": "g2"}
        self.assertEqual(merge_dataset(prev, new)["version"], "v1")
        self.assertEqual(merge_dataset(None, new)["version"], "v2")


if __name__ == "__main__":
    unittest.main()
