"""OpenStreetMap → grafo viário genérico (nós com lon/lat; arestas com geometria e atributos).

Produção: PBF do Geofabrik → `osmium extract` (bbox) → `osmium tags-filter` (highway=…) →
`osmium cat` para XML → `osmnx.graph_from_xml` (simplificado) → grafo genérico. Teste: um JSON
com o mesmo grafo genérico (`osm_small_graph.json`), escolhido pela extensão do arquivo que o
Fetcher devolve. Os dois caminhos entregam a mesma estrutura para `transforms/centrality.py`.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from ..fetch import Fetcher
from ..geo import linestring_length_m


class OsmError(RuntimeError):
    pass


@dataclass
class RoadGraph:
    nodes: dict[str, tuple[float, float]] = field(default_factory=dict)   # id → (lon, lat)
    edges: list[dict[str, Any]] = field(default_factory=list)              # u, v, key, osmid[], name, highway, oneway, length_m, coords
    snapshot: str = ""                                                      # data do extrato
    source_files: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {"snapshot": self.snapshot, "nodes": {k: list(v) for k, v in self.nodes.items()}, "edges": self.edges}


def graph_from_json(payload: dict[str, Any]) -> RoadGraph:
    graph = RoadGraph(snapshot=str(payload.get("snapshot", "")))
    for node_id, lonlat in payload["nodes"].items():
        graph.nodes[str(node_id)] = (float(lonlat[0]), float(lonlat[1]))
    for edge in payload["edges"]:
        coords = [[float(x), float(y)] for x, y in edge["coords"]]
        graph.edges.append({
            "u": str(edge["u"]), "v": str(edge["v"]), "key": int(edge.get("key", 0)),
            "osmid": [int(o) for o in edge.get("osmid", [])],
            "name": edge.get("name"), "highway": str(edge.get("highway", "unclassified")),
            "oneway": bool(edge.get("oneway", False)),
            "length_m": float(edge.get("length_m") or linestring_length_m(coords)),
            "coords": coords,
        })
    return graph


def _run(cmd: Sequence[str]) -> None:
    result = subprocess.run(list(cmd), capture_output=True, text=True)
    if result.returncode != 0:
        raise OsmError(f"{cmd[0]} falhou: {result.stderr.strip()[:500]}")


def graph_from_pbf(pbf_path: Path, *, bbox: tuple[float, float, float, float], highway_filter: Sequence[str],
                   work_dir: Path) -> RoadGraph:  # pragma: no cover - exige osmium + osmnx
    if shutil.which("osmium") is None:
        raise OsmError("osmium-tool ausente (apt-get install osmium-tool)")
    try:
        import osmnx as ox  # type: ignore
    except ImportError as error:
        raise OsmError("osmnx ausente (pip install -r pipeline/requirements.txt)") from error
    work_dir.mkdir(parents=True, exist_ok=True)
    clipped = work_dir / "clipped.osm.pbf"
    filtered = work_dir / "roads.osm.pbf"
    xml = work_dir / "roads.osm"
    lon_min, lat_min, lon_max, lat_max = bbox
    _run(["osmium", "extract", "--overwrite", "-b", f"{lon_min},{lat_min},{lon_max},{lat_max}", str(pbf_path), "-o", str(clipped)])
    tags = ",".join(highway_filter)
    _run(["osmium", "tags-filter", "--overwrite", str(clipped), f"w/highway={tags}", "-o", str(filtered)])
    _run(["osmium", "cat", "--overwrite", str(filtered), "-o", str(xml)])
    multigraph = ox.graph_from_xml(str(xml), simplify=True, retain_all=False)
    graph = RoadGraph()
    for node_id, data in multigraph.nodes(data=True):
        graph.nodes[str(node_id)] = (float(data["x"]), float(data["y"]))
    for u, v, key, data in multigraph.edges(keys=True, data=True):
        if "geometry" in data:
            coords = [[float(x), float(y)] for x, y in data["geometry"].coords]
        else:
            coords = [list(graph.nodes[str(u)]), list(graph.nodes[str(v)])]
        osmid = data.get("osmid", [])
        osmid = osmid if isinstance(osmid, list) else [osmid]
        highway = data.get("highway", "unclassified")
        highway = highway[0] if isinstance(highway, list) else highway
        name = data.get("name")
        name = name[0] if isinstance(name, list) else name
        graph.edges.append({
            "u": str(u), "v": str(v), "key": int(key), "osmid": [int(o) for o in osmid],
            "name": name, "highway": str(highway), "oneway": bool(data.get("oneway", False)),
            "length_m": float(data.get("length", linestring_length_m(coords))), "coords": coords,
        })
    try:
        import osmium  # type: ignore  # noqa: F401
    except ImportError:
        pass
    graph.snapshot = _pbf_timestamp(pbf_path)
    return graph


def _pbf_timestamp(pbf_path: Path) -> str:  # pragma: no cover - exige osmium
    result = subprocess.run(["osmium", "fileinfo", "-e", "-g", "data.timestamp.last", str(pbf_path)], capture_output=True, text=True)
    return result.stdout.strip()[:10] if result.returncode == 0 else ""


def load_graph(fetcher: Fetcher, *, pbf_url: str, bbox: tuple[float, float, float, float], highway_filter: Sequence[str],
               work_dir: Path) -> RoadGraph:
    retrieval = fetcher.fetch(pbf_url)
    path = retrieval.path
    if path.suffix.lower() == ".json":
        graph = graph_from_json(json.loads(path.read_text("utf-8")))
    else:
        graph = graph_from_pbf(path, bbox=bbox, highway_filter=highway_filter, work_dir=work_dir)
    graph.source_files.append(retrieval.as_dict())
    if not graph.snapshot:
        graph.snapshot = retrieval.retrieved_at[:10] if retrieval.retrieved_at else ""
    return graph
