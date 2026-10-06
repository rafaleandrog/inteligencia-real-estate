"""Grade Estatística 2010 × 2022: join por célula, variação, overview de 1 km e shards por RA.

Regras que não se perdem (docs/DATA_CONTRACT.md, "households_grid"):
- célula presente num ano e ausente no outro → `null` + flag, nunca zero;
- valor suprimido → `null` + flag, nunca saturado (R8.59);
- somas do overview são ESTRITAS: filho nulo → soma nula + `partial_children`;
- célula sem domicílio nos dois anos é omitida e CONTADA;
- `households_delta_pct_change` é fração decimal e é `null` quando 2010 é nulo ou zero.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Mapping, Sequence

from ..geo import cell_size_from_id, convex_hull, polygon_area_km2, polygon_centroid
from ..sources.ibge_grade import GridCellRecord
from .classify import assign_class

AREA_TOLERANCE = 0.05


class HouseholdsError(ValueError):
    pass


@dataclass
class HouseholdsResult:
    detail: list[dict[str, Any]] = field(default_factory=list)     # feições 200 m (após o descarte)
    overview: list[dict[str, Any]] = field(default_factory=list)   # feições 1 km
    counts: dict[str, int] = field(default_factory=dict)
    flags: set[str] = field(default_factory=set)


def _delta_fields(dom10: int | None, dom22: int | None, area_km2: float) -> dict[str, Any]:
    if dom10 is None or dom22 is None:
        return {"households_delta": None, "households_delta_per_km2": None, "households_delta_pct_change": None}
    delta = dom22 - dom10
    pct = None if dom10 == 0 else round(delta / dom10, 4)
    return {
        "households_delta": delta,
        "households_delta_per_km2": round(delta / area_km2, 2),
        "households_delta_pct_change": pct,
    }


def _strict_sum(values: Sequence[int | None]) -> tuple[int | None, int]:
    missing = sum(1 for v in values if v is None)
    if missing or not values:
        return None, missing
    return sum(values), 0  # type: ignore[arg-type]


def _empty_both(dom10: int | None, dom22: int | None) -> bool:
    return (dom10 is None or dom10 == 0) and (dom22 is None or dom22 == 0)


def build_households(
    cells_2010: Iterable[GridCellRecord],
    cells_2022: Iterable[GridCellRecord],
    *,
    suppressed_2010: Iterable[str],
    suppressed_2022: Iterable[str],
    cell_area_km2: Mapping[str, float],
    breaks: Mapping[str, Sequence[float]],
    drop_if_empty_both_years: bool,
    assign_ra: Callable[[Sequence[float]], str | None],
) -> HouseholdsResult:
    by10 = {c.cell_id: c for c in cells_2010}
    by22 = {c.cell_id: c for c in cells_2022}
    sup10, sup22 = set(suppressed_2010), set(suppressed_2022)
    result = HouseholdsResult()
    counts = defaultdict(int)
    counts["cells_2010"] = len(by10)
    counts["cells_2022"] = len(by22)

    all_cells: list[dict[str, Any]] = []
    for cell_id in sorted(set(by10) | set(by22)):
        rec10, rec22 = by10.get(cell_id), by22.get(cell_id)
        base = rec22 or rec10
        assert base is not None
        size = cell_size_from_id(cell_id)
        if size not in cell_area_km2:
            raise HouseholdsError(f"tamanho de célula sem área configurada: {size} ({cell_id})")
        area = cell_area_km2[size]
        measured = polygon_area_km2(base.geometry)
        if abs(measured - area) / area > AREA_TOLERANCE:
            raise HouseholdsError(f"célula {cell_id}: área medida {measured:.4f} km² difere de {area} km² além de {AREA_TOLERANCE:.0%}")
        flags: list[str] = []
        if rec10 is None:
            flags.append("cell_missing_2010")
        if rec22 is None:
            flags.append("cell_missing_2022")
        if cell_id in sup10:
            flags.append("value_suppressed_2010")
        if cell_id in sup22:
            flags.append("value_suppressed_2022")
        dom10 = rec10.dom_ocu if rec10 else None
        dom22 = rec22.dom_ocu if rec22 else None
        if drop_if_empty_both_years and _empty_both(dom10, dom22):
            counts["dropped_empty_both_years"] += 1
            continue
        centroid = polygon_centroid(base.geometry)
        ra = assign_ra(centroid)
        if ra is None:
            flags.append("ra_unassigned")
            counts["ra_unassigned"] += 1
        props: dict[str, Any] = {
            "cell_id": cell_id,
            "cell_size": size,
            "area_km2": area,
            "pop_2010": rec10.pop if rec10 else None,
            "pop_2022": rec22.pop if rec22 else None,
            "dom_ocu_2010": dom10,
            "dom_ocu_2022": dom22,
            **_delta_fields(dom10, dom22, area),
            "ra_geo_id": ra,
            "quality_flags": sorted(set(flags)),
        }
        props["class_households_delta_per_km2"] = assign_class(props["households_delta_per_km2"], breaks["households_delta_per_km2"])
        if "households_delta" in breaks:
            props["class_households_delta"] = assign_class(props["households_delta"], breaks["households_delta"])
        all_cells.append({"id": cell_id, "geometry": base.geometry, "properties": props,
                          "_parent": (base.parent_1km or cell_id), "_centroid": centroid})

    detail = [c for c in all_cells if c["properties"]["cell_size"] == "200M"]
    result.detail = [{"id": c["id"], "geometry": c["geometry"], "properties": c["properties"]} for c in detail]
    counts["published"] = len(result.detail)

    # Overview: pais de 1 km das células de 200 m + células de 1 km não subdivididas.
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for c in all_cells:
        if c["properties"]["cell_size"] == "200M":
            groups[c["_parent"]].append(c)
    singles = [c for c in all_cells if c["properties"]["cell_size"] == "1KM"]
    overview: list[dict[str, Any]] = []
    for parent_id in sorted(groups):
        children = groups[parent_id]
        area = cell_area_km2["1KM"]
        dom10, miss10 = _strict_sum([c["properties"]["dom_ocu_2010"] for c in children])
        dom22, miss22 = _strict_sum([c["properties"]["dom_ocu_2022"] for c in children])
        pop10, _ = _strict_sum([c["properties"]["pop_2010"] for c in children])
        pop22, _ = _strict_sum([c["properties"]["pop_2022"] for c in children])
        missing = max(miss10, miss22)
        geometry = {"type": "Polygon", "coordinates": [convex_hull(
            p for c in children for ring in c["geometry"]["coordinates"][:1] for p in ring
        )]}
        centroid = polygon_centroid(geometry)
        ra = assign_ra(centroid)
        flags = []
        if missing:
            flags.append("partial_children")
            counts["partial_children"] += 1
        if ra is None:
            flags.append("ra_unassigned")
        props = {
            "cell_id": parent_id, "cell_size": "1KM", "area_km2": area,
            "pop_2010": pop10, "pop_2022": pop22, "dom_ocu_2010": dom10, "dom_ocu_2022": dom22,
            **_delta_fields(dom10, dom22, area), "ra_geo_id": ra,
            "children": len(children), "children_missing": missing, "quality_flags": sorted(set(flags)),
        }
        props["class_households_delta_per_km2"] = assign_class(props["households_delta_per_km2"], breaks["households_delta_per_km2"])
        overview.append({"id": parent_id, "geometry": geometry, "properties": props})
    for c in singles:
        props = dict(c["properties"])
        props["children"] = 0
        props["children_missing"] = 0
        props.pop("class_households_delta", None)
        overview.append({"id": c["id"], "geometry": c["geometry"], "properties": props})
    result.overview = sorted(overview, key=lambda f: f["id"])
    counts["overview_cells"] = len(result.overview)
    result.counts = dict(counts)
    if counts.get("ra_unassigned"):
        result.flags.add("ra_unassigned")
    if counts.get("partial_children"):
        result.flags.add("partial_children")
    return result


def shard_by_ra(features: Iterable[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    shards: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for feature in features:
        shards[feature["properties"].get("ra_geo_id") or "SEM_RA"].append(feature)
    return dict(shards)
