"""AOP → hexágonos r9 (detalhe, empregos ≥ 1) e r8 (overview, somas estritas por pai)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Mapping, Sequence

from ..geo import polygon_centroid
from ..sources.aop import HexGeometry, HexRecord
from .classify import assign_class

JOB_METRICS = ("jobs_total", "jobs_low", "jobs_mid", "jobs_high")


@dataclass
class JobsResult:
    detail: list[dict[str, Any]] = field(default_factory=list)
    overview: list[dict[str, Any]] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    flags: set[str] = field(default_factory=set)


def class_or_absent(value: int | float | None, breaks: Sequence[float], *, zero_is_absent: bool) -> int | None:
    if zero_is_absent and value == 0:
        return None
    return assign_class(value, breaks)


def _strict_sum(values: Sequence[int | None]) -> tuple[int | None, int]:
    missing = sum(1 for v in values if v is None)
    if missing or not values:
        return None, missing
    return sum(values), 0  # type: ignore[arg-type]


def build_jobs(
    records: Iterable[HexRecord],
    previous: Iterable[HexRecord],
    *,
    geometry: HexGeometry,
    overview_resolution: int,
    detail_min_jobs: int,
    breaks: Mapping[str, Sequence[float]],
    assign_ra: Callable[[Sequence[float]], str | None],
) -> JobsResult:
    prev_by_hex = {r.h3_index: r for r in previous}
    result = JobsResult()
    counts: dict[str, int] = defaultdict(int)
    all_hexes: list[dict[str, Any]] = []
    for rec in sorted(records, key=lambda r: r.h3_index):
        counts["hexes_source"] += 1
        flags = ["aop_population_2010_based"]
        prev = prev_by_hex.get(rec.h3_index)
        if prev is None:
            flags.append("hex_missing_2017")
        geom = geometry.boundary(rec.h3_index)
        parent = geometry.parent(rec.h3_index, overview_resolution)
        centroid = polygon_centroid(geom)
        ra = assign_ra(centroid)
        if ra is None:
            flags.append("ra_unassigned")
        props: dict[str, Any] = {
            "h3_index": rec.h3_index, "h3_parent_r8": parent, "year": rec.year,
            "jobs_total": rec.jobs_total, "jobs_low": rec.jobs_low, "jobs_mid": rec.jobs_mid, "jobs_high": rec.jobs_high,
            "jobs_total_2017": prev.jobs_total if prev else None,
            "pop_total": rec.pop_total, "income_avg_brl": rec.income_avg_brl, "income_decile": rec.income_decile,
            "ra_geo_id": ra, "quality_flags": sorted(set(flags)),
        }
        for metric in JOB_METRICS:
            if metric in breaks:
                props[f"class_{metric}"] = class_or_absent(props[metric], breaks[metric], zero_is_absent=True)
        all_hexes.append({"id": rec.h3_index, "geometry": geom, "properties": props, "_parent": parent})

    for h in all_hexes:
        total = h["properties"]["jobs_total"]
        if total is None:
            counts["omitted_null_jobs"] += 1
        elif total < detail_min_jobs:
            counts["omitted_zero_jobs"] += 1
        else:
            if "ra_unassigned" in h["properties"]["quality_flags"]:
                counts["ra_unassigned"] += 1
            result.detail.append({"id": h["id"], "geometry": h["geometry"], "properties": h["properties"]})
    counts["published"] = len(result.detail)

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for h in all_hexes:
        groups[h["_parent"]].append(h)
    for parent in sorted(groups):
        children = groups[parent]
        if not any((c["properties"]["jobs_total"] or 0) > 0 or (c["properties"]["pop_total"] or 0) > 0 for c in children):
            continue
        sums: dict[str, Any] = {}
        missing_any = 0
        for metric in JOB_METRICS + ("pop_total", "jobs_total_2017"):
            value, missing = _strict_sum([c["properties"][metric] for c in children])
            sums[metric] = value
            if metric in JOB_METRICS or metric == "pop_total":
                missing_any = max(missing_any, missing)
        geom = geometry.boundary(parent)
        centroid = polygon_centroid(geom)
        ra = assign_ra(centroid)
        flags = ["aop_population_2010_based"]
        if missing_any:
            flags.append("partial_children")
            counts["partial_children"] += 1
        if ra is None:
            flags.append("ra_unassigned")
        props = {
            "h3_index": parent, "year": children[0]["properties"]["year"], **sums,
            "ra_geo_id": ra, "hexes": len(children), "quality_flags": sorted(set(flags)),
        }
        for metric in JOB_METRICS:
            if metric in breaks:
                props[f"class_{metric}"] = class_or_absent(props[metric], breaks[metric], zero_is_absent=True)
        result.overview.append({"id": parent, "geometry": geom, "properties": props})
    counts["overview_hexes"] = len(result.overview)
    result.counts = dict(counts)
    if counts.get("ra_unassigned"):
        result.flags.add("ra_unassigned")
    if counts.get("partial_children"):
        result.flags.add("partial_children")
    return result
