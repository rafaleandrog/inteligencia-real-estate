"""IBGE Grade Estatística (Censos 2010 e 2022): listagem, resolução dos quadrantes e leitura.

Leitura de shapefile (zip) exige pyogrio; a leitura de GeoJSON (`.json`/`.geojson`) é pura e é
o que os fixtures usam. As colunas são mapeadas pelo config por edição e validadas na carga:
coluna ausente FALHA nomeando as colunas encontradas, nunca cai num palpite.
"""

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

from ..fetch import Fetcher
from ..geo import bbox_intersects, bbox_union, geometry_bbox

ZIP_LINK = re.compile(r'href="?(?P<name>grade_id\w+\.zip)"?', re.IGNORECASE)
# Qualquer link de arquivo na listagem: quando não há grade_id*.zip, o erro mostra o layout real do diretório.
OTHER_LINK = re.compile(r'href="?(?P<name>[^"\s>]+\.(?:zip|gpkg|7z|rar|tar|gz|csv|xlsx|pdf|txt))"?', re.IGNORECASE)
# Subpasta numa listagem do geoftp (`href="grade_estatistica/"`); ignora `../` e links absolutos.
DIR_LINK = re.compile(r'href="?(?P<name>[A-Za-z0-9][A-Za-z0-9_.-]*)/"?', re.IGNORECASE)
BBox = tuple[float, float, float, float]


class GradeError(RuntimeError):
    pass


@dataclass(frozen=True)
class GridCellRecord:
    cell_id: str
    parent_1km: str | None
    pop: int | None
    dom_ocu: int | None
    geometry: dict


def parse_listing(html: str) -> list[str]:
    """Nomes `grade_id*.zip` numa página de listagem do geoftp (ordem estável, sem repetição)."""
    names: list[str] = []
    for match in ZIP_LINK.finditer(html):
        name = match.group("name")
        if name not in names:
            names.append(name)
    return sorted(names)


def parse_other_links(html: str) -> list[str]:
    """Todo link de arquivo da listagem (zip, gpkg, 7z, csv, pdf…), na ordem, sem repetição."""
    names: list[str] = []
    for match in OTHER_LINK.finditer(html):
        name = match.group("name").rsplit("/", 1)[-1]
        if name not in names:
            names.append(name)
    return names


def parse_dir_links(html: str) -> list[str]:
    """Subpastas de uma listagem (sem `../`), na ordem, sem repetição."""
    names: list[str] = []
    for match in DIR_LINK.finditer(html):
        name = match.group("name")
        if name not in names:
            names.append(name)
    return names


def quadrant_urls(base_url: str, quadrant_ids: Iterable[str]) -> list[str]:
    base = base_url if base_url.endswith("/") else base_url + "/"
    return [f"{base}{qid}.zip" if not qid.endswith(".zip") else f"{base}{qid}" for qid in quadrant_ids]


def _to_int_or_none(value: Any) -> tuple[int | None, bool]:
    """(valor, suprimido). Negativo ou não inteiro é supressão: vira None + flag, nunca é saturado."""
    if value is None or value == "":
        return None, False
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None, True
    if number < 0 or number != int(number):
        return None, True
    return int(number), False


def _check_columns(available: Iterable[str], columns: Mapping[str, str], label: str) -> None:
    present = set(available)
    missing = {role: name for role, name in columns.items() if name not in present}
    if missing:
        raise GradeError(
            f"{label}: colunas ausentes {sorted(missing.values())}; encontradas {sorted(present)}"
        )


def records_from_geojson(payload: dict[str, Any], columns: Mapping[str, str], label: str) -> tuple[list[GridCellRecord], list[str]]:
    features = payload.get("features") or []
    if not features:
        return [], []
    _check_columns(features[0].get("properties", {}).keys(), columns, label)
    suppressed: list[str] = []
    out: list[GridCellRecord] = []
    for feature in features:
        props = feature["properties"]
        cell_id = str(props[columns["cell_id"]])
        pop, sup_pop = _to_int_or_none(props.get(columns["pop"]))
        dom, sup_dom = _to_int_or_none(props.get(columns["dom_ocu"]))
        if sup_pop or sup_dom:
            suppressed.append(cell_id)
        parent = props.get(columns["parent_1km"])
        out.append(GridCellRecord(
            cell_id=cell_id,
            parent_1km=str(parent) if parent not in (None, "") else None,
            pop=pop, dom_ocu=dom, geometry=feature["geometry"],
        ))
    return out, suppressed


def read_grid_file(path: Path, columns: Mapping[str, str], label: str) -> tuple[list[GridCellRecord], list[str]]:
    """GeoJSON direto (fixture) ou zip de shapefile (produção, exige pyogrio)."""
    suffix = path.suffix.lower()
    if suffix in (".json", ".geojson"):
        return records_from_geojson(json.loads(path.read_text("utf-8")), columns, label)
    if suffix == ".zip":
        return _records_from_zip(path, columns, label)
    raise GradeError(f"formato de arquivo da grade não suportado: {path.name}")


def _records_from_zip(path: Path, columns: Mapping[str, str], label: str) -> tuple[list[GridCellRecord], list[str]]:
    try:
        import pyogrio  # type: ignore
    except ImportError as error:  # pragma: no cover - depende do ambiente
        raise GradeError("ler shapefile da Grade exige pyogrio (pip install -r pipeline/requirements.txt)") from error
    with zipfile.ZipFile(path) as archive:
        shapefiles = [n for n in archive.namelist() if n.lower().endswith(".shp")]
    if not shapefiles:
        raise GradeError(f"{path.name}: nenhum .shp dentro do zip")
    frame = pyogrio.read_dataframe(f"zip://{path}!{shapefiles[0]}")
    _check_columns(frame.columns, columns, label)
    if frame.crs is not None and not str(frame.crs).upper().endswith("4326"):
        frame = frame.to_crs(4326)
    payload = json.loads(frame.to_json())
    return records_from_geojson(payload, columns, label)


def load_edition(fetcher: Fetcher, *, base_url: str, quadrant_ids: Iterable[str], columns: Mapping[str, str],
                 label: str) -> tuple[list[GridCellRecord], list[str], list[dict[str, Any]]]:
    ids = list(quadrant_ids)
    if not ids:
        raise GradeError(
            f"{label}: nenhum quadrante para ler — pine households_grid.quadrant_ids no config (`python -m "
            "imob_pipeline discover grade` lista os nomes) ou deixe vazio para o orquestrador resolvê-los pelo bbox"
        )
    records: list[GridCellRecord] = []
    suppressed: list[str] = []
    retrievals: list[dict[str, Any]] = []
    for url in quadrant_urls(base_url, ids):
        retrieval = fetcher.fetch(url)
        retrievals.append(retrieval.as_dict())
        part, sup = read_grid_file(retrieval.path, columns, f"{label} {retrieval.path.name}")
        records.extend(part)
        suppressed.extend(sup)
    return records, suppressed, retrievals


def _listing_html(fetcher: Fetcher, base_url: str) -> str:
    retrieval = fetcher.fetch(base_url if base_url.endswith("/") else base_url + "/", dest_name="listing.html")
    return retrieval.path.read_text("utf-8", errors="replace")


def _discover(fetcher: Fetcher, base_url: str) -> tuple[list[str], list[str]]:
    """(nomes `grade_id*.zip`, outros links). Sem zip na listagem, desce UM nível de subpastas
    (no geoftp, `censo_2022/` só tem subpastas e os zips ficam em `censo_2022/grade_estatistica/`);
    o nome volta prefixado pela subpasta (`grade_estatistica/grade_id45.zip`), que `quadrant_urls`
    concatena à base — e é assim que o id deve ser pinado no config."""
    base = base_url if base_url.endswith("/") else base_url + "/"
    html = _listing_html(fetcher, base)
    names = parse_listing(html)
    others = parse_other_links(html)
    if not names:
        for sub in parse_dir_links(html):
            sub_html = _listing_html(fetcher, f"{base}{sub}/")
            names.extend(f"{sub}/{name}" for name in parse_listing(sub_html))
            others.extend(f"{sub}/{name}" for name in parse_other_links(sub_html))
    return names, others


def discover(fetcher: Fetcher, base_url: str) -> list[str]:
    return _discover(fetcher, base_url)[0]


def file_bounds(path: Path) -> BBox:
    """Limites (lon_min, lat_min, lon_max, lat_max) em WGS84 de um arquivo da Grade.

    GeoJSON (fixture) é puro: união dos bboxes das feições. Zip de shapefile lê SÓ o cabeçalho
    (`pyogrio.read_info` → `total_bounds`), sem carregar as células.
    """
    suffix = path.suffix.lower()
    if suffix in (".json", ".geojson"):
        payload = json.loads(path.read_text("utf-8"))
        bbox: BBox | None = None
        for feature in payload.get("features") or []:
            geometry = feature.get("geometry")
            if geometry:
                bbox = bbox_union(bbox, geometry_bbox(geometry))
        if bbox is None:
            raise GradeError(f"{path.name}: nenhuma feição com geometria para calcular os limites")
        return bbox
    if suffix == ".zip":
        return _zip_bounds(path)
    raise GradeError(f"formato de arquivo da grade não suportado: {path.name}")


def _zip_bounds(path: Path) -> BBox:
    try:
        import pyogrio  # type: ignore
    except ImportError as error:  # pragma: no cover - depende do ambiente
        raise GradeError("ler os limites do shapefile da Grade exige pyogrio (pip install -r pipeline/requirements.txt)") from error
    with zipfile.ZipFile(path) as archive:
        shapefiles = [n for n in archive.namelist() if n.lower().endswith(".shp")]
    if not shapefiles:
        raise GradeError(f"{path.name}: nenhum .shp dentro do zip")
    info = pyogrio.read_info(f"zip://{path}!{shapefiles[0]}")
    bounds = info.get("total_bounds") if isinstance(info, dict) else None
    if bounds is None:
        raise GradeError(f"{path.name}: pyogrio não devolveu total_bounds do shapefile")
    xmin, ymin, xmax, ymax = (float(v) for v in bounds)
    return to_wgs84_bounds((xmin, ymin, xmax, ymax), info.get("crs"))


def to_wgs84_bounds(bounds: BBox, crs: object) -> BBox:
    """Limites em graus. Sem CRS ou CRS geográfico (a Grade sai em SIRGAS 2000, EPSG:4674) passam
    direto; CRS projetado é reprojetado pelos quatro cantos com pyproj."""
    if not crs:
        return bounds
    try:
        from pyproj import CRS, Transformer  # type: ignore
    except ImportError as error:  # pragma: no cover - depende do ambiente
        raise GradeError("reprojetar os limites do shapefile exige pyproj (pip install -r pipeline/requirements.txt)") from error
    source = CRS.from_user_input(crs)
    if source.is_geographic:
        return bounds
    transformer = Transformer.from_crs(source, "EPSG:4326", always_xy=True)
    xmin, ymin, xmax, ymax = bounds
    corners = [transformer.transform(x, y) for x, y in ((xmin, ymin), (xmin, ymax), (xmax, ymin), (xmax, ymax))]
    return (min(c[0] for c in corners), min(c[1] for c in corners), max(c[0] for c in corners), max(c[1] for c in corners))


def resolve_quadrants(fetcher: Fetcher, base_url: str, *, bbox: BBox, label: str,
                      margin_deg: float = 0.05) -> tuple[list[str], list[dict[str, Any]]]:
    """Quadrantes `grade_id*` cujo arquivo cruza o bbox (com folga): lista o diretório, baixa cada
    zip e lê só os limites. É o caminho de descoberta para `households_grid.quadrant_ids` vazio —
    custa baixar a Grade inteira uma vez (o que fica fora do bbox sai do cache); depois da primeira
    execução, pine os ids no config. Devolve (ids sem `.zip`, relatório por arquivo). Sem nenhum
    `grade_id*.zip` na listagem, FALHA nomeando os outros links que encontrou (o layout real)."""
    names, others = _discover(fetcher, base_url)
    if not names:
        raise GradeError(
            f"{label}: nenhum grade_id*.zip em {base_url} (nem um nível abaixo); "
            f"links encontrados: {others[:40] if others else 'nenhum'}"
        )
    target: BBox = (bbox[0] - margin_deg, bbox[1] - margin_deg, bbox[2] + margin_deg, bbox[3] + margin_deg)
    kept: list[str] = []
    report: list[dict[str, Any]] = []
    discard = getattr(fetcher, "discard", None)
    for name in names:
        url = quadrant_urls(base_url, [name])[0]
        retrieval = fetcher.fetch(url)
        bounds = file_bounds(retrieval.path)
        keep = bbox_intersects(bounds, target)
        report.append({"file": name, "bounds": [round(v, 4) for v in bounds], "bytes": retrieval.bytes, "keep": keep})
        if keep:
            kept.append(name[:-4] if name.lower().endswith(".zip") else name)
        elif callable(discard):
            discard(url)
    if not kept:
        raise GradeError(f"{label}: nenhum quadrante cruza o bbox {list(bbox)}; limites lidos: {report}")
    return kept, report
