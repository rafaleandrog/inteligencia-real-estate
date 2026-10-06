"""Agregados por RA a partir dos arquivos PUBLICADOS — o que o site mostra é o que se soma.

Domicílios: células de 200 m publicadas (detalhe) + células de 1 km não subdivididas
(`children == 0` no overview). Empregos: hexágonos r9 publicados; população-base: overview r8
(inclui hexágonos sem emprego). Centralidade: arestas publicadas no detalhe. Invariante:
Σ RAs + balde SEM_RA = total publicado (contado em `counts`, nunca escondido).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable, Mapping


def _sum_or_none(values: list[int | None]) -> int | None:
    present = [v for v in values if v is not None]
    return sum(present) if present else None


def aggregate_households(detail: Iterable[dict[str, Any]], overview: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_ra: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    cells = list(detail) + [f for f in overview if f["properties"].get("children", 0) == 0]
    for feature in cells:
        p = feature["properties"]
        ra = p.get("ra_geo_id") or "SEM_RA"
        by_ra[ra]["dom10"].append(p.get("dom_ocu_2010"))
        by_ra[ra]["dom22"].append(p.get("dom_ocu_2022"))
        by_ra[ra]["pop10"].append(p.get("pop_2010"))
        by_ra[ra]["pop22"].append(p.get("pop_2022"))
        # Soma com buraco é soma parcial (R8.55): célula sem valor num dos anos entra na contagem de parciais.
        partial = p.get("dom_ocu_2010") is None or p.get("dom_ocu_2022") is None or "partial_children" in (p.get("quality_flags") or [])
        by_ra[ra]["partial"].append(1 if partial else 0)
    out: dict[str, dict[str, Any]] = {}
    for ra, cols in by_ra.items():
        h10 = _sum_or_none(cols["dom10"])
        h22 = _sum_or_none(cols["dom22"])
        delta = (h22 - h10) if (h10 is not None and h22 is not None) else None
        growth = round(delta / h10, 4) if (delta is not None and h10) else None
        out[ra] = {
            "households_2010": h10, "households_2022": h22, "households_delta": delta, "households_growth_pct": growth,
            "pop_2010": _sum_or_none(cols["pop10"]), "pop_2022": _sum_or_none(cols["pop22"]),
            "cells_2010": sum(1 for v in cols["dom10"] if v is not None),
            "cells_2022": sum(1 for v in cols["dom22"] if v is not None),
            "cells_partial": sum(cols["partial"]),
        }
    return out


def aggregate_jobs(detail: Iterable[dict[str, Any]], overview: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    jobs: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for feature in detail:
        p = feature["properties"]
        ra = p.get("ra_geo_id") or "SEM_RA"
        for metric in ("jobs_total", "jobs_low", "jobs_mid", "jobs_high"):
            jobs[ra][metric].append(p.get(metric))
        jobs[ra]["hexes"].append(1)
    pop: dict[str, list] = defaultdict(list)
    for feature in overview:
        p = feature["properties"]
        pop[p.get("ra_geo_id") or "SEM_RA"].append(p.get("pop_total"))
    out: dict[str, dict[str, Any]] = {}
    for ra in set(jobs) | set(pop):
        total = _sum_or_none(jobs[ra]["jobs_total"]) if ra in jobs else None
        basis = _sum_or_none(pop[ra]) if ra in pop else None
        out[ra] = {
            "jobs_total": total,
            "jobs_low": _sum_or_none(jobs[ra]["jobs_low"]) if ra in jobs else None,
            "jobs_mid": _sum_or_none(jobs[ra]["jobs_mid"]) if ra in jobs else None,
            "jobs_high": _sum_or_none(jobs[ra]["jobs_high"]) if ra in jobs else None,
            "jobs_population_basis": basis,
            "jobs_per_1000_residents": round(total / basis * 1000, 1) if (total is not None and basis) else None,
            "hexes": sum(jobs[ra]["hexes"]) if ra in jobs else 0,
        }
    return out


def build_rows(crosswalk_rows: Iterable[Mapping[str, Any]], *, households: Mapping[str, Mapping[str, Any]] | None,
               jobs: Mapping[str, Mapping[str, Any]] | None, roads: Mapping[str, Mapping[str, Any]] | None,
               sources: Mapping[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for cw in sorted(crosswalk_rows, key=lambda r: r["ra_number"]):
        ra = cw["ra_geo_id"]
        flags: list[str] = []
        row: dict[str, Any] = {
            "ra_geo_id": ra, "ra_geo_id_roman": cw["ra_geo_id_roman"], "ra_name": cw["ra_name"], "ra_area_km2": cw.get("ra_area_km2"),
        }
        hh = households.get(ra) if households else None
        if hh:
            row.update({"households_source": sources.get("households")})
            row.update(hh)
            area = cw.get("ra_area_km2")
            row["households_per_km2_2022"] = round(hh["households_2022"] / area, 1) if (hh.get("households_2022") is not None and area) else None
            if hh.get("cells_partial"):
                flags.append("partial_children")
        else:
            row.update({k: None for k in ("households_source", "households_2010", "households_2022", "households_delta",
                                          "households_growth_pct", "households_per_km2_2022", "pop_2010", "pop_2022",
                                          "cells_2010", "cells_2022", "cells_partial")})
            flags.append("households_missing")
        jb = jobs.get(ra) if jobs else None
        if jb:
            row.update({"jobs_source": sources.get("jobs"), "jobs_year": sources.get("jobs_year")})
            row.update(jb)
            area = cw.get("ra_area_km2")
            row["jobs_per_km2"] = round(jb["jobs_total"] / area, 1) if (jb.get("jobs_total") is not None and area) else None
        else:
            row.update({k: None for k in ("jobs_source", "jobs_year", "jobs_total", "jobs_low", "jobs_mid", "jobs_high",
                                          "jobs_population_basis", "jobs_per_1000_residents", "jobs_per_km2", "hexes")})
            flags.append("jobs_missing")
        rd = roads.get(ra) if roads else None
        if rd:
            row.update({"centrality_source": sources.get("centrality"), "centrality_snapshot": sources.get("centrality_snapshot")})
            row.update(rd)
        else:
            row.update({k: None for k in ("centrality_source", "centrality_snapshot", "edges_total", "road_km_total",
                                          "road_km_top_decile", "centrality_mean", "centrality_p90")})
            flags.append("centrality_missing")
        row["quality_flags"] = sorted(set(flags))
        rows.append(row)
    return rows
