"""Dataset `households_grid`: Grade Estatística 2010 × 2022, overview 1 km + shards 200 m por RA."""

from __future__ import annotations

from ..outputs.manifest import dataset_entry
from ..sources.ibge_grade import load_edition, resolve_quadrants
from ..transforms.households import build_households
from ._common import breaks_block, clear_folder, publish, ra_index, write_layer, write_shards
from .context import RunContext

DATASET_ID = "households_grid"
FOLDER = "households_grid"
DETAIL_FOLDER = f"{FOLDER}/detail_200m"
SCHEMA = "schemas/households_grid.properties.schema.json"
ZOOM_MIN = 12


def _quadrants(ctx: RunContext, base_url: str, label: str) -> tuple[list[str], list[dict] | None]:
    """Ids pinados no config ou, com `quadrant_ids` vazio, resolvidos pelos limites de cada arquivo
    contra o bbox do projeto (por edição: 2010 e 2022 podem ter quadrantes diferentes)."""
    cfg = ctx.config.households
    if cfg.quadrant_ids:
        return list(cfg.quadrant_ids), None
    ids, report = resolve_quadrants(ctx.fetcher, base_url, bbox=ctx.config.project.bbox, label=label)
    ctx.log.info("%s: quadrantes resolvidos pelo bbox do projeto: %s — pine em households_grid.quadrant_ids "
                 "(pipeline/config/df.toml) para não baixar a Grade inteira de novo", label, ids)
    return ids, report


def run(ctx: RunContext) -> dict:
    cfg = ctx.config.households
    index, _ = ra_index(ctx)
    ids10, disc10 = _quadrants(ctx, cfg.base_url_2010, "Grade 2010")
    cells10, sup10, ret10 = load_edition(ctx.fetcher, base_url=cfg.base_url_2010, quadrant_ids=ids10,
                                         columns=cfg.columns_2010, label="Grade 2010")
    ids22, disc22 = _quadrants(ctx, cfg.base_url_2022, "Grade 2022")
    cells22, sup22, ret22 = load_edition(ctx.fetcher, base_url=cfg.base_url_2022, quadrant_ids=ids22,
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
    counts = {**result.counts, "suppressed_2010": len(sup10), "suppressed_2022": len(sup22),
              "quadrants_2010": len(ids10), "quadrants_2022": len(ids22)}
    notes = "A primeira classe (até 100 dom./km²) inclui perda e zero. 'Omitida' (sem domicílio nos dois anos) não é 'sem dado'."
    if cfg.notes_pt:
        notes += " " + cfg.notes_pt.strip()
    discovered = disc10 is not None or disc22 is not None
    if discovered:
        notes += (f" Quadrantes da Grade resolvidos pelo bbox do projeto nesta execução "
                  f"(2010: {', '.join(ids10)}; 2022: {', '.join(ids22)}).")
    entry = dataset_entry(
        dataset_id=DATASET_ID,
        title_pt="Domicílios ocupados por célula da Grade Estatística, 2010→2022 (IBGE)",
        version=ctx.version_stamp(), generated_at=ctx.now(), files=files, sources=sources, years=[2010, 2022],
        crs=ctx.config.project.crs, bbox=bbox,
        method_pt=(
            "As mesmas células nas duas edições (join por ID_UNICO). Colunas de origem — 2010: população "
            f"{cfg.columns_2010['pop']}, domicílios {cfg.columns_2010['dom_ocu']}, pai {cfg.columns_2010['parent_1km']}; "
            f"2022: população {cfg.columns_2022['pop']}, domicílios {cfg.columns_2022['dom_ocu']}, pai {cfg.columns_2022['parent_1km']}. "
            "households_delta = dom_ocu_2022 − dom_ocu_2010; "
            "por km² pela área nominal da célula; variação relativa é fração decimal e é nula quando 2010 é nulo ou zero. "
            "Overview de 1 km com somas estritas (filho nulo → soma nula + partial_children). Célula sem domicílio nos dois "
            "anos é omitida e contada. Valor suprimido vira nulo + flag, nunca é saturado. RA pelo centroide da célula."
        ),
        ra_assignment_method=ctx.config.ra.assignment_method,
        class_breaks=breaks_block(dict(cfg.breaks), n=len(result.detail)),
        counts=counts, quality_flags=sorted(set(result.flags) | set(cfg.dataset_flags)),
        notes_pt=notes,
        schema=SCHEMA,
    )
    manifest = publish(ctx, entry)
    info = {**counts, "files": len(files), "bytes": sum(f["bytes"] for f in files),
            "quadrant_ids_2010": ids10, "quadrant_ids_2022": ids22}
    if discovered:
        info["quadrant_discovery"] = {"2010": disc10, "2022": disc22}
    ctx.summary.dataset(DATASET_ID).update(info)
    ctx.log.info("households_grid: %s células publicadas, %s overview, %s arquivos", len(result.detail), len(result.overview), len(files))
    return manifest
