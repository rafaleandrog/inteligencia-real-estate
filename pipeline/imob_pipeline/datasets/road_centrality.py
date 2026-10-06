"""Dataset `road_centrality`: OpenStreetMap → betweenness amostrado → overview + shards de detalhe por RA."""

from __future__ import annotations

from ..geo import BBOX_MARGIN_DEG
from ..outputs.manifest import dataset_entry
from ..sources.osm import load_graph
from ..transforms.centrality import build_edges, compute_betweenness
from ._common import breaks_block, clear_folder, publish, ra_index, write_layer, write_shards
from .context import RunContext

DATASET_ID = "road_centrality"
FOLDER = "road_centrality"
DETAIL_FOLDER = f"{FOLDER}/detail"
SCHEMA = "schemas/road_centrality.properties.schema.json"
# Detalhe só a partir do zoom 13: na segunda execução real o detalhe do DF inteiro deu 58 MB num arquivo
# só (percentil ≥ 50) e a viewport do zoom 12 cruza uma dúzia de RAs; shards por RA a partir do 13 carregam
# só o que está na tela (#167).
ZOOM_MIN = 13


def run(ctx: RunContext) -> dict:
    cfg = ctx.config.centrality
    index, _ = ra_index(ctx)
    graph = load_graph(ctx.fetcher, pbf_url=cfg.pbf_url, bbox=ctx.config.project.bbox, highway_filter=cfg.highway_filter,
                       work_dir=ctx.cache_dir / "osm")
    betweenness, engine, n_sources = compute_betweenness(graph, sample_sources=cfg.sample_sources, seed=cfg.seed, engine=ctx.centrality_engine)
    built = build_edges(
        graph, betweenness, breaks=cfg.breaks["betweenness_percentile"], publish_min_percentile=cfg.publish_min_percentile,
        overview_min_percentile=cfg.overview_min_percentile, always_publish_highways=cfg.always_publish_highways,
        overview_highways=cfg.overview_highways, simplify_tolerance_deg=cfg.simplify_tolerance_deg,
        detail_simplify_tolerance_deg=cfg.detail_simplify_tolerance_deg, assign_ra=index.assign, bbox=ctx.config.project.bbox,
    )
    clear_folder(ctx, DETAIL_FOLDER)
    legacy = ctx.out_dir / FOLDER / "detail.json"  # arquivo único das versões anteriores: fora do manifest, o validador reprova
    if legacy.exists():
        legacy.unlink()
    files = [write_layer(ctx, f"{FOLDER}/overview.json", built["overview"], role="overview", budget_bytes=cfg.budgets["overview"])]
    files += write_shards(ctx, DETAIL_FOLDER, built["detail"], budget_bytes=cfg.budgets["shard"], zoom_min=ZOOM_MIN)
    bbox = None
    for f in files:
        if f.get("bbox"):
            b = f["bbox"]
            bbox = b if bbox is None else [min(bbox[0], b[0]), min(bbox[1], b[1]), max(bbox[2], b[2]), max(bbox[3], b[3])]
    counts = {**built["counts"], "nodes_graph": len(graph.nodes), "sample_sources": n_sources}
    source = {**cfg.source.as_dict(), "retrieved_at": graph.source_files[0]["retrieved_at"] if graph.source_files else ctx.now(),
              "files": [cfg.pbf_url.rsplit("/", 1)[-1]]}
    flags = {"betweenness_sampled"}
    if built["counts"].get("ra_unassigned"):
        flags.add("ra_unassigned")
    entry = dataset_entry(
        dataset_id=DATASET_ID,
        title_pt="Centralidade viária (betweenness de aresta, OpenStreetMap)",
        version=ctx.version_stamp(), generated_at=ctx.now(), files=files, sources=[source],
        years=[int(graph.snapshot[:4])] if graph.snapshot[:4].isdigit() else [], crs=ctx.config.project.crs, bbox=bbox,
        method_pt=(
            f"Rede viária de automóvel ({', '.join(cfg.highway_filter)}) recortada pelo bbox; betweenness de aresta com {n_sources} "
            f"origens amostradas (semente {cfg.seed}, motor {engine}), pesos = comprimento, normalizado pelo máximo; percentil sobre "
            f"todas as {counts['edges_graph']} arestas do grafo (empates com posição média). Detalhe (shards por RA, zoom ≥ {ZOOM_MIN}): "
            f"percentil ≥ {cfg.publish_min_percentile:g} ou classe arterial ({', '.join(cfg.always_publish_highways)}), geometria "
            f"simplificada a {cfg.detail_simplify_tolerance_deg} grau; overview: percentil ≥ {cfg.overview_min_percentile:g} ou classe "
            f"({', '.join(cfg.overview_highways)}), simplificado a {cfg.simplify_tolerance_deg} grau. Aresta com vértice fora do bbox "
            f"do projeto (+{BBOX_MARGIN_DEG}°) não é publicada ({counts['dropped_outside_bbox']} descartadas): o recorte do OSM mantém "
            f"inteiras as vias que cruzam a borda. RA pelo ponto médio da aresta. Extrato OSM de {graph.snapshot or 'data não informada'}."
        ),
        ra_assignment_method="midpoint_within_ra",
        class_breaks=breaks_block({"betweenness_percentile": list(cfg.breaks["betweenness_percentile"])}, n=counts["published"]),
        counts=counts, quality_flags=sorted(flags),
        notes_pt="Valor amostrado: a ordem relativa é estável, o valor absoluto não é comparável entre execuções com amostra diferente.",
        schema=SCHEMA,
    )
    manifest = publish(ctx, entry)
    ctx.summary.dataset(DATASET_ID).update({**counts, "engine": engine, "files": len(files), "bytes": sum(f["bytes"] for f in files)})
    ctx.log.info("road_centrality: %s arestas publicadas em %s shards (%s no overview), motor %s",
                 counts["published"], len(files) - 1, counts["overview"], engine)
    return manifest
