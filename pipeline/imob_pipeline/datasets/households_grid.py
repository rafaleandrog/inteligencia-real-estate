"""Dataset `households_grid`: Grade Estatística 2010 × 2022, overview 1 km + shards 200 m por RA."""

from __future__ import annotations

from ..outputs.manifest import dataset_entry
from ..sources.ibge_grade import load_edition
from ..transforms.households import build_households
from ._common import breaks_block, clear_folder, publish, ra_index, write_layer, write_shards
from .context import RunContext

DATASET_ID = "households_grid"
FOLDER = "households_grid"
DETAIL_FOLDER = f"{FOLDER}/detail_200m"
SCHEMA = "schemas/households_grid.properties.schema.json"
ZOOM_MIN = 12


def run(ctx: RunContext) -> dict:
    cfg = ctx.config.households
    index, _ = ra_index(ctx)
    cells10, sup10, ret10 = load_edition(ctx.fetcher, base_url=cfg.base_url_2010, quadrant_ids=cfg.quadrant_ids,
                                         columns=cfg.columns_2010, label="Grade 2010")
    cells22, sup22, ret22 = load_edition(ctx.fetcher, base_url=cfg.base_url_2022, quadrant_ids=cfg.quadrant_ids,
                                         columns=cfg.columns_2022, label="Grade 2022")
    result = build_households(
        cells10, cells22, suppressed_2010=sup10, suppressed_2022=sup22, cell_area_km2=cfg.cell_area_km2,
        breaks=cfg.breaks, drop_if_empty_both_years=cfg.drop_if_empty_both_years, assign_ra=index.assign,
    )
    clear_folder(ctx, DETAIL_FOLDER)
    files = [write_layer(ctx, f"{FOLDER}/overview_1km.json", result.overview, role="overview", budget_bytes=cfg.budgets["overview"])]
    files += write_shards(ctx, DETAIL_FOLDER, result.detail, budget_bytes=cfg.budgets["shard"], zoom_min=ZOOM_MIN)
    bbox = None
    for f in files:
        if f.get("bbox"):
            b = f["bbox"]
            bbox = b if bbox is None else [min(bbox[0], b[0]), min(bbox[1], b[1]), max(bbox[2], b[2]), max(bbox[3], b[3])]
    sources = [
        {**cfg.source_2010.as_dict(), "retrieved_at": ret10[0]["retrieved_at"], "files": [r["url"].rsplit("/", 1)[-1] for r in ret10]},
        {**cfg.source_2022.as_dict(), "retrieved_at": ret22[0]["retrieved_at"], "files": [r["url"].rsplit("/", 1)[-1] for r in ret22]},
    ]
    counts = {**result.counts, "suppressed_2010": len(sup10), "suppressed_2022": len(sup22)}
    entry = dataset_entry(
        dataset_id=DATASET_ID,
        title_pt="Domicílios ocupados por célula da Grade Estatística, 2010→2022 (IBGE)",
        version=ctx.version_stamp(), generated_at=ctx.now(), files=files, sources=sources, years=[2010, 2022],
        crs=ctx.config.project.crs, bbox=bbox,
        method_pt=(
            "As mesmas células nas duas edições (join por ID_UNICO). households_delta = dom_ocu_2022 − dom_ocu_2010; "
            "por km² pela área nominal da célula; variação relativa é fração decimal e é nula quando 2010 é nulo ou zero. "
            "Overview de 1 km com somas estritas (filho nulo → soma nula + partial_children). Célula sem domicílio nos dois "
            "anos é omitida e contada. Valor suprimido vira nulo + flag, nunca é saturado. RA pelo centroide da célula."
        ),
        ra_assignment_method=ctx.config.ra.assignment_method,
        class_breaks=breaks_block(dict(cfg.breaks), n=len(result.detail)),
        counts=counts, quality_flags=sorted(result.flags),
        notes_pt="A primeira classe (até 100 dom./km²) inclui perda e zero. 'Omitida' (sem domicílio nos dois anos) não é 'sem dado'.",
        schema=SCHEMA,
    )
    manifest = publish(ctx, entry)
    ctx.summary.dataset(DATASET_ID).update({**counts, "files": len(files), "bytes": sum(f["bytes"] for f in files)})
    ctx.log.info("households_grid: %s células publicadas, %s overview, %s arquivos", len(result.detail), len(result.overview), len(files))
    return manifest
