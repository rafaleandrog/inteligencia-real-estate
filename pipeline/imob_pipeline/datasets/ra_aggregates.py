"""Dataset `ra_aggregates`: uma linha por RA, somada dos arquivos publicados dos outros três."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..outputs.geojson import write_json
from ..outputs.manifest import dataset_entry, file_entry, read_manifest
from ..transforms.aggregate_ra import aggregate_households, aggregate_jobs, build_rows
from ..transforms.centrality import ra_road_summary
from ._common import publish
from .context import RunContext

DATASET_ID = "ra_aggregates"
FILE_NAME = "ra_aggregates.json"
SCHEMA = "schemas/ra_aggregates.schema.json"


def _features(out_dir: Path, manifest: dict[str, Any], dataset_id: str, roles: tuple[str, ...]) -> list[dict[str, Any]]:
    dataset = next((d for d in manifest.get("datasets", []) if d.get("id") == dataset_id), None)
    if not dataset:
        return []
    features: list[dict[str, Any]] = []
    for entry in dataset["files"]:
        if entry["role"] in roles:
            payload = json.loads((out_dir / entry["path"]).read_text("utf-8"))
            features.extend(payload.get("features", []))
    return features


def _dataset(manifest: dict[str, Any], dataset_id: str) -> dict[str, Any] | None:
    return next((d for d in manifest.get("datasets", []) if d.get("id") == dataset_id), None)


def run(ctx: RunContext) -> dict:
    manifest = read_manifest(ctx.out_dir) or {"datasets": []}
    crosswalk_path = ctx.out_dir / "ra_crosswalk.json"
    if not crosswalk_path.exists():
        raise RuntimeError("ra_aggregates exige ra_crosswalk.json publicado — rode `run ra_crosswalk` antes")
    crosswalk_rows = json.loads(crosswalk_path.read_text("utf-8"))["rows"]

    hh_detail = _features(ctx.out_dir, manifest, "households_grid", ("detail_shard", "detail"))
    hh_overview = _features(ctx.out_dir, manifest, "households_grid", ("overview",))
    jobs_detail = _features(ctx.out_dir, manifest, "jobs_hex", ("detail_shard", "detail"))
    jobs_overview = _features(ctx.out_dir, manifest, "jobs_hex", ("overview",))
    roads_detail = _features(ctx.out_dir, manifest, "road_centrality", ("detail",))

    households = aggregate_households(hh_detail, hh_overview) if (hh_detail or hh_overview) else None
    jobs = aggregate_jobs(jobs_detail, jobs_overview) if (jobs_detail or jobs_overview) else None
    roads = ra_road_summary(roads_detail) if roads_detail else None

    hh_ds, jobs_ds, roads_ds = (_dataset(manifest, k) for k in ("households_grid", "jobs_hex", "road_centrality"))
    sources = {
        "households": hh_ds["sources"][0]["name"] if hh_ds else None,
        "jobs": jobs_ds["sources"][0]["name"] if jobs_ds else None,
        "jobs_year": max(jobs_ds["years"]) if jobs_ds and jobs_ds.get("years") else None,
        "centrality": roads_ds["sources"][0]["name"] if roads_ds else None,
        "centrality_snapshot": str(roads_ds["years"][0]) if roads_ds and roads_ds.get("years") else None,
    }
    rows = build_rows(crosswalk_rows, households=households, jobs=jobs, roads=roads, sources=sources)
    hh_cfg = ctx.config.households
    # Comparação entre edições suprimida por config (universo de domicílios a confirmar; #164, #166):
    # nulo com flag, nunca um número sem ressalva ao lado — os totais de cada edição continuam.
    growth_suppressed = bool(households) and hh_cfg.suppress_growth_in_aggregates
    if growth_suppressed:
        for row in rows:
            if row.get("households_source") is not None:
                row["households_delta"] = None
                row["households_growth_pct"] = None
                row["quality_flags"] = sorted(set(row.get("quality_flags") or []) | {"households_growth_suppressed"})
    write_json(ctx.out_dir / FILE_NAME, {"rows": rows}, indent=None)
    files = [file_entry(ctx.out_dir, FILE_NAME, role="data", budget_bytes=ctx.config.manifest.budgets["aggregates"])]

    counts: dict[str, int] = {"ras": len(rows)}
    if households:
        unassigned = households.get("SEM_RA", {})
        counts["unassigned_households_2022"] = int(unassigned.get("households_2022") or 0)
        counts["households_2022_total"] = int(sum((h.get("households_2022") or 0) for h in households.values()))
    if jobs:
        counts["unassigned_jobs"] = int((jobs.get("SEM_RA", {}) or {}).get("jobs_total") or 0)
        counts["jobs_total"] = int(sum((j.get("jobs_total") or 0) for j in jobs.values()))
    if roads:
        counts["unassigned_edges"] = int((roads.get("SEM_RA", {}) or {}).get("edges_total") or 0)
        counts["edges_total"] = int(sum(r["edges_total"] for r in roads.values()))
    flags = [f for f, present in (("households_missing", households), ("jobs_missing", jobs), ("centrality_missing", roads)) if not present]
    notes = "Bloco de dataset não gerado vem nulo (nunca zero) com a flag correspondente."
    # Ressalva declarada no config do conjunto de origem acompanha o agregado: quem lê
    # households_growth_pct aqui precisa da mesma ressalva de quem lê o mapa (#164, #166).
    if households and hh_cfg.dataset_flags:
        flags.extend(hh_cfg.dataset_flags)
        if hh_cfg.notes_pt:
            notes += " Domicílios (ressalva herdada de households_grid): " + hh_cfg.notes_pt.strip()
    if growth_suppressed:
        flags.append("households_growth_suppressed")
        notes += (" households_delta e households_growth_pct saem nulos (flag households_growth_suppressed) até o universo "
                  "de domicílios de 2010 ser confirmado e o site mostrar a ressalva ao lado do número (#164, #166); "
                  "households_2010 e households_2022 continuam publicados.")
    all_sources = [s for ds in (hh_ds, jobs_ds, roads_ds) if ds for s in ds["sources"]]
    entry = dataset_entry(
        dataset_id=DATASET_ID,
        title_pt="Agregados por Região Administrativa (domicílios, empregos, centralidade)",
        version=ctx.version_stamp(), generated_at=ctx.now(), files=files,
        sources=all_sources or [{"name": "ponte de RAs (GeoPortal/SEDUH)", "url": ctx.config.ra.source.url, "retrieved_at": ctx.now(),
                                 "license": ctx.config.ra.source.license, "attribution_pt": ctx.config.ra.source.attribution_pt}],
        years=sorted({y for ds in (hh_ds, jobs_ds, roads_ds) if ds for y in ds.get("years", [])}),
        crs=ctx.config.project.crs, bbox=None,
        method_pt=(
            "Somas sobre os arquivos publicados: domicílios = células de 200 m + células de 1 km não subdivididas; empregos = "
            "hexágonos r9 publicados, população-base = overview r8 (inclui hexágonos sem emprego); centralidade = arestas publicadas. "
            "households_growth_pct = delta ÷ 2010 (fração decimal); jobs_per_1000_residents = empregos ÷ população-base × 1000; "
            "por km² pela área oficial da RA. Feição fora de toda RA vai para o balde SEM_RA, contado em counts."
        ),
        ra_assignment_method=ctx.config.ra.assignment_method, class_breaks=None, counts=counts, quality_flags=sorted(set(flags)),
        notes_pt=notes,
        schema=SCHEMA,
    )
    manifest = publish(ctx, entry)
    ctx.summary.dataset(DATASET_ID).update({**counts, "bytes": files[0]["bytes"]})
    ctx.log.info("ra_aggregates: %s RAs", len(rows))
    return manifest
