"""Cada checagem do validador é plantada quebrada e vista falhar (R8.23)."""

import json
import tempfile
import unittest
from pathlib import Path

from imob_pipeline.outputs.geojson import make_feature, write_feature_collection, write_json
from imob_pipeline.outputs.manifest import dataset_entry, file_entry, upsert_manifest
from imob_pipeline.outputs.validator import Finding, has_errors, validate_public_dir

from .helpers import REPO_ROOT

BBOX = (-48.30, -16.06, -47.30, -15.48)
BREAKS = {"households_delta_per_km2": {"method": "fixed", "breaks": [100, 350, 750, 1000, 2000], "classes": 6}}


def square(x, y, size=0.001):
    return {"type": "Polygon", "coordinates": [[[x, y], [x, y + size], [x + size, y + size], [x + size, y], [x, y]]]}


def cell_props(cell_id: str, per_km2, klass):
    return {
        "cell_id": cell_id, "cell_size": "200M", "area_km2": 0.04, "pop_2010": 10, "pop_2022": 12,
        "dom_ocu_2010": 3, "dom_ocu_2022": 5, "households_delta": 2, "households_delta_per_km2": per_km2,
        "households_delta_pct_change": 0.6667, "ra_geo_id": "RA_11", "class_households_delta_per_km2": klass,
        "quality_flags": [],
    }


class PublicDir:
    """Monta um data/public mínimo e válido num diretório temporário."""

    def __init__(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "README.md").write_text("x", "utf-8")
        schemas = self.root / "schemas"
        schemas.mkdir()
        for schema in (REPO_ROOT / "data" / "public" / "schemas").glob("*.json"):
            (schemas / schema.name).write_text(schema.read_text("utf-8"), "utf-8")

    def build(self, *, features=None, breaks=BREAKS, budget=100_000, dataset_id="households_grid"):
        if features is None:
            features = [
                make_feature("200ME1N1", square(-47.9, -15.8), cell_props("200ME1N1", 50.0, 0)),
                make_feature("200ME1N2", square(-47.9, -15.801), cell_props("200ME1N2", 400.0, 2)),
            ]
        rel = f"{dataset_id}/overview_1km.json"
        info = write_feature_collection(self.root / rel, features, decimals=5)
        files = [file_entry(self.root, rel, role="overview", budget_bytes=budget, bbox=info["bbox"])]
        entry = dataset_entry(
            dataset_id=dataset_id, title_pt="t", version="2026-10-05", generated_at="2026-10-05T00:00:00Z", files=files,
            sources=[{"name": "s", "url": "https://s", "retrieved_at": "x", "license": "l", "attribution_pt": "a"}],
            years=[2010, 2022], crs="EPSG:4326", bbox=info["bbox"], method_pt="m", ra_assignment_method="centroid_within_ra",
            class_breaks=breaks, counts={"published": len(features)}, quality_flags=[], notes_pt="",
            schema="schemas/households_grid.properties.schema.json",
        )
        upsert_manifest(self.root, entry, generated_at="2026-10-05T00:00:00Z", pipeline_commit="c", config_sha256="0" * 64, attribution_pt="a")
        return self.root

    def manifest(self):
        return json.loads((self.root / "manifest.json").read_text("utf-8"))

    def write_manifest(self, manifest):
        (self.root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), "utf-8")

    def cleanup(self):
        self.tmp.cleanup()


def errors(findings):
    return [f for f in findings if f.level == "erro"]


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.pub = PublicDir()

    def tearDown(self):
        self.pub.cleanup()

    def test_valid_dir_passes(self):
        root = self.pub.build()
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertFalse(has_errors(findings), [str(f) for f in findings])
        self.assertTrue(any(f.check == "resultado" for f in findings))

    def test_empty_dir_before_first_run_is_ok(self):
        findings = validate_public_dir(self.pub.root)
        self.assertFalse(has_errors(findings))
        self.assertTrue(any("primeira execução" in f.message for f in findings))

    def test_files_without_manifest_fail(self):
        (self.pub.root / "stray.json").write_text("{}", "utf-8")
        findings = validate_public_dir(self.pub.root)
        self.assertTrue(has_errors(findings))
        self.assertIn("sem manifest", errors(findings)[0].message)

    def test_sha_mismatch(self):
        root = self.pub.build()
        path = root / "households_grid" / "overview_1km.json"
        path.write_bytes(path.read_bytes().replace(b'"v"', b'"w"') + b" ")
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("sha256" in f.message for f in errors(findings)))

    def test_over_budget(self):
        root = self.pub.build(budget=10)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any(f.check == "orcamento" for f in errors(findings)))

    def test_unlisted_file(self):
        root = self.pub.build()
        (root / "households_grid" / "extra.json").write_text("{}", "utf-8")
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("não está no manifest" in f.message for f in errors(findings)))

    def test_missing_listed_file(self):
        root = self.pub.build()
        (root / "households_grid" / "overview_1km.json").unlink()
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("ausente" in f.message for f in errors(findings)))

    def test_nan_in_file(self):
        root = self.pub.build()
        path = root / "households_grid" / "overview_1km.json"
        manifest = self.pub.manifest()
        text = path.read_text("utf-8").replace("50.0", "NaN")
        path.write_text(text, "utf-8")
        import hashlib
        data = path.read_bytes()
        manifest["datasets"][0]["files"][0]["sha256"] = hashlib.sha256(data).hexdigest()
        manifest["datasets"][0]["files"][0]["bytes"] = len(data)
        from imob_pipeline.outputs.manifest import content_hash
        manifest["datasets"][0]["content_hash"] = content_hash(manifest["datasets"][0]["files"])
        self.pub.write_manifest(manifest)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("JSON inválido" in f.message for f in errors(findings)))

    def _rebuild_with_features(self, features, **kwargs):
        return self.pub.build(features=features, **kwargs)

    def test_unclosed_ring(self):
        bad = {"type": "Polygon", "coordinates": [[[-47.9, -15.8], [-47.9, -15.799], [-47.899, -15.799], [-47.899, -15.8]]]}
        root = self._rebuild_with_features([make_feature("c1", bad, cell_props("c1", 10.0, 0))])
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("anel aberto" in f.message for f in errors(findings)))

    def test_duplicate_id(self):
        feats = [make_feature("c1", square(-47.9, -15.8), cell_props("c1", 10.0, 0)),
                 make_feature("c1", square(-47.9, -15.801), cell_props("c1", 10.0, 0))]
        root = self._rebuild_with_features(feats)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("id repetido" in f.message for f in errors(findings)))

    def test_out_of_bbox(self):
        root = self._rebuild_with_features([make_feature("c1", square(-46.0, -15.8), cell_props("c1", 10.0, 0))])
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("fora do bbox" in f.message for f in errors(findings)))

    def test_too_many_decimals(self):
        root = self._rebuild_with_features([make_feature("c1", square(-47.9, -15.8), cell_props("c1", 10.0, 0))])
        path = root / "households_grid" / "overview_1km.json"
        text = path.read_text("utf-8").replace("-47.9,", "-47.9000001,", 1)
        path.write_text(text, "utf-8")
        manifest = self.pub.manifest()
        import hashlib
        data = path.read_bytes()
        from imob_pipeline.outputs.manifest import content_hash
        manifest["datasets"][0]["files"][0].update({"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
        manifest["datasets"][0]["content_hash"] = content_hash(manifest["datasets"][0]["files"])
        self.pub.write_manifest(manifest)
        findings = validate_public_dir(root, bbox=BBOX, decimals=5)
        self.assertTrue(any("casas" in f.message for f in errors(findings)))

    def test_class_mismatch(self):
        root = self._rebuild_with_features([make_feature("c1", square(-47.9, -15.8), cell_props("c1", 400.0, 5))])
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any(f.check == "classes" for f in errors(findings)))

    def test_breaks_not_increasing(self):
        root = self.pub.build(breaks={"households_delta_per_km2": {"method": "fixed", "breaks": [100, 100], "classes": 3}})
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("crescentes" in f.message for f in errors(findings)))

    def test_secret_like_string(self):
        token = "gh" + "p_" + "A" * 36
        feats = [make_feature("c1", square(-47.9, -15.8), {**cell_props("c1", 10.0, 0), "quality_flags": []})]
        feats[0]["properties"]["cell_id"] = token
        root = self._rebuild_with_features(feats)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any(f.check == "secret" for f in errors(findings)))

    def test_feature_count_mismatch(self):
        root = self.pub.build()
        manifest = self.pub.manifest()
        manifest["datasets"][0]["files"][0]["features"] = 99
        self.pub.write_manifest(manifest)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("feições/linhas" in f.message for f in errors(findings)))

    def test_content_hash_mismatch(self):
        root = self.pub.build()
        manifest = self.pub.manifest()
        manifest["datasets"][0]["content_hash"] = "0" * 64
        self.pub.write_manifest(manifest)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("content_hash" in f.message for f in errors(findings)))

    def test_bad_path_and_role(self):
        root = self.pub.build()
        manifest = self.pub.manifest()
        manifest["datasets"][0]["files"][0]["path"] = "../households_grid/overview_1km.json"
        self.pub.write_manifest(manifest)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("caminho inválido" in f.message for f in errors(findings)))

    def test_shards_must_sum_to_published(self):
        root = self.pub.build()
        rel = "households_grid/detail_200m/RA_11.json"
        write_feature_collection(root / rel, [make_feature("s1", square(-47.91, -15.8), cell_props("s1", 10.0, 0))], decimals=5)
        manifest = self.pub.manifest()
        ds = manifest["datasets"][0]
        ds["files"].append(file_entry(root, rel, role="detail_shard", budget_bytes=100_000, shard_key="ra_geo_id", shard_value="RA_11"))
        from imob_pipeline.outputs.manifest import content_hash
        ds["content_hash"] = content_hash(ds["files"])
        ds["counts"]["published"] = 5
        self.pub.write_manifest(manifest)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any(f.check == "shards" for f in errors(findings)))

    def test_wrong_geometry_kind_for_dataset(self):
        line = {"type": "LineString", "coordinates": [[-47.9, -15.8], [-47.89, -15.8]]}
        root = self._rebuild_with_features([make_feature("c1", line, cell_props("c1", 10.0, 0))])
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(any("geometria LineString" in f.message for f in errors(findings)))

    def test_finding_str(self):
        self.assertIn("ERRO", str(Finding("erro", "x", "y")))


if __name__ == "__main__":
    unittest.main()


class SchemasDirAbsentTests(unittest.TestCase):
    """Diretório gerado fora de data/public (fixtures do site) não carrega `schemas/`: informa, não falha."""

    def test_missing_schemas_dir_is_info_not_error(self):
        public = PublicDir()
        root = public.build()
        import shutil
        shutil.rmtree(root / "schemas")
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertFalse(has_errors(findings), [str(f) for f in findings])
        self.assertTrue(any(f.check == "schema" and "schemas/ ausente" in f.message for f in findings))
        public.tmp.cleanup()


@unittest.skipUnless(__import__("importlib").util.find_spec("jsonschema"), "jsonschema ausente")
class EveryFeatureIsValidatedTests(unittest.TestCase):
    """Achado do Codex na PR #157: a feição 5.001 também passa pelo schema."""

    def test_invalid_property_after_the_5000th_feature_is_rejected(self):
        public = PublicDir()
        features = [make_feature(f"200ME{i}N1", square(-47.9, -15.8 + i * 1e-6), cell_props(f"200ME{i}N1", 50.0, 0)) for i in range(5001)]
        features[-1]["properties"]["propriedade_fora_do_contrato"] = 1
        root = public.build(features=features, budget=20_000_000)
        findings = validate_public_dir(root, bbox=BBOX)
        self.assertTrue(has_errors(findings), [str(f) for f in findings][:5])
        self.assertTrue(any(f.check == "schema" and "200ME5000N1" in f.message for f in findings), [str(f) for f in findings][:5])
        public.tmp.cleanup()
