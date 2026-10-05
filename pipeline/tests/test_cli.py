"""Ponta a ponta sem rede: `run ra_crosswalk --fixture-dir` → `validate` → `pr-body`."""

import json
import tempfile
import unittest
from pathlib import Path

from imob_pipeline.cli import main
from imob_pipeline.datasets import ra_crosswalk
from imob_pipeline.outputs.validator import has_errors, validate_public_dir

from .helpers import FIXTURES, FIXTURE_CONFIG, REPO_ROOT, fixed_clock, fixture_context


def seed_public_dir(root: Path) -> None:
    (root / "README.md").write_text("x", "utf-8")
    schemas = root / "schemas"
    schemas.mkdir(parents=True, exist_ok=True)
    for schema in (REPO_ROOT / "data" / "public" / "schemas").glob("*.json"):
        (schemas / schema.name).write_text(schema.read_text("utf-8"), "utf-8")


class CrosswalkDatasetTests(unittest.TestCase):
    def test_run_writes_crosswalk_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "public"
            out.mkdir()
            seed_public_dir(out)
            ctx = fixture_context(out, clock=fixed_clock())
            manifest = ra_crosswalk.run(ctx)
            payload = json.loads((out / "ra_crosswalk.json").read_text("utf-8"))
            self.assertEqual([r["ra_geo_id"] for r in payload["rows"]], ["RA_11", "RA_19"])
            self.assertEqual(payload["source"]["retrieved_at"], "fixture")
            ds = manifest["datasets"][0]
            self.assertEqual(ds["id"], "ra_crosswalk")
            self.assertEqual(ds["version"], "2026-10-05")
            self.assertEqual(ds["counts"], {"ras": 2})
            self.assertEqual(ds["files"][0]["path"], "ra_crosswalk.json")
            findings = validate_public_dir(out, bbox=ctx.config.project.bbox)
            self.assertFalse(has_errors(findings), [str(f) for f in findings])
            # segunda execução: bytes idênticos, versão preservada
            again = ra_crosswalk.run(fixture_context(out, clock=fixed_clock("2026-11-05T12:00:00Z")))
            self.assertEqual(again["datasets"][0]["version"], "2026-10-05")
            self.assertEqual(again["generated_at"], "2026-10-05T12:00:00Z")

    def test_cli_run_validate_and_pr_body(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "public"
            out.mkdir()
            seed_public_dir(out)
            cache = Path(tmp) / "cache"
            code = main(["run", "ra_crosswalk", "--out", str(out), "--config", str(FIXTURE_CONFIG),
                         "--cache", str(cache), "--fixture-dir", str(FIXTURES)])
            self.assertEqual(code, 0)
            self.assertTrue((out / "manifest.json").exists())
            self.assertTrue((cache / "runs" / "latest" / "summary.json").exists())
            self.assertEqual(main(["validate", str(out), "--config", str(FIXTURE_CONFIG)]), 0)
            body = Path(tmp) / "pr.md"
            self.assertEqual(main(["pr-body", "--out", str(out), "--to", str(body),
                                   "--summary", str(cache / "runs" / "latest" / "summary.json")]), 0)
            text = body.read_text("utf-8")
            self.assertIn("ra_crosswalk", text)
            self.assertIn("R7.2", text)

    def test_unknown_dataset_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit):
                main(["run", "nao_existe", "--out", tmp, "--config", str(FIXTURE_CONFIG), "--cache", tmp,
                      "--fixture-dir", str(FIXTURES)])


if __name__ == "__main__":
    unittest.main()
