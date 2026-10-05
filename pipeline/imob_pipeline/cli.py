"""`python -m imob_pipeline …` — run | validate | pr-body (| discover | extract, nas fases seguintes)."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .config import ConfigError, load_config
from .datasets import households_grid, jobs_hex, ra_aggregates, ra_crosswalk, road_centrality
from .datasets.context import RunContext, git_commit
from .fetch import FixtureFetcher, HttpFetcher
from .outputs.manifest import read_manifest
from .outputs.pr_body import render_pr_body
from .outputs.validator import has_errors, validate_public_dir

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPO_ROOT / "pipeline" / "config" / "df.toml"
DEFAULT_CACHE = REPO_ROOT / "pipeline" / ".cache"

DATASETS: dict[str, Callable[[RunContext], dict]] = {
    ra_crosswalk.DATASET_ID: ra_crosswalk.run,
    households_grid.DATASET_ID: households_grid.run,
    jobs_hex.DATASET_ID: jobs_hex.run,
    road_centrality.DATASET_ID: road_centrality.run,
    ra_aggregates.DATASET_ID: ra_aggregates.run,
}
# Ordem de `all`: a ponte primeiro (os outros atribuem RA), agregados por último (leem o publicado).
DATASET_ORDER = [ra_crosswalk.DATASET_ID, households_grid.DATASET_ID, jobs_hex.DATASET_ID,
                road_centrality.DATASET_ID, ra_aggregates.DATASET_ID]


def register_dataset(dataset_id: str, runner: Callable[[RunContext], dict], *, after: str | None = None) -> None:
    DATASETS[dataset_id] = runner
    if dataset_id not in DATASET_ORDER:
        if after and after in DATASET_ORDER:
            DATASET_ORDER.insert(DATASET_ORDER.index(after) + 1, dataset_id)
        else:
            DATASET_ORDER.append(dataset_id)


def _setup_logging(level: str, run_dir: Path | None) -> logging.Logger:
    logger = logging.getLogger("imob_pipeline")
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    logger.handlers.clear()
    console = logging.StreamHandler(sys.stderr)
    console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(console)
    if run_dir:
        run_dir.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(run_dir / "run.log", encoding="utf-8")
        file_handler.setFormatter(logging.Formatter('{"time":"%(asctime)s","level":"%(levelname)s","message":%(message)r}'))
        logger.addHandler(file_handler)
    return logger


def _resolve_datasets(requested: list[str]) -> list[str]:
    if requested == ["all"]:
        return list(DATASET_ORDER)
    unknown = [d for d in requested if d not in DATASETS]
    if unknown:
        raise SystemExit(f"dataset desconhecido: {unknown}; disponíveis: {DATASET_ORDER}")
    return [d for d in DATASET_ORDER if d in requested]


def cmd_run(args: argparse.Namespace) -> int:
    try:
        config = load_config(args.config)
    except ConfigError as error:
        print(f"config inválida: {error}", file=sys.stderr)
        return 2
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    cache_dir = Path(args.cache)
    run_dir = cache_dir / "runs" / stamp
    log = _setup_logging(args.log_level, run_dir)
    fetcher = (
        FixtureFetcher.from_dir(args.fixture_dir) if args.fixture_dir
        else HttpFetcher(cache_dir / "raw", refresh=args.refresh)
    )
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    ctx = RunContext(config=config, fetcher=fetcher, out_dir=out_dir, pipeline_commit=git_commit(REPO_ROOT), log=log,
                     cache_dir=cache_dir, centrality_engine=args.engine)
    if args.fixture_dir:
        hex_file = Path(args.fixture_dir) / "hex_geometries.json"
        if hex_file.exists():
            from .sources.aop import FixtureHexGeometry
            ctx.hex_geometry = FixtureHexGeometry.from_file(hex_file)
    for dataset_id in _resolve_datasets(args.datasets):
        log.info("dataset %s: início", dataset_id)
        DATASETS[dataset_id](ctx)
        log.info("dataset %s: fim", dataset_id)
    summary = ctx.summary.datasets
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True), "utf-8")
    latest = cache_dir / "runs" / "latest"
    try:
        if latest.is_symlink() or latest.exists():
            latest.unlink()
        latest.symlink_to(run_dir.name)
    except OSError:
        pass
    findings = validate_public_dir(out_dir, bbox=config.project.bbox, decimals=config.project.coordinate_decimals)
    for finding in findings:
        print(finding)
    for handler in list(log.handlers):
        handler.close()
        log.removeHandler(handler)
    return 1 if has_errors(findings) else 0


def cmd_discover(args: argparse.Namespace) -> int:
    """`discover grade`: lista grade_id*.zip nas pastas de 2010 e 2022 do geoftp (para pinar quadrant_ids)."""
    from .sources.ibge_grade import discover as discover_grade
    try:
        config = load_config(args.config)
    except ConfigError as error:
        print(f"config inválida: {error}", file=sys.stderr)
        return 2
    fetcher = FixtureFetcher.from_dir(args.fixture_dir) if args.fixture_dir else HttpFetcher(Path(args.cache) / "raw", refresh=True)
    for label, base in (("2010", config.households.base_url_2010), ("2022", config.households.base_url_2022)):
        names = discover_grade(fetcher, base)
        print(f"Grade {label} ({base}): {len(names)} arquivo(s)")
        for name in names:
            print(f"  {name}")
    print("Pine os quadrantes que cruzam o bbox em households_grid.quadrant_ids (pipeline/config/df.toml).")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    bbox = None
    decimals = 5
    if args.config:
        try:
            config = load_config(args.config)
            bbox = config.project.bbox
            decimals = config.project.coordinate_decimals
        except ConfigError as error:
            print(f"config inválida: {error}", file=sys.stderr)
            return 2
    findings = validate_public_dir(args.dir, bbox=bbox, decimals=decimals)
    for finding in findings:
        print(finding)
    failed = has_errors(findings)
    print("FALHA" if failed else "ok")
    return 1 if failed else 0


def cmd_pr_body(args: argparse.Namespace) -> int:
    manifest = read_manifest(Path(args.out))
    if manifest is None:
        print("manifest.json ausente — nada a descrever", file=sys.stderr)
        return 1
    summary = None
    if args.summary and Path(args.summary).exists():
        summary = json.loads(Path(args.summary).read_text("utf-8"))
    body = render_pr_body(manifest, summary)
    target = Path(args.to)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, "utf-8")
    print(f"corpo da PR escrito em {target}")
    return 0


def cmd_extract(args: argparse.Namespace) -> int:
    """Fase 2: extração BigQuery (RAIS por CEP). Sem credencial, diz por quê e sai 0."""
    import os
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") and not os.environ.get("BQ_PROJECT_ID"):
        print("extract: credencial GCP ausente — extração BigQuery pulada (fase 2).")
        return 0
    print(f"extract {args.source} {args.year}: extração BigQuery ainda não implementada (fase 2); nada gravado.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="imob_pipeline", description="Pipeline de dados públicos do Imob Intelligence")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="gera um ou mais datasets em data/public")
    run.add_argument("datasets", nargs="+", help="ids de dataset ou 'all'")
    run.add_argument("--out", default=str(REPO_ROOT / "data" / "public"))
    run.add_argument("--config", default=str(DEFAULT_CONFIG))
    run.add_argument("--cache", default=str(DEFAULT_CACHE))
    run.add_argument("--fixture-dir", default=None, help="usa FixtureFetcher com <dir>/fixture_urls.json — nunca toca a rede")
    run.add_argument("--refresh", action="store_true", help="ignora o cache de downloads")
    run.add_argument("--log-level", default="INFO")
    run.add_argument("--engine", default="auto", choices=["auto", "igraph", "pure"], help="motor de betweenness")
    run.set_defaults(func=cmd_run)

    discover = sub.add_parser("discover", help="lista o que a fonte publica, para pinar no config")
    discover.add_argument("what", choices=["grade"])
    discover.add_argument("--config", default=str(DEFAULT_CONFIG))
    discover.add_argument("--cache", default=str(DEFAULT_CACHE))
    discover.add_argument("--fixture-dir", default=None)
    discover.set_defaults(func=cmd_discover)

    validate = sub.add_parser("validate", help="confere data/public contra o manifest e os schemas")
    validate.add_argument("dir")
    validate.add_argument("--config", default=None, help="opcional: bbox e casas decimais do config")
    validate.set_defaults(func=cmd_validate)

    body = sub.add_parser("pr-body", help="escreve o corpo da PR a partir do manifest")
    body.add_argument("--out", default=str(REPO_ROOT / "data" / "public"))
    body.add_argument("--to", required=True)
    body.add_argument("--summary", default=None)
    body.set_defaults(func=cmd_pr_body)

    extract = sub.add_parser("extract", help="fase 2: extração BigQuery (Base dos Dados)")
    extract.add_argument("source", choices=["rais"])
    extract.add_argument("--year", type=int, required=True)
    extract.add_argument("--out", required=True)
    extract.set_defaults(func=cmd_extract)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))
