"""Dataset `jobs_hex`: Ipea AOP, hexágonos r9 (detalhe por RA) e r8 (overview)."""

from __future__ import annotations

from ..outputs.manifest import dataset_entry
from ..sources.aop import H3Library, load_landuse
from ..transforms.jobs import build_jobs
from ._common import breaks_block, clear_folder, publish, ra_index, write_layer, write_shards
from .context import RunContext

DATASET_ID = "jobs_hex"
FOLDER = "jobs_hex"
DETAIL_FOLDER = f"{FOLDER}/detail_r9"
SCHEMA = "schemas/jobs_hex.properties.schema.json"
ZOOM_MIN = 12


def run(ctx: RunContext) -> dict:
    cfg = ctx.config.jobs
    index, _ = ra_index(ctx)
    geometry = ctx.hex_geometry or H3Library()
    records, retrievals = load_landuse(ctx.fetcher, metadata_url=cfg.metadata_url, city=cfg.city, year=cfg.year, columns=cfg.columns,
                                       fallback_urls=cfg.metadata_fallback_urls, probe_urls=cfg.probe_urls)
    previous, prev_retrievals = load_landuse(ctx.fetcher, metadata_url=cfg.metadata_url, city=cfg.city, year=cfg.previous_year,
                                             columns=cfg.columns, fallback_urls=cfg.metadata_fallback_urls, probe_urls=cfg.probe_urls)
    result = build_jobs(
        records, previous, geometry=geometry, overview_resolution=cfg.overview_resolution,
        detail_min_jobs=cfg.detail_min_jobs, breaks=cfg.breaks, assign_ra=index.assign,
    )
    clear_folder(ctx, DETAIL_FOLDER)
    files = [write_layer(ctx, f"{FOLDER}/overview_r8.json", result.overview, role="overview", budget_bytes=cfg.budgets["overview"])]
    files += write_shards(ctx, DETAIL_FOLDER, result.detail, budget_bytes=cfg.budgets["shard"], zoom_min=ZOOM_MIN)
    bbox = None
    for f in files:
        if f.get("bbox"):
            b = f["bbox"]
            bbox = b if bbox is None else [min(bbox[0], b[0]), min(bbox[1], b[1]), max(bbox[2], b[2]), max(bbox[3], b[3])]
    source = {**cfg.source.as_dict(), "retrieved_at": retrievals[-1]["retrieved_at"],
              "files": sorted({r["url"].rsplit("/", 1)[-1] for r in retrievals + prev_retrievals})}
    entry = dataset_entry(
        dataset_id=DATASET_ID,
        title_pt=f"Empregos formais por hexágono H3 (Ipea Acesso a Oportunidades / RAIS, {cfg.year})",
        version=ctx.version_stamp(), generated_at=ctx.now(), files=files, sources=[source],
        years=[cfg.previous_year, cfg.year], crs=ctx.config.project.crs, bbox=bbox,
        method_pt=(
            f"Hexágonos H3 resolução {cfg.h3_resolution} do AOP para a cidade '{cfg.city}', ano {cfg.year}; T001–T004 são empregos "
            f"formais (RAIS) por tercil de renda; P001 é população com base no Censo 2010. Detalhe publica jobs_total ≥ {cfg.detail_min_jobs}; "
            f"overview soma por hexágono-pai r{cfg.overview_resolution} com somas estritas. RA pelo centro do hexágono."
        ),
        ra_assignment_method=ctx.config.ra.assignment_method,
        class_breaks=breaks_block(dict(cfg.breaks), n=len(result.detail), zero_is_absent=True),
        counts=result.counts, quality_flags=sorted(result.flags | {"aop_population_2010_based"}),
        notes_pt="Hexágono omitido (sem emprego formal) não é 'sem dado': conta em omitted_zero_jobs. População-base é do Censo 2010 (AOP).",
        schema=SCHEMA,
    )
    manifest = publish(ctx, entry)
    ctx.summary.dataset(DATASET_ID).update({**result.counts, "files": len(files), "bytes": sum(f["bytes"] for f in files)})
    ctx.log.info("jobs_hex: %s hexágonos publicados, %s overview", len(result.detail), len(result.overview))
    return manifest
