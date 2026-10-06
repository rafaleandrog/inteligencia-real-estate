import json
import unittest

from imob_pipeline.sources.geoportal_ra import to_polygons
from imob_pipeline.sources.osm import graph_from_json
from imob_pipeline.transforms.assign_ra import RaIndex
from imob_pipeline.transforms.centrality import (
    betweenness_pure, build_edges, compute_betweenness, edge_key, pick_sources, ra_road_summary,
)

from .helpers import FIXTURES, ra_features


def fixture_graph():
    return graph_from_json(json.loads((FIXTURES / "osm_small_graph.json").read_text("utf-8")))


class CentralityTests(unittest.TestCase):
    def test_bridge_has_max_betweenness_and_isolated_zero(self):
        graph = fixture_graph()
        scores = betweenness_pure(graph, sources=sorted(graph.nodes))
        bridge = scores[("n5", "n6", 0)]
        self.assertEqual(bridge, max(scores.values()))
        self.assertEqual(scores.get(("n10", "n11", 0), 0.0) > 0, True)  # 2 nós, 1 caminho: valor baixo mas > 0
        self.assertLess(scores[("n10", "n11", 0)], bridge)

    def test_sampling_is_deterministic_and_normalized(self):
        graph = fixture_graph()
        a, engine_a, n_a = compute_betweenness(graph, sample_sources=5, seed=7, engine="pure")
        b, engine_b, n_b = compute_betweenness(graph, sample_sources=5, seed=7, engine="pure")
        self.assertEqual(a, b)
        self.assertEqual((engine_a, n_a), ("pure", 5))
        self.assertEqual(max(a.values()), 1.0)
        self.assertEqual(len(a), len(graph.edges))
        c, _, _ = compute_betweenness(graph, sample_sources=5, seed=8, engine="pure")
        self.assertEqual(set(c), set(a))

    def test_pick_sources(self):
        self.assertEqual(pick_sources(["b", "a", "c"], 0, 1), ["a", "b", "c"])
        self.assertEqual(pick_sources(["b", "a", "c"], 10, 1), ["a", "b", "c"])
        self.assertEqual(len(pick_sources([str(i) for i in range(50)], 5, 1)), 5)

    def test_pure_engine_refuses_large_graph(self):
        graph = fixture_graph()
        graph.edges = graph.edges * 2000
        with self.assertRaises(RuntimeError):
            compute_betweenness(graph, sample_sources=10, seed=1, engine="pure")

    def test_build_edges_filters_and_overview(self):
        graph = fixture_graph()
        scores, _, _ = compute_betweenness(graph, sample_sources=0, seed=1, engine="pure")
        index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        built = build_edges(graph, scores, breaks=[50, 75, 90, 97], publish_min_percentile=50, overview_min_percentile=90,
                            always_publish_highways=["primary", "secondary"], simplify_tolerance_deg=0.001, assign_ra=index.assign)
        detail = {f["id"]: f["properties"] for f in built["detail"]}
        overview = {f["id"]: f for f in built["overview"]}
        self.assertEqual(built["counts"]["edges_graph"], 12)
        self.assertIn("n5-n6-0", detail)
        self.assertEqual(detail["n5-n6-0"]["betweenness"], 1.0)
        self.assertEqual(detail["n5-n6-0"]["betweenness_percentile"], 100.0)
        self.assertEqual(detail["n5-n6-0"]["class_betweenness_percentile"], 4)
        self.assertIn("betweenness_sampled", detail["n5-n6-0"]["quality_flags"])
        self.assertNotIn("n10-n11-0", detail)   # rua isolada de baixo percentil, não arterial
        self.assertIn("n6-n7-0", detail)        # secondary: sempre publicada
        self.assertIn("n5-n6-0", overview)
        self.assertEqual(len(overview["n5-n6-0"]["geometry"]["coordinates"]), 2)
        self.assertIn("geometry_simplified", overview["n5-n6-0"]["properties"]["quality_flags"])
        self.assertEqual(len(next(f for f in built["detail"] if f["id"] == "n5-n6-0")["geometry"]["coordinates"]), 3)
        self.assertTrue(all(p["betweenness_percentile"] >= 50 or p["highway"] in ("primary", "secondary") for p in detail.values()))
        self.assertEqual(detail["n1-n2-0"]["osmid"], [101]) if "n1-n2-0" in detail else None
        self.assertEqual(built["counts"]["published"], len(detail))

    def test_ra_road_summary(self):
        graph = fixture_graph()
        scores, _, _ = compute_betweenness(graph, sample_sources=0, seed=1, engine="pure")
        index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        built = build_edges(graph, scores, breaks=[50, 75, 90, 97], publish_min_percentile=0, overview_min_percentile=90,
                            always_publish_highways=[], simplify_tolerance_deg=0.0, assign_ra=index.assign)
        summary = ra_road_summary(built["detail"])
        self.assertIn("SEM_RA", summary)
        self.assertEqual(summary["SEM_RA"]["edges_total"], 2)   # ponte (ponto médio fora) e rua isolada
        self.assertEqual(sum(s["edges_total"] for s in summary.values()), 12)
        for s in summary.values():
            self.assertGreaterEqual(s["road_km_total"], s["road_km_top_decile"])
            self.assertIsNotNone(s["centrality_p90"])



class OverviewAndDetailSizeTests(unittest.TestCase):
    """Segunda execução real (#167): o overview só carrega as classes de `overview_highways` fora do percentil, e o
    detalhe também é simplificado (flag `geometry_simplified`) — o DF inteiro deu 58 MB sem isso."""

    def setUp(self):
        self.graph = fixture_graph()
        self.scores, _, _ = compute_betweenness(self.graph, sample_sources=0, seed=1, engine="pure")
        index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        self.common = dict(breaks=[50, 75, 90, 97], publish_min_percentile=0, overview_min_percentile=101,
                           always_publish_highways=["primary", "secondary"], simplify_tolerance_deg=0.0, assign_ra=index.assign)

    def test_overview_highways_restrict_what_enters_the_overview(self):
        same = build_edges(self.graph, self.scores, **self.common)   # None = as mesmas classes de always_publish_highways
        self.assertEqual({f["properties"]["highway"] for f in same["overview"]}, {"primary", "secondary"})
        only_primary = build_edges(self.graph, self.scores, overview_highways=["primary"], **self.common)
        self.assertEqual({f["properties"]["highway"] for f in only_primary["overview"]}, {"primary"})
        self.assertLess(only_primary["counts"]["overview"], same["counts"]["overview"])
        self.assertEqual(only_primary["counts"]["published"], same["counts"]["published"])      # o detalhe não muda
        none = build_edges(self.graph, self.scores, overview_highways=[], **self.common)
        self.assertEqual(none["overview"], [])                                                   # só o percentil manda

    def test_detail_simplification_drops_vertices_and_flags_the_edge(self):
        raw = build_edges(self.graph, self.scores, **self.common)
        simplified = build_edges(self.graph, self.scores, detail_simplify_tolerance_deg=0.001, **self.common)
        before = {f["id"]: f for f in raw["detail"]}
        after = {f["id"]: f for f in simplified["detail"]}
        self.assertEqual(len(before["n5-n6-0"]["geometry"]["coordinates"]), 3)
        self.assertEqual(len(after["n5-n6-0"]["geometry"]["coordinates"]), 2)
        self.assertIn("geometry_simplified", after["n5-n6-0"]["properties"]["quality_flags"])
        self.assertNotIn("geometry_simplified", before["n5-n6-0"]["properties"]["quality_flags"])
        self.assertEqual(after["n5-n6-0"]["properties"]["length_m"], before["n5-n6-0"]["properties"]["length_m"])  # comprimento é do grafo
        self.assertEqual(simplified["counts"]["detail_simplified"], sum(
            1 for f in simplified["detail"] if "geometry_simplified" in f["properties"]["quality_flags"]))
        self.assertEqual(raw["counts"]["detail_simplified"], 0)
        for fid, feature in after.items():
            if "geometry_simplified" not in feature["properties"]["quality_flags"]:
                self.assertEqual(feature["geometry"]["coordinates"], before[fid]["geometry"]["coordinates"])


class PublishInsideBboxTests(unittest.TestCase):
    """O recorte do OSM mantém inteiras as vias que cruzam a borda; só arestas dentro do bbox (+ folga) são
    publicadas, e as descartadas são contadas (#164)."""

    def test_edges_outside_bbox_are_dropped_and_counted(self):
        graph = graph_from_json(json.loads((FIXTURES / "osm_small_graph.json").read_text("utf-8")))
        scores, _, _ = compute_betweenness(graph, sample_sources=0, seed=1, engine="pure")
        index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        common = dict(breaks=[50, 75, 90, 97], publish_min_percentile=0, overview_min_percentile=90,
                      always_publish_highways=[], simplify_tolerance_deg=0.0, assign_ra=index.assign)
        everything = build_edges(graph, scores, **common)
        lons = [p[0] for e in graph.edges for p in e["coords"]]
        lats = [p[1] for e in graph.edges for p in e["coords"]]
        # bbox que corta o vértice mais a leste: toda aresta que o toca sai, sem folga
        tight = (min(lons), min(lats), max(lons) - 1e-9, max(lats))
        built = build_edges(graph, scores, bbox=tight, bbox_margin_deg=0.0, **common)
        dropped = built["counts"]["dropped_outside_bbox"]
        self.assertGreater(dropped, 0)
        self.assertEqual(built["counts"]["published"] + dropped, everything["counts"]["published"])
        east = max(lons)
        for feature in built["detail"]:
            self.assertTrue(all(p[0] < east for p in feature["geometry"]["coordinates"]), feature["id"])
        # com o bbox inteiro (e folga), nada é descartado
        loose = build_edges(graph, scores, bbox=(min(lons), min(lats), max(lons), max(lats)), **common)
        self.assertEqual(loose["counts"]["dropped_outside_bbox"], 0)
        self.assertEqual(loose["counts"]["published"], everything["counts"]["published"])


if __name__ == "__main__":
    unittest.main()
