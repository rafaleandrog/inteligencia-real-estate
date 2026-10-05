"""Dataset `ra_crosswalk`: a ponte declarada entre `RA_nn` e `RA2026_RA-<romano>`."""

from __future__ import annotations

from ..outputs.geojson import write_json
from ..outputs.manifest import dataset_entry, file_entry, upsert_manifest
from ..sources.geoportal_ra import load_ra_polygons
from ..transforms.crosswalk import build_crosswalk
from .context import RunContext

DATASET_ID = "ra_crosswalk"
FILE_NAME = "ra_crosswalk.json"
SCHEMA = "schemas/ra_crosswalk.schema.json"


def run(ctx: RunContext) -> dict:
    cfg = ctx.config.ra
    polygons, retrievals = load_ra_polygons(
        ctx.fetcher, cfg.geoportal_layer_url, out_fields=cfg.out_fields, page_size=cfg.page_size,
    )
    retrieved_at = retrievals[0]["retrieved_at"] if retrievals else ctx.now()
    source = {**cfg.source.as_dict(), "retrieved_at": retrieved_at}
    payload = build_crosswalk(
        polygons, roman_key_prefix=cfg.roman_key_prefix, expected_count=cfg.expected_count, source=source,
    )
    write_json(ctx.out_dir / FILE_NAME, payload, indent=2)
    files = [file_entry(ctx.out_dir, FILE_NAME, role="data", budget_bytes=ctx.config.manifest.budgets["crosswalk"])]
    entry = dataset_entry(
        dataset_id=DATASET_ID,
        title_pt="Ponte entre as grafias de Região Administrativa (RA_nn ↔ RA2026_RA-romano)",
        version=ctx.version_stamp(),
        generated_at=ctx.now(),
        files=files,
        sources=[source],
        years=[],
        crs=ctx.config.project.crs,
        bbox=None,
        method_pt=(
            "Derivada só dos atributos oficiais do GeoPortal/SEDUH (ra_cira, ra_codigo, ra_nome, ra_areakm2); "
            "o código romano é validado por ida-e-volta contra o número; nome e slug seguem as mesmas funções do Code.gs."
        ),
        ra_assignment_method=None,
        class_breaks=None,
        counts={"ras": len(payload["rows"])},
        quality_flags=[],
        notes_pt="RA 36 e 37 existem no limite oficial e podem não ter perfil PDAD; a ausência de perfil é decidida pelo cliente, não aqui.",
        schema=SCHEMA,
    )
    manifest = upsert_manifest(
        ctx.out_dir, entry, generated_at=ctx.now(), pipeline_commit=ctx.pipeline_commit,
        config_sha256=ctx.config.sha256, attribution_pt=ctx.config.manifest.attribution_pt,
    )
    info = ctx.summary.dataset(DATASET_ID)
    info.update({"ras": len(payload["rows"]), "bytes": files[0]["bytes"]})
    ctx.log.info("ra_crosswalk: %s RAs, %s bytes", len(payload["rows"]), files[0]["bytes"])
    return manifest
