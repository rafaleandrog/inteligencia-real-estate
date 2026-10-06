"""Grade Estatística 2010 × 2022: join por célula, variação, overview de 1 km e shards por RA.

Regras que não se perdem (docs/DATA_CONTRACT.md, "households_grid"):
- célula presente num ano e ausente no outro → `null` + flag, nunca zero;
- valor suprimido → `null` + flag, nunca saturado (R8.59);
- somas do overview são ESTRITAS: filho nulo → soma nula + `partial_children`;
- célula sem domicílio NEM população nos dois anos é omitida e CONTADA (do detalhe; a de 1 km, do
  overview); mesmo omitida do detalhe, continua filha do pai no overview (somas, contagens e a
  checagem de resolução ambígua veem todas as filhas listadas). Célula só com população (domicílios
  coletivos) é publicada com domicílios zero, para a gente dela chegar aos totais por RA;
- célula com centroide fora do bbox do projeto é descartada e CONTADA — o quadrante da Grade cobre
  muito mais que o DF e a segunda execução real publicou Goiás inteiro (#167);
- `households_delta_pct_change` é fração decimal e é `null` quando 2010 é nulo ou zero;
- a mesma célula de 1 km pode vir INTEIRA numa edição e SUBDIVIDIDA em 200 m na outra (área que
  urbanizou entre os Censos): o overview publica UMA feição por id, o valor de cada edição vem da
  listagem daquela edição (célula inteira ou soma estrita das filhas), com a flag
  `resolution_changed` e `children_2010`/`children_2022` dizendo de onde veio cada ano (#167).
  A mesma edição com a célula inteira E filhas é resolução ambígua: falha nomeando a célula.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Mapping, Sequence

from ..geo import bbox_contains_point, cell_size_from_id, convex_hull, polygon_area_km2, polygon_centroid
from ..sources.ibge_grade import GridCellRecord
from .classify import assign_class

AREA_TOLERANCE = 0.05
EDITIONS = ("2010", "2022")


class HouseholdsError(ValueError):
    pass


@dataclass
class HouseholdsResult:
    detail: list[dict[str, Any]] = field(default_factory=list)     # feições 200 m (após o descarte)
    overview: list[dict[str, Any]] = field(default_factory=list)   # feições 1 km
    counts: dict[str, int] = field(default_factory=dict)
    flags: set[str] = field(default_factory=set)


@dataclass
class _Joined:
    """Uma célula (200 m ou 1 km) depois do join das duas edições."""
    cell_id: str
    size: str
    area: float
    geometry: dict[str, Any]
    centroid: tuple[float, float]
    parent: str
    recs: dict[str, GridCellRecord | None]
    flags: list[str]

    def dom(self, edition: str) -> int | None:
        rec = self.recs[edition]
        return rec.dom_ocu if rec else None

    def pop(self, edition: str) -> int | None:
        rec = self.recs[edition]
        return rec.pop if rec else None


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


def _blank(value: int | None) -> bool:
    return value is None or value == 0


def _empty_both(dom10: int | None, dom22: int | None) -> bool:
    return _blank(dom10) and _blank(dom22)


def _empty_cell(j: "_Joined") -> bool:
    """Sem domicílio E sem população nas duas edições. Célula só com população (domicílios coletivos:
    quartel, presídio, alojamento) é publicada com domicílios zero — omiti-la sumiria com gente dos
    totais por RA (segundo achado do Codex na PR #168)."""
    return all(_blank(v) for v in (j.dom("2010"), j.dom("2022"), j.pop("2010"), j.pop("2022")))


def _cell_props(cell_id: str, size: str, area: float, *, pop10: int | None, pop22: int | None, dom10: int | None,
                dom22: int | None, ra: str | None, flags: Iterable[str], breaks: Mapping[str, Sequence[float]],
                with_delta_class: bool) -> dict[str, Any]:
    props: dict[str, Any] = {
        "cell_id": cell_id,
        "cell_size": size,
        "area_km2": area,
        "pop_2010": pop10,
        "pop_2022": pop22,
        "dom_ocu_2010": dom10,
        "dom_ocu_2022": dom22,
        **_delta_fields(dom10, dom22, area),
        "ra_geo_id": ra,
        "quality_flags": sorted(set(flags)),
    }
    props["class_households_delta_per_km2"] = assign_class(props["households_delta_per_km2"], breaks["households_delta_per_km2"])
    if with_delta_class and "households_delta" in breaks:
        props["class_households_delta"] = assign_class(props["households_delta"], breaks["households_delta"])
    return props


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
    bbox: Sequence[float] | None = None,
) -> HouseholdsResult:
    """`bbox` (lon_min, lat_min, lon_max, lat_max): célula com centroide fora dele é descartada ANTES da
    checagem de área e contada em `dropped_outside_bbox` (#167)."""
    by = {"2010": {c.cell_id: c for c in cells_2010}, "2022": {c.cell_id: c for c in cells_2022}}
    sup = {"2010": set(suppressed_2010), "2022": set(suppressed_2022)}
    result = HouseholdsResult()
    counts: dict[str, int] = defaultdict(int)
    counts["cells_2010"] = len(by["2010"])
    counts["cells_2022"] = len(by["2022"])
    counts["dropped_outside_bbox"] = 0
    counts["dropped_empty_both_years"] = 0
    counts["resolution_changed"] = 0

    joined: list[_Joined] = []
    for cell_id in sorted(set(by["2010"]) | set(by["2022"])):
        recs = {e: by[e].get(cell_id) for e in EDITIONS}
        base = recs["2022"] or recs["2010"]
        assert base is not None
        centroid = polygon_centroid(base.geometry)
        if bbox is not None and not bbox_contains_point(tuple(bbox), centroid):  # type: ignore[arg-type]
            counts["dropped_outside_bbox"] += 1
            continue
        size = cell_size_from_id(cell_id)
        if size not in cell_area_km2:
            raise HouseholdsError(f"tamanho de célula sem área configurada: {size} ({cell_id})")
        area = cell_area_km2[size]
        measured = polygon_area_km2(base.geometry)
        if abs(measured - area) / area > AREA_TOLERANCE:
            raise HouseholdsError(f"célula {cell_id}: área medida {measured:.4f} km² difere de {area} km² além de {AREA_TOLERANCE:.0%}")
        flags: list[str] = []
        for e in EDITIONS:
            if recs[e] is None:
                flags.append(f"cell_missing_{e}")
            if cell_id in sup[e]:
                flags.append(f"value_suppressed_{e}")
        joined.append(_Joined(cell_id=cell_id, size=size, area=area, geometry=base.geometry, centroid=centroid,
                              parent=(base.parent_1km or cell_id), recs=recs, flags=flags))

    # Detalhe: células de 200 m. Vazia nos dois anos → omitida do DETALHE e contada, mas continua
    # filha do pai: somas, contagens, population e a detecção de resolução ambígua precisam de
    # TODAS as filhas listadas (achado do Codex na PR #168 — descartar antes escondia a colisão
    # e jogava fora a população de uma filha sem domicílio). Células de 1 km ficam para o
    # overview (inteiras ou fundidas com as filhas da outra edição).
    singles: dict[str, _Joined] = {}
    groups: dict[str, list[_Joined]] = defaultdict(list)
    detail_cells: list[_Joined] = []
    for j in joined:
        if j.size == "1KM":
            singles[j.cell_id] = j
            continue
        groups[j.parent].append(j)
        if drop_if_empty_both_years and _empty_cell(j):
            counts["dropped_empty_both_years"] += 1
            continue
        detail_cells.append(j)

    detail: list[dict[str, Any]] = []
    for j in sorted(detail_cells, key=lambda c: c.cell_id):
        ra = assign_ra(j.centroid)
        flags = list(j.flags)
        if ra is None:
            flags.append("ra_unassigned")
            counts["ra_unassigned"] += 1
        props = _cell_props(j.cell_id, j.size, j.area, pop10=j.pop("2010"), pop22=j.pop("2022"), dom10=j.dom("2010"),
                            dom22=j.dom("2022"), ra=ra, flags=flags, breaks=breaks, with_delta_class=True)
        detail.append({"id": j.cell_id, "geometry": j.geometry, "properties": props})
    result.detail = detail
    counts["published"] = len(detail)

    # Overview: uma feição de 1 km por id — pai das filhas de 200 m e/ou célula de 1 km inteira.
    overview: list[dict[str, Any]] = []
    for parent_id in sorted(set(groups) | set(singles)):
        children = groups.get(parent_id, [])
        single = singles.get(parent_id)
        values: dict[str, int | None] = {}
        pops: dict[str, int | None] = {}
        n_children: dict[str, int] = {}
        missing: dict[str, int] = {}
        origin: dict[str, str | None] = {}
        flags = []
        for e in EDITIONS:
            subdivided = any(c.recs[e] is not None for c in children)
            whole = single is not None and single.recs[e] is not None
            if subdivided and whole:
                raise HouseholdsError(
                    f"célula {parent_id}: a Grade {e} traz a célula de 1 km inteira E {sum(1 for c in children if c.recs[e])} "
                    f"filhas de 200 m — resolução ambígua, confira o layout da edição"
                )
            if subdivided:
                values[e], missing[e] = _strict_sum([c.dom(e) for c in children])
                pops[e], _ = _strict_sum([c.pop(e) for c in children])
                n_children[e] = sum(1 for c in children if c.recs[e] is not None)
                origin[e] = "children"
            elif whole:
                assert single is not None
                values[e], pops[e], n_children[e], missing[e] = single.dom(e), single.pop(e), 0, 0
                origin[e] = "whole"
                if f"value_suppressed_{e}" in single.flags:
                    flags.append(f"value_suppressed_{e}")
            else:
                values[e], pops[e], n_children[e], missing[e], origin[e] = None, None, 0, 0, None
                flags.append(f"cell_missing_{e}")
        # Sem domicílio nem população nos dois anos em TODAS as listagens (célula inteira e cada filha)
        # → omitida e contada. Pai com filhas parciais (somas nulas, mas alguma filha com gente) é publicado.
        all_empty = all(_empty_cell(c) for c in children) and (single is None or _empty_cell(single))
        if drop_if_empty_both_years and all_empty:
            counts["dropped_empty_both_years"] += 1
            continue
        if children:
            geometry = {"type": "Polygon", "coordinates": [convex_hull(
                p for c in children for ring in c.geometry["coordinates"][:1] for p in ring
            )]} if single is None else single.geometry
        else:
            assert single is not None
            geometry = single.geometry
        centroid = polygon_centroid(geometry)
        ra = assign_ra(centroid)
        children_missing = max(missing.values(), default=0)
        if children_missing:
            flags.append("partial_children")
            counts["partial_children"] += 1
        if ra is None:
            flags.append("ra_unassigned")
            if not children:
                counts["ra_unassigned"] += 1
        if set(origin.values()) == {"children", "whole"}:
            flags.append("resolution_changed")
            counts["resolution_changed"] += 1
        props = _cell_props(parent_id, "1KM", cell_area_km2["1KM"], pop10=pops["2010"], pop22=pops["2022"],
                            dom10=values["2010"], dom22=values["2022"], ra=ra, flags=flags, breaks=breaks, with_delta_class=False)
        props["children"] = len(children)
        props["children_missing"] = children_missing
        props["children_2010"] = n_children["2010"]
        props["children_2022"] = n_children["2022"]
        overview.append({"id": parent_id, "geometry": geometry, "properties": props})
    result.overview = sorted(overview, key=lambda f: f["id"])
    counts["overview_cells"] = len(result.overview)
    result.counts = dict(counts)
    for key in ("ra_unassigned", "partial_children", "resolution_changed"):
        if counts.get(key):
            result.flags.add(key)
    return result


def shard_by_ra(features: Iterable[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    shards: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for feature in features:
        shards[feature["properties"].get("ra_geo_id") or "SEM_RA"].append(feature)
    return dict(shards)
