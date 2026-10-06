"""Apoio aos testes: caminhos e fábricas de contexto sem rede."""

from __future__ import annotations

import json
from pathlib import Path

from imob_pipeline.config import load_config
from imob_pipeline.datasets.context import RunContext
from imob_pipeline.fetch import FixtureFetcher
from imob_pipeline.records import RunSummary

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_DIR.parent
FIXTURES = PIPELINE_DIR / "tests" / "fixtures"
FIXTURE_CONFIG = PIPELINE_DIR / "config" / "fixture.toml"
PROD_CONFIG = PIPELINE_DIR / "config" / "df.toml"
RA_FIXTURE = REPO_ROOT / "tests" / "fixtures" / "geoportal-ras-cruzeiro-candangolandia.geojson"


def ra_features() -> list[dict]:
    return json.loads(RA_FIXTURE.read_text("utf-8"))["features"]


def fixture_context(out_dir: Path, *, clock=None) -> RunContext:
    config = load_config(FIXTURE_CONFIG)
    fetcher = FixtureFetcher.from_dir(FIXTURES)
    ctx = RunContext(config=config, fetcher=fetcher, out_dir=Path(out_dir), pipeline_commit="0123456789abcdef", summary=RunSummary())
    if clock:
        ctx.clock = clock
    return ctx


def fixed_clock(value: str = "2026-10-05T12:00:00Z"):
    return lambda: value
