"""Betweenness de aresta (amostrado) → percentil sobre todas as arestas → filtro de publicação.

Dois motores com o mesmo contrato: igraph (produção, rápido) e Brandes em Python puro
(fixtures e verificação; impraticável para o DF inteiro — o dataset recusa grafo grande sem
igraph em vez de rodar por horas). Direção respeita `oneway`; o valor de uma via de mão dupla
soma as duas direções. Normalização pelo máximo (0–1).
"""

from __future__ import annotations

import heapq
import random
from collections import defaultdict, deque
from typing import Any, Callable, Iterable, Mapping, Sequence

from ..geo import BBOX_MARGIN_DEG, bbox_contains_point, linestring_midpoint, simplify_line
from ..sources.osm import RoadGraph
from .classify import assign_class, percentile, percentile_ranks

EdgeKey = tuple[str, str, int]
PURE_ENGINE_MAX_EDGES = 20_000


def edge_key(edge: Mapping[str, Any]) -> EdgeKey:
    return (str(edge["u"]), str(edge["v"]), int(edge["key"]))


def _directed_arcs(graph: RoadGraph) -> list[tuple[str, str, float, EdgeKey]]:
    arcs = []
    for edge in graph.edges:
        key = edge_key(edge)
        w = float(edge["length_m"]) or 1e-6
        arcs.append((edge["u"], edge["v"], w, key))
        if not edge.get("oneway"):
            arcs.append((edge["v"], edge["u"], w, key))
    return arcs


def pick_sources(node_ids: Sequence[str], sample_sources: int, seed: int) -> list[str]:
    ordered = sorted(node_ids)
    if sample_sources <= 0 or sample_sources >= len(ordered):
        return ordered
    rng = random.Random(seed)
    return sorted(rng.sample(ordered, sample_sources))


def betweenness_pure(graph: RoadGraph, *, sources: Sequence[str]) -> dict[EdgeKey, float]:
    """Brandes (arestas, dirigido, com pesos) a partir das origens dadas."""
    adjacency: dict[str, list[tuple[str, float, EdgeKey]]] = defaultdict(list)
    for u, v, w, key in _directed_arcs(graph):
        adjacency[u].append((v, w, key))
    score: dict[EdgeKey, float] = defaultdict(float)
    for s in sources:
        dist: dict[str, float] = {s: 0.0}
        sigma: dict[str, float] = defaultdict(float)
        sigma[s] = 1.0
        preds: dict[str, list[tuple[str, EdgeKey]]] = defaultdict(list)
        order: list[str] = []
        seen: set[str] = set()
        heap = [(0.0, s)]
        while heap:
            d, v = heapq.heappop(heap)
            if v in seen:
                continue
            seen.add(v)
            order.append(v)
            for w_node, w, key in adjacency.get(v, ()):
                nd = d + w
                if nd < dist.get(w_node, float("inf")) - 1e-12:
                    dist[w_node] = nd
                    sigma[w_node] = sigma[v]
                    preds[w_node] = [(v, key)]
                    heapq.heappush(heap, (nd, w_node))
                elif abs(nd - dist.get(w_node, float("inf"))) <= 1e-12:
                    sigma[w_node] += sigma[v]
                    preds[w_node].append((v, key))
        delta: dict[str, float] = defaultdict(float)
        for w_node in reversed(order):
            for v, key in preds.get(w_node, ()):
                c = (sigma[v] / sigma[w_node]) * (1.0 + delta[w_node]) if sigma[w_node] else 0.0
                score[key] += c
                delta[v] += c
    return dict(score)


def betweenness_igraph(graph: RoadGraph, *, sources: Sequence[str]) -> dict[EdgeKey, float]:  # pragma: no cover - exige igraph
    import igraph  # type: ignore
    node_index = {node_id: i for i, node_id in enumerate(sorted(graph.nodes))}
    arcs = _directed_arcs(graph)
    g = igraph.Graph(n=len(node_index), edges=[(node_index[u], node_index[v]) for u, v, _, _ in arcs], directed=True)
    weights = [w for _, _, w, _ in arcs]
    src = [node_index[s] for s in sources]
    try:
        # python-igraph ≥ 0.10: betweenness por subconjunto de origens via `sources=`.
        values = g.edge_betweenness(directed=True, weights=weights, sources=src)
    except TypeError:  # versões que expõem a variante com nome próprio
        values = g.edge_betweenness_subset(sources=src, targets=None, directed=True, weights=weights)
    score: dict[EdgeKey, float] = defaultdict(float)
    for (_, _, _, key), value in zip(arcs, values):
        score[key] += float(value)
    return dict(score)


def compute_betweenness(graph: RoadGraph, *, sample_sources: int, seed: int,
                        engine: str = "auto") -> tuple[dict[EdgeKey, float], str, int]:
    sources = pick_sources(list(graph.nodes), sample_sources, seed)
    if engine == "auto":
        try:
            import igraph  # type: ignore  # noqa: F401
            engine = "igraph"
        except ImportError:
            engine = "pure"
    if engine == "pure" and len(graph.edges) > PURE_ENGINE_MAX_EDGES:
        raise RuntimeError(
            f"grafo com {len(graph.edges)} arestas excede o limite do motor puro ({PURE_ENGINE_MAX_EDGES}); instale igraph"
        )
    raw = betweenness_igraph(graph, sources=sources) if engine == "igraph" else betweenness_pure(graph, sources=sources)
    peak = max(raw.values(), default=0.0)
    normalized = {key: (value / peak if peak > 0 else 0.0) for key, value in raw.items()}
    for edge in graph.edges:
        normalized.setdefault(edge_key(edge), 0.0)
    return normalized, engine, len(sources)


def build_edges(
    graph: RoadGraph,
    betweenness: Mapping[EdgeKey, float],
    *,
    breaks: Sequence[float],
    publish_min_percentile: float,
    overview_min_percentile: float,
    always_publish_highways: Iterable[str],
    simplify_tolerance_deg: float,
    assign_ra: Callable[[Sequence[float]], str | None],
    bbox: tuple[float, float, float, float] | None = None,
    bbox_margin_deg: float = BBOX_MARGIN_DEG,
) -> dict[str, Any]:
    """`bbox`: aresta com qualquer vértice fora dele (+ folga) não é publicada e é contada em
    `dropped_outside_bbox` — o recorte do OSM (`osmium extract`) mantém inteiras as vias que cruzam
    a borda, e o validador recusa coordenada fora do bbox do projeto (#164)."""
    always = set(always_publish_highways)
    ordered = sorted(graph.edges, key=edge_key)
    values = [float(betweenness.get(edge_key(e), 0.0)) for e in ordered]
    ranks = percentile_ranks(values)
    detail: list[dict[str, Any]] = []
    overview: list[dict[str, Any]] = []
    counts: dict[str, int] = {"edges_graph": len(ordered), "published": 0, "overview": 0, "ra_unassigned": 0,
                              "dropped_outside_bbox": 0}
    for edge, value, rank in zip(ordered, values, ranks):
        arterial = edge["highway"] in always
        if rank < publish_min_percentile and not arterial:
            continue
        coords = edge["coords"]
        if bbox is not None and not all(bbox_contains_point(bbox, (p[0], p[1]), bbox_margin_deg) for p in coords):
            counts["dropped_outside_bbox"] += 1
            continue
        midpoint = linestring_midpoint(coords)
        ra = assign_ra(midpoint)
        flags = ["betweenness_sampled"]
        if ra is None:
            flags.append("ra_unassigned")
            counts["ra_unassigned"] += 1
        u, v, k = edge_key(edge)
        props = {
            "edge_id": f"{u}-{v}-{k}",
            "osmid": sorted(int(o) for o in edge.get("osmid", [])),
            "name": edge.get("name"),
            "highway": edge["highway"],
            "oneway": bool(edge.get("oneway", False)),
            "length_m": round(float(edge["length_m"]), 1),
            "betweenness": round(value, 6),
            "betweenness_percentile": round(rank, 1),
            "class_betweenness_percentile": assign_class(round(rank, 1), breaks),
            "ra_geo_id": ra,
            "quality_flags": sorted(set(flags)),
        }
        detail.append({"id": props["edge_id"], "geometry": {"type": "LineString", "coordinates": coords}, "properties": props})
        if rank >= overview_min_percentile or arterial:
            simplified = simplify_line(coords, simplify_tolerance_deg)
            oprops = dict(props)
            if len(simplified) < len(coords):
                oprops["quality_flags"] = sorted(set(flags) | {"geometry_simplified"})
            overview.append({"id": props["edge_id"], "geometry": {"type": "LineString", "coordinates": simplified}, "properties": oprops})
    counts["published"] = len(detail)
    counts["overview"] = len(overview)
    return {"detail": detail, "overview": overview, "counts": counts}


def ra_road_summary(detail_features: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Por RA (sobre as arestas publicadas): total, km, km no decil superior, média e p90."""
    by_ra: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for feature in detail_features:
        by_ra[feature["properties"].get("ra_geo_id") or "SEM_RA"].append(feature["properties"])
    out: dict[str, dict[str, Any]] = {}
    for ra, props in by_ra.items():
        values = sorted(float(p["betweenness"]) for p in props)
        km_total = sum(float(p["length_m"]) for p in props) / 1000.0
        km_top = sum(float(p["length_m"]) for p in props if float(p["betweenness_percentile"]) >= 90) / 1000.0
        out[ra] = {
            "edges_total": len(props),
            "road_km_total": round(km_total, 2),
            "road_km_top_decile": round(km_top, 2),
            "centrality_mean": round(sum(values) / len(values), 6) if values else None,
            "centrality_p90": round(percentile(values, 90), 6) if values else None,
        }
    return out
