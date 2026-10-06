"""Peças compartilhadas pelos orquestradores: RAs oficiais, escrita de shards e entrada no manifest."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from ..outputs.geojson import write_feature_collection
from ..outputs.manifest import file_entry, upsert_manifest
from ..sources.geoportal_ra import load_ra_polygons
from ..transforms.assign_ra import RaIndex
from ..transforms.households import shard_by_ra
from .context import RunContext


def ra_index(ctx: RunContext) -> tuple[RaIndex, list[dict[str, Any]]]:
    cfg = ctx.config.ra
    polygons, retrievals = load_ra_polygons(ctx.fetcher, cfg.geoportal_layer_url, out_fields=cfg.out_fields, page_size=cfg.page_size)
    if len(polygons) != cfg.expected_count:
        raise RuntimeError(f"GeoPortal devolveu {len(polygons)} RAs; o config espera {cfg.expected_count}")
    return RaIndex(polygons), retrievals


def write_layer(ctx: RunContext, rel_path: str, features: Iterable[dict[str, Any]], *, role: str, budget_bytes: int,
                zoom_min: int | None = None, shard_key: str | None = None, shard_value: str | None = None) -> dict[str, Any]:
    info = write_feature_collection(ctx.out_dir / rel_path, features, decimals=ctx.config.project.coordinate_decimals)
    return file_entry(ctx.out_dir, rel_path, role=role, budget_bytes=budget_bytes, features=info["features"], bbox=info["bbox"],
                      shard_key=shard_key, shard_value=shard_value, zoom_min=zoom_min)


def write_shards(ctx: RunContext, folder: str, features: Iterable[dict[str, Any]], *, budget_bytes: int, zoom_min: int) -> list[dict[str, Any]]:
    entries = []
    for ra, group in sorted(shard_by_ra(features).items()):
        entries.append(write_layer(ctx, f"{folder}/{ra}.json", group, role="detail_shard", budget_bytes=budget_bytes,
                                   zoom_min=zoom_min, shard_key="ra_geo_id", shard_value=ra))
    return entries


def clear_folder(ctx: RunContext, folder: str) -> None:
    """Shards antigos de uma RA que deixou de ter feição não podem sobrar fora do manifest."""
    target = ctx.out_dir / folder
    if target.exists():
        for old in target.glob("*.json"):
            old.unlink()


def publish(ctx: RunContext, entry: dict[str, Any]) -> dict[str, Any]:
    return upsert_manifest(ctx.out_dir, entry, generated_at=ctx.now(), pipeline_commit=ctx.pipeline_commit,
                           config_sha256=ctx.config.sha256, attribution_pt=ctx.config.manifest.attribution_pt)


def breaks_block(breaks: dict[str, list[float]], *, n: int, zero_is_absent: bool = False) -> dict[str, Any]:
    out = {}
    for metric, cuts in breaks.items():
        block: dict[str, Any] = {"method": "fixed", "breaks": list(cuts), "classes": len(cuts) + 1, "n": n}
        if zero_is_absent:
            block["zero_is_absent"] = True
        out[metric] = block
    return out
